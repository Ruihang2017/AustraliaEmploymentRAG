# 08-sources-cases — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.9. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `08-sources-cases` |
| Lane | `08-sources-cases` |
| Ticket prefix | `SCAS` |
| Tickets | 13 (`SCAS-01` … `SCAS-13`) |
| Agent | `builder` (all 13, plan §1.1) |
| Epic | `E14-CASES` (PRD §44.2) — exit evidence *"Case metadata/paragraph/treatment evidence tests"* |
| Requirement families | `SRCH-004`, `SRCH-005` (plan §3); contributes to `SRCH-003`, `ADM-001` |
| Write-owns | `pipelines/adapters/_shared/caselaw/**` · `pipelines/adapters/case-{hca,fca,fcfcoa,fwc,nsw,vic,qld,wa,sa,tas,act,nt}/**` (plan §4) |
| Depends on modules | `05-ingestion-framework` (`INGF-09`), `07-sources-instruments` (`SINS-02`, for `SCAS-05` only) |
| Language/toolchain | Python (`uv`, `pytest`) — PRD §18.2 *"Ingestion/build/evaluation \| Local Python pipeline"*, §20.1, §45.3 |
| Version | v0.2 |

## Problem

PRD §7 wave 3 is *"Official courts and tribunals: High Court, federal courts, FWC and official
state/territory decision portals."* PRD §40.4 turns that into **twelve mandatory source groups**, and
PRD §44.4 forbids calling any of them covered until it actually is:

> "It is not permitted to silently call an unimplemented source category covered."

Case law is the one corpus family where *the relationship between documents is itself a legal claim*.
A judgment's text is only half the product; the other half is whether a later court affirmed,
reversed, overruled, distinguished or merely cited it — and getting that wrong is a critical legal
error, not a ranking defect. PRD §27 names it as a standing risk:

> "| Case treatment is incomplete | Evidence-status relationships, `TREATMENT_NOT_CONFIRMED`, focus
> review on high-impact authorities, no LLM-only treatment assertion |"

PRD §9.2 and §9.3 fix exactly how much may be asserted:

> §9.2 — "Court/tribunal, level, date, case number and neutral citation MUST be displayed. Authority
> status MUST distinguish binding, potentially binding, persuasive and unknown. Appeal, affirmation,
> reversal, overruling, distinction, following and citation relationships **MAY be asserted only with
> evidence**. **A citation alone establishes `CITES`, not treatment.** Unconfirmed later treatment
> MUST display `TREATMENT_NOT_CONFIRMED`. Holding/reasons MUST be distinguished from obiter, party
> submissions and background where the source permits. A single decision MUST NOT be generalised into
> a universal rule without supporting authority."
>
> §9.3 — "Official structured assertions may support conclusions. Deterministic extraction may
> support conclusions when exact source evidence and parser version are retained. **LLM-discovered
> relationships are `MODEL_SUGGESTED` and MUST NOT change legal status or support a definitive
> treatment conclusion.**"

This module therefore has three jobs:

1. **Make PRD §9.2/§9.3 mechanically unbreakable** (`SCAS-01`) — an API in which an evidence-free
   treatment relation, a `CITES`-to-treatment upgrade, or a `MODEL_SUGGESTED` legal status cannot be
   expressed at all, and `TREATMENT_NOT_CONFIRMED` is what you get by default rather than by
   remembering to set it.
2. **Deliver the twelve PRD §40.4 groups** (`SCAS-02`…`SCAS-13`), each with the full PRD §40.8
   twelve-item Definition of Done and its own Source Coverage Registry row (plan §2.1 **A2**).
3. **Never fake coverage.** PRD §40.4: *"Every state/territory group must be decomposed into exact
   official collections before implementation. If an official court does not publish a relevant class
   or historical range, the registry records `SOURCE_UNAVAILABLE` or date-limited coverage; the
   product does not silently substitute a commercial headnote site."* A portal that cannot do what a
   ticket assumed is recorded with a PRD §7/§12.1 limited status, not quietly downgraded. The
   governing launch policy is settled (**D15**): all twelve groups are attempted in full, no group is
   pre-selected for omission or reduced implementation, and a limited state is permitted only where
   measured evidence shows a genuine official-source limitation.

## Scope

