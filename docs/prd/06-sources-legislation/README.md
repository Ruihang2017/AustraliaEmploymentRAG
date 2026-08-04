# 06-sources-legislation — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.7. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `06-sources-legislation` |
| Lane | `06-sources-legislation` |
| Ticket prefix | `SLEG` |
| Tickets | 10 (`SLEG-01` … `SLEG-10`) |
| Agent | `builder` (all 10, plan §1.1) |
| Epics | `E09-LEG-CTH`, `E10-LEG-STATES` (PRD §44.2) |
| Write-owns | `pipelines/adapters/_shared/legislation/**` · `pipelines/adapters/leg-{cth,nsw,vic,qld,wa,sa,tas,act,nt}/**` (plan §4) |
| Depends on module | `05-ingestion-framework` |
| Requirement families | `SRCH-002`, `SRCH-003`, `SRCH-005`; supports `ADM-001`, `SEC-002` |
| Language/toolchain | Python (`uv`, `pytest`) — PRD §18.2 "Ingestion/build/evaluation \| Local Python pipeline", PRD §20.1, PRD §45.3 |
| Version | v0.2 |

## Problem

PRD §7 wave 1 is **"Primary operative law: Commonwealth and all state/territory legislation
registers, history, commencement, amendment and repeal."** PRD §40.2 turns that into nine mandatory
source groups — `LEG-CTH`, `LEG-NSW`, `LEG-VIC`, `LEG-QLD`, `LEG-WA`, `LEG-SA`, `LEG-TAS`,
`LEG-ACT`, `LEG-NT` — each with a named official register, required document families, a minimum
adapter capability and an initial index tier. Nothing else in the product works without them:

- **Search** cannot satisfy `SRCH-002` ("Every result independently passes all hard filters") or
  `SRCH-005` ("Source/version pages expose timeline and relationships without generation") unless
  each register emits versions with real effective intervals and evidenced status events.
- **Point-in-time retrieval** must cover three financial years at launch (PRD §6.6: 2026–27,
  2025–26, 2024–25), which only the registers can supply.
- **Nine downstream modules' tickets are gated on these nine adapters.** Plan §6.2:
  `SLEG-02`…`SLEG-10` each block a payroll-tax adapter (`SINS-07`…`SINS-14`), an adjacent-regime
  adapter (`SADJ-01`…`SADJ-09`), a future-law adapter (`SFUT-02`…`SFUT-10`), the state/federal
  evaluation case sets (`GOLD-05`, `GOLD-09`) and the full-roster reconciliation (`GOLD-16`).
  `SLEG-01` additionally blocks `SINS-01` (`_shared/rates`) and `SFUT-01` (`_shared/future`).

The failure mode this module must not produce is the one PRD §44.4 names explicitly:

> "It is not permitted to silently call an unimplemented source category covered."

and PRD §7:

> "No mandatory source group may remain `PLANNED_NOT_ACTIVE` at release. A group blocked by official
> capability or licensing MUST use an explicit status such as `METADATA_AND_LINK_ACTIVE`,
> `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED` or `SOURCE_UNAVAILABLE` and MUST produce
> customer-visible warnings when relevant."

**How that limited state may be used is settled policy, not an open launch question.** Plan §8
**Q10** is confirmed: no mandatory source group is pre-selected for omission or reduced
implementation, all nine wave-1 registers in the approved MVP scope must be attempted in full, and
arbitrary scope reduction to make a release date easier is not permitted. A group may launch in a
customer-visible limited state **only** where measured evidence shows a genuine official-source
limitation prevents `ACTIVE`, and it then carries `INGF-07`'s `limitation` block recording the
evidence, the affected dates or collections, the customer-visible warning and why full coverage is
unavailable. Silent omission is prohibited and no unofficial source or commercial headnote may
substitute for unavailable official material. See decision **D13**.

Two shapes of work follow. **One** ticket builds the legal machinery every register shares —
point-in-time version resolution, evidenced status events, node lineage and the PRD §40.2
subject/title allowlist. **Nine** tickets each build exactly one register's adapter to the twelve-item
PRD §40.8 Definition of Done, in nine disjoint directories, so they run as nine parallel lanes
(plan §7: 10 tickets, min 2 waves, 9 useful lanes — the widest module in the plan alongside
`07`/`08`). PRD §44.3 is explicit that this is the safe unit: *"Safe parallel work units are
individual source adapters."*

## Scope

