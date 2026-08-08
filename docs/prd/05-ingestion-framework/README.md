# 05-ingestion-framework — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.6. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `05-ingestion-framework` |
| Lane | `05-ingestion-framework` |
| Ticket prefix | `INGF` |
| Tickets | 9 (`INGF-01` … `INGF-09`) |
| Agent | `builder` (all 9, plan §1.1) |
| Epic | `E08-LEG-FRAMEWORK` (PRD §44.2) |
| Write-owns | `pipelines/ingestion/**` (plan §4) |
| Depends on module | `04-corpus-contract` |
| Language/toolchain | Python (`uv`, `pytest`) — PRD §18.2 "Ingestion/build/evaluation \| Local Python pipeline", §20.1, §45.3 |
| Version | v0.2 (2026-08-03) |

## Problem

PRD §40 mandates 52 official source groups (§40.2–40.6), each delivered by its own adapter under
`pipelines/adapters/<group-id>/**` and each subject to the same twelve-item Definition of Done
(§40.8). PRD §44.3 names "individual source adapters" as the canonical safe parallel work unit, and
the decomposition puts all 52 in modules `06`–`10` where they run as wide parallel waves.

Nothing about that is safe unless the shared machinery exists **first** and is genuinely shared.
PRD §40.7 is explicit about the split:

> "The adapter never writes active corpus tables directly. It emits versioned intermediate records
> with source URL, artifact hash and tool version. **Shared framework code performs HTTP safety,
> hashing, artifact persistence, retry, licensing, metrics, quarantine and run accounting.**"

This module is that shared framework code. It has three jobs:

1. **Fix the contract** — the eight §40.7 boundaries, the intermediate-record envelope, and the
   framework ports, so 52 adapter tickets can be written in parallel without reading each other's
   code and without inventing their own HTTP, parsing or persistence.