| In scope | Ticket |
|---|---|
| Neutral-citation and pinpoint parsing, stable case identity, judgment paragraph identity and node hierarchy, court/bench facts, the evidence-backed treatment/citation relation API, case `LegalEvent`s, case-specific validation findings, the twelve-adapter authoring guide | `SCAS-01` |
| `CASE-HCA` — High Court cases/judgments | `SCAS-02` |
| `CASE-FCA` — Federal Court and Full Court judgments | `SCAS-03` |
| `CASE-FCFCOA` — Federal Circuit and Family Court judgments | `SCAS-04` |
| `CASE-FWC` — FWC/FWCFB/FWCA decisions and orders | `SCAS-05` |
| `CASE-NSW`, `CASE-VIC`, `CASE-QLD`, `CASE-WA`, `CASE-SA`, `CASE-TAS`, `CASE-ACT`, `CASE-NT` — state/territory court, tribunal and industrial-commission decision collections, each decomposed to exact official endpoints | `SCAS-06` … `SCAS-13` |

## Non-goals

| Not in this module | Owner |
|---|---|
| The adapter interface, safe fetcher, artifact store, licence gate, quarantine/run accounting, parser/OCR host, registry composer, discovery scheduler, conformance kit | `05-ingestion-framework` (`INGF-01`…`INGF-09`) |
| The `corpus.sqlite` schema and the intermediate normalised-record payload types | `04-corpus-contract` / `CRPS-01` (plan §2.1 **A4**) |
| Canonical enum values (`relation_type`, `confidence_state`, `event_type`, `document_type`, `node_kind`, `court_level`, `authority_type`) | `00-foundation` / `FND-03` — this module **consumes** them and writes back rather than forking |
| The binding / potentially binding / persuasive / unknown **rule** (PRD §9.2 bullet 2) and the PRD §9.1 authority hierarchy | `00-foundation` / `FND-10` (`packages/domain/src/legal/**`); consumed at answer time by `12-evidence-safety` / `EVID-04` |
| Chunking, index-tier assignment, embeddings, release build/sign/publish | `04-corpus-contract` / `CRPS-03`…`CRPS-07` |
| Retrieval, exact-identifier ranking, relationship-relevance ranking (PRD §36.3 item 7) | `11-retrieval-engine` / `RETR-03`, `RETR-06` |
| "A single decision MUST NOT be generalised into a universal rule without supporting authority" (PRD §9.2 bullet 7) — an answer-generation rule | `00-foundation` / `FND-07`, `12-evidence-safety` / `EVID-05` |
| Awards, enterprise agreements, FWC research material and pay data | `07-sources-instruments` / `SINS-02`, `SINS-03`, `SINS-04` (see **D10**) |
| Legislation registers and point-in-time legislation machinery | `06-sources-legislation` / `SLEG-01`…`SLEG-10` |
| Evaluation cases for case authority/appeal/treatment (40 cases) | `21-evaluation-600` / `GOLD-12`; full-roster reconciliation `GOLD-16` |
| Source health, quarantine and licensing consoles | `22-internal-admin` / `INTL-02`, `INTL-03`, `INTL-05` |
| Customer-facing source/timeline/relationship screens | `14-search-product` / `FIND-02`, `FIND-05` |
| Cross-boundary security suites under `tests/**` | `23-assurance` |
| Any app-database, tenant or customer-data access | PRD §39.1: *"Python pipeline code never imports tenant/customer packages"* — standing rule, not a deferral |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **`pipelines/adapters/_shared/caselaw/**` is the only code the twelve adapters share.** No adapter copies a case-law helper into its own directory, and no adapter imports another adapter's private modules (the one ordered exception is **D10**). | plan §9 **R2**: *"The shared primitive stays owned by `SLEG-01`/`SINS-01`/`SCAS-01`/`SFUT-01`; a new sibling ticket is added there and the adapters are `blocked_by` it. Never copy the helper into two adapter directories."* | `SCAS-01` |
| D2 | **A treatment relation cannot be constructed without an evidence span, a derivation and a parser version.** `assert_treatment()` takes them as required arguments; there is no evidence-free constructor and `NodeRelationRecord` is frozen. | PRD §9.2 *"MAY be asserted only with evidence"*; PRD §9.3 *"Deterministic extraction may support conclusions **when exact source evidence and parser version are retained**"*; PRD §35.2 `node_relation` carries `evidence_node_version_id`, `evidence_start`, `evidence_end`, `derivation`, `parser_version`, `confidence_state`. | `SCAS-01` |
| D3 | **`CITES` is a terminal value.** `record_citation()` always yields `relation_type = CITES`; no function converts an existing relation into a treatment; an upgrade requires a fresh `assert_treatment()` call with its own evidence. | PRD §9.2: *"A citation alone establishes `CITES`, not treatment."* | `SCAS-01` |
| D4 | **`TREATMENT_NOT_CONFIRMED` is computed, never stored as a guess.** `treatment_status()` returns it for every case pair with no evidenced treatment relation, so the safe answer is the default rather than something a Builder must remember. | PRD §9.2: *"Unconfirmed later treatment MUST display `TREATMENT_NOT_CONFIRMED`."* | `SCAS-01` |
| D5 | **No adapter in this module emits a `MODEL_SUGGESTED` relation.** The emit boundary rejects it with `TREATMENT_MODEL_SUGGESTED_REJECTED`. An adapter has no model port: `INGF-01`'s `AdapterRunContext` exposes fetcher, artifacts, licence, parser, quarantine, records, runs, history, clock and log — and nothing else — so a model-derived relation cannot lawfully originate here. | PRD §9.3; PRD §40.7's eight boundaries; `INGF-01` deliverable 7; PRD §39.1. | `SCAS-01` |
| D6 | **Evidenced treatment changes the treatment graph, not `legal_status`.** A judgment is `IN_FORCE` from its decision date; a reversal or overruling is recorded as a `LegalEvent` plus an evidenced `NodeRelation`, and never rewrites the earlier judgment's PRD §6.7 status. | PRD §9.2 treats treatment as a *relationship*; PRD §36.3 ranks *"authority level and binding/persuasive role"* separately from status; PRD §6.7's `SUPERSEDED`/`REPEALED` are document-version states. See **Q3** — `FND-10` may need the opposite and owns the decision. | `SCAS-01` |
| D7 | **Paragraph number is the stable node key; `[45]` is a display label.** `stable_node_key = para/0045`, `display_label = [45]`. Unnumbered material gets `seq/<ordinal>` and is never renumbered into the numbered space; a duplicate paragraph number is a BLOCKING finding, never a silent merge. | PRD §15.3: *"Provision labels are version-specific display values, not permanent IDs"*; PRD §40.4 `CASE-FCA` requires *"exact paragraphs"*; PRD §36.4 `pinpoint` is a *"Version-specific provision/clause/paragraph label"*. | `SCAS-01` |
| D8 | **This module records court facts; it does not compute bindingness.** Whether an authority binds depends on the *asking* court and jurisdiction, so it cannot be a per-document constant. Adapters emit `authority_type`, `jurisdiction`, `court_level`, appellate/full-bench facts; `FND-10` computes the PRD §9.2 status from them. | PRD §35.2 `authority` (`authority_type`, `jurisdiction`, `court_level`); plan §5.1 gives `FND-10` *"temporal applicability and authority hierarchy"*; PRD §36.3 item 3. | `SCAS-01` |
| D9 | **Only citations that resolve to a corpus document produce a `NodeRelation`.** An unresolved outbound citation is counted in the run report and, when systematic, becomes a `known_gaps` entry in that group's `registry.yaml` — never a dangling relation row. A group emits relations only from documents it owns. | PRD §35.2 `node_relation` requires both endpoints; PRD §6.1 requires *"known gaps"* in the registry; PRD §44.4 forbids implying coverage that does not exist. | `SCAS-01` |
| D10 | **`CASE-FWC` reuses `FWC-DOCS`'s portal discovery and must not fork it.** The document families are split: decisions and orders (with matter/section/bench metadata) belong to `CASE-FWC`; awards, agreements, variations, pay data and research material belong to `FWC-DOCS`/`FWC-AWARDS`/`FWC-AGREEMENTS`. This is why plan §5.9 makes `SCAS-05` `blocked_by SINS-02`. | PRD §40.4 gives `CASE-FWC` the official entry *"FWC Document Search"* — the same portal as PRD §40.3's `FWC-DOCS`; plan §6.2 edge `SINS-02 --> SCAS-05`; plan §4 (read access is unrestricted, only writes are allocated). See **Q4**. | `SCAS-05` |
| D11 | **`_shared/` itself is a PEP 420 implicit namespace package.** `SCAS-01` creates no file at `pipelines/adapters/_shared/` level and no `__init__.py` above `_shared/caselaw/`. | plan §4 allocates `_shared/legislation` (06), `_shared/rates` (07), `_shared/caselaw` (08) and `_shared/future` (10) but **never `_shared/` itself**; `SLEG-01` and `SCAS-01` are concurrent (both `blocked_by INGF-09`), so any file at the `_shared/` root would be an unowned write collision. | `SCAS-01` |
| D12 | **Fixtures are recorded from the official source, never hand-authored.** A file under `fixtures/` that purports to be an official response but was written by hand is a fabrication and a release-blocking defect. If the build environment cannot reach the official site, the ticket escalates (feedback obligation) rather than inventing evidence. | PRD §40.8 items 2 and 4; PRD §6.1 *"Only official public sources are eligible"*; PRD §12.2 (quarantine over guesswork); PRD §44.4. | every adapter ticket |
| D13 | **Aggregators and commercial services are not sources.** Only the official publisher endpoints listed in that group's `registry.yaml`/`allowlist.yaml` are fetched. If a court's only durable public archive is an aggregator, the group records `SOURCE_UNAVAILABLE` or date-limited coverage. | PRD §6.1 *"Only official public sources are eligible … Third-party commercial headnotes and summaries are excluded"*; PRD §40.4 *"the product does not silently substitute a commercial headnote site"*; PRD §11.1. | every adapter ticket |
| D14 | **Officially published anonymisation is preserved; the pipeline never re-identifies.** Adapters ingest judgment text exactly as the court publishes it (including pseudonymised party names) and treat an official removal/suppression as the PRD §40.8 item 3 deletion/unavailability path. | PRD §10.1 (*"public case parties"* are acceptable data, employee PII is not); PRD §40.8 item 3; PRD §12.2. | `SCAS-01`, every adapter ticket |
| D15 | **A limited launch state is evidence-gated, never a scope choice.** No mandatory group in this module is pre-selected for omission or reduced implementation; all twelve are attempted in full; arbitrary scope reduction to make a release date easier is not permitted. A group may launch in one of PRD §7's four limited states (`METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`) **only** where measured evidence shows a genuine official-source limitation — an official capability limit, the official body not publishing the material, a licensing restriction, historical material unavailable, a freshness limitation, or another real official-source constraint — and only with `INGF-07`'s `limitation` block recording the evidence, the affected dates or collections, the customer-visible warning and why full coverage is unavailable. Silent omission is prohibited, and no unofficial source or commercial headnote may substitute for unavailable official material: **D13** restated as launch policy. This module **consumes** `INGF-07`'s schema and never redefines it. `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` verifies the launch statement discloses it accurately; Gate 2 is verification and sign-off, not an opportunity to cut mandatory scope. | plan §8 **Q10** (confirmed policy); `INGF-07` deliverables 2, 3 and 7; PRD §7, §26, §40.4, §44.4. | every adapter ticket |