| In scope | Ticket |
|---|---|
| Shared legislation primitives: point-in-time version resolution, `LegalEvent` vocabulary + evidence rule, PRD §6.7 status derivation, node lineage (renumber/replace/split/merge), the `titles.yaml` subject/title-allowlist schema with dependency expansion, financial-year coverage helper, legislation validation findings and failure codes | `SLEG-01` |
| `LEG-CTH` — Federal Register of Legislation: Acts, regulations/instruments, compilations, as-made, amendments, commencement, repeal, histories | `SLEG-02` |
| `LEG-NSW` — NSW legislation: in-force/repealed/as-made Acts/instruments, point-in-time versions, commencement tables | `SLEG-03` |
| `LEG-VIC` — Victorian legislation: in-force/superseded/as-made Acts/statutory rules, versioned authorised PDFs, history | `SLEG-04` |
| `LEG-QLD` — Queensland Legislation: Acts, subordinate legislation, point-in-time reprints, future annotations | `SLEG-05` |
| `LEG-WA` — WA Legislation: Acts, subsidiary legislation, gazettes and historical versions where official, stable identity | `SLEG-06` |
| `LEG-SA` — South Australian Legislation: Acts, regulations/rules, proclamations/notices, historical index | `SLEG-07` |
| `LEG-TAS` — Tasmanian Legislation Online: Acts/statutory rules, point-in-time, as-made/uncommenced | `SLEG-08` |
| `LEG-ACT` — ACT Legislation Register: Acts, subordinate laws, disallowable/notifiable instruments, commencement notices, republications, instrument relations | `SLEG-09` |
| `LEG-NT` — NT Legislation: in-force/historical Acts and subordinate law, as-made, gazettes | `SLEG-10` |

Each of the nine adapter tickets delivers the **same twelve artefacts** (PRD §40.8): registry row +
URL allowlist + licence snapshot/assessment; discovery fixture + live dry-run evidence; stable
identity/version/deletion rules; representative HTML/XML/JSON/PDF fixtures; parser/node round-trip
tests; three-time-point history; incremental no-change/changed/removed/transient-failure tests;
count/hash baseline and anomaly thresholds; freshness schedule with last-check/last-ingest
separation; quarantine cases with operator recovery actions; a retrieval/citation evaluation subset;
and measured storage, parse time, index size and peak memory.

## Non-goals