2. **Own the security boundary** — SEC-002 ("Source fetches enforce allowlist, DNS/IP/redirect/
   type/size/time limits", evidence "SSRF and decompression-bomb suites pass") and PRD §37.4's
   isolated parser/OCR subprocess. Official source content is untrusted input (PRD §21).
3. **Make coverage auditable** — PRD §6.1 requires every source to appear in the Source Coverage
   Registry, PRD §12.1 requires five *separate* freshness dates, PRD §7 forbids a mandatory group
   remaining `PLANNED_NOT_ACTIVE` at release, and PRD §44.4 forbids silently calling an
   unimplemented source category covered.

## Scope

| In scope | Ticket |
|---|---|
| The eight §40.7 adapter boundaries, adapter metadata, framework ports, intermediate-record envelope, failure-code registry | `INGF-01` |
| SSRF-safe shared fetcher: per-source allowlist, HTTPS, DNS resolution + IP denial before and after redirects, redirect/type/size/time/decompression limits, conditional requests, retry | `INGF-02` |
| Immutable content-addressed artifact store, R2/local backends, key convention, replay | `INGF-03` |
| Licence snapshot capture, `LicenceAssessment` file schema, conservative permitted-use gate | `INGF-04` |
| Quarantine sink + reason/operator-action table, `ingestion_run` accounting, the §40.9 stage runner, §40.9 anomaly rules | `INGF-05` |
| Resource-limited parser/OCR subprocess harness (HTML/XML/JSON/PDF/archive/OCR), XXE / zip-bomb / zip-slip / macro defences | `INGF-06` |
| Source Coverage Registry composition from per-adapter files (A2), the 52-group mandatory roster, the five §12.1 freshness dates, and the limited-state record (evidence, affected dates/collections, customer-visible warning, reason) the confirmed plan §8 **Q10** policy requires | `INGF-07` |
| Discovery / change-detection scheduler on the §12.1 cadences, conditional-request change scans, discovery-only production mode | `INGF-08` |
| Adapter conformance kit: the twelve §40.8 DoD checks as one reusable suite, reference adapter, authoring guide, report schema | `INGF-09` |

## Non-goals

| Not in this module | Owner |
|---|---|
| Any individual source adapter (all 52 groups of PRD §40.2–40.6) | modules `06-sources-legislation`, `07-sources-instruments`, `08-sources-cases`, `09-sources-adjacent`, `10-sources-future` |
| The `corpus.sqlite` schema and the intermediate normalised-record payload types | `04-corpus-contract` / `CRPS-01` (A4) |
| Chunking, index-tier assignment, embeddings, release build/validation/sign/publish | `CRPS-03`…`CRPS-07` |
| Corpus promotion, rollback, active-pointer switch | `18-ops-release` / `RLSE-07` |
| Internal admin consoles for source health, quarantine and licensing | `22-internal-admin` / `INTL-02`, `INTL-03`, `INTL-05` |
| Customer-facing source/registry screens | `14-search-product` / `FIND-05` |
| Licence-limited quotation/display/export enforcement at render time | `12-evidence-safety` / `EVID-06`, `19-exports` / `XPRT-02`–`XPRT-04` |
| Change matching, `detected_change` fan-out and tenant alerts | `16-monitor-alerts` / `WTCH-02`, tables in `01-app-data` / `DATA-07` |
| Full-roster coverage/licence/freshness reconciliation across all 52 groups | `21-evaluation-600` / `GOLD-16` |
| Verifying and signing off the launch state of a source group, and any statement of which groups (if any) launch limited | Gate 2 verification and sign-off under the confirmed limited-state launch policy (plan §8 **Q10**; **D12**). `GOLD-16` produces the measured evidence and the proposed registry state; `LNCH-05` verifies that the launch statement discloses every limitation accurately. |
| Authoring, sealing or reading blind evaluation gold | `21-evaluation-600` / `GOLD-01`, under plan §8 **Q6** (confirmed). Nothing in this module reads `evals/gold/**`, and adapter conformance fixtures are ordinary fixtures (**D13**). |
| Cross-boundary SSRF/security suites under `tests/security/**` | `23-assurance` / `ASSR-02` |
| Any app-database, tenant or customer-data access | PRD §39.1: "Python pipeline code never imports tenant/customer packages" |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **Every framework port is declared in `INGF-01` (wave 1); `INGF-02`…`INGF-06` supply implementations only.** Ports: `Fetcher`, `ArtifactStore`, `LicenceGate`, `ParserHost`, `QuarantineSink`, `RunRecorder`, `RunHistoryPort`, `RecordSink`, `Clock`. | PRD §39.1 dependency rule ("`packages/infrastructure` adapters → `packages/domain` ports"); plan §7 records this module at 2 useful lanes — that width only exists if a downstream ticket never needs a sibling's internals. | `INGF-01` |
| D2 | **The Source Coverage Registry is composed at build time from per-adapter files, never one shared document.** | plan §2.1 **A2**; PRD §40.8 item 1 makes a registry row part of every adapter's DoD, so one shared file would serialise all 52 adapter tickets; PRD §6.1, §12.1. | `INGF-07` |
| D3 | **Each per-adapter file's schema has exactly one owning ticket, assigned in dependency order:** `allowlist.yaml` → `INGF-02`; `licence.yaml` + `licence-snapshots/` → `INGF-04`; `registry.yaml` → `INGF-07`; `conformance.yaml` → `INGF-09`; `adapter.py` convention → `INGF-01`. | D2 + plan §6.2 edge order (`INGF-02` → `INGF-03` → `INGF-04` → `INGF-07`); avoids two tickets writing one schema. | `INGF-07` restates the whole layout |
| D4 | **Failure codes are area-local constants registered into a runtime registry (`register_failure_codes`), not one shared enum module.** | Same anti-serialisation principle as A2; `INGF-05` (quarantine) and `INGF-06` (parsing) are concurrent siblings in plan §7's second lane and must not contend on one file. PRD §12.2 lists the reason classes; PRD §35.3 `quarantine_item.reason_code`. | `INGF-01` |
| D5 | **Adapters are located by directory convention** — `pipelines/adapters/<group-id>/adapter.py` exposing module-level `ADAPTER: SourceAdapter`. No central adapter manifest. **ADR candidate** (see M5). | plan §2.1 **A1**'s identical rationale (autoload, never a shared central manifest) applied to adapters; without it all 52 adapter tickets edit one registration file. | `INGF-01` |
| D6 | **Ingestion working state lives in a separate mutable `ingestion.sqlite`**, never `corpus.sqlite` and never `app.sqlite`. **ADR candidate** (see M1). | PRD §18.3: "`corpus.sqlite` is release-specific, immutable and production read-only … Ingestion MUST NOT modify active production corpus data"; PRD §39.1 forbids pipeline code from touching tenant data; PRD §39.3 requires app/ephemeral/corpus not to share a wildcard backup rule. | `INGF-05` |
| D7 | **`INGF-05` owns the §40.9 stage runner** (`IngestionRunner`): Discover → Fetch+hash → Licence gate → Parse/OCR isolated → Normalise → Extract events/relations → Validate → Quarantine\|emit. `INGF-09` drives it from fixtures; `INGF-08` triggers it. | PRD §40.9 flow; PRD §35.3 `ingestion_run` holds exactly the per-stage counts. | `INGF-05` |
| D8 | **The intermediate-record payload types are imported from `CRPS-01` and re-exported unchanged; this module never redefines, widens or copies them.** | plan §2.1 **A4**; PRD §40.7 ("emits versioned intermediate records"); PRD §45.2 gives `pipelines` "official-source acquisition/build/evaluation", not the corpus schema. | `INGF-01` |
| D9 | **Unclear rights collapse to the metadata/link-only permission set** before any storage, indexing, embedding, display or export decision is taken. | PRD §11.1: "Unclear rights default to metadata, limited quotation and official links." | `INGF-04` |
| D10 | **Adapters may not import an HTTP or document-parsing library**; both are reachable only through the injected ports, enforced by an architecture test over `pipelines/adapters/**`. | PRD §37.4: "Adapters use a shared fetcher, not arbitrary HTTP libraries"; PRD §21.1; SEC-002 needs a positive control, not a convention. | `INGF-02`, `INGF-06` |
| D11 | **Python src-layout under one import root.** Plan §5.6 writes ticket scopes as `src/<area>/**`; under Python src-layout that path is `pipelines/ingestion/src/<import-root>/<area>/**`. The area names, their one-to-one mapping to tickets and their disjointness are unchanged. The import root is whatever `FND-01`'s committed `pipelines/ingestion/pyproject.toml` declares; if it declares none, `aer_ingestion` (see M4). **Resolved by `INGF-01` (2026-08-08): the committed manifest declares `name = "taxrag-pipeline-ingestion"`, so the import root is `taxrag_pipeline_ingestion` and area directories are `pipelines/ingestion/src/taxrag_pipeline_ingestion/<area>/**`. `FND-01`'s skeleton package `pipelines/ingestion/taxrag_pipeline_ingestion/__init__.py` (at the member root, not under `src/`) stays byte-empty and carries no code — `tools/workspace-assertions.mjs::assertSkeleton()`/`assertEntryFilesEmpty()` enforce that on every branch — and `src/` itself carries no `__init__.py`. Nothing is installed (`[tool.uv] package = false`), so tests reach the package through a per-test-directory `conftest.py` that puts `pipelines/ingestion/src` on `sys.path`, mirroring the CRPS-01/CRPS-03 convention (ADR candidate, unwritten).** | PRD §20.1 layout; plan §1.1 (module owns its members' manifests, append-only). | `INGF-01` |
| D12 | **A customer-visible limited state is recordable only with its evidence, and which groups are limited is not decided in this module.** Plan §8 **Q10** is confirmed policy: no mandatory source group is pre-selected for omission or reduced implementation; every Commonwealth, state and territory mandatory group in the approved MVP scope must be attempted in full; arbitrary scope reduction to make a release date easier is not permitted. A group may launch in one of the PRD's four limited states — `METADATA_AND_LINK_ACTIVE`, `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE` — **only** where measured evidence shows a genuine limitation prevents `ACTIVE` (official capability limit, the official body not publishing the material, licensing restriction, historical material unavailable, freshness limitation, or another real official-source constraint), and the registry entry must record that evidence, the affected dates or collections, the customer-visible warning and why full coverage is unavailable. Silent omission is prohibited and no unofficial source or commercial headnote may substitute for unavailable official material — so the schema carries no field that could express one, and an absent roster group remains a hard `MANDATORY_GROUP_MISSING` failure. `GOLD-16` produces the measured evidence and the proposed registry state, `LNCH-05` verifies the launch statement, and Gate 2 is verification and sign-off under this policy, not an opportunity to cut mandatory scope. The specific list of limited groups, if any, remains a Gate 2 output. | Plan §8 **Q10** (confirmed policy); PRD §7, §6.1, §26, §44.4. | `INGF-07` (schema, composition failures, composed output); `INGF-05` (a BLOCK rule a group cannot pass routes here, never to a threshold downgrade) |
| D13 | **No blind evaluation gold enters this module; adapter conformance fixtures are ordinary fixtures.** Plan §8 **Q6** is confirmed: blind material is authored by dedicated `evaluation-author` agents in an isolated workspace outside the repository, independently reviewed before encryption, sealed with libsodium `SealedBox`, with the Founder as sole private-key custodian and `EVAL_BLIND_KEY_FILE` supplying the path with no default, no in-repository lookup and no keyring fallback; `GOLD-01` implements it. The consequence here is unchanged and settled: the conformance kit never opens a path under `evals/gold/**`, and no adapter fixture may contain or reference blind gold material. DoD item 11 checks that an evaluation subset is *referenced and well-formed*, never a gold answer. | Plan §8 **Q6** (confirmed); PRD §14.3, §45.1 item 6; plan §9 **R9**. | `INGF-09` |

## Rejected alternatives

| Rejected | Why |
|---|---|
| One shared `sources/registry.yaml` listing all 52 groups | Serialises all 52 adapter tickets on one file — the exact failure plan §2 exists to prevent (A2). |
| One shared `failure_codes.py` enum | Same serialisation at module scale: `INGF-05` and `INGF-06` are concurrent siblings, and later every adapter would want a code. |
| Adapters calling `httpx`/`requests` directly, policed by a lint rule | PRD §37.4 requires a *shared fetcher*. A lint rule is bypassable and gives SEC-002 no positive control; the port + architecture test does. |
| In-process parsing with a hardened library only | PRD §37.4 requires "a resource-limited subprocess with no customer credentials or app database access". A library flag cannot bound CPU, address space or wall clock. |
| Recording ingestion state in `corpus.sqlite` | Forbidden by PRD §18.3 (release-specific, immutable, production read-only). |
| Recording ingestion state in `app.sqlite` | Forbidden by PRD §39.1 ("Python pipeline code never imports tenant/customer packages") and PRD §45.2. |
| Adapters writing `document_version` / `node_version` rows directly | Forbidden verbatim by PRD §40.7. |
| Collapsing `INGF-02`…`INGF-06` into one "framework" ticket | Plan §5.6 fixes nine tickets; merging them produces exactly the fully-serial lane plan §7 and CLAUDE.md treat as a decomposition defect. |
| Defining the normalised-record payloads here instead of importing `CRPS-01` | Breaks A4: the corpus builder must be testable from contract fixtures alone and must not depend on adapter code. |
| Omitting or reducing a mandatory source group to make a release date easier | Plan §8 **Q10** (confirmed policy) forbids pre-selecting any group for omission or reduced implementation, and PRD §44.4 forbids silently calling an unimplemented source category covered. A genuine official-source limitation is recorded as an evidenced limited state (**D12**), never as absence. |
| A registry field naming a substitute, alternative or fallback source when official material is unavailable | Plan §8 **Q10** item 7: no unofficial source or commercial headnote may substitute for unavailable official material. The schema cannot express one, so the composer cannot accept one. |

## Benchmark-selected and deferred parameters (plan §8)

Deliberately unfixed — PRD §1's `Benchmark-selected` device, not a gap in the spec. Neither entry
blocks this module: the build proceeds against the PRD's initial default or the abstraction, and the
measured value is written back through the named ticket. Nobody is asked to guess a number here.

| # | Parameter and status | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q9** *(plan §8)* | Per-source anomaly thresholds. The ±10% collection-count change and >2% parse-failure figures are **initial defaults**; each adapter may tighten or replace the percentages once it has a representative baseline. Critical identity, time, mandatory-source and citation failures are **unconditional blockers** unaffected by any percentage threshold. **Baseline-selected.** | each adapter ticket; the two defaults and the tighten-only override mechanism in **`INGF-05`** | per-adapter DoD item 8 (`conformance.yaml` `anomaly_overrides`, tighten-only); **consolidated and verified in `GOLD-16`** | Nothing — the critical failures already block release unconditionally | PRD §40.9; plan §8 **Q9** |
| **Q3** *(plan §8)* | Always-hot vector count, semantic-cache limits, resident-memory allocation and the cold/hot tier boundary. **Deferred until real-scale measurement.** Relevant here only because `INGF-09` DoD item 12 measures per-group storage, parse time, index size and peak memory against PRD §39.2's 2 GiB host budget. | `18-ops-release` | `RLSE-11`'s 2 GB benchmark records the measured decision | Nothing in this module — item 12 records measurements; it does not set the host budget | PRD §17.2, §39.2; plan §8 **Q3** |

## Open questions

Module-local only. Plan §8's decision register settles the two entries this table used to carry:
**Q10** (limited-state launch policy) is confirmed and is decision **D12**, and **Q9** (per-source
anomaly thresholds) is baseline-selected and sits in the table above. None of M1–M5 blocks the
module's first wave.

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| M1 | Where `ingestion.sqlite` lives on the production host, and whether the host runs discovery-only ingestion at all. PRD §19.3 says "The production server continues lightweight source discovery", but PRD §39.3's filesystem table has no row for it. | `18-ops-release` (**`RLSE-02`** owns `infra/deploy/host/**`) | `RLSE-02` | Nothing before first provisioning. `INGF-05`/`INGF-08` take the path from configuration and default to a workstation-local path. |
| M2 | The conservative quote-character ceiling applied when a licence assessment is `UNCLEAR_RESTRICTED` or `REVIEW_REQUIRED`. PRD §11.1 says "limited quotation" and gives `max_quote_chars` as a column, but no number. | **Founder** (PRD §11.2 legal positioning; `LEGAL_REVIEW_PENDING` is an explicit launch risk) | `INGF-04` pins an initial default and records it as an initial default, **not** a product rule (PRD §45.1 item 5) | Nothing — the default is conservative by construction. |
| M3 | `INGF-09` is `blocked_by` `INGF-05`, `INGF-06` only (plan §5.6/§6.2), yet §40.8 DoD items 1 and 9 exercise the `licence.yaml` (`INGF-04`) and `registry.yaml` (`INGF-07`) schemas. | this sub-PRD (Architect) → plan §5.6/§6.2 | `INGF-09` reports `NOT_AVAILABLE` and **fails** rather than passing silently when a port is unregistered | Nothing today: all 52 adapter tickets are `blocked_by INGF-09` and land after it. If the kit cannot be made honest without the edges, the writeback is a plan change adding `INGF-04`, `INGF-07` to `INGF-09.blocked_by` — never a silent local fix. |
| M4 | The Python import root for `pipelines/ingestion`. | `00-foundation` (**`FND-01`** creates every member manifest, plan §1.1) | `INGF-01` reads the committed `pyproject.toml` and follows it; falls back to `aer_ingestion` | **RESOLVED (2026-08-08, `INGF-01`): the import root is `taxrag_pipeline_ingestion`; the `aer_ingestion` fallback is not used.** Modules `06`–`10` import `from taxrag_pipeline_ingestion.adapter import …`. See D11. |
| M5 | Adapter autoload by directory convention (D5) is a hard-to-reverse structural choice with no row in plan §2.1. | this sub-PRD (Architect) | `INGF-01`; if durable, it records `docs/adr/NNNN-adapter-autoload-and-failure-code-registry.md` (plan §2.1 A9: ADR files are owned per-file by the creating ticket) | Nothing — A1 already settles the identical question for routes. |

## Work breakdown

`lane` = `05-ingestion-framework` and `agent` = `builder` for all nine tickets (plan §1.1). Paths are
relative to the repository root; `<root>` is the import root of D11.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`INGF-01`](tickets/INGF-01-adapter-interface-and-versioned-intermediate-records.md) — Adapter interface and versioned intermediate records | M | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/adapter/**`, `pipelines/ingestion/tests/adapter/**` | `CRPS-01` |
| [`INGF-02`](tickets/INGF-02-safe-fetcher-allowlist-dns-ip-denial-redirect-type-size-time.md) — Safe fetcher (allowlist, DNS/IP denial, redirect/type/size/time) | L | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/fetch/**`, `pipelines/ingestion/tests/fetch/**` | `INGF-01` |
| [`INGF-03`](tickets/INGF-03-immutable-artifact-store-with-hashing-and-r2-keys.md) — Immutable artifact store with hashing and R2 keys | M | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/artifacts/**`, `pipelines/ingestion/tests/artifacts/**` | `INGF-02` |
| [`INGF-04`](tickets/INGF-04-licence-snapshot-assessment-registry-and-permitted-use-gate.md) — Licence snapshot/assessment registry and permitted-use gate | L | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/licensing/**`, `pipelines/ingestion/tests/licensing/**` | `INGF-03` |
| [`INGF-05`](tickets/INGF-05-quarantine-ingestion-run-accounting-and-anomaly-rules.md) — Quarantine, ingestion-run accounting and anomaly rules | M | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/{quarantine,runs}/**`, `pipelines/ingestion/tests/{quarantine,runs}/**` | `INGF-03` |
| [`INGF-06`](tickets/INGF-06-isolated-parser-ocr-subprocess-harness.md) — Isolated parser/OCR subprocess harness | L | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/parsing/**`, `pipelines/ingestion/tests/parsing/**` | `INGF-02` |
| [`INGF-07`](tickets/INGF-07-source-coverage-registry-composition-and-freshness-fields.md) — Source Coverage Registry composition and freshness fields | M | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/registry/**`, `pipelines/ingestion/tests/registry/**` | `INGF-04` |
| [`INGF-08`](tickets/INGF-08-discovery-change-detection-scheduler.md) — Discovery / change-detection scheduler | M | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/discovery/**`, `pipelines/ingestion/tests/discovery/**` | `INGF-05`, `INGF-07` |
| [`INGF-09`](tickets/INGF-09-adapter-conformance-kit-the-twelve-item-dod.md) — Adapter conformance kit (the twelve-item DoD) | L | `05-ingestion-framework` | `pipelines/ingestion/src/<root>/conformance/**`, `pipelines/ingestion/tests/conformance/**` | `INGF-05`, `INGF-06` |

`pipelines/ingestion/pyproject.toml` is **shared-additive** across the nine tickets: each ticket
appends only the dependencies it declares, and a conflict is resolved by re-running `uv lock`, never
by hand-merging (plan §1.1, PRD §44.3).

### Lane profile (plan §7)

Six waves, peak two concurrent lanes, **not fully serial**:

```text
wave 1  INGF-01
wave 2  INGF-02
wave 3  INGF-03 | INGF-06
wave 4  INGF-04 | INGF-05
wave 5  INGF-07 | INGF-09
wave 6  INGF-08
```

Plan §7: "the fetcher must exist before artifacts, artifacts before licensing and quarantine
(PRD §40.9 pipeline order). Parser isolation and licensing run as the second lane." The order is the
PRD §40.9 pipeline itself, not contention.

### Downstream

`INGF-09` gates 13 tickets in modules `06`–`10` (`SLEG-01`, `SINS-02`, `SINS-05`, `SCAS-01`,
`SADJ-01`…`SADJ-09`), which in turn gate the remaining 39 adapter tickets — so the conformance kit
and the `INGF-01` contract are the interface all 52 adapters are written against.
`INGF-02` gates `ASSR-02`; `INGF-04` gates `INTL-05`; `INGF-05` gates `INTL-03`; `INGF-07` gates
`GOLD-16` and `INTL-02` (plan §6.2).

## Acceptance — what makes the module done

The module is done when all nine tickets are delivered and:

1. **SEC-002** — "Source fetches enforce allowlist, DNS/IP/redirect/type/size/time limits", minimum
   acceptance evidence "SSRF and decompression-bomb suites pass" (PRD §30.2). Satisfied by
   `INGF-02` (SSRF) and `INGF-06` (decompression/zip-bomb, XXE, macro isolation). The
   cross-boundary suite under `tests/security/**` is `ASSR-02`'s; the module-local suites live in
   `pipelines/ingestion/tests/**` and must be green on their own.
2. **PRD §40.7** — all eight adapter boundaries exist as one enforced contract, and an architecture
   test proves no adapter writes corpus tables or opens its own HTTP/parser (`INGF-01`, `INGF-02`,
   `INGF-06`).
3. **PRD §40.8** — a single command runs the twelve-item Definition of Done for any group directory
   and emits a machine-readable report; the negative-control suite proves each check can fail
   (`INGF-09`).
4. **PRD §11.1 / ADM-001** — every artifact links a `LicenceSnapshot`, every snapshot has an
   independent `LicenceAssessment` covering all nine decision axes, and unclear rights collapse to
   metadata/link-only before storage, indexing, embedding, display or export (`INGF-04`).
5. **PRD §12.2 / ADM-001** — the six quarantine classes are represented, every reason code has a
   defined operator action, and `has_open_quarantine()` is exported for the release gate
   (`INGF-05`). Enforcement of "cannot enter promoted release while open" belongs to `CRPS-06` /
   `RLSE-07`.
6. **PRD §6.1 / §7 / §12.1 / ADM-001** — the registry composes deterministically from per-adapter
   files, carries all nine §6.1 attributes, keeps the five §12.1 dates as separate fields, and fails
   composition when any of the 52 mandatory §40.2–40.6 group IDs is missing (`INGF-07`, PRD §44.4).
   Composition also fails when a group declares one of the four PRD §7 limited states without the
   evidence, affected dates or collections, customer-visible warning and reason the confirmed plan §8
   **Q10** policy requires, and no schema key lets a group be skipped, excluded or served by a
   substitute source (**D12**). Which groups, if any, are limited stays a Gate 2 output prepared by
   `GOLD-16`.
7. **PRD §12.1 / §33.4 step 1 / §19.3** — discovery runs on the §12.1 cadences with conditional
   requests and has a lightweight discovery-only mode (`INGF-08`).
8. **PRD §26 (Corpus)** — "Raw evidence/provenance/licensing … workflows operate" and "Source
   freshness, quarantine … are demonstrated" have their ingestion-side evidence
   (`INGF-03`, `INGF-04`, `INGF-05`, `INGF-07`, `INGF-08`).
9. **PRD §44.2 `E08` exit evidence** — "SEC-002 and adapter fixture tests".
10. `uv run pytest` and `pnpm test` are green on the merged default branch after every ticket
    (PRD §45.3, plan §1.1).

## Changelog

- **v0.2 — 2026-08-03** — realigned to `docs/prd/breakdown-plan.md` §8's decision register.
  **Q10 is confirmed policy**: the limited-state launch policy is decision **D12**, and `INGF-07` now
  specifies the `limitation` record (state, closed `reason_code` set, mandatory `reason_detail`,
  evidence entries, affected dates or collections, customer-visible warning) that makes a limited
  state representable only with its evidence — plus the four new composition failures, the composed
  output carrying the block verbatim for `GOLD-16`/`LNCH-05`, and the schema-shape guarantee that no
  group can be skipped, excluded or served by a substitute source. The 52-group roster and the
  `MANDATORY_GROUP_MISSING` BLOCK behaviour are unchanged, and the specific list of limited groups, if
  any, remains a Gate 2 output from `GOLD-16` → `LNCH-05`. **Q6 is confirmed**: blind authoring,
  isolation, sealing and key custody are settled as decision **D13**, and `INGF-09` now states its
  module-local consequence — conformance fixtures are ordinary fixtures that never contain or
  reference blind gold — as settled rather than pending. **Q9 remains baseline-selected** and **Q3
  deferred until real-scale measurement**: Q9 moved out of "Open questions" into the new
  **Benchmark-selected and deferred parameters** table, which also records Q3 because `INGF-09` DoD
  item 12 measures against PRD §39.2's host budget; `INGF-05` now presents the ±10% / >2%
  figures as initial defaults replaced per source from a representative baseline and verified by
  `GOLD-16`, never as numbers the Founder must guess. Nine tickets, their `blocked_by`/`blocks` edges,
  file-scopes, PRD traceability and every PRD §40.8 Definition-of-Done item are unchanged; **M1**–**M5**
  remain open.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.6 (9 tickets,
  `INGF-01`…`INGF-09`). Records A2 (registry composed from per-adapter files) as `INGF-07`'s
  decision, and raises M1–M5 as module-level open questions.