## Rejected alternatives

| Rejected | Why |
|---|---|
| A `confidence` float on treatment relations, with a threshold | PRD §9.2 is binary — evidenced or not. A threshold is a place for an unevidenced assertion to hide, and PRD §35.2 gives `confidence_state`, not a score. |
| Deriving treatment from a "cases citing this" list on a court page | That list is official structured evidence for `CITES` only. PRD §9.2: *"A citation alone establishes `CITES`, not treatment."* |
| Storing `TREATMENT_NOT_CONFIRMED` as a row per case pair | Quadratic and unfalsifiable. PRD §9.2 requires it to be *displayed*; computing it as the default of `treatment_status()` makes omission impossible (D4). |
| One `case-law` adapter with twelve jurisdiction back-ends | Falsifies plan §2 principle 3 and PRD §44.3 (*"Safe parallel work units are individual source adapters"*), and collapses a twelve-lane wave into one serial ticket. |
| Copying `_shared/caselaw` helpers into each adapter to avoid a dependency edge | plan §9 **R2** forbids exactly this; twelve divergent copies of the treatment rules is the worst possible outcome for PRD §9.2. |
| A shared `courts.yaml` listing every court code for all twelve groups | Serialises twelve concurrent tickets on one file — the failure plan §2.1 **A2** exists to prevent. Court codes are registered per group through `register_court_codes()`. |
| Using AustLII/Jade/commercial reporters because they are easier to parse | PRD §6.1 and §40.4 (D13). An easier parse is not a licence to change the authority of the corpus. |
| Hand-writing "representative" fixtures when the site is unreachable | D12. In a legal-research product, fabricated provenance is worse than missing coverage — PRD §44.4 gives the honest alternative. |
| Letting `CASE-*` groups also ingest awards/agreements they encounter | Duplicate documents under two `source_id`s, and a coverage claim nobody owns. D10 splits the families. |