| Not in this module | Owner |
|---|---|
| The adapter interface, safe fetcher, artifact store, licence gate, parser/OCR host, quarantine, run accounting, registry composition, discovery scheduler and conformance kit | `05-ingestion-framework` / `INGF-01`…`INGF-09` |
| The `corpus.sqlite` schema and the intermediate normalised-record payload types | `04-corpus-contract` / `CRPS-01` (plan §2.1 **A4**) |
| Chunking, index-tier assignment, embeddings, release build/validation/signing/publish | `04-corpus-contract` / `CRPS-03`…`CRPS-07` |
| Bills, explanatory memoranda, drafts, consultations and the current-vs-future separation model | `10-sources-future` / `SFUT-01`…`SFUT-10` (decision **D6**) |
| Awards, agreements, FWC/FWO/ATO material and payroll-tax **rates/guidance** | `07-sources-instruments` (payroll-tax *legislation* is in this module's title allowlist — decision **D7**) |
| Court, commission and tribunal decisions | `08-sources-cases` |
| Regulator guidance, codes and policy for WHS/discrimination/compensation/labour-hire/LSL regimes | `09-sources-adjacent` (the underlying *legislation* is in this module's title allowlist — **D7**) |
| Evaluation cases, gold answers, metrics and full-roster reconciliation | `21-evaluation-600` / `GOLD-05`, `GOLD-09`, `GOLD-16` |
| Internal source-health / quarantine / licensing consoles | `22-internal-admin` / `INTL-02`, `INTL-03`, `INTL-05` |
| Customer-facing source and coverage screens | `14-search-product` / `FIND-05` |
| Corpus promotion, rollback and the active pointer | `18-ops-release` / `RLSE-07` |
| Cross-boundary SSRF/security suites under `tests/security/**` | `23-assurance` / `ASSR-02` |
| Any app-database, tenant or customer-data access | PRD §39.1: "Python pipeline code never imports tenant/customer packages" — standing rule, not a deferral |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **All version/commencement/repeal/lineage machinery lives once, in `pipelines/adapters/_shared/legislation/**`.** The nine adapters import it; none copies it and none may write it. | Plan §9 **R2**: "The shared primitive stays owned by `SLEG-01` … Never copy the helper into two adapter directories." Plan §5.7 gives `SLEG-01` exactly this goal. `SINS-01` and `SFUT-01` are `blocked_by SLEG-01` (plan §6.2), so the surface is also modules 07 and 10's contract. | `SLEG-01` |
| D2 | **Layout: `pipelines/adapters/` is the uv workspace member root; `_shared` is the only importable package under it. Group directories are loaded by *path*, never imported by name.** Group ids contain hyphens (`leg-cth`) and are not Python identifiers; `INGF-01`'s `load_adapter(group_dir)` imports `<group_dir>/adapter.py` directly. `SLEG-01` reads `FND-01`'s committed `pipelines/adapters/pyproject.toml` and follows it; only if it declares no package does `SLEG-01` append `_shared`. | Plan §4 writes the scope as `pipelines/adapters/_shared/legislation/**` and `pipelines/adapters/leg-*/**` — both direct children of `pipelines/adapters/`. `INGF-01` deliverable 9: `iter_adapter_dirs` "yields every direct child of `pipelines/adapters/` that is not prefixed `_`". `INGF-07` deliverable 1 fixes the per-group file layout. PRD §20.1 lists `pipelines/adapters` as a member; `FND-01` creates its manifest (plan §1.1). | `SLEG-01`; open question **L2** |
| D3 | **`pipelines/adapters/pyproject.toml` is shared-additive across modules `06`–`10`, append-only, conflicts resolved by re-running `uv lock` — never hand-merged.** In practice adapter tickets append **nothing**: `INGF-01` deliverable 11 and `INGF-02` deliverable 8 architecture tests forbid any module under `pipelines/adapters/**` from importing an HTTP or document-parsing library, so adapters have no third-party dependency to declare. | Plan §1.1 ("within a module a manifest is append-only shared, and conflicts resolve by re-running the package manager"), extended to the one PRD §20.1 member that plan §4 splits across five modules. PRD §44.3's lockfile rule. PRD §37.4: "Adapters use a shared fetcher, not arbitrary HTTP libraries." | `SLEG-01` (first writer); open question **L1** |
| D4 | **Per-group file ownership follows plan §2.1 A2.** Every group owns its own `registry.yaml`, `allowlist.yaml`, `licence.yaml`, `licence-snapshots/`, `conformance.yaml`, `titles.yaml`, `adapter.py`, `fixtures/` and `tests/`. This module creates **no** cross-group shared document other than `_shared/legislation/**`. | Plan §2.1 **A2**: "composed at build time from per-adapter files … never one shared document … one shared file would serialise all 52 adapter tickets." `INGF-07` deliverable 1 + its A2 guarantee test. | every adapter ticket |
| D5 | **`titles.yaml` — schema in `SLEG-01`, content per adapter.** A group's title allowlist lists each included title with its inclusion reason (`SUBJECT_MATCH` or `DEPENDENCY_EXPANSION` naming the depending title), so coverage claims are auditable. | PRD §40.2: "Wave 1 is scoped to employment-related titles and their necessary amending, commencement, transitional and interpretation instruments—not every unrelated law in each register. **A maintained subject/title allowlist plus dependency expansion records why each title is included.**" A2's anti-serialisation principle applied to the allowlist. | `SLEG-01` (schema), each adapter (content) |
| D6 | **Bills and the current-vs-future separation model are module `10`'s.** Wave-1 adapters ingest the register's Act/instrument material and emit PRD §6.7 statuses **honestly** for it — including `ENACTED_NOT_IN_FORCE` for registered-but-uncommenced material, because PRD §15.2 requires status to follow the evidence. They do not ingest Bills, explanatory memoranda, drafts or consultations, and they do not build the separation/labelling model. | PRD §40.2 lists Bills among register document families, PRD §40.6 assigns `FUTURE-*` "Bill/draft/proclamation/commencement/repeal status without contaminating current-law answers", and PRD §6.5 requires future material to be "separated from current-law answers and visibly labelled". The DAG settles the direction: `SFUT-02`…`SFUT-10` are `blocked_by` `SLEG-02`…`SLEG-10` (plan §6.2), never the reverse. | `SLEG-01`; each adapter's non-goals |
| D7 | **Title-allowlist scope is PRD §6.2 (Commonwealth) / PRD §6.3 (states and territories) — including payroll-tax legislation, WHS/OHS, discrimination, workers compensation, labour hire, portable and ordinary long service leave, surveillance/privacy, whistleblowing, child employment and public-sector employment — plus dependency expansion.** | PRD §6.3 enumerates exactly those topics per jurisdiction. It is why plan §6.2 makes `SINS-07`…`SINS-14` (payroll tax) and `SADJ-02`…`SADJ-09` (adjacent regimes) `blocked_by` the matching `SLEG` ticket: those modules add rates, rulings and regulator guidance **on top of** legislation this module has already ingested. | each adapter ticket |
| D8 | **A capability the register does not actually provide is a registry status plus a writeback, never a silent downgrade.** PRD §40.2's "Minimum adapter capability" column is a requirement, not an observation; when the live register cannot meet it the adapter sets `adapter_status` to one of `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`, adds a `known_gaps` entry with `customer_visible: true`, fills the `limitation` block **D13** requires, and updates this README **before** merging. | PRD §7 (the four limited statuses, customer-visible warnings), PRD §12.1 ("Sources without reliable delta mechanisms MUST show `FRESHNESS_LIMITED` rather than a false guarantee"), PRD §44.4, PRD §6.1 ("Customer-facing coverage language MUST refer to the published/auditable source registry and visible limitations"), and the confirmed limited-state policy in plan §8 **Q10**, which now backs this rule instead of leaving it pending. | every adapter ticket |
| D9 | **Historical depth: the three PRD §6.6 financial years (2024–25, 2025–26, 2026–27) at version and node level; still-operative older instruments are not excluded merely for age.** A narrower window is a `DATE_LIMITED` `known_gaps` entry marked `customer_visible: true`, plus a writeback. | PRD §6.6 verbatim, including "Case law and still-operative instruments MUST NOT be excluded solely because they are older than three financial years." `INGF-07`'s `registry.yaml` requires `document_coverage.financial_years` to cover the minimum or explain the gap. | `SLEG-01` (helper), each adapter (coverage) |
| D10 | **No synthesised consolidations.** Where a register publishes no consolidated point-in-time text for a date in the §6.6 window, the adapter emits the versions the register actually publishes and records a `DATE_LIMITED` gap. It never reconstructs a consolidated text from as-made plus amendments and presents it as an official version. **ADR candidate** (see L6). | PRD §6.1: "Only official public sources are eligible for the corpus." A machine-reconstructed consolidation is a derived work, not an official source, and PRD §9.1's authority hierarchy would rank it as if it were primary law. PRD §45.5 classes a durable choice like this as an "Architecture decision". | `SLEG-01` |
| D11 | **Legal status is derived from evidenced events, never scraped as a display string.** Every emitted `legal_status` traces to a `LegalEvent` with an `evidence_node_version_id`; where no evidence exists the status is `STATUS_UNCONFIRMED`. | PRD §15.2: "Legal status MUST be derived from evidenced LegalEvents. Cached status fields MAY improve performance but are not the authoritative history." PRD §35.2 `legal_event.evidence_node_version_id`; `node_relation.confidence_state` ("`MODEL_SUGGESTED` cannot support definitive status"). | `SLEG-01` |
| D12 | **Every DoD item is proved offline from recorded fixtures.** The single live interaction per group is a one-time discovery dry run whose evidence is committed as `fixtures/dry-run.json`; all twelve checks then replay through `INGF-09`'s `ReplayFetcher`, which still enforces that group's `allowlist.yaml`. | `INGF-09` deliverable 6 and its non-goal "No live network access. 'Live dry-run evidence' (item 2) is a **recorded artifact** the adapter ticket commits". PRD §20.3 requires Python tests to run in CI; CI has no licence to hit nine government registers. | every adapter ticket |
| D13 | **The limited-state launch policy is confirmed, and a limited state is an evidenced record, never a scope choice.** Plan §8 **Q10** settles it: no mandatory source group is pre-selected for omission or reduced implementation; all nine wave-1 registers must be attempted in full; arbitrary scope reduction to make a release date easier is not permitted; a group may launch in one of PRD §7's four limited states **only** on measured evidence of a genuine official-source limitation — an official capability limit, the official body not publishing the material, a licensing restriction, historical material unavailable, a freshness limitation, or another real official-source constraint; that state records the evidence, the affected dates or collections, the customer-visible warning and why full coverage is unavailable; silent omission is prohibited and no unofficial source or commercial headnote may substitute for unavailable official material. Mechanically this module **consumes** `INGF-07`'s contract and does not redefine it: `registry.yaml.limitation` is non-null exactly when `adapter_status` is one of the four limited states, with `state` equal to `adapter_status`, a `reason_code` from the closed set `OFFICIAL_CAPABILITY_LIMIT \| MATERIAL_NOT_PUBLISHED \| LICENSING_RESTRICTION \| HISTORICAL_MATERIAL_UNAVAILABLE \| FRESHNESS_LIMITATION \| OTHER_OFFICIAL_SOURCE_CONSTRAINT`, a mandatory `reason_detail`, a non-empty `evidence[]`, an `affected` scope and a `customer_visible_warning`. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the launch statement discloses it, and Gate 2 is verification and sign-off under this policy — not an opportunity to cut mandatory scope. | Plan §8 **Q10** (confirmed policy); PRD §7, §26, §44.4, §6.1; `INGF-07` deliverables 2–3 and 6–7. | every adapter ticket; consolidated by `GOLD-16` |

## Rejected alternatives

| Rejected | Why |
|---|---|
| One `legislation` adapter parameterised over nine registers | Collapses nine parallel lanes into one serial ticket and one write-set — the exact failure plan §2 exists to prevent. PRD §44.3 names "individual source adapters" as the safe parallel unit; plan §7 records this module at 9 useful lanes. |
| Copying the point-in-time / event helpers into each `leg-*` directory | Plan §9 **R2** forbids it verbatim: "Never copy the helper into two adapter directories." Nine divergent copies of the status-derivation rule is nine different legal answers. |
| One shared `titles.yaml` (or `sources.yaml`) covering all nine jurisdictions | Serialises nine tickets on one file — plan §2.1 **A2**; `INGF-07`'s A2 guarantee test would also fail it. |
| Letting each adapter define its own `LegalEvent` type vocabulary | `SRCH-005` requires timelines and relationships to render uniformly across jurisdictions, and `WTCH-02`'s change matching consumes one event stream. Divergent vocabularies would push the normalisation into the consumer. |
| Scraping the register's own status label ("In force", "Repealed") as `legal_status` | PRD §15.2 requires derivation from evidenced events. A scraped string has no `evidence_node_version_id` and cannot support PRD §9.1's authority reasoning or `SRCH-002`'s status filter. |
| Reconstructing consolidated point-in-time text from as-made + amendments where the register publishes none | D10: PRD §6.1 admits only official public sources; a synthesised consolidation would be presented with the authority of primary law it does not have. |
| Substituting a commercial consolidator or headnote service where an official register is awkward | PRD §6.1: "Third-party commercial headnotes and summaries are excluded"; PRD §40.4 states the same rule for decisions ("the product does not silently substitute a commercial headnote site"). |
| Ingesting each register wholesale and filtering later | PRD §40.2: "not every unrelated law in each register". It also breaks PRD §39.2's storage budget and PRD §17.2's tiering assumptions. |
| Marking a group `ACTIVE` when point-in-time or change detection is not actually available | PRD §7, §12.1 and §44.4. D8 gives the four explicit limited statuses instead. |
| Adapters calling `httpx`/`requests` or a PDF library directly | PRD §37.4 requires the shared fetcher and the isolated parser host; `INGF-01` deliverable 11 and `INGF-02` deliverable 8 fail the build on it. |
| Adding Bill tracking to wave 1 because §40.2 lists Bills | D6. `FUTURE-*` (module `10`) owns it and is already ordered after this module in the DAG; duplicating it here would create two owners for `BILL_NOT_ENACTED`. |
| Hitting the live registers in CI | D12. PRD §20.3 runs Python tests on every PR; nine registers × every PR is neither polite nor reproducible, and `INGF-09` is built for replay. |

## Open questions

None blocks Gate 1. Each has a named owner.

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| L1 | `pipelines/adapters/pyproject.toml` is a single PRD §20.1 member that plan §4 splits across five modules (`06`–`10`); no plan row allocates the manifest itself. D3 treats it as shared-additive/append-only. | this sub-PRD (Architect) → writeback to `docs/prd/breakdown-plan.md` §4 | `SLEG-01` as first writer; confirmed when `SINS`/`SCAS`/`SADJ`/`SFUT` land | Nothing — D3's rule is conflict-free because adapters declare no dependencies. |
| L2 | The import root and packaging style of the `pipelines/adapters` member (D2). `FND-01` creates the manifest; its choice governs. | `00-foundation` / **`FND-01`** | `SLEG-01` reads the committed manifest and follows it; falls back to declaring `_shared` | Every import path in modules `06`–`10`. `FND-01` is wave 1, so this is settled before `SLEG-01` starts. |
| L3 *(plan §8 Q9 — baseline-selected)* | Per-source anomaly thresholds. The ±10% count change and >2% parse failure are **initial defaults**, tightened per source once that source has a representative baseline (PRD §40.9). They are measured outputs, not numbers anyone is asked to guess. | each adapter ticket, from its own baseline; defaults in `INGF-05` | per-adapter DoD item 8 (`conformance.yaml` `anomaly_overrides`, **tighten-only** in `INGF-05`/`INGF-09` — a genuinely looser percentage is a writeback to `GOLD-16`, never a local override); consolidated in `GOLD-16` | Nothing — critical identity, time, mandatory-source and citation failures block release unconditionally, whatever the percentages say. |
| L4 *(plan §8 Q10 — policy confirmed in **D13**; only the measurement remains)* | Whether any wave-1 group turns out to have a genuine official-source limitation and so carries a `limitation` block at launch. Not a scope decision and not a preference: every group is attempted in full, and only measured evidence can produce a limited state. | `GOLD-16` produces the measured evidence and the proposed registry state; the Founder verifies and signs off at Gate 2 **under D13**, which cannot be used to cut mandatory scope | `GOLD-16` → `LNCH-05`; this module supplies each group's `registry.yaml` evidence and, where the evidence requires it, its `limitation` block | Nothing in this module — every ticket builds its group in full either way. |
| L5 | Which titles count as "employment-related" is a legal-scope judgement, and PRD §6.1 forbids over-claiming coverage. Who signs off each jurisdiction's `titles.yaml`? | **Founder** (PRD §43.4 item 4 "source adapter … anomalies"; PRD §41.3 step 1 shows coverage to the customer) | each adapter ticket records a per-title inclusion reason (D5); `GOLD-05`/`GOLD-09` exercise it; the Founder reviews at Gate 2 | Nothing — D5 makes the claim auditable either way. |
| L6 | Where a register publishes no consolidated point-in-time version for part of the PRD §6.6 window, is a gap acceptable (D10) or must the adapter reconstruct? D10 says gap. **ADR candidate** — `docs/adr/NNNN-no-synthesised-consolidations.md`, owned by the creating ticket per plan §2.1 **A9**. | this sub-PRD (Architect) → **`SLEG-01`** records the ADR if it proves durable | `SLEG-01`; each affected adapter records the `DATE_LIMITED` gap | Nothing before an actual gap is found; then it is a `known_gaps` entry, not a code decision. |
| L7 | Each register's licence terms differ (Crown copyright variants, CC-BY variants); the `max_quote_chars` and assessment status per group are legal calls. | **Founder** (`05-ingestion-framework` M2; PRD §11.2 keeps `LEGAL_REVIEW_PENDING` an explicit launch risk) | each adapter captures the snapshot and records a conservative `licence.yaml`; unclear rights collapse to metadata/link-only through `INGF-04`'s gate | Nothing — the collapse is conservative by construction (PRD §11.1). |
| L8 | `INGF-09` DoD item 11 needs an evaluation subset that `21-evaluation-600` authors later (`GOLD-05`, `GOLD-09`). | `21-evaluation-600`; ids declared here in `registry.yaml.evaluation_subset_ref` | `GOLD-16` reconciles; until `evals/cases/**` exists the item reports `DEFERRED(GOLD-16)` — the single deferrable item | Nothing. `evals/gold/**` is never read by this module (plan §9 **R9**, PRD §45.1 item 6). |

## Work breakdown

`lane` = `06-sources-legislation` and `agent` = `builder` for all ten tickets (plan §1.1). Paths are
repository-relative.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`SLEG-01`](tickets/SLEG-01-legislation-adapter-primitives-point-in-time-events-title-allowlist.md) — Legislation adapter primitives (point-in-time, events, title allowlist) | L | `06-sources-legislation` | `pipelines/adapters/_shared/legislation/**`; first writer of `pipelines/adapters/pyproject.toml` (D3) | `INGF-09` |
| [`SLEG-02`](tickets/SLEG-02-leg-cth-federal-register-of-legislation.md) — `LEG-CTH` — Federal Register of Legislation | L | `06-sources-legislation` | `pipelines/adapters/leg-cth/**` | `SLEG-01` |
| [`SLEG-03`](tickets/SLEG-03-leg-nsw.md) — `LEG-NSW` | L | `06-sources-legislation` | `pipelines/adapters/leg-nsw/**` | `SLEG-01` |
| [`SLEG-04`](tickets/SLEG-04-leg-vic.md) — `LEG-VIC` | L | `06-sources-legislation` | `pipelines/adapters/leg-vic/**` | `SLEG-01` |
| [`SLEG-05`](tickets/SLEG-05-leg-qld.md) — `LEG-QLD` | L | `06-sources-legislation` | `pipelines/adapters/leg-qld/**` | `SLEG-01` |
| [`SLEG-06`](tickets/SLEG-06-leg-wa.md) — `LEG-WA` | L | `06-sources-legislation` | `pipelines/adapters/leg-wa/**` | `SLEG-01` |
| [`SLEG-07`](tickets/SLEG-07-leg-sa.md) — `LEG-SA` | L | `06-sources-legislation` | `pipelines/adapters/leg-sa/**` | `SLEG-01` |
| [`SLEG-08`](tickets/SLEG-08-leg-tas.md) — `LEG-TAS` | L | `06-sources-legislation` | `pipelines/adapters/leg-tas/**` | `SLEG-01` |
| [`SLEG-09`](tickets/SLEG-09-leg-act.md) — `LEG-ACT` | L | `06-sources-legislation` | `pipelines/adapters/leg-act/**` | `SLEG-01` |
| [`SLEG-10`](tickets/SLEG-10-leg-nt.md) — `LEG-NT` | L | `06-sources-legislation` | `pipelines/adapters/leg-nt/**` | `SLEG-01` |

### Lane profile (plan §7)

Two waves, peak nine concurrent lanes, **not fully serial**:

```text
wave 1  SLEG-01
wave 2  SLEG-02 | SLEG-03 | SLEG-04 | SLEG-05 | SLEG-06 | SLEG-07 | SLEG-08 | SLEG-09 | SLEG-10
```

The nine wave-2 lanes are disjoint by construction: each writes exactly one
`pipelines/adapters/leg-<jur>/**` directory, and the only path they share is
`pipelines/adapters/pyproject.toml`, which D3 keeps append-only and which in practice they do not
touch at all.

### Downstream (plan §6.2)

- `SLEG-01` blocks `SLEG-02`…`SLEG-10`, `SINS-01` (`_shared/rates`) and `SFUT-01` (`_shared/future`).
- `SLEG-02` blocks `SADJ-01`, `SFUT-02`, `GOLD-05`, `GOLD-16`.
- `SLEG-03`…`SLEG-10` each block their jurisdiction's payroll-tax adapter (`SINS-07`…`SINS-14`),
  adjacent-regime adapter (`SADJ-02`…`SADJ-09`), future-law adapter (`SFUT-03`…`SFUT-10`), plus
  `GOLD-09` and `GOLD-16`.

Two consequences bind this module. First, `SLEG-01`'s public surface is a **cross-module contract**
(modules `07` and `10` build on it), so a change after merge requires re-publishing the dependent
tickets. Second, each register's title allowlist must already contain the payroll-tax and
adjacent-regime legislation those downstream modules assume (**D7**).

## Acceptance — what makes the module done

The module is done when all ten tickets are delivered and:

1. **PRD §40.8, all twelve items, for all nine groups.** `python -m <root>.conformance check
   pipelines/adapters/leg-<jur>` exits `0` in **strict** mode for each of the nine, and each PR
   attaches its `conformance-report.json` with `summary.pass` covering every item except a
   `DEFERRED(GOLD-16)` item 11 (`INGF-09` deliverables 4–5; PRD §45.4 "Changes to source adapters
   include the twelve-item adapter Definition of Done").
2. **PRD §7 / §40.1 / §44.4 — coverage is honest.** All nine wave-1 group IDs of `INGF-07`'s
   `MANDATORY_SOURCE_GROUPS` have a directory and a valid `registry.yaml`, and every one has an
   `adapter_status` for which `is_release_acceptable()` is true — `ACTIVE`, or one of
   `METADATA_AND_LINK_ACTIVE` / `FRESHNESS_LIMITED` / `LICENSING_RESTRICTED` / `SOURCE_UNAVAILABLE`
   with a `customer_visible: true` gap entry **and** a complete `limitation` block carrying the
   measured evidence, the affected dates or collections and the customer-visible warning (**D13**).
   `compose_registry(mode="release")` reports no `MANDATORY_GROUP_MISSING` for wave 1 and no
   `REGISTRY_LIMITATION_*` failure.
3. **`SRCH-002`** — "Advanced Search applies date, jurisdiction, type, authority and status filters …
   Every result independently passes all hard filters" (PRD §30.2). Every emitted `DocumentVersion`
   carries a non-null `jurisdiction` (via its `source`/`authority`), `document_type`,
   `effective_from`, `legal_status` from PRD §6.7's seven values, and evidenced events behind that
   status — the inputs PRD §36.2's eligibility predicate filters on.
4. **`SRCH-003`** — "Snippet offsets reproduce exact NodeVersion text" (PRD §30.2). DoD item 5's
   exact-text round-trip passes for every document fixture in all nine groups, and every
   `document_version` carries an `official_url` (PRD §15.3, §35.2).
5. **`SRCH-005`** — "Source/version pages expose timeline and relationships without generation …
   Historical stable link survives later release" (PRD §30.2). Each group emits `legal_event` rows
   with `evidence_node_version_id` and `node_relation` rows for renumber/replace/split/merge, and
   DoD item 3 proves `stable_source_key`/`stable_node_key` stability across two versions.
6. **PRD §6.6** — the three financial years 2024–25, 2025–26 and 2026–27 resolve to a version for
   every group (DoD item 6's three time points), or a `DATE_LIMITED` customer-visible gap explains
   why not (**D9**).
7. **PRD §6.1 / §11.1 / `ADM-001`** — every group has an immutable `licence-snapshots/` capture whose
   SHA-256 matches `licence.yaml.snapshot.terms_sha256`, and a `LicenceAssessment` stating all nine
   decision axes; unclear rights collapse to metadata/link-only through `INGF-04`'s gate.
8. **PRD §12.1 / `SEC-002`** — each group declares `change_detection.{capability,cadence}` and proves
   last-check / last-ingest separation (DoD item 9); every `official_endpoints` URL is inside that
   group's `allowlist.yaml`, and `ReplayFetcher` refuses an off-allowlist fixture URL.
9. **PRD §26 (Corpus)** — "All five source waves have active or explicitly limited registry status"
   has its wave-1 evidence, and "Current financial year plus the preceding two financial years
   (three total) are validated" holds for legislation.
10. **PRD §44.2 exit evidence** — `E09-LEG-CTH`: "Adapter DoD + temporal search fixture";
    `E10-LEG-STATES`: "Each group has independent DoD/report".
11. `uv run pytest` and `pnpm test` are green on the merged default branch after every ticket
    (PRD §45.3, PRD §20.3 "Rust and Python builds/tests", plan §1.1).

## Changelog

- **v0.2 — 2026-08-03** — writeback of the `docs/prd/breakdown-plan.md` §8 decision register.
  **Q10 (limited-state launch policy) is now a confirmed policy**, recorded as new decision **D13**
  and no longer written anywhere in this module as an open Founder decision: every wave-1 group is
  attempted in full, arbitrary scope reduction is not permitted, and a limited state requires
  measured evidence of a genuine official-source limitation. `INGF-07`'s `limitation` block
  (`state`, closed-set `reason_code`, `reason_detail`, non-empty `evidence[]`, `affected` scope,
  `customer_visible_warning`) is **consumed** as the record of that evidence and never redefined
  here; **D8** now names it, acceptance item 2 requires it, and **L4** is restated as a `GOLD-16`
  measurement verified at Gate 2 rather than a pending scope choice. **Q9 (per-source anomaly
  thresholds) remains baseline-selected** — **L3** restated as initial defaults tightened from each
  adapter's own baseline, tighten-only in `INGF-05`/`INGF-09`, consolidated by `GOLD-16`, with
  critical identity, time, mandatory-source and citation failures unconditional. No change to product
  scope, the source roster, the A$50/month ceiling, any quality gate, any adapter's PRD §40.8
  evidence-collection or customer-visible-limitation duties, the ten tickets, or the dependency order.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.7 (10 tickets,
  `SLEG-01`…`SLEG-10`). Records D1–D12; raises L1–L8, of which **L6** (no synthesised consolidations)
  is flagged as an ADR candidate to be recorded by `SLEG-01` if it proves durable.
