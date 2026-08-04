---
id: FIND-02
title: Document, version, node, timeline and relation endpoints
module: 14-search-product
lane: 14-search-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, RETR-09]
blocks: [FIND-05]
---

# FIND-02 — Document, version, node, timeline and relation endpoints

Implements PRD §16.2 (the eight non-search "Search and authorities" endpoints), §15.3, §9.2, §9.3,
§13.2 — requirement ID `SRCH-005`, with `SRCH-003` (exact node text and offsets) on the read side;
epic `E18-SEARCH-API-UI`.
No ADR — the decision is already made in PRD §16.2 (the endpoint list), PRD §15.3 (*"Citations MUST
target DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk"*) and
PRD §31.2 (the three source routes these endpoints serve); this is build ticket 2 of 6 against it.
Parent sub-PRD: [14-search-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RUNT-02 — admission middleware chain](../../03-app-runtime/tickets/RUNT-02-admission-middleware-chain.md),
[RETR-09 — `packages/retrieval-client` typed client](../../11-retrieval-engine/tickets/RETR-09-retrieval-client-typed-client.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against two fixed
contracts — `RUNT-01`/`RUNT-02`'s route-area and admission contract and `RETR-09`'s typed client —
not a new subsystem decision.

## Background + basis

**The endpoint list is fixed.** PRD §16.2 "Search and authorities" names nine endpoints;
`POST /v1/search` is `FIND-01`'s and the other eight are this ticket's:

```text
GET /v1/documents/{document_id}
GET /v1/documents/{document_id}/versions
GET /v1/document-versions/{version_id}/nodes
GET /v1/node-versions/{node_version_id}
GET /v1/documents/{document_id}/timeline
GET /v1/nodes/{node_id}/timeline
GET /v1/documents/{document_id}/relations
GET /v1/nodes/{node_id}/relations
```

and PRD §16.2 adds the rule that covers all of them: *"Search is read-only despite POST and MUST not
consume generation credits."*

**They exist to make a historical link durable.** PRD §30.2 `SRCH-005`: *"Source/version pages expose
timeline and relationships without generation"*, primary API *"document/node endpoints"*, minimum
acceptance evidence *"Historical stable link survives later release"*. PRD §31.2 gives the three
consuming routes and their first-use states verbatim:

| Route | Screen | Main action | Empty/first-use state |
|---|---|---|---|
| `/documents/:documentId` | Document | Read metadata/current version/timeline | Not applicable; invalid/other-tenant-safe 404 |
| `/document-versions/:versionId` | Document version | Read exact historical version | Source unavailable banner if artifact is link-only |
| `/nodes/:nodeId` | Node timeline | View provision lineage | Relationship limitations shown |

`UAT-SRCH-03` is the human test: *"Select 2024-08-03 then open result → Version effective at that
date opens; current text is not substituted."*

**Identity is immutable; labels are not.** PRD §15.3: *"Provision labels are version-specific display
values, not permanent IDs. Node lineage supports renumber/replacement/split/merge. SearchChunks MUST
NOT cross independent legal nodes merely for convenience. SearchChunks and embeddings may be
deleted/rebuilt. Citations MUST target DocumentVersion + NodeVersion + exact offsets + source
snapshot, never a SearchChunk."* PRD §35.2 makes `document_version` and `node_version` immutable
rows. Sub-PRD **D13** is the consequence: these endpoints address `document_version_id` and
`node_version_id`, never a chunk and never "the current one", which is what makes a link captured
today resolve to the same text after a later release.

**Relationships may only claim what the evidence supports.** PRD §9.3: *"Official structured
assertions may support conclusions. Deterministic extraction may support conclusions when exact
source evidence and parser version are retained. LLM-discovered relationships are `MODEL_SUGGESTED`
and MUST NOT change legal status or support a definitive treatment conclusion."* PRD §9.2:
*"Appeal, affirmation, reversal, overruling, distinction, following and citation relationships MAY be
asserted only with evidence. A citation alone establishes `CITES`, not treatment. Unconfirmed later
treatment MUST display `TREATMENT_NOT_CONFIRMED`."* PRD §35.2's `node_relation` row carries exactly
the fields that make that checkable: `relation_type`, `evidence_node_version_id`, `evidence_start`,
`evidence_end`, `derivation`, `parser_version`, `confidence_state`. These endpoints transport all of
them; they never drop the qualifier that makes a relationship honest.

**Licence limits are decided upstream and must not be undone here.** PRD §11.1 lists the assessment
states — `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`, `METADATA_AND_LINK_ONLY`, `UNCLEAR_RESTRICTED`,
`PROHIBITED`, `REVIEW_REQUIRED` — and *"Unclear rights default to metadata, limited quotation and
official links."* PRD §36.2's eligibility conjunct 4 is *"document/source use is permitted by licence
assessment"*, applied inside the search boundary. This ticket therefore **transports** whatever the
engine returns: where material is metadata-and-link-only the response carries metadata, the official
URL and the licence limitation, and carries **no** canonical text. It never re-derives a licence
decision and never fetches text the engine withheld.

**Latency has its own PRD gate.** PRD §13.2: *"Source-node retrieval | p95 ≤ 1 second"*, and
*"If a goal cannot be met without violating evidence quality, cost or safety, the product MUST
preserve correctness and surface delay/degraded status."* `RETR-09` already defaults these endpoints'
client deadlines to 1 s (its deliverable 6). This ticket carries a co-located measurement; the
consolidated, gate-bearing measurement is `FIND-06`'s.

**Everything comes through one client.** `RETR-09` exposes `getNodeVersion()`, `listVersionNodes()`,
`documentTimeline()`, `nodeTimeline()`, `documentRelations()`, `nodeRelations()` and `release()`,
each requiring a `corpusReleaseId`, returning `{ data, corpusReleaseId, retrievalProfileId,
requestId, degraded, warnings, stageStates }`, and mapping failures onto the PRD §34.9 catalogue. It
also exports `src/testing/mockSearch.ts` serving `RETR-01`'s committed contract examples, so this
ticket is testable offline with no Rust process.

**Carried caveats, accepted and documented:**

- `RETR-01`'s frozen internal contract (retrieval sub-PRD **D8**) lists node, version-nodes, timeline
  and relation endpoints but **no document-metadata endpoint and no version-list endpoint**. If
  `documentTimeline()` does not carry the `legal_document` metadata PRD §35.2 defines
  (`document_type`, `canonical_title`, `official_identifier`, `neutral_citation`, `employer_abn`) and
  the version rows `GET /v1/documents/{id}/versions` needs, the **first action of this ticket is a
  docs PR against `RETR-01` and `RETR-09`**, not a workaround — sub-PRD **Q-FIND-6**, retrieval
  sub-PRD **Q-RETR-6**, which names `FIND-02` as the confirming consumer. `FIND-05` waits on this
  ticket, so a late shape change is a critical-path event.
- The PRD contains no §34 payload for these eight endpoints. Their public shapes are `FND-04`'s
  OpenAPI (`schemas/openapi/openapi.yaml`, which declares *"Every PRD §16.2 endpoint"*); this ticket
  conforms to the generated types and raises any gap there (sub-PRD **D4**).

## Goal

Produce four autoloaded route areas — `documents`, `document-versions`, `nodes`, `node-versions` —
serving the eight PRD §16.2 endpoints above by mapping the generated `/v1` contract onto
`packages/retrieval-client` calls, with immutable version/node identities, full relationship
qualifiers (`confidence_state`, `derivation`, `parser_version`, evidence offsets), licence
limitations transported unchanged, PRD §34.1 pagination, PRD §34.9 errors, and no generated text
anywhere. Completion is mechanically checkable: contract tests replay `RETR-01`'s committed examples
through each endpoint and assert the generated response shape; a node-version response's text and
offsets reproduce the snippet `FIND-01` returned for the same node; a link captured against a version
id resolves identically after a second release is loaded; a source scan finds no model-gateway and no
database import; and `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm generated:check` are green.

## Non-goals

- **No `POST /v1/search`** — `FIND-01`, same module, same wave. The two tickets share no file.
- **No screens** — `FIND-05` (`apps/web/src/features/sources/**`), which is `blocked_by` this ticket.
- **No corpus reading, no ranking, no filtering, no licence decision** — `11-retrieval-engine`
  (`RETR-01`, `RETR-04`). This module holds no corpus path and no licence rule.
- **No OpenAPI authoring, generated bindings or enum members** — `00-foundation` (`FND-03`,
  `FND-04`), PRD §44.3 serial-owned.
- **No quotation limits, evidence packs or citation validation** — `12-evidence-safety` (`EVID-04`,
  `EVID-05`, `EVID-06`). Those govern answers and exports; this is a source read path.
- **No admission, auth, tenancy or rate-limit logic** — `RUNT-02`.
- **No app-database access** — breakdown plan **A3**; PRD §16.2 (read-only).
- **No watch target, no saved source, no Research Record** — `16-monitor-alerts` (`WTCH-01`),
  `17-records-collab`; breakdown plan §4.2.
- **No benchmark harness** — `FIND-06`. This ticket asserts its own latency co-located; it writes
  nothing under `apps/api/bench/**`.
- **No cross-boundary suites** — `tests/**` is `23-assurance`.

## File-scope (write-owns)

- `apps/api/src/routes/documents/**` — `GET /v1/documents/{document_id}`,
  `/versions`, `/timeline`, `/relations`.
- `apps/api/src/routes/document-versions/**` — `GET /v1/document-versions/{version_id}/nodes`.
- `apps/api/src/routes/nodes/**` — `GET /v1/nodes/{node_id}/timeline`, `/relations`.
- `apps/api/src/routes/node-versions/**` — `GET /v1/node-versions/{node_version_id}`.
- Co-located tests for each area under `apps/api/src/routes/<area>/__tests__/**` (sub-PRD **D8**).

Does not touch:

- `apps/api/src/routes/search/**` — `FIND-01` (same module, concurrent wave-1 sibling).
- `apps/api/package.json` — extended by `FIND-01` with the retrieval-client dependency
  (sub-PRD **D11**, **Q-FIND-1**). This ticket adds **no** dependency; if it needs one, coordinate
  through the README writeback rather than editing the manifest concurrently with `FIND-01`.
- `apps/api/bench/search/**` — `FIND-06`. `apps/web/**` — `FIND-03`/`FIND-04`/`FIND-05`, `RUNT-05`.
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` and
  `apps/api/test/**` — `RUNT-01`/`RUNT-02`/`RUNT-03`; `apps/api/src/routes/{health,system-status}/**`
  — `RUNT-08`.
- `packages/retrieval-client/**` — `RETR-09`; `services/search-rs/**` — `11-retrieval-engine`. Both
  are read (types, committed contract examples, exported mock server), never written.
- `packages/contracts/**`, `schemas/openapi/**` — `FND-03`/`FND-04`, serial-owned;
  `packages/domain/**` — `00-foundation`; `packages/database/**` — `01-app-data`; `packages/ui/**`,
  `packages/observability/**` — `03-app-runtime`; `packages/pii/**`, `packages/citations/**`,
  `packages/model-gateway/**` — `12-evidence-safety`.
- `apps/worker/**`, `apps/admin/**`, `apps/widget/**`, `pipelines/**`, `infra/**`, `tests/**`,
  `evals/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen. Root manifests,
  lockfiles and `.github/workflows/**` — `FND-01`, `FND-02`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written these four areas and nothing contends for them.
Under breakdown plan **A1** every route area is a self-contained directory with no shared
registration file, so these four are disjoint from `FIND-01`'s `search` area — the two tickets are
the module's wave-1 pair and run as concurrent lanes (breakdown plan §7: 6 tickets, 3 minimum waves,
2 useful lanes). `RUNT-01` ships no route directory and `RUNT-08` owns only `health` and
`system-status`; every other `routes/<area>/**` belongs to a different module (breakdown plan §4).
This ticket writes no manifest at all, so it cannot collide with `FIND-01`'s single append-only
dependency line.

## Deliverables

1. **Four A1 route areas**, each `apps/api/src/routes/<area>/index.ts` with a default-exported
   `FastifyPluginAsync` and `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`.
   Derived prefixes are `/v1/documents`, `/v1/document-versions`, `/v1/nodes`, `/v1/node-versions`
   (`RUNT-01` contract item 4). No area declares `requiresPiiAdmission`, `requiresRecentAuth`,
   `idempotent` or any generation cost (PRD §16.2, §30.2 `PII-002`; sub-PRD **D1**).
2. **Endpoint → client mapping**, implemented once per endpoint with no shared mutable state:

   | Public endpoint | `packages/retrieval-client` call | Notes |
   |---|---|---|
   | `GET /v1/documents/{document_id}` | document metadata (see caveat) | PRD §35.2 `legal_document` fields |
   | `GET /v1/documents/{document_id}/versions` | version list (see caveat) | PRD §35.2 `document_version` rows, ordered |
   | `GET /v1/documents/{document_id}/timeline` | `documentTimeline()` | PRD §35.2 `legal_event` rows + version chain |
   | `GET /v1/document-versions/{version_id}/nodes` | `listVersionNodes()` | bounded page, PRD §34.1 |
   | `GET /v1/node-versions/{node_version_id}` | `getNodeVersion()` | exact text, offsets, pinpoint, interval |
   | `GET /v1/nodes/{node_id}/timeline` | `nodeTimeline()` | provision lineage across versions |
   | `GET /v1/documents/{document_id}/relations` | `documentRelations()` | PRD §35.2 `node_relation` rows |
   | `GET /v1/nodes/{node_id}/relations` | `nodeRelations()` | same |

   **Caveat, and the required first action:** if `RETR-01`'s frozen contract exposes no document
   metadata or version-list call, raise the docs PR against `RETR-01` + `RETR-09` before writing the
   handler (sub-PRD **Q-FIND-6**). Do not synthesise document metadata by aggregating node rows and
   do not open a second path to the corpus.
3. **Release resolution and historical pinning.** Every handler resolves a `corpus_release_id`
   exactly as `FIND-01` does (`client.release()` with a short TTL) and passes it as the required
   `corpusReleaseId`. Where the generated contract declares an optional release parameter, an
   explicit value is honoured and echoed so a captured link can name its release; an unloaded release
   yields `503 CORPUS_INCOMPATIBLE` (PRD §18.4 — *"Old releases cannot be removed while jobs remain
   pinned"*; retrieval sub-PRD **D3**). The response always states which release answered it.
4. **Exact node text and offsets.** `GET /v1/node-versions/{id}` returns the canonical text, its
   character offsets, `display_label`/`pinpoint`, `effective_from`/`effective_to`, `legal_status`,
   the owning `document_version_id`/`document_node_id`, the content/text hash and the official URL —
   transported unchanged. Offsets are the half-open character offsets into NFC-normalised canonical
   text that retrieval sub-PRD **D13** fixes; this ticket re-derives none of them. A `FIND-01`
   snippet at `[start_offset, end_offset)` must be reproducible from this endpoint's text — that
   cross-endpoint identity is `SRCH-003`'s minimum evidence and is asserted in the test plan.
5. **Relations with their qualifiers intact.** Relation responses carry, per row, `relation_type`,
   the `from`/`to` node-version ids, `evidence_node_version_id` with `evidence_start`/`evidence_end`,
   `derivation`, `parser_version` and `confidence_state`; `MODEL_SUGGESTED` and
   `TREATMENT_NOT_CONFIRMED` are transported as first-class values, never filtered out to make a list
   look cleaner and never upgraded. A relation without evidence is returned with its evidence fields
   absent — it is not silently dropped, because `FIND-05` must render *"Relationship limitations
   shown"* (PRD §31.2, §9.2, §9.3, §35.2).
6. **Licence-aware transport.** Where the engine reports `METADATA_AND_LINK_ONLY`,
   `UNCLEAR_RESTRICTED`, `PROHIBITED` or `REVIEW_REQUIRED` for the addressed material, the response
   carries the assessment state, the attribution text where one applies, the official URL and **no**
   canonical text. This module makes no licence decision and never requests text the engine withheld
   (PRD §11.1, §36.2; `FIND-05` renders the *"Source unavailable banner if artifact is link-only"*
   state from this field, PRD §31.2).
7. **Pagination and ordering.** List endpoints (`/versions`, `/nodes`, `/timeline`, `/relations`)
   implement PRD §34.1 exactly: `page_size` 1–100 default 25, opaque `next_cursor`. Ordering is
   deterministic and documented per endpoint — versions and timeline by effective date then
   `ordinal`; nodes by `ordinal`; relations by `relation_type` then target id — so a cursor is stable
   and page 2 cannot repeat or skip a row. The cursor encodes the pinned release (as in `FIND-01`
   deliverable 4) and carries no tenant or actor value.
8. **Immutable-resource caching.** Version- and node-version-addressed responses carry a strong
   `ETag` derived from `(corpus_release_id, resource id, content/text hash)` and a `Cache-Control`
   permitting private caching; a conditional request with a matching `If-None-Match` returns `304`.
   Document-metadata and timeline responses, whose "current version" changes between releases, carry
   no long-lived cache directive. Basis: PRD §35.2 (`document_version` and `node_version` are
   immutable), PRD §13.2's ≤ 1 s objective. `If-Match` is **not** used — nothing here is mutable
   (PRD §34.1).
9. **Not-found and error mapping.** An unknown, malformed or not-in-this-release identifier returns
   the uniform `404 RESOURCE_NOT_FOUND` body — identical in shape for "absent" and "not addressable"
   (PRD §34.9: *"Check ID; same response for forbidden/other tenant"*; PRD §31.2's
   *"invalid/other-tenant-safe 404"*). Client errors map exactly as in `FIND-01` deliverable 10:
   `CorpusIncompatibleError` → `503 CORPUS_INCOMPATIBLE`; timeout/connection/5xx →
   `500 INTERNAL_ERROR`; malformed identifier → `400 INVALID_REQUEST`. Codes come from `RUNT-01`'s
   typed factory, never a literal.
10. **Degraded is a success** (sub-PRD **D9**): a degraded client result returns `200` with the
    affected stages named in `warnings`. These read endpoints depend only on the corpus reader, so a
    degraded dense or rerank stage must not affect them at all — if it does, that is a retrieval-side
    defect and a writeback, not a local retry loop.
11. **Observability without content.** One log line per request: `{request_id, endpoint,
    corpus_release_id, resource_kind, result_count, latency_ms, degraded, error_code}` — never node
    text, title, official URL or identifier text beyond opaque ids (PRD §22).
12. **Co-located latency assertion.** A repeatable measurement (fixed warm-up, configured iteration
    count) over `GET /v1/node-versions/{id}` and `GET /v1/document-versions/{id}/nodes` against
    `mockSearch`, reporting p50/p95 and asserting that **this module's own overhead** (total minus the
    stubbed client time) stays within a declared budget stated in the PR. The end-to-end PRD §13.2
    ≤ 1 s gate against a real search process is `FIND-06`'s (sub-PRD **D12**); this assertion exists
    so an API-side regression is attributable here rather than discovered at the end.
13. **Co-located test suite** under each area's `__tests__/**`, including the architecture scan
    (no `packages/model-gateway`, no `packages/database`, no direct search-port URL).

## Acceptance checklist (classified)

- [ ] `[machine]` All eight PRD §16.2 endpoints are registered at their exact paths, by directory
      autoload, with zero diff outside these four area directories (PRD §16.2; breakdown plan **A1**;
      `RUNT-01` contract item 6)
- [ ] `[fixture]` **Contract replay**: every relevant example under `RETR-01`'s
      `services/search-rs/src/service/contract/examples/` is served through `mockSearch` and each
      endpoint's HTTP body validates against its generated `/v1` response type, with no property
      renamed, added or dropped (`FND-04`; PRD §34 preamble)
- [ ] `[fixture]` **`SRCH-003` cross-endpoint identity**: for every fixture result, the snippet
      `FIND-01` returns at `[start_offset, end_offset)` is byte-identical to the substring of the
      text this ticket's `GET /v1/node-versions/{id}` returns for the same node version (PRD §34.2,
      §15.3; `SRCH-003`)
- [ ] `[fixture]` **`SRCH-005` historical stability**: a `document_version_id`/`node_version_id`
      captured under release A returns byte-identical text after release B is loaded and made active;
      the response states which release answered it, and no handler substitutes the current version
      (PRD §30.2 `SRCH-005`; §18.4; `UAT-SRCH-03`; sub-PRD **D13**)
- [ ] `[machine]` **Relationship honesty**: a fixture relation with `confidence_state =
      MODEL_SUGGESTED` is returned with that value and with its evidence fields; nothing upgrades it,
      and a relation lacking evidence is returned with the evidence fields absent rather than being
      dropped (PRD §9.2, §9.3, §35.2)
- [ ] `[fixture]` **Licence limitation**: a `METADATA_AND_LINK_ONLY` fixture returns the assessment
      state, attribution where applicable and the official URL, and contains **no** canonical text —
      asserted by the absence of the fixture's text bytes in the response (PRD §11.1, §36.2;
      PRD §31.2 "Source unavailable banner if artifact is link-only")
- [ ] `[machine]` **No generation anywhere**: a source scan finds no `packages/model-gateway` import
      in these areas and no response field is produced by string composition of source text; these
      endpoints work with generation disabled and consume no generation credit (PRD §16.2, §26;
      `SRCH-005` *"without generation"*)
- [ ] `[machine]` **No app-database access**: a source scan finds no `packages/database` import and an
      integration run records zero writes to `app.sqlite` (PRD §16.2; breakdown plan **A3**)
- [ ] `[machine]` **Pagination**: each list endpoint defaults `page_size` to 25, accepts 1–100,
      rejects 0 and 101 with `400 INVALID_REQUEST`, and paging twice over a fixture returns every row
      exactly once in the documented order (PRD §34.1)
- [ ] `[machine]` **Cursor release-safety**: a cursor issued under release A replayed after A is
      unloaded returns `503 CORPUS_INCOMPATIBLE`, never rows from release B (PRD §36.2 conjunct 5,
      §18.4)
- [ ] `[machine]` **404 uniformity**: an unknown id, a malformed id and an id absent from the pinned
      release all return the identical `404 RESOURCE_NOT_FOUND` body apart from `request_id`
      (PRD §34.9, §16.5; PRD §31.2 "invalid/other-tenant-safe 404")
- [ ] `[machine]` **Caching**: a version/node-version response carries a strong `ETag`; a repeat with
      `If-None-Match` returns `304`; a document-metadata response carries no long-lived cache
      directive (PRD §35.2 immutability; §13.2)
- [ ] `[machine]` **Degraded is 200** with the affected stages in `warnings`, and a degraded dense or
      rerank stage does not change any of these responses (PRD §13.2; retrieval sub-PRD **D10**)
- [ ] `[machine]` **Latency (co-located, attributable)**: this module's own overhead over
      `GET /v1/node-versions/{id}` and `GET /v1/document-versions/{id}/nodes` is measured over a fixed
      iteration count against `mockSearch` and reported in the PR with method and machine; the
      PRD §13.2 **p95 ≤ 1 s** end-to-end gate itself is evaluated by `FIND-06` in `LOCAL_SEARCH`
      mode (PRD §13.2; sub-PRD **D12**)
- [ ] `[machine]` **Logging carries no content**: a canary token in a fixture node's text appears in
      no emitted log line (PRD §22)
- [ ] `[machine]` **No second door**: no direct URL to the search port, no SQLite driver, no corpus
      path in these areas (PRD §39.1, §39.4; retrieval sub-PRD **D1**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1, §45.3; `DEV-001`)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement IDs `SRCH-005`, `SRCH-003` and UAT id
      `UAT-SRCH-03`; schema/API compatibility impact (the eight `/v1` operations and any `FND-04` or
      `RETR-01` addition raised); tenant/PII/security impact ("no tenant data is read or written; no
      PII admission declared"); source/licence impact ("licence limitations are transported, never
      re-decided"); latency impact (measured above); rollback path; known gaps
- [ ] No `[human]` criteria in this ticket — it ships no customer-visible surface. `UAT-SRCH-03` is
      executed through `FIND-05` at Gate 2.
- [ ] `cargo test --workspace` and `uv run pytest` not applicable — no Rust and no Python here
      (PRD §45.3).

## Test plan

All steps run offline: no network, no Rust process, no model provider. Harness: the repository's
TypeScript test runner as configured by `FND-01`; copy the construction pattern from
`apps/api/test/admission/**` (`RUNT-02`: build with `buildApp()`, inject a stub principal, assert on
`app.inject()`), and from `FIND-01`'s `__tests__/contract.test.ts` for fixture replay.

1. **Registration** — `documents/__tests__/route-area.test.ts` (and one per area): assert every path
   in the PRD §16.2 list above is registered exactly once, under the `tenant` profile.
2. **Contract replay** — per area: enumerate `RETR-01`'s committed examples, serve through
   `mockSearch`, assert each response against its generated `/v1` type and against a literal field
   list transcribed from PRD §35.2 for that resource. Fail naming the example file.
3. **Cross-endpoint snippet identity** — `node-versions/__tests__/snippet-identity.test.ts`: run a
   `FIND-01` search over the same fixture (importing nothing from `FIND-01`'s area — drive it through
   HTTP with `app.inject()`), take each result's `node_version_id` and offsets, fetch the node
   version here, and assert byte equality of the substring.
4. **Historical stability** — `__tests__/release-stability.test.ts`: configure `mockSearch` with two
   releases; fetch a version under A; make B active; re-fetch by the same id; assert identical text
   and that the response names the release that answered.
5. **Relations and licence** — `nodes/__tests__/relations.test.ts`,
   `documents/__tests__/licence.test.ts`: assert qualifier transport, absent-evidence retention, and
   the absence of withheld text (search the raw response bytes for the fixture's text).
6. **Pagination and cursors** — `__tests__/pagination.test.ts`: bounds, full traversal without
   duplication or omission, and the stale-release cursor case.
7. **Caching** — `__tests__/caching.test.ts`: `ETag` presence and stability, `304` on
   `If-None-Match`, no long-lived directive on document metadata.
8. **Errors** — `__tests__/errors.test.ts`: unknown/malformed/absent-in-release ids all produce the
   identical 404 body; client failures map to the deliverable-9 codes.
9. **Latency** — `__tests__/latency.test.ts`: fixed warm-up plus N iterations against `mockSearch`;
   print p50/p95 of module overhead for the PR; fail only on the declared overhead budget, never on
   the end-to-end §13.2 number (which needs a real search process — `FIND-06`).
10. **Architecture** — `__tests__/architecture.test.ts` per area: no `packages/model-gateway`, no
    `packages/database`, no search-port URL, no SQLite driver. Copy `RETR-09`'s
    `test/architecture.test.ts` construction.
11. **Suite green** — `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm generate &&
    pnpm generated:check` from the repository root.
12. **Reviewer focus**: confirm no handler substitutes "the current version" when an explicit version
    id is given; confirm a relation qualifier can never be lost by the mapper; confirm withheld
    licence-restricted text cannot be reached by any parameter combination; confirm cursors cannot
    cross releases; confirm the 404 body is identical across all three not-found causes; confirm the
    four areas share no mutable module-level state.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/14-search-product/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *`RETR-01`'s frozen internal contract exposes no document metadata, no version list, or no
     pagination for timelines/relations* → sub-PRD **Q-FIND-6** / retrieval sub-PRD **Q-RETR-6**.
     Raise **one** docs PR amending `docs/prd/11-retrieval-engine/tickets/RETR-01-*.md` and
     `RETR-09-*.md` together, `--sync`, then implement both sides. Never aggregate node rows into a
     synthetic document record, never call the search process outside the client, and never open
     `corpus.sqlite` — that would overturn retrieval sub-PRD **D1** and PRD §39.1.
   - *`FND-04`'s OpenAPI declares a shape these endpoints cannot fill, or omits a field PRD §31.2 /
     §35.2 requires the screens to show* → docs PR against
     `docs/prd/00-foundation/tickets/FND-04-*.md` (and `FND-03` for any enum member, per its
     friction 1), recorded in `docs/prd/14-search-product/README.md`. Never hand-edit
     `packages/contracts/src/generated/**` (PRD §20.1) and never declare a local type.
   - *The PRD §13.2 ≤ 1 s objective is missed on a real search process* → report it, surface it as
     degraded status, and write back to `docs/prd/14-search-product/README.md` and `FIND-06`. It is
     **never** bought by returning truncated node text, dropping relationship qualifiers, omitting
     licence limitations or caching across releases — PRD §13.2 requires correctness to be preserved
     and the delay surfaced.
   - *A licence-restricted document appears to need its text for the screen to be useful* → it does
     not: PRD §11.1 makes metadata-and-link the defined fallback and PRD §31.2 gives the screen a
     "Source unavailable" state. If the engine returns text for material assessed link-only, that is
     a retrieval/licensing defect: raise it against `RETR-04`/`INGF-04` rather than filtering it out
     here, and record it in this module's README.
3. **Falsified protocol.** If a stable historical link cannot be honoured — for example if version
   identities are not in fact stable across releases — then `SRCH-005`, PRD §15.3 and PRD §18.4 are
   contradicted and the product's citation guarantee is in question. Stop, escalate for re-review,
   and write back to `docs/prd/breakdown-plan.md` §4.2 and both affected sub-PRDs before writing
   compensating code. A per-request "find the closest version" fallback is exactly the silent
   substitution `UAT-SRCH-03` exists to catch.