## Open questions

> **These ids are module-local.** `Q1`…`Q9` below are this sub-PRD's own questions and have nothing to
> do with `docs/prd/breakdown-plan.md` §8's decision-register entries `Q1`…`Q14`. A reference to the
> register is always written out in full as "plan §8 **Qn**"; a bare **Qn** always means the row below.

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| Q1 | Do `packages/contracts`' `relation_type`, `confidence_state` and `event_type` enums (`FND-03`) already contain the values PRD §9.2/§9.3/§15.1 imply — `CITES`, `APPEAL`, `AFFIRMS`, `REVERSES`, `OVERRULES`, `DISTINGUISHES`, `FOLLOWS`, `TREATMENT_NOT_CONFIRMED`, `MODEL_SUGGESTED`, and the appeal-class events? | `00-foundation` (**`FND-03`**) — plan §4.2 makes canonical enums its sole property | `SCAS-01` reads the merged `FND-03` output; a missing value is a **docs PR against `FND-03`**, then `publish-tickets.mjs --sync`, never a local enum | `SCAS-01`'s emit surface; all twelve adapters transitively |
| Q2 | Is `pipelines/adapters` on `sys.path` when `INGF-01`'s `load_adapter()` imports `<group-dir>/adapter.py`, so that `from _shared.caselaw import …` resolves? | `05-ingestion-framework` (**`INGF-01`** owns the loader) | `SCAS-01` follows whatever the merged `INGF-01` loader does and records it in `_shared/caselaw/README.md`; if neither namespace-package import nor an installed `pipelines/adapters` package works, the writeback is a docs PR against `INGF-01` | Every adapter in modules `06`–`10`; raised here because `SCAS-01` is in the first wave that needs it |
| Q3 | Does an evidenced reversal or overruling change the earlier judgment's PRD §6.7 `legal_status`, or only its treatment graph (**D6**)? | `00-foundation` (**`FND-10`**, temporal applicability and authority hierarchy) with `11-retrieval-engine` (`RETR-04`) as consumer | `FND-10`; until then `SCAS-01` implements D6 and exposes the treatment graph so either rule can be computed downstream | Nothing in this module — D6 emits strictly more information than either answer needs |
| Q4 | The exact `FWC-DOCS` ↔ `CASE-FWC` split (**D10**): which portal document families each group ingests, and what `SINS-02` exports for reuse. | this sub-PRD (Architect) jointly with `07-sources-instruments` (**`SINS-02`**) | `SCAS-05`, against the merged `SINS-02`. A disagreement is a docs PR to **both** sub-PRDs, and to `docs/prd/breakdown-plan.md` §5.8/§5.9 if the ticket boundary itself moves | `SCAS-05` only |
| Q5 | Which of the twelve groups, if any, end up carrying a `limitation` block — that is, where measured evidence shows a genuine official-source limitation prevents `ACTIVE`. The **policy** is not open: plan §8 **Q10** is a confirmed policy, recorded here as **D15**, so what remains is a measurement output, not a decision about scope. | measured evidence, not preference — each adapter ticket measures its own group; `21-evaluation-600` (**`GOLD-16`**) consolidates | `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` verifies the launch statement discloses it accurately; the Founder verifies and signs off at Gate 2 under **D15**. Each adapter ticket supplies the evidence and the complete `INGF-07` `limitation` block, never a scope reduction | Launch **disclosure** only — never mandatory scope, which **D15** puts beyond reduction |
| Q6 | The measured per-source anomaly baseline. PRD §40.9's ±10% count change and >2% parse failure are **initial defaults** that each group may tighten once it has a representative baseline (plan §8 **Q9**, baseline-selected — nobody is asked to guess these numbers). Only the per-group baseline is outstanding; the defaults are buildable as they stand. | each adapter ticket, against its own recorded baseline; the defaults live in `INGF-05`, and `INGF-05`/`INGF-09` encode **tighten-only** | per-group `conformance.yaml` `anomaly_overrides` (tighten-only), consolidated and verified in `GOLD-16` | Nothing — critical identity, time, mandatory-source and citation failures are unconditional blockers unaffected by any percentage threshold |
| Q7 | Do `CASE-QLD`, `CASE-WA` and `CASE-TAS` need `_shared/legislation`'s point-in-time machinery for the **operative instruments** PRD §40.4 includes in those rows? | this sub-PRD (Architect); the primitive is `06-sources-legislation` / `SLEG-01` | `SCAS-08`/`SCAS-09`/`SCAS-11`. The default is the `CRPS-01` record contract's own effective-interval fields; if `SLEG-01` is genuinely required, the writeback is a **plan** change adding a `blocked_by SLEG-01` edge in §5.9 and §6.2 — never an unordered cross-module import | `SCAS-08`, `SCAS-09`, `SCAS-11` if it resolves the wrong way |
| Q8 | Whether the twelve groups' fixture recording can be performed at all in the build environment (network reachability, robots/terms compliance, per-site rate limits). | `05-ingestion-framework` (`INGF-02` owns the fetcher and allowlist) + **Founder** for terms questions | each adapter ticket at recording time; an unreachable source is an escalation and a `SOURCE_UNAVAILABLE`/`FRESHNESS_LIMITED` registry status (PRD §7, §12.1), **not** a hand-written fixture (**D12**) | Any group whose portal cannot be recorded |
| Q9 | `INGF-07`'s `registry.yaml` schema has a **singular** `authority:` block, but eight of the twelve groups span several official publishers — PRD §40.4 names *"NSW Caselaw **and** Industrial Relations Commission official collections"*, *"Queensland Courts/Supreme Court Library **and** QIRC"*, *"Tasmanian courts/TASCAT **and** industrial collections"* and so on — each potentially with its own licence terms. | `05-ingestion-framework` (**`INGF-07`** owns the schema); this sub-PRD holds the module-side position | each adapter ticket, following `INGF-07`'s own feedback obligation 1: *"keep **one file per group** and express the multiplicity **inside** it (a list of authorities/collections)"*. A schema change is a docs PR against `INGF-07` plus `docs/prd/05-ingestion-framework/README.md`; a cross-group shared file is never the answer (plan §2.1 **A2**) | Nothing structurally — the multiplicity is expressible inside one file; it decides only whether `INGF-07`'s schema needs a version bump |

