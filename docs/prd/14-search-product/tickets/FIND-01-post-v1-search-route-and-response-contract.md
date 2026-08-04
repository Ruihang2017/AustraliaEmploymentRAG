---
id: FIND-01
title: "`POST /v1/search` route and response contract"
module: 14-search-product
lane: 14-search-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, RETR-09]
blocks: [FIND-03, FIND-06, PLTF-05]
---

# FIND-01 — `POST /v1/search` route and response contract

Implements PRD §16.2, §34.2, §34.9, §13.2 — requirement IDs `SRCH-001`, `SRCH-002`, `SRCH-003`
(the API half of each); epic `E18-SEARCH-API-UI`.
No ADR — the decision is already made in PRD §34.2 (the normative search request/response payload)
and PRD §16.2 (*"Search is read-only despite POST and MUST not consume generation credits"*); this is
build ticket 1 of 6 against it.
Parent sub-PRD: [14-search-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-02 — admission middleware chain](../../03-app-runtime/tickets/RUNT-02-admission-middleware-chain.md),
[RETR-09 — `packages/retrieval-client` typed client](../../11-retrieval-engine/tickets/RETR-09-retrieval-client-typed-client.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against two fixed
contracts — `RUNT-01`/`RUNT-02`'s route-area and admission contract and `RETR-09`'s typed client —
not a new subsystem decision.

## Background + basis

**The payload is normative, not indicative.** PRD §34's preamble: *"The OpenAPI file at
`schemas/openapi/openapi.yaml` will be the generated-code source of truth. The examples below are
normative payload shapes; property names and enum meanings cannot drift from them without PRD/API
change control."* PRD §34.2 then gives both sides verbatim:

```json
{
  "mode": "ADVANCED",
  "query": "annual leave direction section 94",
  "legal_as_at": "2026-08-03",
  "jurisdictions": ["CTH", "VIC"],
  "document_types": ["ACT", "MODERN_AWARD", "DECISION"],
  "legal_statuses": ["IN_FORCE"],
  "authority_ids": [],
  "exact_identifiers": [],
  "employer": null,
  "sort": "RELEVANCE",
  "page_size": 25,
  "cursor": null
}
```

```json
{
  "schema_version": "1.0",
  "request_id": "req_...",
  "search_execution_id": "srx_...",
  "corpus_release_id": "cr_...",
  "legal_as_at": "2026-08-03",
  "applied_filters": {
    "jurisdictions": ["CTH", "VIC"],
    "legal_statuses": ["IN_FORCE"]
  },
  "results": [
    {
      "document_id": "doc_...",
      "document_version_id": "dv_...",
      "node_id": "node_...",
      "node_version_id": "nv_...",
      "title": "Official source title",
      "document_type": "ACT",
      "authority": {"id": "auth_...", "name": "Official authority"},
      "jurisdictions": ["CTH"],
      "legal_status": "IN_FORCE",
      "effective_from": "2026-07-01",
      "effective_to": null,
      "pinpoint": "s 94(5)",
      "snippet": {"text": "Exact source text…", "start_offset": 120, "end_offset": 198},
      "match_reasons": ["EXACT_PROVISION", "LEXICAL"],
      "freshness": "CURRENT",
      "official_url": "https://official.example/..."
    }
  ],
  "next_cursor": null,
  "warnings": []
}
```

PRD §34.2 closes with the rule that makes this endpoint different from every other one:
*"`snippet.text` MUST equal the referenced NodeVersion substring at the returned offsets after the
documented canonical newline normalisation. Search does not return generated summaries."* PRD §8.2
says the same from the product side: *"Snippets MUST originate from source text, not generated
paraphrases."* Sub-PRD **D2** turns this into a build rule: this route transports the snippet and its
offsets unchanged — it does not trim, ellipsise, re-highlight or summarise.

**Search must survive the budget running out.** PRD §16.2: *"Search is read-only despite POST and
MUST not consume generation credits."* PRD §8.2: *"Search MUST remain usable when the AI budget is
exhausted."* PRD §26 lists *"Search remains available independently of hosted-generation budget"* as
a Definition-of-Done item, and PRD §42.2's action at the 100% founder-spend ceiling is *"Stop
founder-funded model calls; preserve Search"*. PRD §30.2 `SRCH-001`'s minimum acceptance evidence is
literally *"Search works with model gateway disabled"*. Sub-PRD **D1** is the consequence: this route
imports no model gateway, declares no generation-credit consumption, and performs no application
database write.

**Admission is already built; this route only declares its profile.** `RUNT-02` ships one ordered,
non-bypassable chain — `['request-limits','authenticate','resolve-organisation','verify-membership',
'evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope','budget-admission',
'idempotency']` — selected by the `RouteAreaConfig.admission` profile `RUNT-01` defined
(`'public' | 'probe' | 'tenant' | 'internal'`). Two of its rules bind this ticket directly:

- `RUNT-02` deliverable 8: *"only routes that declare `requiresPiiAdmission` fail closed; search
  routes do not declare it"* — this is how PRD §30.2 `PII-002` (*"Search can continue if PII service
  is unavailable"*) is satisfied. This route therefore does **not** declare it.
- `RUNT-02` deliverable 9 rejects with `429 CREDIT_LIMIT_REACHED` when quota **or** funding-ledger
  balance is insufficient. A search route that let that stage evaluate a generation cost would break
  `SRCH-001`, `UAT-SRCH-01` and `UAT-ANS-08`. This route declares **no generation cost** so the stage
  is a no-op for it, while PRD §38.5's *search burst* (20/min trial, 60/min paid) and *API calls*
  ledgers still apply — PRD §38.5: *"Search, answer credits, advanced-task credits, API calls and
  provider cost are separate ledgers; exhausting one does not misreport the others."* If the chain
  cannot express "no generation cost", that is a writeback, not a local workaround (see Feedback
  obligation).

**Registration is by directory, never by a manifest.** `RUNT-01`'s A1 contract: *"Every immediate
child directory of `apps/api/src/routes/` is a route area … A route area MUST contain `index.ts`
with a default export that is a Fastify plugin"*, default prefix `/v1/<area-id>`, optional
`export const area = {...} satisfies RouteAreaConfig`, and *"Adding, renaming or removing a route
area produces zero diff outside that area's own directory."* Breakdown plan **A1** exists precisely
so this ticket never edits a shared index.

**Retrieval is somebody else's code, reached one way.** PRD §39.1: *"`services/search-rs` has no
credentials/path for `app.sqlite`"* and *"search-rs → corpus bundle only"*; PRD §39.4 allows exactly
two callers of `127.0.0.1:7700`. `RETR-09` is that hop and ships:

- `createRetrievalClient({ baseUrl, timeouts, retries, logger })` with methods `ready()`,
  `release()`, `retrieve()`, `evidence()`, `getNodeVersion()`, `listVersionNodes()`,
  `documentTimeline()`, `nodeTimeline()`, `documentRelations()`, `nodeRelations()`;
- a **required** `corpusReleaseId` on every call, with no default (`RETR-09` deliverable 2) —
  *"a type that cannot express a tenant cannot leak one"*, and a request type with **no**
  `organizationId`, `userId`, `actor`, `facts` or credential field;
- results shaped `{ data, corpusReleaseId, retrievalProfileId, requestId, degraded, warnings,
  stageStates }`, where *"a degraded response is a success carrying its warnings, never a thrown
  error"* (`RETR-09` deliverable 4);
- a typed error set mapped to the PRD §34.9 catalogue (`CorpusIncompatibleError` →
  `CORPUS_INCOMPATIBLE`, `InvalidRetrievalRequestError` → `INVALID_REQUEST`, `InvalidLegalDateError`
  → `INVALID_LEGAL_DATE`, `InvalidAbnError` → `INVALID_ABN`, `RetrievalTimeoutError` /
  `SearchUnavailableError` / `SearchInternalError` → `INTERNAL_ERROR`);
- `src/testing/mockSearch.ts`, an in-process fake serving `RETR-01`'s committed contract examples
  with switches for degraded stages, `STAGE_NOT_AVAILABLE`, release mismatch, timeout and connection
  failure — exported *"so `FIND-01`, `FIND-02`, `EVID-04` and `ASK-02` can test against the contract
  without running the Rust process"*. This ticket uses it and invents no stub of its own.

**Carried caveats, accepted and documented, not re-litigated:**

- `RETR-02` … `RETR-08` may be merged after this route; until then the search stages answer
  `STAGE_NOT_AVAILABLE`, which `RETR-09` maps to `stageStates['<stage>'] = 'NOT_IMPLEMENTED'` with
  `degraded: true`. This route surfaces that as a **200 with warnings**, never as a fabricated empty
  result set (sub-PRD **D9**; retrieval sub-PRD **D10**).
- PRD §8.2 requires *"authority level"* in the result row and PRD §32.1 requires a
  *"neutral/instrument ID"*, but the §34.2 example shows only `authority: {id, name}`. Sub-PRD
  **Q-FIND-2** records this; the resolution path is a docs PR against `FND-04`, never a locally
  invented field (sub-PRD **D4**).
- The five PRD §32.1 no-results causes are not a PRD-listed enumeration; sub-PRD **Q-FIND-3** routes
  them through `FND-03`'s declared friction-1 path.

## Goal

Produce the `apps/api/src/routes/search/**` route area: one autoloaded Fastify plugin exposing
`POST /v1/search`, validating the PRD §34.2 request against the generated contract, resolving and
pinning exactly one `corpus_release_id` per execution, calling `packages/retrieval-client` once,
minting a `search_execution_id`, and returning the PRD §34.2 response verbatim in shape — including
untouched snippets and offsets, a typed no-results reason, degraded warnings and PRD §34.9 error
codes — while consuming no generation credit and writing nothing to `app.sqlite`. Completion is
mechanically checkable: contract tests replay `RETR-01`'s committed examples through the route and
assert every §34.2 property; a test with the funding ledger at zero and no model gateway bound still
returns `200`; a source-scan test finds no `packages/model-gateway` import and no database write in
this area; and `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm generated:check` are green.

## Non-goals

- **No retrieval.** Ranking, filtering, exact-identifier precedence, snippet offsets, fusion and
  rerank are `11-retrieval-engine` (`RETR-02` … `RETR-08`). This route re-filters and re-ranks
  nothing (sub-PRD **D14**; PRD §45.2 forbids duplicated business rules in `apps/api`).
- **No document/version/node/timeline/relation endpoints** — `FIND-02`, same module, same wave. This
  ticket ships exactly one path.
- **No screens** — `FIND-03`, `FIND-04`.
- **No benchmark** — `FIND-06` (`apps/api/bench/search/**`), which is `blocked_by` this ticket.
- **No OpenAPI authoring, no generated bindings, no enum members** — `00-foundation` (`FND-03`,
  `FND-04`), PRD §44.3 serial-owned. This route **consumes** them; a missing field or member is a
  docs PR there first (sub-PRD **D4**).
- **No admission, authentication, tenancy, rate-limit or idempotency logic** — `RUNT-02`. This route
  declares its profile and nothing more.
- **No changes to the internal search wire contract** — `RETR-01` (retrieval sub-PRD **D8**). A
  needed field is a docs PR against `RETR-01` **and** `RETR-09`.
- **No app-database access of any kind** — `01-app-data` owns `packages/database` (breakdown plan
  **A3**). Search is read-only (PRD §16.2); this route holds no repository handle.
- **No saved search, no watch target, no Research Record** — `16-monitor-alerts` (`WTCH-01`),
  `17-records-collab` (`RCRD-01`, `RCRD-09`); breakdown plan §4.2.
- **No PII detection and no `requiresPiiAdmission` declaration** — `12-evidence-safety` (`EVID-01`);
  PRD §30.2 `PII-002` requires search to continue when the detector is unavailable.
- **No cross-boundary suites** — `tests/**` is `23-assurance` (`ASSR-01`, `ASSR-06`). This ticket
  carries its own co-located assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/api/src/routes/search/**` — the route area: `index.ts` (plugin + `area` config), request
  validation, release resolution, the response mapper, the cursor codec, the error mapper, and this
  ticket's co-located tests under `apps/api/src/routes/search/__tests__/**` (sub-PRD **D8**).
- `apps/api/package.json` — **append-only**, exactly one line: the workspace dependency on
  `packages/retrieval-client` (the package name is whatever `FND-01`/`RETR-09` set in
  `packages/retrieval-client/package.json` — read it, do not guess; `RETR-09`'s test plan shows
  `@aer/retrieval-client`). Nothing else in the manifest is altered. `pnpm-lock.yaml` is regenerated
  by re-running the package manager, never hand-merged (breakdown plan §1.1, §4.1). Sub-PRD
  **Q-FIND-1** records that this crosses into `03-app-runtime`'s manifest.

Does not touch:

- `apps/api/src/routes/{documents,document-versions,nodes,node-versions}/**` — `FIND-02` (same
  module, may run concurrently).
- `apps/api/bench/search/**` — `FIND-06`. `apps/web/**` — `FIND-03`/`FIND-04`/`FIND-05` and
  `RUNT-05`.
- `apps/api/src/{server.ts,app.ts,bootstrap,errors}/**` — `RUNT-01`;
  `apps/api/src/{plugins,middleware}/**` — `RUNT-02`; `apps/api/src/sse/**` — `RUNT-03`;
  `apps/api/src/routes/{health,system-status}/**` — `RUNT-08`; `apps/api/test/**` — `RUNT-01`/
  `RUNT-02` (this ticket's tests are co-located, sub-PRD **D8**).
- `apps/api/src/routes/**` areas belonging to other product modules — `13`, `15`, `16`, `17`, `19`,
  `20`, `22` (breakdown plan §4).
- `packages/retrieval-client/**` — `RETR-09`; `services/search-rs/**` — `11-retrieval-engine`.
  Both are **read** (types and the exported mock server), never written.
- `packages/contracts/**`, `schemas/openapi/**` — `FND-03`/`FND-04`, PRD §44.3 serial-owned;
  `packages/domain/**` — `00-foundation`; `packages/database/**` — `01-app-data`;
  `packages/auth/**` — `02-auth-core`; `packages/ui/**`, `packages/observability/**` —
  `03-app-runtime`; `packages/pii/**`, `packages/citations/**`, `packages/model-gateway/**` —
  `12-evidence-safety`.
- `apps/worker/**`, `apps/admin/**`, `apps/widget/**`, `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.
- Root `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.github/workflows/**` — `FND-01`,
  `FND-02`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged and no ticket is in
flight, so no prior ticket has written these paths and none contends for them. `RUNT-01` explicitly
ships **no** route directory of its own and lists every product `routes/<area>/**` as another
module's; `RUNT-08` owns only `health` and `system-status`. Under **A1** each route area is a
disjoint subtree with no shared registration file, so this area is disjoint from `FIND-02`'s four
areas (its wave-1 sibling) and from every other module's areas. The module's other four tickets are
in different trees (`apps/web/src/features/**`, `apps/api/bench/**`). The single shared artefact is
`apps/api/package.json`, extended append-only with one dependency line (**D11**, **Q-FIND-1**), and
`/start-all` serialises delivery so lockfile regenerations land one at a time.

## Deliverables

1. **`apps/api/src/routes/search/index.ts`** — the A1 entry file: a **default-exported**
   `FastifyPluginAsync` registering `app.post('/', …)` (area id `search` ⇒ derived prefix
   `/v1/search` ⇒ final path `POST /v1/search`), plus

   ```ts
   export const area = { admission: 'tenant' } satisfies RouteAreaConfig;
   ```

   The route declares `idempotent: false` (it is read-only; PRD §34.1 reserves `Idempotency-Key`
   for *"retryable writes"*), does **not** declare `requiresPiiAdmission` (PRD §30.2 `PII-002`;
   `RUNT-02` deliverable 8), does **not** declare `requiresRecentAuth`, and declares **no generation
   cost** so `RUNT-02`'s `budget-admission` stage cannot reject it (PRD §16.2; sub-PRD **D1**). The
   declaration mechanism is whatever `RUNT-02` exposes as merged; if it exposes none, see Feedback
   obligation — do not bypass the chain.
2. **Request validation from the generated contract.** The request schema is derived from
   `packages/contracts/src/generated/**` (`FND-04`), not hand-written, and enforces PRD §34.2 and
   §34.1: `mode` ∈ {`SIMPLE`,`ADVANCED`}; `query` a bounded non-empty string; `legal_as_at`
   `YYYY-MM-DD`; `jurisdictions`, `document_types`, `legal_statuses`, `authority_ids`,
   `exact_identifiers` arrays of the `FND-03` controlled values; `employer` per the generated type
   (sub-PRD **Q-FIND-7**); `sort` ∈ the generated sort enum (PRD §8.2 requires *"relevance,
   authority and date sorting"*); `page_size` 1–100 default **25**; `cursor` opaque. Unknown
   properties are rejected `400 INVALID_REQUEST` naming the field — **field names only, never
   submitted values** (PRD §37.2). A malformed date is `400 INVALID_LEGAL_DATE`; a failed ABN
   checksum is `400 INVALID_ABN` (PRD §34.9).
3. **Legal-date resolution, echoed not assumed.** An omitted `legal_as_at` defaults to **today's
   Australian legal date** taken from a single injected clock (never `new Date()` scattered through
   the handler), and the resolved value is always echoed in the response — PRD §32.1 requires
   `legal_as_at` to be *"required and defaulted to today"* and the screens display the assumption.
   The default is applied once, before the retrieval call, so the request the engine sees and the
   response the client sees name the same date.
4. **One pinned release per execution.** Before retrieval the handler resolves the release id
   (`client.release()`, cached with a short configurable TTL and revalidated on
   `CorpusIncompatibleError`) and passes it as the required `corpusReleaseId`. The resolved id is
   returned as `corpus_release_id`. **`next_cursor` is an opaque string that encodes the pinned
   release id plus the engine's paging token**, and a cursor naming a release that is no longer
   loaded returns `503 CORPUS_INCOMPATIBLE` rather than silently continuing on a different release —
   PRD §36.2 conjunct 5 (*"version and node belong to the pinned CorpusRelease"*) and PRD §18.4.
   The cursor never encodes tenant, actor or query text in readable form.
5. **`search_execution_id`.** Minted per execution as `srx_<uuidv7>` using the `packages/contracts`
   id helpers (`FND-03` reserves the `srx_` prefix); returned in the response (PRD §34.2) and
   included in the log line (deliverable 10). It is **not** persisted — PRD §16.2 makes search
   read-only and PRD §35.6 defines no search-execution table (sub-PRD rejected alternatives).
6. **Response mapper — the PRD §34.2 shape, field for field.** `schema_version`, `request_id`
   (from `RUNT-01`'s request-id hook), `search_execution_id`, `corpus_release_id`, `legal_as_at`,
   `applied_filters`, `results[]`, `next_cursor`, `warnings[]`. `applied_filters` reports what the
   **engine applied** (from the client's echo), not what the client asked for, so a filter that could
   not be applied is visible rather than implied. Each result row carries every property in the
   §34.2 example — `document_id`, `document_version_id`, `node_id`, `node_version_id`, `title`,
   `document_type`, `authority{id,name}`, `jurisdictions[]`, `legal_status`, `effective_from`,
   `effective_to`, `pinpoint`, `snippet{text,start_offset,end_offset}`, `match_reasons[]`,
   `freshness`, `official_url` — and, where the generated contract provides them, the PRD §8.2/§32.1
   additions `authority.authority_type`, `authority.court_level` and the result's official/neutral
   identifier (**Q-FIND-2**). A row missing a mandatory field is a mapper failure, not an omitted
   property: the handler fails the response with `500 INTERNAL_ERROR` and logs the offending field
   name rather than emitting a partially-populated row.
7. **Snippet pass-through (the `SRCH-003` rule).** `snippet.text`, `start_offset` and `end_offset`
   are copied unchanged from the client result. There is **no** truncation, ellipsis insertion,
   whitespace collapsing, HTML escaping into the stored value, term highlighting or summarisation
   anywhere in this area, and no code path in this ticket produces text that did not come from the
   corpus. Basis: PRD §34.2, §8.2, `SRCH-003`; sub-PRD **D2**.
8. **Typed no-results reasons and warnings.** When `results` is empty the response carries exactly
   one primary reason from the five PRD §32.1 causes — `NO_TEXT_MATCH`, `FILTERED_BY_HARD_FILTERS`,
   `SOURCE_NOT_COVERED`, `SOURCE_STALE_OR_UNAVAILABLE`, `EXACT_IDENTIFIER_NOT_FOUND` — derived from
   the engine's response (candidate counts before/after filtering, coverage and freshness signals,
   exact-identifier resolution), plus any additional `warnings`. The values come from
   `packages/contracts` (**Q-FIND-3**); they are never a locally declared string union (PRD §35.1,
   §20.1). `FIND-04` renders them; this ticket decides them.
9. **Degraded is a success.** A client result with `degraded: true` or any `stageStates` entry of
   `'DEGRADED' | 'UNAVAILABLE' | 'NOT_IMPLEMENTED'` returns **200** with the affected stages named in
   `warnings` — never a thrown error, never a silently smaller result set presented as complete
   (PRD §13.2; retrieval sub-PRD **D10**; sub-PRD **D9**).
10. **Error mapping to the closed PRD §34.9 catalogue**, produced through `RUNT-01`'s typed error
    factory so no code string is hand-written:

    | Condition | HTTP + code | Retryable |
    |---|---|---|
    | Schema/unknown field/bad enum | `400 INVALID_REQUEST` | No |
    | Bad or unparseable legal date | `400 INVALID_LEGAL_DATE` | No |
    | ABN checksum failure | `400 INVALID_ABN` | No |
    | `CorpusIncompatibleError`, stale cursor release | `503 CORPUS_INCOMPATIBLE` | No |
    | Engine reports the pinned release's sources unavailable/stale beyond use | `503 SOURCE_NOT_CURRENT` | No automatic retry |
    | `RetrievalTimeoutError`, `SearchUnavailableError`, `SearchInternalError`, mapper failure | `500 INTERNAL_ERROR` | One safe retry |

    `401`/`403`/`429` come from `RUNT-02` and are not produced here. No error body ever contains
    query text, snippet text or a stack (PRD §16.1, §22, §37.2).
11. **Observability without content.** One structured log line per request through
    `packages/observability` (`RUNT-07`) containing `{request_id, search_execution_id,
    corpus_release_id, retrieval_profile_id, mode, result_count, page_size, latency_ms, degraded,
    warning_codes, error_code}` — and **no** query text, snippet text, title, official URL or
    identifier the customer typed. Basis: PRD §22 (*"Logs MUST exclude research/evidence content"*).
12. **Client construction.** One `createRetrievalClient(...)` per process, built from config
    (loopback base URL, per-endpoint deadlines defaulting to `RETR-09`'s PRD §13.2 values — 2 s for
    retrieve), injected into the plugin so tests can substitute `RETR-09`'s exported
    `mockSearch`. This area constructs no other transport, opens no socket to the search port
    directly and imports no SQLite driver (retrieval sub-PRD **D1**; `RETR-09` deliverable 7's
    architecture test enforces it repo-wide).
13. **Co-located test suite** under `apps/api/src/routes/search/__tests__/**` covering deliverables
    2–11 (see Test plan), including a source-scan assertion that this area imports neither
    `packages/model-gateway` nor `packages/database`.

## Acceptance checklist (classified)

- [ ] `[machine]` Autoload: the area registers `POST /v1/search` purely by existing as a directory —
      no file outside `apps/api/src/routes/search/**` is modified except the one dependency line in
      `apps/api/package.json` (breakdown plan **A1**; `RUNT-01` contract item 6)
- [ ] `[fixture]` **Contract replay**: every search example under `RETR-01`'s
      `services/search-rs/src/service/contract/examples/` is served through `mockSearch` and the
      resulting HTTP body matches the PRD §34.2 response shape property-for-property, with no
      property renamed, added or dropped relative to the generated schema (`SRCH-003`; PRD §34.2,
      §34 preamble)
- [ ] `[fixture]` **Snippet fidelity**: for every replayed result, `snippet.text` is byte-identical
      to the client's value and equals the node-version substring at `[start_offset, end_offset)`
      obtained from the same fixture; no result's text differs from its source by even one character
      (`SRCH-003`; PRD §34.2, §8.2; sub-PRD **D2**)
- [ ] `[machine]` **No generated text**: a source scan of `apps/api/src/routes/search/**` finds no
      import of `packages/model-gateway`, no template that concatenates prose into `snippet.text`,
      and no truncation/ellipsis applied to it (PRD §8.2, §16.2)
- [ ] `[machine]` **Search consumes no generation credit**: with a funding ledger reporting zero
      balance and generation reported unavailable, `POST /v1/search` returns `200` with results, and
      no generation-credit ledger is read or written by this route — asserted with a spying budget
      stub that fails the test if a generation cost is evaluated (PRD §16.2, §38.5, §42.2, §26;
      `SRCH-001`, `UAT-ANS-08`)
- [ ] `[machine]` **Search works with the model gateway disabled**: booting the app with **no** PII
      provider and **no** model gateway bound, the route still answers `200` — the PRD §30.2
      `PII-002` split (`RUNT-02` deliverable 8) holds because this route declares no PII admission
      (`SRCH-001`, `PII-002`; PRD §8.2)
- [ ] `[machine]` **No app-database write**: a source scan finds no `packages/database` import in
      this area, and an integration run asserts zero write statements against `app.sqlite` for a
      completed search (PRD §16.2 *"read-only despite POST"*; breakdown plan **A3**)
- [ ] `[machine]` `SRCH-002` **hard-filter property**: over the fixture corpus, for every generated
      request/response pair, every returned row satisfies the request's `legal_as_at` ∈
      `[effective_from, effective_to]`, jurisdiction intersection and permitted `legal_statuses`;
      a `CURRENT_LAW`-mode request in the presence of the fixture's `ENACTED_NOT_IN_FORCE` document
      returns no future material (PRD §30.2 `SRCH-002`, §36.2, §6.5; `UAT-SRCH-02`; sub-PRD **D14**
      — this is a test, not a runtime re-filter)
- [ ] `[machine]` **Pinned release**: the response's `corpus_release_id` equals the id passed to the
      client; a `next_cursor` issued under one release and replayed after that release is unloaded
      returns `503 CORPUS_INCOMPATIBLE` rather than results from another release (PRD §36.2,
      §18.4; `ANS-004`'s pinning discipline)
- [ ] `[machine]` **`search_execution_id`** is present, matches `^srx_`, is unique per request, and
      appears in the log line (PRD §34.2, §33.1 step 4)
- [ ] `[machine]` **Degraded is 200**: a `mockSearch` run with a degraded dense stage and with
      `STAGE_NOT_AVAILABLE` returns `200` with the stages named in `warnings`, not a 5xx and not a
      silently complete-looking empty list (PRD §13.2; retrieval sub-PRD **D10**)
- [ ] `[machine]` **No-results taxonomy**: five fixture scenarios each produce their distinct primary
      reason — no lexical hit; all candidates removed by hard filters; a source group not covered; a
      stale/unavailable source; a well-formed exact identifier that resolves to nothing (PRD §32.1;
      consumed by `FIND-04`)
- [ ] `[machine]` **Error mapping**: one test per row of deliverable 10 asserting HTTP status, §34.9
      code and `retryable`; an unmapped internal failure is exactly `500 INTERNAL_ERROR` with no
      stack, query text or snippet in the body (PRD §34.9, §16.1)
- [ ] `[machine]` **Validation does not leak values**: a `400` body names the offending field but
      never echoes the submitted value — asserted with a canary string that must be absent from the
      response bytes (PRD §37.2)
- [ ] `[machine]` **Logging carries no content**: a canary token placed in `query` appears in no
      emitted log line (PRD §22)
- [ ] `[machine]` **Pagination bounds**: `page_size` defaults to 25, accepts 1–100 and rejects 0 and
      101 with `400 INVALID_REQUEST` (PRD §34.1)
- [ ] `[machine]` **Tenant is never accepted from the wire**: an `organization_id` in the body, query
      or header is rejected `400 INVALID_REQUEST` by the chain and is never forwarded to the
      retrieval client, whose request type cannot express it anyway (PRD §34.1; `RETR-09`
      deliverable 2; `SEC-001`)
- [ ] `[machine]` **Other-tenant safety**: this route addresses only corpus identifiers, so no
      tenant-owned resource is reachable through it — asserted by confirming no repository handle is
      obtained (PRD §16.5; breakdown plan **A3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this area consumes generated
      bindings and must cause no generated diff (PRD §20.1, §45.3; `DEV-001`)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs `SRCH-001`, `SRCH-002`, `SRCH-003`
      and UAT ids `UAT-SRCH-01`, `UAT-SRCH-02`, `UAT-SRCH-04`; schema/API compatibility impact (the
      `/v1` search operation and any `FND-04` additive field raised); tenant/PII/security impact
      ("no tenant data is read or written; no PII admission is declared, per `PII-002`"); cost impact
      ("zero — no generation credit, PRD §16.2"); latency impact (measured end to end by `FIND-06`);
      rollback path; known gaps including any retrieval stage still answering `STAGE_NOT_AVAILABLE`
- [ ] No `[human]` criteria in this ticket — it ships no customer-visible surface. Its human payoff
      (`UAT-SRCH-01`, `UAT-SRCH-02`, `UAT-SRCH-04`) is exercised through `FIND-03`/`FIND-04` at
      Gate 2, and PRD §43.4 founder review reads `FIND-06`'s report.
- [ ] `cargo test --workspace` and `uv run pytest` not applicable — this ticket touches no Rust and
      no Python (PRD §45.3).

## Test plan

All steps run offline: no network, no running Rust process, no model provider. The harness is the
repository's TypeScript test runner as configured by `FND-01`; copy the construction pattern from
`apps/api/test/admission/**` (`RUNT-02`'s integration tests: build the app with `buildApp()`, inject
a stub principal, assert on `app.inject()` responses).

1. **Boot and autoload** — `__tests__/route-area.test.ts`: build the app, assert
   `POST /v1/search` is registered under the derived prefix with the `tenant` admission profile and
   that the loaded-area list from `RUNT-01`'s `registerRouteAreas` reports exactly one route for this
   area. Then `git status --porcelain` in the review step must show no change outside this area
   except the single manifest line.
2. **Contract replay** — `__tests__/contract.test.ts`: enumerate `RETR-01`'s committed search
   examples, serve each through `RETR-09`'s `mockSearch`, `app.inject()` the corresponding request,
   and assert the body against the generated response type plus a literal property list transcribed
   from PRD §34.2. Fail naming the example file.
3. **Snippet fidelity** — same suite: for each replayed result, assert `snippet.text` is byte-equal
   to the fixture's value and equals `nodeText.slice(start_offset, end_offset)` using the node text
   from the same fixture. Assert no result's text contains an ellipsis character the fixture did not
   contain.
4. **Filter property** — `__tests__/filters.property.test.ts`: generate requests over the fixture's
   jurisdictions, dates and status sets; for each response, independently re-evaluate the three
   request filters against every row. This is a test-level check only (**D14**); assert that the
   production module exports no filter function.
5. **Budget and gateway independence** — `__tests__/no-generation-credit.test.ts`: bind a budget stub
   that throws if a generation cost is evaluated and reports a zero funding balance; bind no PII
   provider and no model gateway; assert `200` and a populated result list.
6. **Release pinning and cursor** — `__tests__/release-pinning.test.ts`: assert the client receives
   the same `corpusReleaseId` the response echoes; take a `next_cursor`, switch `mockSearch` to
   release-mismatch, replay, assert `503 CORPUS_INCOMPATIBLE`.
7. **Degraded and no-results** — `__tests__/degraded.test.ts` and `__tests__/no-results.test.ts`:
   drive `mockSearch`'s degraded/`STAGE_NOT_AVAILABLE` switches and the five empty-result scenarios;
   assert status, `warnings` and the single primary reason code for each.
8. **Errors and leakage** — `__tests__/errors.test.ts`: one case per deliverable-10 row; plus a
   canary-string case asserting the canary is absent from the response bytes and from every captured
   log line.
9. **Architecture** — `__tests__/architecture.test.ts`: scan this area's sources for imports of
   `packages/model-gateway`, `packages/database` or a SQLite driver, and for a URL literal pointing
   at the search port; each must be absent. Copy the construction pattern from `RETR-09`'s
   `test/architecture.test.ts`.
10. **Suite green** — `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm generate &&
    pnpm generated:check` from the repository root.
11. **Reviewer focus**: confirm the snippet is never modified on any path (including error and
    partial-response paths); confirm the release id used for page 2 is the page-1 release; confirm
    the no-results reason cannot be derived client-side and is genuinely server-decided; confirm no
    handler path can reach a repository or a provider; confirm the route cannot be rejected by
    budget admission; confirm every error code comes from `RUNT-01`'s factory rather than a literal.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/14-search-product/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The generated `/v1` search schema lacks a field PRD §8.2/§32.1 requires* (authority level,
     neutral/instrument identifier, the no-results reason, the `employer` shape) → sub-PRD
     **Q-FIND-2/3/7**. Raise a docs PR against `docs/prd/00-foundation/tickets/FND-04-*.md` (schema)
     and `FND-03` (enum members) — `FND-03`'s own feedback obligation names this path and says
     *"Do not let the consuming module declare its own copy"* — record the outcome in
     `docs/prd/14-search-product/README.md`, then implement. **Never** hand-edit
     `packages/contracts/src/generated/**` (PRD §20.1) and never declare a local union.
   - *`RUNT-02`'s chain cannot express "this route consumes no generation credit"* → that is a
     `RUNT-02` ticket change (docs PR against
     `docs/prd/03-app-runtime/tickets/RUNT-02-admission-middleware-chain.md`, `--sync`), plus a note
     in this module's README. Do **not** register the route under `public`/`probe` to dodge the
     stage, and do **not** bypass the chain: PRD §16.5's order is mandatory and `RUNT-02` deliverable
     1 exists so *"no route can opt out by omission"*.
   - *`RETR-09`'s client cannot express a field this route needs* (a filter, a paging token, a
     coverage signal for the no-results taxonomy) → that is a change to `RETR-01`'s frozen internal
     contract (retrieval sub-PRD **D8**). One docs PR amending **`RETR-01` and `RETR-09`** together,
     `--sync`, then implement both sides. Never open a second connection to the search process and
     never add an untyped passthrough.
   - *The `apps/api/package.json` dependency line is contested or a script entry turns out to be
     needed* → sub-PRD **Q-FIND-1**. Record what was added in
     `docs/prd/14-search-product/README.md`, and raise the cross-module rule against
     `docs/prd/breakdown-plan.md` §1.1/§4 — seven other product modules hit the same wall next.
   - *The PRD §13.2 p95 ≤ 2 s objective looks unreachable through this route* → PRD §13.2 requires
     the product to *"preserve correctness and surface delay/degraded status"*. Report it in
     `FIND-06`'s output and write back to `docs/prd/14-search-product/README.md`. It is **never**
     bought by relaxing a hard filter, widening the status set, shortening the corpus, caching a
     stale result set or generating a snippet — each of those trades a legal-correctness guarantee
     for a latency number, which PRD §13.2 forbids in that exact sentence.
3. **Falsified protocol.** If search genuinely cannot be served without consuming a generation
   credit, or without an app-database write, then PRD §16.2, §26 and §42.2 are contradicted and the
   product's cheapest safety guarantee is in question. Stop, escalate for re-review, and write back
   to `docs/prd/breakdown-plan.md` §4.2 and this sub-PRD before writing code. Likewise, if a second
   path to the corpus (bypassing `packages/retrieval-client`) appears necessary, that overturns
   retrieval sub-PRD **D1** and PRD §39.1 — escalate rather than adding the second door.
