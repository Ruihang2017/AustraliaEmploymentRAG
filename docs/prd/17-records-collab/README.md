# 17-records-collab — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.18 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `17-records-collab` |
| Lane | `17-records-collab` |
| Ticket prefix | `RCRD` |
| Tickets | 9 (`RCRD-01` … `RCRD-09`) |
| PRD epic | `E24-RECORDS` (week 5; exit evidence *"REC and concurrency tests"*, PRD §44.2) |
| Requirement families | `REC-001` … `REC-004`, `COR-001`, `COR-002` |
| Depends on modules | `00-foundation`, `01-app-data`, `03-app-runtime`, `14-search-product`, `15-answer-product`, `16-monitor-alerts` |
| Modules that depend on this one | `19-exports`, `22-internal-admin`, `23-assurance` |
| Languages | TypeScript only (`apps/api`, `apps/worker`, `apps/web`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.1 (2026-08-03) |

## Problem

A research answer that cannot be *kept* is a demo, not a product. PRD §26 makes the commercial
success signal "a real B2B organisation voluntarily pays"; PRD §4.3 says the job to be done is
research a customer's advisor can stand behind weeks later, in front of someone else. That requires
four properties this module owns and nothing else in the system provides.

1. **The record of what was said must be unfalsifiable.** PRD §8.7: *"Research turns MUST be
   immutable; corrections supersede rather than overwrite prior turns"* and *"Formal answers MUST be
   immutable Answer Snapshots"*. PRD §35.8 invariant 5 turns that into a database rule: *"Formal
   snapshots and legal corpus versions have no UPDATE/DELETE application path; corrections append
   replacements."* If a record can be quietly rewritten, every downstream artifact — the export
   (`19-exports`), the alert impact list (`16-monitor-alerts`), the correction trail
   (`22-internal-admin`) and the evidence pack a customer shows their own regulator — is worthless.
2. **The law moves, and the answer must not move with it silently.** PRD §8.7: *"Rerun under current
   law MUST create a new version and support comparison with the prior answer."* PRD §41.2
   `UAT-REC-01`: *"Rerun a 2024 saved answer under current law → New snapshot/version and diff;
   original remains byte-for-byte unchanged."* The original is evidence of what the advice was, at
   the legal date it was given, on the corpus release it was given from.
3. **Two people editing one record must not silently destroy each other's work.** PRD §8.7:
   *"Concurrent edits MUST use version/ETag checks."* PRD §16.2: *"Editable resources MUST use
   ETag/version + `If-Match`; conflicts return `409 CONCURRENT_MODIFICATION`."* `UAT-REC-02` is the
   two-browser script. PRD §44.2 makes "REC and **concurrency** tests" the epic's exit evidence — the
   only epic in the whole ledger whose exit evidence names concurrency.
4. **A confirmed error must produce a correction, not an edit.** PRD §12.3: *"Confirmed errors MUST
   create a Correction, preserve the original answer, create or link a replacement Answer Snapshot,
   run impact analysis and notify affected customers when required."*

And one thing this module must never do: PRD §8.7's last bullet — *"`CUSTOMER_REVIEWED` means
customer-internal review and MUST NOT imply legal verification by the product owner or a lawyer."*
That is a legal-exposure boundary (PRD §11.2 `LEGAL_REVIEW_PENDING`), not a copy preference, and this
module owns every surface where the word appears.

This module builds the HTTP surface, the two worker jobs and the screens for all of that. It builds
no tables — that is the point of breakdown plan decision **A3**.

## Scope

In scope (exactly the module's breakdown plan §4 write-owns row):

- `apps/api/src/routes/research-records/**` — record CRUD, ETag/`If-Match`, soft delete.
- `apps/api/src/routes/research-turns/**` — append-only turns with supersession.
- `apps/api/src/routes/record-answers/**` — record↔answer linkage, version list, diff.
- `apps/api/src/routes/review-actions/**` — PRD §32.6 workflow transitions.
- `apps/api/src/routes/comments/**` — comments targeting record/answer/claim/citation, and resolve.
- `apps/api/src/routes/issues/**` — customer issue reports.
- `apps/api/src/routes/corrections/**` — correction records and replacement linkage.
- `apps/worker/src/handlers/rerun/**` — rerun-under-current-law execution.
- `apps/worker/src/handlers/correction/**` — correction impact analysis and fan-out.
- `apps/web/src/features/records/**` — records list, record detail (six tabs), create-from-search.

Out of scope in one line: **this module orchestrates and renders records; it defines no table, no
repository, no enum, no OpenAPI path, no answer synthesis, no notification transport and no
permission rule.**

## Non-goals

Each names its owner module/ticket or its standing reason.

| Not in this module | Owner / reason |
|---|---|
| `research_record`, `research_turn`, `answer_snapshot`, `comment`, `review_action`, `issue_report`, `correction` tables and every repository over them | `01-app-data` (`DATA-06`, `DATA-07`, `DATA-09`). Breakdown plan **A3** and PRD §45.2 give `packages/database` "app schema/migrations/tenant repositories/outbox/encryption"; plan R4 forbids a product module to add a migration. A missing column is a **new `01-app-data` ticket plus a `blocked_by` edge**, never a local table. |
| The PRD §32.6 transition table, the ETag staleness rule and `EDITABLE_FIELDS` as pure logic | `00-foundation` (`FND-08`, `packages/domain/src/workflow/**`). `RCRD-04` is `blocked_by FND-08` and calls it; it never re-derives a transition. |
| The PRD §38.1 role matrix and resource membership | `00-foundation` (`FND-06`), evaluated by `03-app-runtime`/`RUNT-02`'s `evaluate-permission` stage. Routes here *declare* the permission they need. |
| Authentication, tenant resolution, rate/quota, PII detection, idempotency storage | `03-app-runtime` (`RUNT-02`) plus `02-auth-core` and `12-evidence-safety` (`EVID-01`). Every route here runs the `tenant` admission profile and declares its per-route flags; none re-implements a stage. |
| Canonical enums, opaque ID prefixes, the OpenAPI root and generated bindings | `00-foundation` (`FND-03`, `FND-04`). Serial-owned, breakdown plan §4.1. A path or enum this module needs and cannot find is a **writeback**, never a hand-edit (PRD §20.1 forbids editing generated bindings). |
| Answer synthesis, evidence packing, the deterministic validator, clarification rounds, SSE stage events, and `POST /v1/answers/{id}/rerun` admission | `15-answer-product` (`ASK-01` … `ASK-12`) and `12-evidence-safety`. `RCRD-03` is `blocked_by ASK-04` and consumes the §34.5 snapshot contract; it re-implements no part of the pipeline (PRD §45.2: `apps/worker` must not own "Duplicated business rules"). |
| Watchlists, watch targets, change matching, alert creation, and the source-change path that sets `REVIEW_REQUIRED` | `16-monitor-alerts` (`WTCH-01` … `WTCH-08`). `RCRD-08` is `blocked_by WTCH-01` and only *renders* the Watch tab. The correction-triggered `REVIEW_REQUIRED` path is this module's (`RCRD-07`); the source-change one is `WTCH-03`'s. |
| Email, webhook and digest delivery | `16-monitor-alerts` (`WTCH-04`, `WTCH-05`, `WTCH-06`). `RCRD-07` writes an **outbox event** in the same transaction as the business change (PRD §35.8 invariant 6) and stops there. |
| The internal issue-triage and correction **console** | `22-internal-admin` (`INTL-08`, `blocked_by RCRD-07`) owns `apps/api/src/routes/internal/**` and `apps/admin/**`. This module builds the mechanism it drives. |
| PDF/DOCX/JSON export of records and snapshots | `19-exports` (`XPRT-01` … `XPRT-05`; `XPRT-05` is `blocked_by RCRD-08`). |
| `/v1/audit-events` and `/v1/usage/*` | `20-developer-platform` (`PLTF-09`). Module `20` is numbered above `17`; an edge from here would invert the topological order and fail `dag-scan.mjs` (plan §3, R6). See **D11**. |
| Shared accessible primitives, the ten PRD §31.3 async states and the evidence panel | `03-app-runtime` (`RUNT-06`, `packages/ui`), breakdown plan **A6**. `RCRD-08`/`RCRD-09` compose them and define no second set. |
| The web app shell, navigation slots, organisation switcher, status bar, `orgScopedKey`, the API client | `03-app-runtime` (`RUNT-05`). `RCRD-08` is `blocked_by RUNT-05` and registers one feature area against its A1 contract. |
| Search endpoints and the Simple/Advanced Search screens | `14-search-product` (`FIND-01` … `FIND-06`). `RCRD-09` is `blocked_by FIND-04` and owns only the record-writing destination — breakdown plan §4.2: *"'Create record from search selection' → sole owner `17` (`RCRD-09`); would put record writes in `14`."* |
| The `CUSTOMER_REVIEWED` disclaimer **copy**, ToS/Privacy/AUP text | `24-launch` (`LNCH-01`, `docs/policies/**`). This module renders the acknowledgement control and enforces the meaning; it holds no policy prose. |
| Cross-boundary tenant-isolation, security, PII and E2E UAT suites under `tests/**` | `23-assurance` (`ASSR-01` is `blocked_by RCRD-08`; `ASSR-06` is `blocked_by RCRD-09`). Per plan R8 every ticket here carries **its own** co-located tenant assertions so assurance confirms rather than discovers. |
| `apps/api/package.json`, `apps/worker/package.json`, `apps/web/package.json` and the three `tsconfig.json` | `03-app-runtime` (plan §4 assigns the app manifests to that module explicitly). See **D16**: a new runtime dependency is a writeback, not a local edit. |

## Decisions

Each states its basis: a PRD section, a breakdown-plan §2.1 ADR candidate, or an upstream ticket's
published contract. Where the PRD does not answer, the item is an open question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **No ticket in this module writes a table, a migration or a repository.** Persistence is reached only through `packages/database` repositories (`DATA-06` research/evidence, `DATA-07` issue/correction/audit). A required write that no repository exposes is a new `01-app-data` ticket plus a `blocked_by` edge. | Breakdown plan **A3** and §4.2 ("App tables + repositories → sole owner `01`, would have been shared with 15, 16, **17**, 19, 20, 22"); PRD §45.2; plan §9 risk **R4**. |
| D2 | **Route areas self-register by directory; the nested `/v1/research-records/{id}/…` paths are mounted with an explicit `area.prefix`.** `research-records` takes the default `/v1/research-records`; `research-turns`, `record-answers` and `review-actions` each export `area = { prefix: '/v1/research-records' }` and register sub-paths under it. `comments`, `issues` and `corrections` take their defaults `/v1/comments`, `/v1/issues`, `/v1/corrections`. | Breakdown plan **A1**; `RUNT-01`'s registration contract items 3–4 (*"an explicit `prefix` overrides both"*; *"If two areas would register the same method+path, boot fails … Last-wins is forbidden"*); PRD §16.2's literal endpoint list. |
| D3 | **ETag values are produced by `DATA-06`'s `etagFor(record)`; this module never computes one.** `DATA-06` deliverable 6 exists precisely *"so `RCRD-01` does not invent its own"*. | `DATA-06` deliverable 6; `FND-08` feedback obligation 3 (*"do not let two modules compute ETags differently, which would make `UAT-REC-02` non-deterministic"*); PRD §34.1, §16.2. |
| D4 | **`If-Match` handling is exactly two outcomes.** A **mismatched** validator → `409 CONCURRENT_MODIFICATION`. An **absent** `If-Match` on a documented-required write → `400 INVALID_REQUEST` with `details` naming the header. No new error code is invented. | PRD §34.9 is a closed catalogue with no precondition-required row; `RUNT-01` feedback obligation (*"Do not invent a code … stop at the nearest existing code"*); `FND-08`'s `checkIfMatch` returns `MISSING` and `STALE` as distinguishable results. Recorded as open question **QR-4**. |
| D5 | **Immutability is a shape, not a promise.** For turns, answer snapshots, review actions and corrections this module registers **no** `PUT`, `PATCH` or `DELETE` handler at all, and the repositories it calls expose no `update`/`delete` member. Correction of a mistake is a *new row* carrying a supersession or replacement link. | PRD §8.7; §32.6 (*"The Timeline is append-only … formal turns/answers are never edited"*); §35.8 invariant 5; §34.7 (*"A mistake is corrected by adding a new turn with `supersedes_turn_id`, never by editing the original turn"*); REC-001 evidence *"No update path mutates an existing formal snapshot"*; `DATA-06` deliverable 3. |
| D6 | **`CUSTOMER_REVIEWED` never implies legal verification.** No payload, enum description, badge, tooltip, banner or empty-state string produced by this module may state or imply product-owner or lawyer verification; the transition into it requires an explicit disclaimer acknowledgement. Every ticket carries a machine assertion over the strings it ships. | PRD §8.7 (*"MUST NOT imply legal verification by the product owner or a lawyer"*); §32.6 (`IN_REVIEW → CUSTOMER_REVIEWED` condition *"explicit disclaimer acknowledgement"*); §11.2 (*"MUST NOT state that a customer is definitely compliant"*, `LEGAL_REVIEW_PENDING`). |
| D7 | **Rerun composes the existing answer pipeline and never re-implements synthesis.** `apps/worker/src/handlers/rerun/**` registers under the same PRD §39.5 queue class as the snapshot it reruns (`interactive_quick` for a Quick source snapshot, `interactive_research` for Deep/Coverage/Compare). | PRD §45.2 (`apps/worker` owns "Lease loops and application-service orchestration", must not own "Duplicated business rules"); §39.5 queue table; §18.5 answer runtime. |
| D8 | **The rerun *admission* endpoint `POST /v1/answers/{answer_snapshot_id}/rerun` belongs to `15-answer-product`/`ASK-04`.** This module owns the record-scoped surface `GET /v1/research-records/{id}/answers`, the link operation, the version diff, and the rerun **execution** handler. | Breakdown plan §4 (`routes/answer-snapshots/**` → `15`; `routes/record-answers/**` + `handlers/rerun/**` → `17`); PRD §16.2 groups the rerun endpoint under "Answers" and `/v1/research-records/{id}/answers` under "Research and collaboration". Coordination point **QR-5**. |
| D9 | **Correction create/confirm is an internal-identity operation on a route area this module owns.** `apps/api/src/routes/corrections/**` defaults to the `tenant` admission profile for reads and declares a per-route `admission: 'internal'` override on create/confirm; `22-internal-admin`/`INTL-08` builds the console that calls it. | PRD §30.2 `COR-002` primary surface *"Internal issue flow"*; §8.11 (*"issue triage and corrections"* is internal administration); `RUNT-02` deliverable 1 (*"per-route overrides declared in the route schema"*) and profile `internal`; plan §5.23 makes `INTL-08` `blocked_by RCRD-07`. Confirmed at build time — **QR-11**. |
| D10 | **Every free-text customer field this module persists passes the `pii-admission` stage and fails closed.** Turn content, comment bodies, issue descriptions, review reasons and record notes all declare `requiresPiiAdmission: true`. | PRD §10.1 (*"The server MUST be the authoritative PII boundary before logging, persistence or provider calls"*); §37.2 (*"only then create logs, persistence, jobs or provider calls"*); `PII-002`; `RUNT-02` deliverable 8 (an unbound provider yields `503 GENERATION_UNAVAILABLE`, never admission). |
| D11 | **The record **Audit** tab shows the record's own append-only history** — turns, review actions, answer versions, comments and correction events — not the organisation-wide audit log. | PRD §32.6 tab list; plan §4 gives `/v1/audit-events` to `20-developer-platform` (`PLTF-09`), and module `20` is numbered above `17`, so an edge would invert the topological order (plan §3) and `dag-scan.mjs` exits 1 on a module cycle (plan R6). |
| D12 | **Screens are built against `packages/contracts` generated types plus committed synthetic fixtures**, never against a running sibling route. A tab whose endpoint is unavailable renders a PRD §31.3 state with a copyable request id — never a blank panel or a silent success. | PRD §31.3 (*"A spinner without state or recovery guidance is not acceptable"*); `DEV-001` (OpenAPI drives generated cores); plan §1.1; the same treatment `RUNT-05` applies to its concurrent dependency on `RUNT-06`. This is what makes `RCRD-08` buildable without edges to `RCRD-03`/`RCRD-07` (**QR-3**). |
| D13 | **The `records` feature area re-applies breakdown plan A1 one level down.** `RCRD-08` ships a sub-area registry (`import.meta.glob('./*/sub-area.ts*', { eager: true })` in `records/feature.tsx`) so `RCRD-09` adds `records/from-search/**` and produces **zero diff** outside that directory. | Breakdown plan **A1**; `RUNT-05` contract item 6 (*"Adding, renaming or removing a feature area produces zero diff outside that area's own directory"*) applied recursively, because plan §5.18 splits one feature area across two tickets. |
| D14 | **The search → record handoff is a URL plus organisation-scoped client state, never a cross-module import.** `14-search-product` navigates to `/records?from_search=<search_execution_id>`; the selected stable IDs are read from `orgScopedKey(organizationId,'search-selection',searchExecutionId)`. Only opaque public corpus IDs cross the boundary — never the query string, never the user's notes. | PRD §33.1 step 6 (*"writes only the selected stable IDs and user-authored anonymous notes"*); §41.1 (*"customer research content is not placed in URL query strings, analytics, browser error telemetry or page titles"*); §31.2 (`/records` main action is *"Filter/create/open records"* — no new route is invented); plan R6 (a `14 → 17` import would be a module cycle). |
| D15 | **Tests live inside the owning app**: `apps/api/test/records/**`, `apps/worker/test/records/**`, `apps/web/test/records/**`, each partitioned per ticket by its own subdirectory. Cross-boundary suites stay in `tests/**`. | Breakdown plan §1.1 ("Tests"); plan §9 risk **R8** (co-located assertions so `23-assurance` confirms rather than discovers). |
| D16 | **This module writes no app manifest.** `apps/api/{package.json,tsconfig.json}`, `apps/worker/{…}` and `apps/web/{…}` are `03-app-runtime`'s per plan §4. A route or screen that needs a new runtime dependency raises it against `RUNT-01`/`RUNT-04`/`RUNT-05` as a docs change first. | Breakdown plan §4 (the app manifests appear in the `03-app-runtime` row, not this one); §1.1's append-only manifest rule is a *within-module* rule and does not override the §4 allocation. |
| D17 | **Opaque IDs are never parsed.** `rec_`, `ans_`, `clm_`, `cit_`, `cmt_`, `iss_`, `cor_`, `srx_`, `doc_`, `dv_`, `node_`, `nv_` prefixes come from `packages/contracts` (`FND-03`); this module treats them as strings and validates them by repository lookup, never by prefix inspection. | PRD §34.1 (*"Opaque resource-prefixed UUIDv7 strings … clients never parse them"*); plan §4.1 (canonical IDs are `FND-03`, serial-owned). |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Make records mutable with an edit-history side table.** | PRD §8.7 and §35.8 invariant 5 require *no UPDATE/DELETE application path* for formal artifacts. A history table records what was changed; it does not prevent the change. REC-001's evidence is literally *"No update path mutates an existing formal snapshot."* |
| **A `PUT /v1/research-records/{id}` full replace.** | PRD §32.6 permits editing only *title/tags/assignments*, and `workflow_status` may move only through a `ReviewAction` (§35.8 invariant 7). A full replace makes both boundaries invisible in the wire shape. Replaced by a `PATCH` whose body type excludes every non-editable field. |
| **Last-write-wins on record metadata, with a "someone else edited this" toast.** | PRD §8.7: *"Concurrent edits MUST use version/ETag checks."* REC-004's evidence and `UAT-REC-02` require the second writer to receive `409` and reload guidance, not a lost update with an apology. |
| **Rerun updates the answer in place and keeps a `previous_text` column.** | REC-002 evidence: *"Original legal date/release/output are unchanged"*; `UAT-REC-01`: *"original remains byte-for-byte unchanged"*. A byte-for-byte guarantee is not compatible with any in-place write. |
| **A correction edits the wrong answer and marks it corrected.** | PRD §12.3: a Correction *"preserve[s] the original answer, create[s] or link[s] a replacement Answer Snapshot"*. The original is the evidence of what the customer was told. |
| **Send correction emails/webhooks directly from `handlers/correction/**`.** | PRD §35.8 invariant 6 requires the outbox event and the business state to commit together, and `16-monitor-alerts` owns every delivery channel (`WTCH-04`/`05`/`06`). Duplicating transport here would produce two idempotency domains for one event (`MON-004`). |
| **Create the `issue_report` / `correction` tables here because no `DATA-07` edge exists.** | Plan **A3**, PRD §45.2 and plan **R4** all forbid it. The missing edge is a *plan* defect with a writeback path (**QR-1**), not a licence to own a table. |
| **Put "create record from search selection" on the search screen.** | Breakdown plan §4.2 places it here by name, precisely so `14-search-product` never performs a record write. A `14 → 17` import would also invert the module order (plan R6). |
| **Own `/v1/audit-events` so the Audit tab has a single source.** | `PLTF-09` (`20-developer-platform`) owns it and module `20` sits above `17` in the topological order (plan §3). Replaced by **D11**. |
| **A shared `apps/api/src/routes/records/index.ts` mounting all seven areas.** | Exactly the central manifest breakdown plan **A1** exists to prevent; it would serialise all seven route tickets on one file and reproduce risk **R1** inside a single module. |
| **A shared `apps/web/src/features/records/routes.ts` listing both tickets' screens.** | Same failure one level down: `RCRD-09` would have to write `RCRD-08`'s file. Replaced by **D13**. |
| **Copy the search query text onto the created record so the user remembers what they searched.** | PRD §33.1 step 6 limits the write to *"the selected stable IDs and user-authored anonymous notes"*. The query is customer content that never passed a record-scoped PII admission and is not part of the specified write. |
| **Derive the correction badge by joining `correction` rows in the web client.** | PRD §34.5 already puts `correction_state` on the Answer Snapshot payload. Deriving it a second way creates two answers to one question and makes `RCRD-08` depend on `RCRD-07` without an edge (**QR-3**). |
| **One "records and collaboration" ticket.** | The module would be a single serial lane; breakdown plan §2 makes disjoint write-sets the basis of the cut and §7 requires every module to reach at least two useful lanes. The 9-way split yields 4 waves at concurrency 4. |
| **Let `RCRD-07` import `packages/domain/src/workflow` (`FND-08`) directly.** | No `blocked_by` edge exists (plan §5.18/§6.2) and inventing one in the frontmatter is forbidden. `RCRD-07` uses `DATA-06`'s `applyReviewAction`, which is reachable through `RCRD-01`'s `blocked_by DATA-06`; the gap is recorded as **QR-2** with a writeback path. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it. Items
QR-1 … QR-3 are **plan-edge findings**: they are recorded here rather than fixed, because
`blocked_by` is exactly breakdown plan §5.18 and inventing an edge would falsify `dag-scan.mjs`'s
input.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **QR-1** | **`RCRD-06` and `RCRD-07` write `issue_report` and `correction`, which are PRD §35.6 tables owned by `DATA-07` — but neither ticket has a `blocked_by DATA-07` edge** (plan §5.18, §6.2 line `DATA-07 --> DATA-09 & EVID-08 & WTCH-01 & WTCH-02 & PLTF-09 & INTL-09`). In the global schedule `01-app-data` delivers ~12 waves earlier, so the repositories exist in practice. | `17-records-collab` with `01-app-data` | Confirmed at `RCRD-06`/`RCRD-07` build time. If `DATA-07`'s repositories are absent, **stop** and write back to `docs/prd/breakdown-plan.md` §5.18 + §6.2 and this README — never create the tables here (plan A3/R4). | Nothing today | Plan §5.2, §5.18, §6.2; PRD §35.6, §45.2 |
| **QR-2** | **`RCRD-07` must set affected records to `REVIEW_REQUIRED` but has no `blocked_by FND-08` or `RCRD-04` edge.** Interim: it calls `DATA-06.applyReviewAction(tx, ctx, …)` with `actor: 'system'` and a reason naming the correction — the structural half of PRD §35.8 invariant 7, reachable through `RCRD-01 → DATA-06`. The *legality* of the transition is `FND-08`'s. | `17-records-collab` with `00-foundation` | `RCRD-07`. A need to import `packages/domain/src/workflow` or `RCRD-04`'s service is a **missing plan edge**: write back to plan §5.18/§6.2 and this README before adding any import. | Nothing today (`FND-08` lands in module `00` wave 3, ~13 waves earlier) | PRD §32.6 (`REVIEW_REQUIRED` trigger list names *"correction"*), §35.8 invariant 7; `DATA-06` deliverable 8; plan §6.2 |
| **QR-3** | **`RCRD-08` renders the Answers tab (`RCRD-03`) and the correction badge (`RCRD-07`) but is `blocked_by` neither.** Resolved by **D12** (generated contract types + committed fixtures) and by PRD §34.5, which already carries `correction_state` on the snapshot payload. | `17-records-collab` | `RCRD-08`. If a tab genuinely cannot be built without a sibling's implementation, that is a plan edge — write back to plan §5.18/§6.2, do not import a sibling's internals. | Nothing — every tab degrades to a PRD §31.3 state | PRD §34.5, §31.3, §32.6; plan §5.18 |
| **QR-4** | **A missing `If-Match` on a required write has no PRD §34.9 code.** **D4** maps it to `400 INVALID_REQUEST` naming the header. Adding a `428`-class row is a product/API change. | **Founder** (PRD §45.5 "Product change") staged through `00-foundation`/`FND-04` | `RCRD-01` records the interim behaviour; a permanent code is an `FND-04` + PRD change | Nothing — `409` on mismatch is unambiguous and is what `UAT-REC-02` exercises | PRD §34.9, §34.1, §16.2, §45.5 |
| **QR-5** | **Every `/v1` path this module serves must exist in `schemas/openapi/openapi.yaml`** (serial-owned by `FND-04`, plan §4.1): the turns, record-answers, review-actions, comments, issues, corrections and **diff** paths. PRD §16.2 names most of them; the diff endpoint and the correction endpoints are not spelled out as paths. | `00-foundation` (`FND-04`) | Each route ticket verifies its paths against the generated bindings first; an absent path is a docs PR against `FND-04`, then `publish-tickets.mjs --sync`, then code. Never a hand-edit (PRD §20.1). | Would block the affected route ticket if unresolved | PRD §34, §20.1, `DEV-001`; plan §4.1, §1.1 |
| **QR-6** | **The version-diff payload shape is not in the PRD.** §8.7 requires "support comparison with the prior answer" and `UAT-REC-01` requires "a diff", but §34 defines no shape. `RCRD-03` fixes an initial structured shape over the §34.5 snapshot. **ADR candidate** if it becomes a public `/v1` contract. | `17-records-collab` (`RCRD-03`) | `RCRD-03` (shape + fixture); promoted to `docs/adr/NNNN-answer-version-diff-contract.md` if `FND-04` publishes it | Nothing — the shape is derivable from §34.5 | PRD §8.7, §34.5, §41.2 `UAT-REC-01`, §45.5 |
| **QR-7** | **The search → record handoff contract must be readable by `FIND-04`, which is built first** (edge `FIND-04 → RCRD-09`). **D14** declares it here. If `FIND-04` shipped a different affordance, `RCRD-09` conforms to what exists and writes back. | `14-search-product` (`FIND-04`) with `17-records-collab` (`RCRD-09`) | `RCRD-09`; a divergence is a writeback to this README and a docs PR against `FIND-04` | Nothing — `RCRD-09` also works standalone from `/records` | PRD §33.1 step 6, §32.1, §31.2; plan §4.2 |
| **QR-8** | **`FND-03` must export a `ResearchTurnType` enum.** PRD §34.7 shows `FACT_CLARIFICATION`; §15.5 describes *"Immutable question, clarification or superseding fact turn"*; §32.4 adds a coverage fact confirmation. No closed list is stated. | `00-foundation` (`FND-03`), Founder for any value the PRD does not imply | `RCRD-02` consumes the enum; if it is absent, raise an `FND-03` writeback rather than declaring a local vocabulary | Would block `RCRD-02`'s CHECK-constraint parity | PRD §15.5, §32.4, §34.7, §35.1; plan §4.1 |
| **QR-9** | **May a turn be superseded more than once?** PRD §34.7 gives `supersedes_turn_id` but not the cardinality. `RCRD-02` fixes: at most **one** direct successor per turn, so the effective view is unambiguous; chains are expressed by successive turns. | `17-records-collab` (`RCRD-02`) | `RCRD-02`; a product need for branching supersession is a PRD §45.5 product change | Nothing | PRD §8.7, §34.7 |
| **QR-10** | **Issue and correction category vocabularies.** PRD §12.3 names six report kinds (incorrect citation, outdated source, wrong jurisdiction/date, unsupported claim, missing authority, privacy issue) and four target levels (answer/claim/citation/source), but no enum exists. | `00-foundation` (`FND-03`); Founder for any category the PRD does not name | `RCRD-06`/`RCRD-07` consume the enum; an absent one is an `FND-03` writeback | Would block CHECK parity on `issue_report` | PRD §12.3, §35.1, §35.6; plan §4.1 |
| **QR-11** | **Does the correction create/confirm route stay at `/v1/corrections` with a per-route `internal` admission (**D9**), or move under `22-internal-admin`'s `/internal/v1`?** The file scope (`apps/api/src/routes/corrections/**` → `17`) is fixed by plan §4; only the mounted URL and admission profile are open. | `22-internal-admin` (`INTL-08`) with `17-records-collab` (`RCRD-07`) | `RCRD-07` ships **D9**; `INTL-08` confirms or writes back to this README and plan §4.2 | Nothing — the mechanism is identical either way | PRD §8.11, §12.3, §30.2 `COR-002`; plan §5.23 |

## Work breakdown

Lane is `17-records-collab` and agent is `builder` for all nine tickets (breakdown plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown plan §5.18, and are disjoint
between tickets. `depends-on` is exactly breakdown plan §5.18.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`RCRD-01`](tickets/RCRD-01-research-record-crud-with-etag-if-match.md) — Research-record CRUD with ETag / `If-Match` | M | `17-records-collab` | `apps/api/src/routes/research-records/**`, `apps/api/test/records/research-records/**` | `RUNT-02`, `DATA-06` |
| [`RCRD-02`](tickets/RCRD-02-immutable-turns-with-supersede-semantics.md) — Immutable turns with supersede semantics | M | `17-records-collab` | `apps/api/src/routes/research-turns/**`, `apps/api/test/records/research-turns/**` | `RCRD-01` |
| [`RCRD-03`](tickets/RCRD-03-record-answer-linkage-rerun-under-current-law-version-diff.md) — Record↔answer linkage, rerun under current law, version diff | L | `17-records-collab` | `apps/api/src/routes/record-answers/**`, `apps/worker/src/handlers/rerun/**`, `apps/api/test/records/record-answers/**`, `apps/worker/test/records/rerun/**` | `RCRD-01`, `ASK-04` |
| [`RCRD-04`](tickets/RCRD-04-review-actions-and-workflow-transitions.md) — Review actions and workflow transitions | M | `17-records-collab` | `apps/api/src/routes/review-actions/**`, `apps/api/test/records/review-actions/**` | `RCRD-01`, `FND-08` |
| [`RCRD-05`](tickets/RCRD-05-comments-on-record-answer-claim-or-citation.md) — Comments on record, answer, claim or citation | M | `17-records-collab` | `apps/api/src/routes/comments/**`, `apps/api/test/records/comments/**` | `RCRD-01` |
| [`RCRD-06`](tickets/RCRD-06-issue-reports-at-answer-claim-citation-source-level.md) — Issue reports at answer/claim/citation/source level | M | `17-records-collab` | `apps/api/src/routes/issues/**`, `apps/api/test/records/issues/**` | `RCRD-01` |
| [`RCRD-07`](tickets/RCRD-07-corrections-preserve-original-link-replacement-impact-analysis.md) — Corrections: preserve original, link replacement, impact analysis | L | `17-records-collab` | `apps/api/src/routes/corrections/**`, `apps/worker/src/handlers/correction/**`, `apps/api/test/records/corrections/**`, `apps/worker/test/records/correction/**` | `RCRD-06`, `RCRD-03` |
| [`RCRD-08`](tickets/RCRD-08-records-list-and-record-detail-screens-six-tabs.md) — Records list and record detail screens (six tabs) | L | `17-records-collab` | `apps/web/src/features/records/**` **except** `from-search/**`, `apps/web/test/records/**` except `from-search/**` | `RUNT-05`, `RCRD-02`, `RCRD-04`, `RCRD-05`, `WTCH-01` |
| [`RCRD-09`](tickets/RCRD-09-create-record-from-search-selection.md) — Create record from search selection | M | `17-records-collab` | `apps/web/src/features/records/from-search/**`, `apps/web/test/records/from-search/**` | `RCRD-08`, `FIND-04` |

Standing module-wide exceptions and shared reads (no ticket writes these):

- `apps/api/package.json`, `apps/worker/package.json`, `apps/web/package.json` and their
  `tsconfig.json` — `03-app-runtime` (**D16**).
- `schemas/openapi/**`, `packages/contracts/**` — `00-foundation`, serial-owned (**QR-5**).
- `packages/database/**` — `01-app-data` (**D1**).
- `docs/adr/NNNN-<slug>.md` — shared-additive with per-file ownership (plan **A9**); the only ADR
  slug reserved by this module is `answer-version-diff-contract`, claimed by `RCRD-03` if **QR-6**
  is promoted.

Wave shape (breakdown plan §7: **4 minimum waves, 4 useful lanes, not fully serial**). External
blockers are shown in brackets:

```text
wave 1  RCRD-01 [RUNT-02, DATA-06]
wave 2  RCRD-02 | RCRD-03 [ASK-04] | RCRD-04 [FND-08] | RCRD-05
wave 3  RCRD-06 | RCRD-08 [RUNT-05, WTCH-01]
wave 4  RCRD-07 | RCRD-09 [FIND-04]
```

`RCRD-06` has no intra-module blocker beyond `RCRD-01` and is ready in wave 2; it is shown in wave 3
only so the schedule fits four lanes, which is the concurrency at which the module reaches its 4-wave
minimum. Take the authoritative concurrency from `docs/prd/dag.html`, not from this paragraph
(CLAUDE.md).

## Acceptance — what makes the whole module done

The module is done when all nine tickets are delivered (`/verify-delivery` green each) **and**:

1. **`REC-001` — saved research stores immutable turns and Answer Snapshots.** No route, handler or
   screen in this module exposes an update or delete path to a `research_turn`, `answer_snapshot`,
   `answer_claim`, `claim_citation`, `answer_assumption`, `review_action` or `correction`; a raw
   `PUT`/`PATCH`/`DELETE` against every such path is rejected by the framework, and the repositories
   called expose no `update`/`delete` member. (PRD §30.2 `REC-001` evidence: *"No update path mutates
   an existing formal snapshot"*; §8.7; §35.8 invariant 5.)
2. **`REC-002` — rerun creates a new answer and diff.** `UAT-REC-01` passes end to end: rerunning a
   saved 2024 answer under current law produces `answer_version = n+1` on the same record, pinned to
   the **current** active corpus release, with a diff against the prior version; the prior snapshot
   and all its claims, citations and assumptions are **byte-for-byte identical** before and after,
   verified by a hash taken before the rerun. (PRD §30.2 `REC-002`; §8.7; §41.2 `UAT-REC-01`.)
3. **`REC-003` — comments can target record, answer, claim or citation.** All four target kinds are
   creatable and listable, target and role validation pass, and a target in another organisation is
   rejected inside the same transaction with the indistinguishable `404 RESOURCE_NOT_FOUND`.
   (PRD §30.2 `REC-003`; §8.7; §35.5 *"target must belong to same tenant"*.)
4. **`REC-004` — workflow transitions enforce actor, ETag and audit.** Every transition goes through
   a `ReviewAction`; `CUSTOMER_REVIEWED` is unreachable by any other path; an invalid transition and
   a stale ETag both return `409`; each transition writes its append-only `review_action` row in the
   same transaction as the status change. (PRD §30.2 `REC-004`; §32.6; §35.8 invariant 7; §41.2
   `UAT-REC-02`.)
5. **`COR-001` — users report defects in context with stable IDs.** An issue report can be raised at
   answer, claim, citation and source level for each of the six PRD §12.3 categories, and the stored
   report carries **stable target IDs plus the reporter's own description only** — never copied
   answer, claim, citation or source text. (PRD §30.2 `COR-001` evidence: *"Report includes stable
   target IDs, not copied full content"*.)
6. **`COR-002` — a confirmed correction preserves, links, analyses and notifies.** Confirming an
   issue creates a `Correction`, leaves the original snapshot unchanged, links a replacement
   snapshot (created by a rerun or linked to an existing one), computes the impacted record set,
   marks those records `REVIEW_REQUIRED` with a reason naming the correction, and writes the
   notification outbox event in the same transaction as the business change. (PRD §30.2 `COR-002`;
   §12.3; §35.8 invariants 5 and 6.)
7. **Concurrency — the `E24` exit evidence.** PRD §44.2 gives `E24-RECORDS` the exit evidence *"REC
   and concurrency tests"*. Every mutable surface in this module has a two-writer test: record
   metadata (`UAT-REC-02`), workflow transition, comment edit/resolve, turn sequence allocation and
   correction confirmation. In each, exactly one writer succeeds and the other receives `409` — no
   lost update, no duplicate row, no partial commit.
8. **Tenant isolation, co-located.** Per plan R8 every route ticket carries its own cross-tenant
   matrix: read, write, delete, list and queued-job access to another organisation's record, turn,
   answer, comment, issue and correction return the byte-identical `404 RESOURCE_NOT_FOUND` (apart
   from `request_id`), and the worker handlers re-authorise tenant and actor before each stage.
   (PRD §21.2 — *"Automated tests MUST cover read/write/delete/export/download and queued-job tenant
   attacks"*; `SEC-001`; `UAT-AUTH-03`. `ASSR-01` then confirms rather than discovers.)
9. **`CUSTOMER_REVIEWED` never implies verification.** A machine assertion over every string this
   module ships — API enum descriptions, screen copy, badges, tooltips, banners and empty states —
   proves that no rendered or returned text states or implies legal verification by the product owner
   or a lawyer, and that the transition into `CUSTOMER_REVIEWED` requires an explicit disclaimer
   acknowledgement. (PRD §8.7; §11.2.)
10. **PRD §41.2 manual scripts.** `UAT-REC-01` and `UAT-REC-02` pass as founder-run scripts against
    the deployed surfaces, and `UAT-EXP-01`'s precondition holds (an old corrected answer shows its
    original legal date and release plus a correction banner). `ASSR-06` automates the automatable
    rows. (PRD §41.2; §43.4 founder review queue.)
11. **PRD §41.1 universal UI acceptance** on `/records` and `/records/:recordId`: 360/768/1280 px
    without hiding legal status, citations, primary actions or error recovery; full keyboard
    operation; one programmatic page heading; colour never the only status signal; dates as
    `3 Aug 2026`; request/job/correction IDs copyable; **no customer research content in URLs,
    analytics, telemetry or page titles**; refresh/back/forward/reconnect duplicates no write.
12. **Offline reproducibility.** Every `[machine]` and `[fixture]` item in every ticket runs with no
    network, no model provider and no live corpus: `pnpm lint`, `pnpm typecheck`, `pnpm test` and
    `pnpm test:integration` green on the merged default branch, and `pnpm generate &&
    pnpm generated:check` clean. No Rust or Python surface exists in this module, so
    `cargo test --workspace` and `uv run pytest` are unaffected. (PRD §20.3, §45.3.)

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.18 (9 tickets,
  `RCRD-01` … `RCRD-09`). Records decisions D1–D17, rejects 14 alternatives, and opens QR-1 … QR-11.
  Three of those are **plan-edge findings** raised rather than fixed, because `blocked_by` must equal
  plan §5.18 exactly: `DATA-07` is not a declared blocker of `RCRD-06`/`RCRD-07` (QR-1), `FND-08` is
  not a declared blocker of `RCRD-07` (QR-2), and `RCRD-08` renders surfaces owned by `RCRD-03` and
  `RCRD-07` without an edge to either (QR-3). One ADR candidate: the answer version-diff contract
  (QR-6, `RCRD-03`).