## Work breakdown

`lane` = `08-sources-cases` and `agent` = `builder` for all thirteen tickets (plan §1.1). All paths are
relative to the repository root. Every adapter directory follows `INGF-07`'s per-adapter layout
(`registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`,
`adapter.py`, `fixtures/`, `tests/`).

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`SCAS-01`](tickets/SCAS-01-case-law-primitives-citation-level-paragraph-identity-treatment.md) — Case-law primitives: citation, level, paragraph identity, treatment | L | `08-sources-cases` | `pipelines/adapters/_shared/caselaw/**` | `INGF-09` |
| [`SCAS-02`](tickets/SCAS-02-case-hca.md) — `CASE-HCA` | L | `08-sources-cases` | `pipelines/adapters/case-hca/**` | `SCAS-01` |
| [`SCAS-03`](tickets/SCAS-03-case-fca.md) — `CASE-FCA` | L | `08-sources-cases` | `pipelines/adapters/case-fca/**` | `SCAS-01` |
| [`SCAS-04`](tickets/SCAS-04-case-fcfcoa.md) — `CASE-FCFCOA` | L | `08-sources-cases` | `pipelines/adapters/case-fcfcoa/**` | `SCAS-01` |
| [`SCAS-05`](tickets/SCAS-05-case-fwc.md) — `CASE-FWC` | L | `08-sources-cases` | `pipelines/adapters/case-fwc/**` | `SCAS-01`, `SINS-02` |
| [`SCAS-06`](tickets/SCAS-06-case-nsw.md) — `CASE-NSW` | L | `08-sources-cases` | `pipelines/adapters/case-nsw/**` | `SCAS-01` |
| [`SCAS-07`](tickets/SCAS-07-case-vic.md) — `CASE-VIC` | L | `08-sources-cases` | `pipelines/adapters/case-vic/**` | `SCAS-01` |
| [`SCAS-08`](tickets/SCAS-08-case-qld.md) — `CASE-QLD` | L | `08-sources-cases` | `pipelines/adapters/case-qld/**` | `SCAS-01` |
| [`SCAS-09`](tickets/SCAS-09-case-wa.md) — `CASE-WA` | L | `08-sources-cases` | `pipelines/adapters/case-wa/**` | `SCAS-01` |
| [`SCAS-10`](tickets/SCAS-10-case-sa.md) — `CASE-SA` | L | `08-sources-cases` | `pipelines/adapters/case-sa/**` | `SCAS-01` |
| [`SCAS-11`](tickets/SCAS-11-case-tas.md) — `CASE-TAS` | L | `08-sources-cases` | `pipelines/adapters/case-tas/**` | `SCAS-01` |
| [`SCAS-12`](tickets/SCAS-12-case-act.md) — `CASE-ACT` | L | `08-sources-cases` | `pipelines/adapters/case-act/**` | `SCAS-01` |
| [`SCAS-13`](tickets/SCAS-13-case-nt.md) — `CASE-NT` | L | `08-sources-cases` | `pipelines/adapters/case-nt/**` | `SCAS-01` |

