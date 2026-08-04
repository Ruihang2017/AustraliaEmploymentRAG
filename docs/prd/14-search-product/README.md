# 14-search-product — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.15 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `14-search-product` |
| Lane | `14-search-product` |
| Ticket prefix | `FIND` |
| Tickets | 6 (`FIND-01` … `FIND-06`) |
| PRD epic | `E18-SEARCH-API-UI` (week 4; depends on `E02`, `E17`; exit criteria *"SRCH/UAT and p95 gates"*, PRD §44.2) |
| Requirement families | `SRCH-001` … `SRCH-005` |
| Depends on modules | `03-app-runtime`, `11-retrieval-engine` (transitively `00-foundation`, `01-app-data`, `02-auth-core`, `04-corpus-contract`) |
| Modules that depend on this one | `16-monitor-alerts` (`WTCH-07`), `17-records-collab` (`RCRD-09`), `20-developer-platform` (`PLTF-05`), `23-assurance` (`ASSR-06`) |
| Languages | TypeScript (`apps/api`, `apps/web`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.2 (2026-08-03) |

## Problem

Search is the only product surface that must work when everything expensive is switched off. PRD §26
makes it a Definition-of-Done item — *"Search remains available independently of hosted-generation
budget"* — PRD §42.2 repeats it as the operator action at the 100% spend ceiling (*"Stop
founder-funded model calls; preserve Search"*), and PRD §8.2 states it as a product rule: *"Search
MUST remain usable when the AI budget is exhausted."* If the search surface acquires a dependency on
generation, the product's cheapest, most defensible capability disappears exactly when the founder's
A$50 budget runs out.

Four pressures make this a module of its own.

1. **It is the first customer-visible use of the retrieval engine, and it is a thin one.** PRD §45.2
   gives `apps/api` *"HTTP auth/admission/DTO mapping/SSE"* and forbids it *"Duplicated business
   rules"*. Every legal decision — eligibility, ranking, exact-identifier precedence, snippet offsets
   — is already made in `11-retrieval-engine`. This module's job is to expose that faithfully at
   `/v1` and to render it, not to re-decide any of it. Breakdown plan risk **R5** names shell/product
   boundary creep as the likely failure here.
2. **The wire payload is normative and unusually specific.** PRD §34.2 gives the exact search request
   and response, and adds a rule no other endpoint carries: *"`snippet.text` MUST equal the referenced
   NodeVersion substring at the returned offsets after the documented canonical newline
   normalisation. Search does not return generated summaries."* PRD §8.2 repeats it — *"Snippets MUST
   originate from source text, not generated paraphrases."* A snippet that is trimmed, re-highlighted
   or ellipsised in the API or in the browser breaks `SRCH-003`.
3. **The screens carry legal meaning, not decoration.** PRD §32.1 fixes the result row's eleven
   fields and requires the no-results state to distinguish five distinct causes — *"no text match,
   all matches removed by hard filters, source not covered, source stale/unavailable and invalid
   exact identifier"*. Only the server can tell those apart. An empty list is a defect, not a state.
4. **Two other modules build on this one and must not have to edit it.** Breakdown plan §4.2 assigns
   *"create record from search selection"* to `17-records-collab` (`RCRD-09`) and *"create watch
   target from search/source"* to `16-monitor-alerts` (`WTCH-07`), because either would put tenant
   writes inside a read-only surface. So this module must publish stable extension points and write
   no record and no watch target itself.

## Scope

In scope — exactly the module's breakdown plan §4 write-owns row:

- `apps/api/src/routes/{search,documents,document-versions,nodes,node-versions}/**` — the nine PRD
  §16.2 "Search and authorities" endpoints as A1 autoloaded route areas.
- `apps/api/bench/search/**` — the API-level latency and exact-match regression benchmark.
- `apps/web/src/features/{search,sources}/**` — Simple Search, Advanced Search, and the document /
  document-version / node-timeline screens.

Out of scope in one line: **this module maps a fixed retrieval contract onto `/v1` and renders it; it
retrieves nothing itself, decides no legal rule, and writes no tenant data.**

## Non-goals

Each names its owner module/ticket or its standing reason.

| Not in this module | Owner / reason |
|---|---|
| Retrieval of any kind — bundle loading, exact/lexical/dense stages, hard filters, fusion, rerank, evidence assembly, the retrieval profile, snippet offsets | `11-retrieval-engine` (`RETR-01` … `RETR-08`). This module calls `packages/retrieval-client` (`RETR-09`) and nothing else (retrieval sub-PRD **D1**). |
| The internal search wire contract and the search process | `11-retrieval-engine` (`RETR-01`, frozen contract; retrieval sub-PRD **D8**). A field this module needs that the contract cannot express is a docs PR against `RETR-01` + `RETR-09`, never a local workaround. |
| The `/v1` OpenAPI document, generated bindings and canonical enums | `00-foundation` (`FND-03`, `FND-04`) — PRD §44.3 serial-owned. This module **consumes** the generated types; PRD §20.1 forbids hand-editing generated output. |
| Fastify bootstrap, route autoload, error catalogue, `request_id`, the admission chain, SSE, `/health/*`, `/v1/system-status` | `03-app-runtime` (`RUNT-01`, `RUNT-02`, `RUNT-03`, `RUNT-08`). |
| The web shell, navigation, organisation switcher, status/degraded badges, `apps/web/src/lib/**`, Home | `03-app-runtime` (`RUNT-05`). |
| Shared UI primitives, the ten PRD §31.3 async states, the evidence/source panel, `SafeMarkdown`, status badges, the accessibility harness | `03-app-runtime` (`RUNT-06`) — breakdown plan **A6**. This module composes them; it defines no second evidence panel. |
| App tables, migrations, repositories, the usage ledger | `01-app-data` (breakdown plan **A3**; PRD §45.2). This module performs **no** app-database write at all. |
| Answers, Ask, Coverage, Compare and every generated artefact | `15-answer-product`. Search never calls a model (PRD §16.2). |
| "Create Research Record from search selection" | `17-records-collab` (`RCRD-09`, `blocked_by FIND-04`) — breakdown plan §4.2, PRD §33.1 step 6. |
| "Create watch target from search or source", saved searches | `16-monitor-alerts` (`WTCH-01`, `WTCH-07`, `blocked_by FIND-05`) — breakdown plan §4.2, PRD §33.1 step 7, §8.8. |
| PII detection | `12-evidence-safety` (`EVID-01` … `EVID-03`). PRD §30.2 `PII-002`: *"Search can continue if PII service is unavailable; free-text research fails closed"* — so search routes never declare PII admission (`RUNT-02` deliverable 8). |
| Widget, SDKs, developer portal | `20-developer-platform` (`PLTF-05` is `blocked_by FIND-01`). |
| Cross-boundary suites — tenant isolation, security, E2E UAT automation, accessibility automation | `23-assurance` (`ASSR-01`, `ASSR-02`, `ASSR-06`, `ASSR-07`). This module carries its **own** co-located assertions (breakdown plan §9 **R8**). |
| Retrieval-level benchmarks (recall@10, memory, startup, per-stage latency) | `11-retrieval-engine` (`RETR-10`). `FIND-06` measures the **HTTP** path and consumes `RETR-10`'s report. |
| Real-scale 2 GB host benchmark and the hot-dense-coverage decision | `18-ops-release` (`RLSE-11`). |

## Decisions

Each states its basis: a PRD section, a breakdown plan §2.1 decision, or an upstream sub-PRD
decision. Where the PRD does not answer, the item is an open question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **Search is read-only and non-charging by construction.** The route areas perform no app-database write, hold no provider credential, and declare no generation-credit consumption; they admit through `RUNT-02`'s `tenant` profile and consume only the PRD §38.5 *search burst* and *API calls* ledgers. A funding ledger at zero, a disabled model gateway or a `GENERATION_UNAVAILABLE` system status changes nothing about a search response. | PRD §16.2 *"Search is read-only despite POST and MUST not consume generation credits"*; §38.5 *"Search, answer credits, advanced-task credits, API calls and provider cost are separate ledgers"*; §42.2 (100% ceiling → *"preserve Search"*); §26; §8.2. |
| D2 | **Snippets are transported, never composed.** `snippet.text` and its offsets are passed through byte-for-byte from the search process to the API response to the rendered DOM. Nothing in this module truncates, ellipsises, re-tokenises, re-highlights by matching query terms against the text, or generates a summary. Highlighting, where shown, is driven by offsets supplied in the payload. | PRD §34.2 *"`snippet.text` MUST equal the referenced NodeVersion substring at the returned offsets … Search does not return generated summaries"*; §8.2; `SRCH-003`; retrieval sub-PRD **D13**. |
| D3 | **`packages/retrieval-client` is the only door.** No file in this module opens `corpus.sqlite`, constructs a URL to the search port, or starts the search process. Every corpus read is a client call with a required `corpusReleaseId`. | PRD §39.1 (*"search-rs → corpus bundle only"*), §39.4 (only `app`/`worker` reach `127.0.0.1:7700`); retrieval sub-PRD **D1**; `RETR-09` deliverable 7 asserts it repo-wide. |
| D4 | **Public shapes come from the generated bindings.** Request/response types are imported from `packages/contracts/src/generated/**` (`FND-04`) and controlled values from `packages/contracts/src/enums/**` (`FND-03`). A field or enum member this module needs but the contract lacks is obtained by a docs PR against `FND-04`/`FND-03` **first**; it is never declared locally and a generated file is never hand-edited. | PRD §20.1 (generated bindings MUST NOT be hand-edited); §34 preamble (*"property names and enum meanings cannot drift"*); §16.1 (*"Optional fields may be added within v1"*); `FND-03` Feedback-obligation friction 1, which names exactly this path for `document_type`, `authority_type`, `court_level`, `freshness`, `match_reasons`, `sort` and jurisdiction codes; breakdown plan §4.2. |
| D5 | **The five PRD §32.1 no-results causes are decided server-side and transported as typed reasons.** Only the server knows whether a hard filter removed every candidate, whether the source group is not covered, or whether it is stale/unavailable. The screens render the reason they are given; they never infer it from `results.length === 0`. | PRD §32.1 (*"No-results state MUST distinguish: no text match, all matches removed by hard filters, source not covered, source stale/unavailable and invalid exact identifier"*); PRD §45.2 (`apps/web` must not own security or legal decisions). |
| D6 | **Five API route areas, autoloaded, one per PRD §16.2 path segment**: `search`, `documents`, `document-versions`, `nodes`, `node-versions`. Each is a directory containing `index.ts` with a default-exported Fastify plugin, per `RUNT-01`'s A1 contract; adding them changes **zero** tracked file outside their own directories. | Breakdown plan **A1**; `RUNT-01` §"The A1 registration contract"; PRD §16.2 endpoint list; PRD §39.1. |
| D7 | **Two web feature areas: `search` and `sources`.** `apps/web/src/features/search/` is one A1 feature area registering the single route `/search`; the Simple/Advanced split is a **mode registry autoloaded from `./*/mode.tsx`**, so `advanced/` is added by `FIND-04` with zero diff to `FIND-03`'s files. `apps/web/src/features/sources/` is the second area and registers `/documents/:documentId`, `/document-versions/:versionId` and `/nodes/:nodeId`. | PRD §31.2 fixes `/search` and `/search?mode=advanced` as **one** path with a query parameter, and gives the three source routes; `RUNT-05` §"The A1 web registration contract" (one `feature.tsx` per area, `nav.slot` claimed once, `nav` optional); breakdown plan **A1** (directory convention, never a central manifest). |
| D8 | **Tests are co-located inside this module's own subtrees.** API tests live under `apps/api/src/routes/<area>/__tests__/**`; web tests live beside their components under `apps/web/src/features/{search,sources}/**`. Neither `apps/api/test/**` nor `apps/web/test/**` is written here. | Breakdown plan §1.1 (*"Unit/integration tests live inside the owning package or app"*; *"A ticket never writes into another module's tree"*); `RUNT-01` claims `apps/api/test/**`, `RUNT-02` claims `apps/api/test/admission/**`, `RUNT-05` claims `apps/web/test/**`. |
| D9 | **Degradation is surfaced, never hidden or repaired.** A degraded retrieval response (`degraded: true` with named stages, `RETR-09` deliverable 4) is a **200** carrying `warnings`, and the screens show an explicit degraded banner naming what is reduced. A latency objective that cannot be met is reported and escalated; it is never bought by relaxing a hard filter, widening a status set, shortening the corpus or generating a snippet. | PRD §13.2 (*"the product MUST preserve correctness and surface delay/degraded status"*); retrieval sub-PRD **D10**; PRD §42.1 (*"Provider outage does not make Search unready; it marks generation degraded"*). |
| D10 | **This module publishes extension points; it never writes tenant data.** `FIND-03` creates the area-level **result-action registry** (`registerSearchResultAction`, context = stable identifiers only); `FIND-04` exports the **result-selection** surface (`useSearchSelection`) via `advanced/public.ts`; `FIND-05` exports a **source-action registry** and a stable watch-target descriptor via `sources/public.ts`. Together they are what `RCRD-09` and `WTCH-07` consume. All three are pure UI slots: this module renders whatever a downstream feature registers and performs no write itself. Imports run downstream→upstream (`17`/`16` import `14`), matching the DAG direction. | Breakdown plan §4.2 (`RCRD-09` and `WTCH-07` own those writes); PRD §33.1 steps 6–7 (*"writes only the selected stable IDs and user-authored anonymous notes"*); PRD §16.2 (search is read-only); breakdown plan **A3**. |
| D11 | **`apps/api/package.json` is extended append-only with exactly one workspace dependency** — the retrieval client — by `FIND-01`. No other file of module `03-app-runtime` is touched, and `pnpm-lock.yaml` is regenerated as a build artifact, never hand-merged. See **Q-FIND-1**: this crosses a module boundary and is recorded, not assumed. | Breakdown plan §1.1 ("Package manifests": append-only, conflicts resolved by re-running the package manager) and §4.1 (root lockfiles are `FND-01`'s pins, regenerated not merged); `RUNT-01` deliverable 1 declares only `packages/contracts`. |
| D12 | **Benchmark honesty: mode is reported and the gate is only asserted where it is meaningful.** `FIND-06` runs in `MOCK` mode (against `RETR-09`'s exported mock server — measures API overhead, **does not** evaluate the PRD §13.2 gate) or `LOCAL_SEARCH` mode (against a locally built `search-rs` loaded with the `CRPS-08` fixture bundle — evaluates the gate). A `MOCK` run reports *"gate not evaluated"* loudly and never passes silently. Fixture-scale numbers are labelled fixture-scale. | PRD §13.2 (*"Performance goals are subject to the representative 2 GB production benchmark"*); `RETR-10`'s identical `scale: "FIXTURE" \| "REAL"` honesty rule; breakdown plan §1.1 acceptance-tag mapping. |
| D13 | **Historical links address immutable identities.** Source screens and the API address `document_version_id` and `node_version_id` (immutable per PRD §35.2) and carry the `corpus_release_id` the result came from wherever the contract accepts it, so a link captured today resolves to the same text after a later release. A link is never re-pointed to "the current version" silently. | `SRCH-005` (*"Historical stable link survives later release"*); PRD §31.2 (`/document-versions/:versionId` — *"Read exact historical version"*); PRD §18.4; `UAT-SRCH-03`. |
| D14 | **The module asserts hard-filter conformance in tests, not at runtime.** A test-level property check re-evaluates the request's date/jurisdiction/status filters against every returned row (`SRCH-002`'s minimum evidence, *"Every result independently passes all hard filters"*), and the screens never re-filter, re-rank, re-sort or dedupe results client-side — but no production code path re-filters, which would duplicate a business rule in `apps/api`. | PRD §30.2 `SRCH-002`; PRD §36.2 (the filters run twice, both inside search); PRD §36.3 (*"No learned score may reintroduce a filtered item"*); PRD §45.2; breakdown plan **R5**. |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **`apps/api` calls `services/search-rs` directly** (its own fetch, its own retry policy). | PRD §39.1/§39.4 and retrieval sub-PRD **D1** make `packages/retrieval-client` the single door; `RETR-09` deliverable 7 ships an architecture test that fails the build if a second caller appears. Two callers means two retry policies, two error mappings and two places to leak a tenant. |
| **`apps/api` re-runs the hard filters or re-ranks results before responding.** | PRD §36.2 applies the filters twice already, inside the search boundary; a third, differently-implemented copy in TypeScript is the divergence risk retrieval sub-PRD **Q-RETR-3** already flags, and PRD §45.2 forbids duplicated business rules in `apps/api`. Replaced by **D14** (test-level property check). |
| **Server-side snippet composition** — trimming to a fixed width, adding ellipses inside the text, or asking a model for a summary. | PRD §34.2 and §8.2 both forbid it, and `SRCH-003`'s minimum evidence is byte equality with the NodeVersion substring. Visual truncation is a CSS concern, never a payload concern. |
| **Client-side highlighting by matching query terms against the snippet text.** | Re-tokenising legal text in the browser produces highlights that disagree with the ranking evidence and silently mutates displayed source text. Highlight ranges come from payload offsets or are absent. |
| **A separate route path `/search/advanced`.** | PRD §31.2 fixes `/search?mode=advanced` — one route, one query parameter, one shareable URL. A second path would double the nav slot and split the `save search/watch` toolbar. |
| **One combined "Search API + screens" ticket.** | Breakdown plan §2 cuts on disjoint write-sets and §7 requires every module to reach at least two useful lanes; this module's API and screen branches run concurrently in three waves. One ticket would make the module fully serial — which §7 treats as a decomposition defect, not a scheduling detail. |
| **Letting the screen infer the no-results cause** from an empty array. | The five PRD §32.1 causes are indistinguishable client-side: "removed by hard filters" and "no text match" produce the identical empty array. Replaced by **D5**. |
| **Persisting search executions in `app.sqlite`** so the "stable search URL" can be an opaque id. | PRD §16.2 makes search read-only; PRD §35.6 defines no such table; breakdown plan **A3** gives every app table to `01-app-data`. A new table is a `DATA-*` ticket plus a `blocked_by` edge, i.e. a plan change — see **Q-FIND-4**. |
| **Creating the Research Record or the watch target from the search screen** "because the user is already there". | Breakdown plan §4.2 assigns both elsewhere precisely to keep tenant writes out of this module; PRD §33.1 steps 6–7 describe them as separate steps. Replaced by **D10**'s registries. |
| **Gating search behind budget admission** so quota accounting is uniform across routes. | PRD §16.2, §26 and §42.2 all require search to survive budget exhaustion. Uniformity here would produce a `429 CREDIT_LIMIT_REACHED` on the one surface the PRD promises will still work. |
| **Declaring `document_type`, `match_reasons`, `freshness`, `sort` or a no-results reason as a local string union** in `apps/api` or `apps/web`. | PRD §35.1 generates controlled values from `packages/contracts`; breakdown plan §4.2 gives canonical enums a single owner; `FND-03`'s own feedback obligation names these exact identifiers and says *"Do not let the consuming module declare its own copy"*. Replaced by **D4**. |
| **Measuring the PRD §13.2 API p95 inside `services/search-rs`.** | `RETR-10`'s non-goals assign the HTTP-level measurement to `FIND-06` explicitly; a number measured inside the Rust process excludes admission, serialisation and the client hop that the customer actually experiences. |

## Open questions

None blocks the module's first wave. Each names an owner and the artefact that resolves it.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q-FIND-1** | **A product route area cannot import a workspace package without an entry in `apps/api/package.json`, which breakdown plan §4 gives to `03-app-runtime`.** Is the app manifest append-only **across** modules (as §1.1 makes it within one), and where does a per-module runnable script (e.g. the `FIND-06` benchmark entry) live? | `03-app-runtime` (`RUNT-01`, manifest owner) with the plan | `FIND-01` — the first product route area in the repo — records what it added; `FIND-06` documents a direct invocation that needs no script entry | Nothing — the addition is one dependency line, and `/start-all` serialises delivery | Breakdown plan §1.1, §4, §4.1; PRD §44.3 (lockfiles regenerated, never hand-merged) |
| **Q-FIND-2** | PRD §8.2 requires **authority level** in the result row and PRD §32.1 requires a **neutral/instrument identifier**, but the §34.2 example response shows only `authority: {id, name}`. Are these additive optional properties on the `/v1` search result? | `00-foundation` (`FND-04`, OpenAPI owner) with `14-search-product` | `FIND-01` raises a docs PR against `FND-04` (and `FND-03` for `authority_type`/`court_level` members) if the generated schema lacks them; PRD §16.1 permits additive optional fields within `/v1` | Nothing — the rest of the row is buildable and the screens render "not available" rather than inventing a level | PRD §8.2, §32.1, §9.2, §34.2, §16.1; `FND-03` friction 1 |
| **Q-FIND-3** | The five PRD §32.1 **no-results causes** and the search `warnings[]` codes are not a PRD-listed enumeration. | `00-foundation` (`FND-03`, canonical enums) with `14-search-product` | `FIND-01` proposes the exact member list (`NO_TEXT_MATCH`, `FILTERED_BY_HARD_FILTERS`, `SOURCE_NOT_COVERED`, `SOURCE_STALE_OR_UNAVAILABLE`, `EXACT_IDENTIFIER_NOT_FOUND`) through `FND-03`'s friction-1 path | `FIND-04`'s five-state taxonomy consumes it; both are in this module and ordered by `FIND-03` → `FIND-04` | PRD §32.1, §35.1, §20.1; `FND-03` Feedback obligation |
| **Q-FIND-4** | PRD §41.1 says *"customer research content is not placed in URL query strings"*, while PRD §32.1 requires *"copy stable search URL"* and §31.2 defines `/search?mode=advanced`. Does the rule cover a **corpus query over public law**? This module reads it as covering research-record/answer content and the Ask form's scenario facts, not a public-law query — and enforces the rule's other three clauses (analytics, browser error telemetry, page titles) in full. | **Founder** (product interpretation, PRD §45.5) | Gate 2 founder review, or a PRD clarification | Nothing — the parameter-encoded URL is buildable now; the alternative (a server-minted saved-search id) needs a new app table and is a plan change | PRD §41.1, §32.1, §31.2, §16.2, §35.6 |
| **Q-FIND-5** | PRD §32.1's results toolbar includes *"save search/watch"*, but `WTCH-07` ("create-watch-from-source") declares `blocked_by [RUNT-05, WTCH-01, FIND-05]` — it names the **source** screen, not the search screen. Does `WTCH-07` also need `FIND-04`? | `16-monitor-alerts` | `WTCH-07`; if the edge is needed, the writeback is `docs/prd/breakdown-plan.md` §5.17 and §6.2 | Nothing here — `FIND-03` ships the registry slot and `FIND-04` the selection regardless; an unfilled slot renders nothing | Breakdown plan §5.17, §6.2, §4.2; PRD §32.1, §8.8 |
| **Q-FIND-6** | Can the frozen internal contract express **document metadata, a version list, and pagination or streaming** for timeline and relation reads at MVP scale? `RETR-01`'s frozen endpoint table has node, version-nodes, timeline and relation reads but no document-metadata call; retrieval sub-PRD **Q-RETR-6** names `FIND-02` as the confirming consumer. | `11-retrieval-engine` (`RETR-01`) confirmed by `14-search-product` (`FIND-02`) | `FIND-02` confirms or raises **one** docs PR against `RETR-01` + `RETR-09`; the `/v1` cursor contract itself is PRD §34.1 (`page_size` 1–100, opaque `next_cursor`) | `FIND-05` waits on `FIND-02`, so a late shape change is a critical-path event | Retrieval sub-PRD Q-RETR-6; PRD §16.2, §34.1, §13.2 |
| **Q-FIND-7** | The §34.2 request field `"employer": null` has no declared shape, while PRD §32.1 requires **employer name** and **ABN** advanced filters. | `00-foundation` (`FND-04`) with `14-search-product` | `FIND-01` conforms to whatever `FND-04`'s OpenAPI declares and, if it is unspecified, proposes `{ "name": string?, "abn": string? }` through the `FND-04` docs-PR path | Nothing — `FIND-04`'s filter UI is built against the generated type | PRD §34.2, §32.1, §32.2 (*"ABN checksum validated; clearly labelled as public business data"*) |

## Work breakdown

Lane is `14-search-product` and agent is `builder` for all six tickets (breakdown plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown plan §5.15 (plus the area
entry files noted below), and are disjoint between tickets that can run concurrently. `depends-on` is
exactly breakdown plan §5.15.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`FIND-01`](tickets/FIND-01-post-v1-search-route-and-response-contract.md) — `POST /v1/search` route and response contract | L | `14-search-product` | `apps/api/src/routes/search/**` (incl. co-located tests); append-only: `apps/api/package.json` | `RUNT-02`, `RETR-09` |
| [`FIND-02`](tickets/FIND-02-document-version-node-timeline-and-relation-endpoints.md) — Document, version, node, timeline and relation endpoints | L | `14-search-product` | `apps/api/src/routes/{documents,document-versions,nodes,node-versions}/**` (incl. co-located tests) | `RUNT-02`, `RETR-09` |
| [`FIND-03`](tickets/FIND-03-simple-search-screen.md) — Simple Search screen | M | `14-search-product` | `apps/web/src/features/search/{feature.tsx,mode-registry.ts,search-api.ts,no-results.tsx,result-actions.ts}` + `apps/web/src/features/search/simple/**` | `RUNT-05`, `RUNT-06`, `FIND-01` |
| [`FIND-04`](tickets/FIND-04-advanced-search-screen-filters-sort-no-results-taxonomy.md) — Advanced Search screen (filters, sort, no-results taxonomy) | L | `14-search-product` | `apps/web/src/features/search/advanced/**` | `FIND-03` |
| [`FIND-05`](tickets/FIND-05-document-version-node-timeline-screens.md) — Document / version / node timeline screens | L | `14-search-product` | `apps/web/src/features/sources/**` | `RUNT-05`, `FIND-02` |
| [`FIND-06`](tickets/FIND-06-search-latency-and-exact-match-regression-benchmark.md) — Search latency and exact-match regression benchmark | M | `14-search-product` | `apps/api/bench/search/**` | `FIND-01`, `RETR-10` |

**Two file-scope refinements this sub-PRD records** (both inside the module's §4 write-owns row, both
disjoint from every sibling ticket, neither a new path outside the plan):

- The **area-level files of the `search` feature** — `feature.tsx`, `mode-registry.ts`,
  `search-api.ts`, `no-results.tsx` and `result-actions.ts` — belong to **`FIND-03`**. `RUNT-05`'s A1
  web contract requires exactly one `feature.tsx` per feature area, and breakdown plan §5.15 places
  both search screens inside the single `search` area. `FIND-04` is `blocked_by FIND-03`, so the two
  are never concurrent, and `FIND-04` still writes **only** `advanced/**` because the mode registry
  discovers `./*/mode.tsx` by glob (**D7**) and the shared no-results renderer and action registry are
  consumed by props, not edited.
- `apps/web/src/features/sources/feature.tsx` belongs to **`FIND-05`**, the only ticket in that area.

Standing module-shared exception (breakdown plan §1.1 "Package manifests", and **Q-FIND-1**):

- `apps/api/package.json` — created by `FND-01`, extended by `RUNT-01`; `FIND-01` appends exactly the
  retrieval-client workspace dependency. `pnpm-lock.yaml` is regenerated as a build artifact
  (`corepack pnpm install`), never hand-merged. No other ticket in this module writes any manifest.

Wave shape (breakdown plan §7: **3 minimum waves, 2 useful lanes, not fully serial**). External
blockers in brackets:

```text
wave 1  FIND-01 [RUNT-02, RETR-09]   | FIND-02 [RUNT-02, RETR-09]
wave 2  FIND-03 [RUNT-05, RUNT-06]   | FIND-05 [RUNT-05]
wave 3  FIND-04                      | FIND-06 [RETR-10]
```

`FIND-06` has no intra-module blocker beyond `FIND-01` and may run as early as wave 2 once `RETR-10`
is merged; it is placed in wave 3 above only to show a schedule that reaches the 3-wave minimum at
concurrency 2.

## Acceptance — what makes the whole module done

The module is done when all six tickets are delivered (`/verify-delivery` green each) **and**:

1. **`SRCH-001` — Simple Search accepts natural language, keywords and exact identifiers, and works
   with the model gateway disabled.** With generation disabled and the founder funding ledger at
   zero, `POST /v1/search` returns `200` and the Simple Search screen renders results. Nothing in
   this module imports `packages/model-gateway`. (PRD §30.2 `SRCH-001`; §8.2; §16.2; §26;
   `UAT-SRCH-01`, `UAT-ANS-08`.)
2. **`SRCH-002` — every result independently passes all hard filters.** A property test over the
   `CRPS-08`-derived contract fixtures re-evaluates the request's `legal_as_at`, `jurisdictions` and
   `legal_statuses` against every returned row and finds no violation, and a `CURRENT_LAW` search in
   the presence of the fixture's `ENACTED_NOT_IN_FORCE` document returns no future material in the
   default result set — visibly separated when explicitly requested, never relabelled current.
   (PRD §30.2 `SRCH-002`; §6.5, §6.7, §36.2; `UAT-SRCH-02`; **D14**.)
3. **`SRCH-003` — results expose source text, pinpoint, status, effective interval and official
   link, and snippet offsets reproduce exact NodeVersion text.** For every fixture result,
   `snippet.text` equals the substring of the node version's canonical text at
   `[start_offset, end_offset)` retrieved through `FIND-02`'s node endpoint, and each of the eleven
   PRD §32.1 result-row fields is present in the payload and rendered. (PRD §30.2 `SRCH-003`; §34.2;
   §8.2; §15.3.)
4. **`SRCH-004` — exact provision/case/agreement/ABN matches outrank semantic similarity.**
   `FIND-06`'s API-level exact-match regression set passes at 100% in `LOCAL_SEARCH` mode: for every
   exact identifier in the fixture, the expected node is rank 1 of the `POST /v1/search` response.
   (PRD §30.2 `SRCH-004`; §36.2, §36.3; the retrieval-level half is `RETR-10`.)
5. **`SRCH-005` — source/version pages expose timeline and relationships without generation, and a
   historical stable link survives a later release.** A link captured against
   `document_version_id`/`node_version_id` resolves to the same text after a second release is
   loaded; relationship limitations and `MODEL_SUGGESTED`/`TREATMENT_NOT_CONFIRMED` qualifiers are
   displayed; the five PRD §12.1 freshness facts are shown separately; no generated text appears on
   any of these screens. (PRD §30.2 `SRCH-005`; §9.2, §9.3, §12.1, §31.2; `UAT-SRCH-03`.)
6. **PRD §13.2 latency gates, measured over HTTP.** `FIND-06` in `LOCAL_SEARCH` mode reports, with
   method and machine recorded: `POST /v1/search` **p95 ≤ 2 s** and source-node retrieval
   **p95 ≤ 1 s**. A gate that cannot be met is a writeback and a surfaced degraded status — never a
   relaxed filter, a narrowed corpus or a generated snippet (PRD §13.2; **D9**).
7. **PRD §13.1 accessibility.** All three screen tickets report zero WCAG 2.2 AA violations at
   360 px, 768 px and 1280 px using `RUNT-06`'s exported harness, with complete keyboard operation,
   one programmatic page heading per screen, labelled fields, error summaries, live regions, and
   legal status / jurisdiction / freshness rendered as text plus badge — colour never alone.
   (PRD §13.1, §41.1.)
8. **PRD §41.2 `UAT-SRCH-*` are executable end to end by a human** against the delivered module:
   `UAT-SRCH-01` (model gateway disabled → exact Act section still returned within the latency gate),
   `UAT-SRCH-02` (future material separated), `UAT-SRCH-03` (2024-08-03 legal date → the version
   effective at that date opens, current text is not substituted), `UAT-SRCH-04` (invalid ABN →
   inline checksum error, no search or quota event). These are `[human]` at Gate 2 and the
   automatable subset is `ASSR-06`'s.
9. **No tenant write, no generation credit, no second door.** No file in this module writes
   `app.sqlite`, creates a Research Record or a watch target, imports `packages/model-gateway`, or
   reaches the search process other than through `packages/retrieval-client` — each asserted
   mechanically. (PRD §16.2, §39.1; breakdown plan §4.2, **A3**.)
10. **Every `[machine]`/`[fixture]` item reproduces offline** against the committed `CRPS-08` fixture
    release and `RETR-01`'s committed contract examples, with no network access: `pnpm test`,
    `pnpm typecheck`, `pnpm lint` and `pnpm generate && pnpm generated:check` green on the merged
    default branch (PRD §20.3, §45.3).

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.15 (6 tickets,
  `FIND-01` … `FIND-06`). Records decisions D1–D14, rejects 12 alternatives, and opens Q-FIND-1 …
  Q-FIND-7 (Q-FIND-1 is a cross-module manifest question owned by `03-app-runtime`; Q-FIND-4 is a
  Founder product interpretation; Q-FIND-2/3/7 are `00-foundation` contract additions routed through
  `FND-03`'s declared friction path; Q-FIND-6 confirms retrieval sub-PRD Q-RETR-6). No ADR is
  proposed: every decision above is a build decision against an existing PRD sentence or an existing
  breakdown-plan decision (A1, A3, A6), not a new durable technology trade-off.
- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register.
  `FIND-06` is the only file that needed it. Its falsified protocol no longer presents PRD §27's
  *"reduce hot dense coverage before lexical scope"* mitigation as a decision the Founder has yet to
  take: **Q3 is deferred until real-scale measurement, not undecided** — the governing coverage policy
  is settled (full lexical coverage kept, hot dense coverage reduced before lexical scope, the 2 GB
  budget, explicit per-process memory limits, disclosed downgrades), and only the numbers (always-hot
  vector count, semantic-cache entry/byte limit, resident memory allocation, cold/hot tier boundary)
  plus the launch decision to apply a downgrade await `RLSE-11`'s real 2 GB benchmark. No number is
  invented here and no hot-vector planning hypothesis is stated. `FIND-06`'s two references to
  retrieval sub-PRD **Q4** now name it as a benchmark-selected parameter — PRD §36.2 defaults, tuned on
  development cases only, frozen before validation and blind testing, measured through `RETR-10` and
  frozen by `GOLD-15`. No change to the six tickets, `blocked_by`/`blocks` edges, file-scope, decisions
  D1–D14, the PRD §13.2 gates, the `SRCH-004` pass/fail rule or any acceptance item; `Q-FIND-1` …
  `Q-FIND-7` remain open exactly as authored, including `Q-FIND-4`'s Founder product interpretation.