### Lane profile (plan §7)

Two waves, peak **twelve** concurrent lanes, not fully serial:

```text
wave 1  SCAS-01
wave 2  SCAS-02 | SCAS-03 | SCAS-04 | SCAS-05 | SCAS-06 | SCAS-07 | SCAS-08 | SCAS-09 | SCAS-10 | SCAS-11 | SCAS-12 | SCAS-13
```

The twelve wave-2 tickets write twelve disjoint directories and share exactly one thing: the
`_shared/caselaw/**` library they are all `blocked_by`. `SCAS-05` additionally waits on `SINS-02`
(cross-module, gated by `/start-all`'s flat DAG).

### Downstream (plan §6.2)

`SCAS-02`, `SCAS-03`, `SCAS-04` and `SCAS-05` gate **`GOLD-12`** (*"Cases: case authority, appeal and
treatment (40)"*, `evals/{cases,gold}/case-treatment/**`, goal *"24/8/8 with
`TREATMENT_NOT_CONFIRMED` behaviour"*). All twelve gate **`GOLD-16`** (*"Full-roster coverage, licence
and freshness reconciliation"*, goal *"Every mandatory group is ACTIVE or explicitly limited — never
silently omitted"*). `SCAS-01` gates only its twelve siblings.

## Acceptance — what makes the module done

The module is done when all thirteen tickets are delivered and:

1. **PRD §44.2 `E14-CASES` exit evidence** — *"Case metadata/paragraph/treatment evidence tests"* —
   exists as running tests: metadata (`SCAS-01` citation/court/bench + every adapter's DoD item 1/3),
   paragraph (`SCAS-01` paragraph identity + every adapter's DoD item 5), treatment evidence
   (`SCAS-01` `assert_treatment` + the negative-control suite, plus per-adapter evidenced-treatment
   fixtures).
2. **PRD §9.2 is mechanically enforced** — no code path in this module can produce a treatment
   relation without a resolvable evidence span, `CITES` is never upgraded in place, and
   `treatment_status()` returns `TREATMENT_NOT_CONFIRMED` for every unevidenced pair (`SCAS-01`,
   D2–D4).
3. **PRD §9.3 is mechanically enforced** — `MODEL_SUGGESTED` cannot be emitted by any adapter in this
   module, and no relation this module emits can change a legal status (`SCAS-01`, D5, D6).
4. **PRD §40.8, all twelve items, per group** — each of `CASE-HCA`, `CASE-FCA`, `CASE-FCFCOA`,
   `CASE-FWC`, `CASE-NSW`, `CASE-VIC`, `CASE-QLD`, `CASE-WA`, `CASE-SA`, `CASE-TAS`, `CASE-ACT`,
   `CASE-NT` passes `python -m <root>.conformance check pipelines/adapters/<group>` in strict mode
   with a committed `conformance-report.json` (PRD §45.4: *"Changes to source adapters include the
   twelve-item adapter Definition of Done."*).
5. **PRD §6.1 / §40.1 / ADM-001** — twelve `registry.yaml` rows compose into the Source Coverage
   Registry with all nine PRD §6.1 attributes and the PRD §40.5 `material_class` per endpoint; each
   group is `ACTIVE` or in an explicit PRD §7 limited state with a customer-visible gap entry
   (`INGF-07`'s composer in `mode="release"` is the check). Any limited group also carries
   `INGF-07`'s complete `limitation` block — state, closed-set `reason_code`, `reason_detail`,
   non-empty `evidence[]`, an `affected` scope and a `customer_visible_warning` — or composition
   fails with `REGISTRY_LIMITATION_MISSING`/`_UNEVIDENCED`/`_SCOPE_MISSING`/`_WARNING_MISSING`
   (**D15**).
6. **PRD §40.4 decomposition** — every group, and in particular the eight state/territory groups,
   links exact official collections; no aggregator or commercial reporter appears in any
   `allowlist.yaml` (D13).
7. **PRD §6.6 historical coverage** — 2026–27, 2025–26 and 2024–25 are covered, or a
   `known_gaps` entry with `customer_visible: true` and reason `DATE_LIMITED` says otherwise; PRD §6.6
   also forbids excluding case law *"solely because it is older than three financial years"*, so a
   date floor is a declared limitation, never a silent one.
8. **`SRCH-004`** — *"Exact provision/case/agreement/ABN matches outrank semantic similarity"*,
   evidence *"Exact-match regression set passes"*: every group emits a normalised
   `legal_document.neutral_citation` (or a recorded reason why the court publishes none), which is
   what `RETR-03` matches on.
9. **`SRCH-005`** — *"Source/version pages expose timeline and relationships without generation"*,
   evidence *"Historical stable link survives later release"*: stable document/node keys and the
   evidenced relation graph are what `FIND-02`/`FIND-05` render.
10. **`SRCH-003`** — *"Snippet offsets reproduce exact NodeVersion text"*: every group's DoD item 5
    round-trip passes at paragraph granularity.
11. **PRD §26 (Corpus)** — wave 3 has *"active or explicitly limited registry status"* for all twelve
    groups, evidenced by `GOLD-16`'s reconciliation, and PRD §44.4 is satisfied because no group is
    reported covered without a passing conformance report. No group was pre-selected for omission or
    reduced implementation, and no group reached a limited state without measured evidence (**D15**).
12. `uv run pytest` and `pnpm test` are green on the merged default branch after every ticket
    (PRD §45.3, plan §1.1).

## Changelog

- **v0.2 — 2026-08-03** — aligned with `docs/prd/breakdown-plan.md` §8's decision register. Plan §8
  **Q10** (which source groups may launch in a limited state) is a **confirmed policy** and is no
  longer an open Founder decision; it is recorded here as new decision **D15**: every one of the
  twelve mandatory groups is attempted in full, none is pre-selected for omission or reduced
  implementation, arbitrary scope reduction is not permitted, and a limited state is allowed only on
  measured evidence of a genuine official-source limitation, recorded through `INGF-07`'s
  `limitation` block (`state`, closed-set `reason_code`, mandatory `reason_detail`, non-empty
  `evidence[]`, an `affected` scope and a `customer_visible_warning`). Local **Q5** is re-framed from
  a pending Founder launch decision to the `GOLD-16` measurement output it always was, and local
  **Q6** from "placeholder" thresholds to plan §8 **Q9**'s baseline-selected initial defaults
  (tighten-only; critical identity, time, mandatory-source and citation failures remain unconditional
  blockers). All twelve adapter tickets `SCAS-02`…`SCAS-13` now consume the `INGF-07` contract in
  deliverable 1, the acceptance checklist, the licence deliverable, the feedback obligation and the
  escalation rule; no evidence-collection or customer-visible-limitation requirement was removed, and
  the PRD §40.8 twelve-item DoD and the PRD §9.2/§9.3 case-treatment invariants are untouched. Local
  **Q1**–**Q4** and **Q7**–**Q9** are unchanged and remain open. Reminder: this module's `Q1`…`Q9` are
  module-local ids and are **not** the plan register's `Q1`…`Q14`.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.9 (13 tickets,
  `SCAS-01`…`SCAS-13`). Records D1–D14 (evidence-backed treatment, terminal `CITES`, computed
  `TREATMENT_NOT_CONFIRMED`, no `MODEL_SUGGESTED` from adapters, paragraph identity, court facts
  without bindingness, resolved-citations-only relations, the `FWC-DOCS`/`CASE-FWC` family split,
  `_shared/` as a namespace package, recorded-not-authored fixtures, official-publishers-only, and
  preserved official anonymisation) and raises Q1–Q9, of which Q1, Q2, Q3, Q4, Q7 and Q9 are
  cross-module and Q5, Q6, Q8 carry plan §8 questions forward.
