# 19-exports — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.20 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `19-exports` |
| Lane | `19-exports` |
| Ticket prefix | `XPRT` |
| Tickets | 5 (`XPRT-01` … `XPRT-05`) |
| PRD epic | `E26-EXPORT` (week 5; deliverable *"PDF/DOCX/JSON jobs and S3 Sydney lifecycle"*, exit evidence *"EXP tests, licence/correction preservation"*, PRD §44.2) |
| Requirement families | `EXP-001`, `EXP-002` |
| Depends on modules | `01-app-data`, `03-app-runtime`, `12-evidence-safety`, `17-records-collab`, `18-ops-release` |
| Modules that depend on this one | `23-assurance` (`ASSR-01`, `ASSR-05`, `ASSR-06`), `24-launch` (`LNCH-02`) |
| Languages | TypeScript only (`apps/api`, `apps/worker`, `apps/web`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.1 (2026-08-03) |

## Problem

An answer a customer cannot take out of the product is an answer they cannot use. PRD §4.3's job to
be done is research an advisor can stand behind in front of someone else — a manager, an auditor, a
regulator — weeks or years later. That artifact leaves the product as a file, and the moment it does,
three things can go silently wrong. This module exists to make all three impossible.

1. **The export must be the answer that was given, not the answer the law would give today.**
   PRD §8.9: *"Exports MUST preserve legal date, corpus release, claims, citations, assumptions,
   limitations and correction status. **They MUST NOT regenerate the answer using current law.**"*
   A regenerating exporter would silently rewrite history at the exact moment the customer is
   relying on it, and would falsify `REC-002`/`UAT-REC-01`'s *"original remains byte-for-byte
   unchanged"* one layer above the database. The export path therefore reads an **existing immutable
   snapshot** (`DATA-06`) and has no retrieval client, no model gateway and no network reachable from
   it at all.
2. **The file must not carry what the product promised to withhold.** PRD §8.9: *"Hidden
   prompts/reasoning, secrets and internal licensing notes MUST be excluded."* PRD §9.4: *"Hidden
   chain-of-thought MUST NOT be requested, stored or displayed."* PRD §16.4 puts BYOK keys
   *"excluded from logs/exports/support"*. And PRD §11.1: *"Customer exports MUST apply the same
   restrictions"* — the licence limits that trim a quote on screen trim it identically in a PDF, or
   the product breaches a source licence in a document that leaves the building.
3. **The artifact must not outlive its promise.** PRD §8.9: private artifacts *"MUST be stored in S3
   Sydney under a separately permissioned prefix, delivered through short-lived signed URLs and
   deleted after seven days by default."* PRD §19.2 gives the prefix (`exports/`) and requires
   *"separate least-privilege permissions"*. `EXP-002`'s evidence is *"Expired or other-tenant URL is
   inaccessible"*.

Everything else about this module is plumbing: a job, a queue class, four routes, three renderers and
one screen. These three properties are the product.

## Scope

In scope — exactly the module's breakdown-plan §4 write-owns row:

- `apps/api/src/routes/exports/**` — export job admission, status, cancel and the signed-URL download
  (the `app` process, which PRD §39.2 gives *"export read/sign permission"*).
- `apps/worker/src/handlers/export/**` — the export handler area: the pipeline that loads a snapshot,
  renders it, uploads the artifact and sweeps it at expiry (the `worker` process, which PRD §39.2
  gives *"export write permission"*), plus the PDF, DOCX and JSON renderers.
- `apps/web/src/features/exports/**` — request, status, download and expiry surface.

Out of scope in one line: **this module renders and delivers artifacts from snapshots that already
exist; it defines no table, no repository, no enum, no OpenAPI root, no S3 bucket, prefix or
credential, no licence assessment, no disclaimer prose, and it never produces a claim, a citation or
a sentence of legal text.**

## Non-goals

Each names its owner module/ticket or its standing reason.

| Not in this module | Owner / reason |
|---|---|
| The S3 bucket, the `exports/` and `backups/` prefixes, their two separate least-privilege credentials and the seven-day bucket lifecycle rule | `18-ops-release` (`RLSE-04`, `infra/aws/**`). Breakdown plan §4.2 names this contested path explicitly: *"S3 bucket, prefixes, least-privilege credentials → sole owner `18` (`RLSE-04`); `19` needs the export prefix"*, basis PRD §19.2. This module **consumes** the bucket, prefix, region and credential as configuration (PRD §39.6 secret group *"S3 export credential"*) and defines none of them. |
| Every app table and repository — `job`, `job_event`, `answer_snapshot`, `research_record`, `audit_event`, `usage_ledger` | `01-app-data` (`DATA-05`, `DATA-06`, `DATA-07`). Breakdown plan **A3** and PRD §45.2; plan **R4** forbids a product module to add a migration. A missing column is a **new `01-app-data` ticket plus a `blocked_by` edge**, never a local table. |
| Licence assessment states, quote limits, the trimming rule and the export-exclusion assertion | `12-evidence-safety` (`EVID-06`, `packages/citations/src/licensing/**`), which is `blocked_by EVID-05` and consumes `INGF-04`'s assessments. **D5** binds it through a port. `EVID-06`'s own feedback obligation is explicit: *"never resolve it by letting the export path compute its own limit — two limit implementations is how a licence breach ships unnoticed."* |
| Answer synthesis, evidence packing, the deterministic validator, the model gateway, retrieval | `15-answer-product`, `12-evidence-safety`, `11-retrieval-engine`. Nothing in this module may reach them — that is the mechanical form of PRD §8.9's *"MUST NOT regenerate"* (**D4**). |
| Research-record CRUD, turns, review actions, comments, issues, corrections and the record screens | `17-records-collab` (`RCRD-01` … `RCRD-09`). `XPRT-05` is `blocked_by RCRD-08` and links to those screens; it writes none of them. |
| The worker runtime, its five PRD §39.5 queue classes, lease loops, fairness, checkpoints and `handlers/maintenance/**` | `03-app-runtime` (`RUNT-04`). This module registers **one** handler area (`export`) against `RUNT-04`'s A1 contract and configures nothing about the runtime. |
| Authentication, tenant resolution, permission evaluation, rate/quota ledgers, idempotency storage, request limits | `03-app-runtime` (`RUNT-02`) with `02-auth-core` and `00-foundation` (`FND-06`, `FND-09`). Routes here *declare* the profile, the permission and `idempotent: true`; they re-implement no stage. |
| The web app shell, navigation slots, the organisation switcher, `orgScopedKey`, the API client, the shared UI primitives and the ten PRD §31.3 async states | `03-app-runtime` (`RUNT-05`, `RUNT-06`; plan **A6**). `XPRT-05` registers one feature area and composes `packages/ui`; it defines no second async-state component. |
| Canonical enums (`ExportFormat`, export job types, artifact states), opaque ID prefixes, the OpenAPI root and generated bindings | `00-foundation` (`FND-03`, `FND-04`) — serial-owned, plan §4.1. An absent enum or path is a **writeback**, never a hand-edit (PRD §20.1 forbids editing generated bindings). See **QX-9**, **QX-10**. |
| Disclaimer, Terms, Privacy and AUP **prose** | `24-launch` (`LNCH-01`, `docs/policies/**`); `LNCH-02` (in-product legal surfaces for web, widget **and exports**) is `blocked_by XPRT-02`. This module renders a disclaimer block through a port with a committed neutral default (**D14**) and holds no policy prose. |
| Markdown/HTML sanitisation and code-generated URL allowlisting | `12-evidence-safety` (`EVID-10`). This module has no edge to it and needs none: renderers treat snapshot text as **data, never markup** (**D6**). |
| Ephemeral (`EPHEMERAL` retention) research content | Not exportable at all. PRD §10.4: *"Durable audit/export/review/version comparison/change alerts require `SAVE` mode"*, and `DATA-08` deliberately ships *"no export path, no support-tool"* access to `ephemeral.sqlite` (**D8**). |
| Search-result and organisation-data exports; the organisation-closure export | Recorded as **QX-6**. PRD §8.9 qualifies them *"as applicable"*; PRD §10.3's closure export is a `/settings/data` flow (`13-identity-surface`). Not in these five tickets. |
| Cross-boundary tenant-isolation, integration and E2E UAT suites under `tests/**` | `23-assurance`: `ASSR-01` (`blocked_by XPRT-05`) covers PRD §21.2's *"read/write/delete/**export/download** and queued-job tenant attacks"*; `ASSR-05` (`blocked_by XPRT-01`); `ASSR-06` (`blocked_by XPRT-05`) automates `UAT-EXP-01/02`. Per plan **R8** every ticket here carries its own co-located tenant/licence/exclusion assertions, so assurance confirms rather than discovers. |
| `apps/api/package.json`, `apps/worker/package.json`, `apps/web/package.json` and their `tsconfig.json` | `03-app-runtime` (plan §4 lists the app manifests in that module's row). A new runtime dependency — notably the PDF and DOCX libraries — is a docs change against `RUNT-04` first (**D15**, **QX-4**). |

## Decisions

Each states its basis: a PRD section, a breakdown-plan §2.1 ADR candidate, or an upstream ticket's
published contract. Where the PRD does not answer, the item is an open question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **No ticket in this module writes a table, a migration or a repository.** An export job is an ordinary row in the PRD §35.6 `job` table (`job_type` an export type, `resource_id` the exported resource, `queue_class` `exports`), reached only through `packages/jobs` and `packages/database` repositories. | Breakdown plan **A3**, §4.2 (*"App tables + repositories → sole owner `01`, would have been shared with 15, 16, 17, **19**, 20, 22"*); PRD §45.2, §35.6; plan **R4**. |
| D2 | **The artifact's identity is derived, never stored.** The object key is `exports/{organization_id}/{export_job_id}/{format}/{export_job_id}.{ext}`; expiry is `finished_at + 7 days`; existence is authoritative in the object store. No new column and no new table are required, and re-running the upload stage rewrites the same key with the same bytes. | PRD §35.6 lists no export table (the dictionary is the *minimum*, and adding one is a `01-app-data` ticket — plan **R4**); PRD §8.9 (seven days); PRD §19.2. |
| D3 | **Two processes, two permissions, in the direction PRD §39.2 states.** The `worker` **writes and deletes** artifacts (*"export write permission"*); the `app` **reads and signs** (*"export read/sign permission"*). The API never uploads; the worker never signs a customer URL. | PRD §39.2 process table; §39.4 (*"app/worker → S3 Sydney export prefix — Export artifact lifecycle only"*); §19.2. |
| D4 | **A renderer is a pure function of a frozen `ExportDocument`.** It receives no database handle, no HTTP client, no provider and no corpus. `apps/worker/src/handlers/export/**` may not import `packages/model-gateway`, `packages/retrieval-client`, a search client, `node:http(s)`, `node:dns` or `fetch`, and an architecture test asserts it. This is how *"MUST NOT regenerate the answer using current law"* becomes mechanical rather than aspirational. | PRD §8.9; §9.4; §45.2 (`apps/worker` owns *"Lease loops and application-service orchestration"*, not *"Duplicated business rules"*); `EXP-001` (*"without regeneration"*). |
| D5 | **Licence limits and the export-exclusion assertion are applied exactly once, in the pipeline, through ports.** `XPRT-01` builds the `ExportDocument` with `EVID-06`'s `applyQuotationLimits(citation, assessment, 'EXPORT')` and `assertExportSafe(payload)` already applied; every renderer receives already-limited text and can only narrow it. The ports have **fail-closed strict defaults** (metadata-and-link-only; deny-by-shape internal-field scan) when unbound, and binding is idempotent by port `id` — the same implementation may be bound by more than one ticket, a different one fails boot by name. | PRD §11.1 (*"Customer exports MUST apply the same restrictions"*); §8.9; §36.6 (*"Trim/metadata-link-only; never bypass"*); `EVID-06` deliverables 2, 8, 9 and its sub-PRD **D12**; `RUNT-02` deliverable 8's provider-port precedent (an unbound provider never admits). Resolves **QX-2**. |
| D6 | **Snapshot text is data, never markup.** No renderer interprets HTML or Markdown, resolves an external resource, embeds JavaScript, a macro, a field code, a DDE link, a remote image or an auto-executing action. Source text is placed as literal text; every link is a code-generated official URL rendered as visible text plus an annotation. | PRD §37.5 (*"all links and source metadata are constructed from system records"*); §21.1; `SEC-003`; §9.4. It is also why this module needs no edge to `EVID-10`. |
| D7 | **The PRD §34.9 error catalogue is closed and is not extended.** An artifact that has expired, was never produced, or belongs to another organisation returns the **same** `404 RESOURCE_NOT_FOUND` from the download route. The job resource itself keeps returning `200` with a domain `artifact_state` of `EXPIRED`, because HTTP status and domain status are separate. `410 EPHEMERAL_CONTENT_EXPIRED` stays reserved for PRD §10.4 ephemeral content and is never reused for an export. | PRD §34.9 (closed catalogue; §16.5's *"same response for forbidden/other tenant"*); §16.1 (*"HTTP status and domain answer status remain separate"*); `RUNT-01`'s rule that codes come from the §34.9 catalogue; `EXP-002` evidence. |
| D8 | **Only durable (`SAVE`) resources are exportable.** An `EPHEMERAL` job id is rejected `400 INVALID_REQUEST` naming the field; ephemeral content is never read, and this module opens no connection to `ephemeral.sqlite`. | PRD §10.4 (*"Durable audit/export/review/version comparison/change alerts require `SAVE` mode"*; *"MUST NOT enter … exports or support tools"*); `DATA-08`'s documented non-capabilities. |
| D9 | **Four export target kinds ship: `RESEARCH_RECORD`, `ANSWER_SNAPSHOT`, `COMPARISON_SNAPSHOT`, `COVERAGE_ASSESSMENT`** — the four immutable artifacts PRD §35.5 defines and `DATA-06` persists. `SEARCH_RESULT_SET` and `ORGANIZATION_DATA` are the PRD §8.9 *"as applicable"* tail and are **QX-6**. | PRD §8.9 (*"Research Records, Answer Snapshots, comparisons, coverage assessments, search results and organisation data **as applicable**"*); `EXP-001` (*"Existing snapshots export to PDF, DOCX and versioned JSON"*); PRD §35.5. |
| D10 | **The renderer registry re-applies breakdown plan A1 one level down.** `XPRT-01` owns the handler area entry `apps/worker/src/handlers/export/index.ts` and a registry that discovers `handlers/export/<format>/index.ts` default exports; `XPRT-02`, `XPRT-03` and `XPRT-04` each add exactly one directory and produce **zero diff** outside it. Plan §5.20 splits the area into four sibling directories without naming an owner for the area entry file; plan §4 gives the whole `apps/worker/src/handlers/export/**` subtree to this module, so it belongs to the ticket that owns the pipeline. | Breakdown plan **A1**, §4 (module write-owns row), §5.20; `RUNT-04`'s A1 worker contract items 1–2 (*"a handler area MUST contain `index.ts` with a default export"*) and item 6 (*"zero diff outside that area's own directory"*); the same pattern `RCRD-08` ships for `records/from-search`. **Interpretation** — recorded in the changelog. |
| D11 | **Signed URLs are short-lived, single-object, GET-only, generated on demand and never stored or logged.** Committed safe default **300 seconds**, configurable, hard maximum **900 seconds**. Every download press mints a fresh URL; the URL never appears in a log line, an error body, an analytics call, a job row or the web client's history. | PRD §8.9 (*"short-lived signed URLs"*); §38.4's *"maximum 15-minute lifetime"* as the product's own precedent for *short-lived*; §39.6 layer 1 (committed safe defaults); §22 (bounded logs). See **QX-7**. |
| D12 | **The web feature registers `/exports` and `/exports/:exportJobId`, claims no navigation slot, and is entered by deep link.** The hosting screens (`/answers/:snapshotId`, `/records/:recordId`) link to `/exports?target_kind=…&target_id=…` with **opaque ids only**, so no screen owned by another module has to be edited for the export action to exist. | `EXP-002` (PRD §30.2) names *"Export status"* as a primary surface that PRD §31.2's route table omits — recorded as **QX-3**; PRD §31.3 (an asynchronous screen with all ten states, including `EXPIRED`); §41.1 (*"customer research content is not placed in URL query strings"* — opaque ids are not research content); `RUNT-05` contract item 3 (*"`nav` is optional"*); the same handoff shape as `17-records-collab`'s **D14**. |
| D13 | **Rendering is deterministic.** Given the same `ExportDocument`, template version, injected clock and injected export id, a renderer produces byte-identical output: no ambient `Date.now()`, no randomness, no locale drift, no embedded build timestamp, no random document id. This is what makes committed golden files a real test rather than a smoke test, and it makes a retried upload stage idempotent. | PRD §39.5 (*"only idempotent stages are retried"*); `EXP-001` evidence (*"Export hashes/citations match snapshot"*); plan §1.1's `[fixture]` class. |
| D14 | **The disclaimer is a required, non-removable block supplied through a port with a committed neutral default.** A renderer that cannot place the disclaimer fails the render; no configuration, theme or licence-trimming rule may remove it or an attribution. `LNCH-02` later supplies the approved copy through the same port. | PRD §11.2 (*"It MUST include clear disclaimers in the Web app, widget and exports"*); §8.10 (*"The disclaimer, citations and product-source indicator MUST NOT be removable by customer theming"*); `EVID-06` (*"a trimming rule must never remove a disclaimer or an attribution"*); plan §5.25 (`LNCH-02` is `blocked_by XPRT-02`). |
| D15 | **This module writes no app manifest.** `apps/{api,worker,web}/package.json` and their `tsconfig.json` belong to `03-app-runtime` (plan §4). A new runtime dependency — the PDF and DOCX libraries above all — is raised as a docs change against `RUNT-04`, merged, `--sync`ed, and only then used. | Breakdown plan §4 (app manifests appear in the `03-app-runtime` row); §1.1's append-only manifest rule is a *within-module* rule and does not override the §4 allocation; the identical reading in `17-records-collab`'s **D16**. See **QX-4**. |
| D16 | **Tests are co-located and offline.** `apps/api/test/exports/**`, `apps/worker/test/exports/{pipeline,pdf,docx,json}/**`, `apps/web/test/exports/**`, partitioned per ticket. Every `[machine]` and `[fixture]` check runs against `XPRT-01`'s **in-process object-store stub** — no AWS account, no credential, no network, in CI and on a laptop. | Breakdown plan §1.1 ("Tests"), §9 **R8**; PRD §20.2 (*"Coding agents MUST NOT receive production SSH, database, backup, signing or provider credentials by default"*); PRD §20.3. |
| D17 | **Opaque IDs are never parsed.** `exp_`, `ans_`, `rec_`, `cmp_`, `cov_`, `clm_`, `cit_`, `cr_`, `dv_`, `nv_` prefixes come from `packages/contracts` (`FND-03`); this module treats them as strings and validates them by repository lookup, never by prefix inspection — including inside an object key. | PRD §34.1 (*"Opaque resource-prefixed UUIDv7 strings … clients never parse them"*); plan §4.1. |
| D18 | **Nothing customer-readable goes into an object key, an object's metadata or a download filename.** Keys and filenames are built from opaque ids only; the record title, question, claim text and citation quotes never appear outside the artifact body. | PRD §41.1 (*"customer research content is not placed in URL query strings, analytics, browser error telemetry or page titles"*); §19.2 (R2/S3 boundary); §22. |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Render the export from a fresh answer run so the customer gets today's law.** | PRD §8.9: *"They MUST NOT regenerate the answer using current law."* It would also break `UAT-EXP-01` (*"Export shows original legal date/release and correction banner; no regeneration"*) and make an exported PDF disagree with the snapshot it claims to be. Rerun-under-current-law is a different, explicit product action owned by `RCRD-03`. |
| **Let each renderer apply its own licence limit, because each format needs a different amount of text.** | PRD §11.1 and §8.9 bind exports to the same restrictions as display; `EVID-06`'s feedback obligation calls two limit implementations *"how a licence breach ships unnoticed"*. Replaced by **D5**: one application, in the pipeline, before any renderer sees the text. |
| **Store the generated signed URL on the job row so the UI can poll for it.** | A stored signed URL is a bearer credential at rest with a seven-day-long blast radius and would appear in backups (PRD §23.1) and support views. **D11** mints one per download press instead. PRD §16.4 sets the standard: credentials are *"excluded from logs/exports/support"*. |
| **Rely solely on the S3 lifecycle rule for the seven-day deletion.** | A bucket lifecycle rule runs asynchronously and is invisible to the product; if it were misconfigured (a `18-ops-release` artifact this module does not own), artifacts would silently outlive the promise. `XPRT-01` therefore refuses to sign at/after expiry **and** sweeps explicitly, with `RLSE-04`'s lifecycle rule as the backstop — two independent enforcements of PRD §8.9. |
| **Add an `export_artifact` table to `packages/database` for keys, hashes and expiry.** | Breakdown plan **A3**/**R4** and PRD §45.2 forbid a product module to write `packages/database/**`. If derived identity (**D2**) proves insufficient, the path is a **new `01-app-data` ticket plus a `blocked_by` edge**, recorded in the plan first — see the Feedback obligation in `XPRT-01`. |
| **Generate the PDF with a headless browser for perfect fidelity to the web layout.** | PRD §39.2 caps the worker at **384 MiB** and PRD §19.1 forbids production from compiling code or running heavy build work; a browser engine breaks both and enlarges the release archive `RLSE-01` signs. The renderer must be a bounded, offline, deterministic library — the choice is **QX-5**, an ADR candidate. |
| **Send the artifact bytes back through the API and let the app upload them.** | PRD §39.2 gives the `app` process *export read/sign* and the `worker` *export write* permission. Reversing it would require broadening the app's least-privilege credential, which is exactly the boundary PRD §19.2 asks for. |
| **Expose a `410 EXPORT_EXPIRED` error code so the UI can be precise.** | PRD §34.9 is a closed catalogue; inventing a row is a PRD/API change (§45.5 "Product change") staged through `FND-04`. **D7** distinguishes the states where it is safe to — on the job resource, as a domain state — and keeps the download route indistinguishable, which is also what `EXP-002` and PRD §16.5 want. |
| **Let the export screen live inside `features/records` so the action sits where the user is.** | Plan §4 gives this module only `apps/web/src/features/exports/**`; `features/records/**` is `RCRD-08`'s. Replaced by **D12**'s deep link, which needs no edit to another module's files — the same reason plan **A1** exists. |
| **Export ephemeral answers "because the user can see them on screen".** | PRD §10.4 is explicit that ephemeral content *"MUST NOT enter … exports or support tools"* and that durable export requires `SAVE`. **D8**. |
| **One "exports" ticket.** | The module would be a single serial lane; plan §2 makes disjoint write-sets the basis of the cut and §7 requires every module to reach at least two useful lanes. The 5-way split yields 3 waves at concurrency 3, with the three renderers running as parallel lanes. |
| **Put the correction banner together in the renderer by joining `correction` rows.** | PRD §34.5 already carries `correction_state` on the snapshot payload, and this module has no `DATA-07` edge (**QX-1**). Deriving it a second way would create two answers to one question — the same trap `17-records-collab` rejected. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it. **QX-1**,
**QX-2** and **QX-8** are *plan-edge findings*: they are recorded here rather than fixed, because
`blocked_by` must equal breakdown plan §5.20 exactly and inventing an edge would falsify
`dag-scan.mjs`'s input.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **QX-1** | **`XPRT-01` creates and leases jobs on the PRD §35.6 `job` table but has no `blocked_by DATA-05` edge** (plan §5.20 gives `RUNT-02`, `RUNT-04`, `DATA-06`, `RLSE-04`). It is reachable transitively — `RUNT-04` is `blocked_by DATA-05` and publishes `JobContext`, and `RUNT-02` owns idempotency storage — so the repositories exist in practice. | `19-exports` with `01-app-data` | Confirmed at `XPRT-01` build time. If a job repository operation is missing, **stop** and write back to `docs/prd/breakdown-plan.md` §5.20 + §6.2 and this README — never create a table or a migration here (plan **A3**/**R4**). | Nothing today | Plan §5.2, §5.20, §6.2; PRD §35.6, §45.2 |
| **QX-2** | **`XPRT-04` (JSON) has no `blocked_by EVID-06` edge although PRD §8.9's excerpt-length rule applies to JSON exactly as to PDF/DOCX.** Resolved by **D5**: limits are applied once in `XPRT-01`'s pipeline behind a fail-closed port, so JSON inherits them whether or not `EVID-06` has landed. | `19-exports` with `12-evidence-safety` | `XPRT-01` (the port + strict default) and `XPRT-04` (the assertion that its output never exceeds the limit). If **D5** proves unworkable, write back to plan §5.20/§6.2 for an `EVID-06 → XPRT-04` edge before writing code. | Nothing — the default is stricter than any assessment | PRD §8.9, §11.1, §36.6; plan §5.20, §6.2; `EVID-06` D12 |
| **QX-3** | **PRD §31.2's route table has no export row, but PRD §30.2 `EXP-002` names *"Export status"* as a primary surface.** **D12** mints `/exports` and `/exports/:exportJobId`. | **Founder** (PRD §45.5 *"Product change"* — a customer-visible route), proposed by `19-exports` | `XPRT-05` ships **D12** and records it; a different placement is a docs change to this README plus plan §5.20 | Nothing — the surface is required by `EXP-002` either way | PRD §30.2 `EXP-002`, §31.2, §31.3, §45.5 |
| **QX-4** | **The PDF and DOCX libraries must be declared in `apps/worker/package.json`, which plan §4 allocates to `03-app-runtime`** (**D15**). | `03-app-runtime` (`RUNT-04`) with `19-exports` | Before `XPRT-02`/`XPRT-03` write code: a docs change against `RUNT-04` adding the dependency, merged, `--sync`ed; the lockfile is regenerated as a build artifact and never hand-merged (plan §4.1). | Would block `XPRT-02` and `XPRT-03` if unresolved | Plan §4, §4.1, §1.1; PRD §44.3 |
| **QX-5** | **Which PDF and DOCX libraries?** Constraints: pure offline operation, deterministic byte output (**D13**), bounded memory inside the worker's PRD §39.2 **384 MiB** limit, no browser engine, no system binary outside the `RLSE-01` release archive, embedded fonts, and a text layer that can be extracted for assertions. **ADR candidate.** | `19-exports` (`XPRT-02` decides and records; `XPRT-03` follows) | `docs/adr/NNNN-export-renderer-toolchain.md`, claimed by `XPRT-02` under plan **A9** (slug `export-renderer-toolchain` reserved to this module) | Nothing before `XPRT-02` | PRD §18.2, §19.1, §39.2, §45.5 (*"Architecture decision"*); plan **A9** |
| **QX-6** | **Search-result and organisation-data exports (PRD §8.9 *"as applicable"*) and the PRD §10.3 organisation-closure export are not in these five tickets** (**D9**). The closure export is a `/settings/data` flow owned by `13-identity-surface`. | **Founder** (launch scope, PRD §26/§45.5) with `13-identity-surface` | A scope decision at Gate 2; if in scope, a **new ticket** in this module plus plan §5.20/§6.2 rows — the four kinds in **D9** are extensible by adding a target loader, not by changing a renderer | Nothing in the MVP register — `EXP-001`/`EXP-002` name only snapshots and artifacts | PRD §8.9, §10.3, §30.2, §31.2 (`/settings/data`) |
| **QX-7** | **The exact signed-URL TTL, and whether `RLSE-04`'s least-privilege export credential grants `DeleteObject`** (the sweep in **D2**/`XPRT-01` needs it; without it the sweep degrades to alerting and the bucket lifecycle alone). | `18-ops-release` (`RLSE-04`) with `19-exports` | `XPRT-01` ships **D11**'s 300 s default and a sweep that logs a bounded, alertable failure if delete is denied; `RLSE-04` confirms the grant or this README records the degradation | Nothing — expiry is enforced at signing time regardless | PRD §8.9, §19.2, §39.2, §39.4, §38.4 |
| **QX-8** | **Should export creation and download write a PRD §35.6 `audit_event`?** PRD §10.3 keeps security/audit events 12 months and PRD §21.2 requires *export/download* attack tests, but `audit_event` is `DATA-07`'s and this module has no edge to it. Interim: bounded structured logs through `packages/observability` (`RUNT-07`), ids and codes only. | `19-exports` with `01-app-data` and `22-internal-admin` | `XPRT-01` records the interim; an audit requirement is a plan edge (`DATA-07 → XPRT-01`) written back to plan §5.20/§6.2 first | Nothing today | PRD §10.3, §21.2, §22, §35.6; plan §6.2 |
| **QX-9** | **`FND-03` must export the export vocabularies**: `ExportFormat` (`PDF`, `DOCX`, `JSON`), the export job type(s), `ExportTargetKind` (**D9**) and the artifact state values including `EXPIRED`. None is spelled out as a closed list in the PRD. | `00-foundation` (`FND-03`); **Founder** for any value the PRD does not imply | Consumed by `XPRT-01`; an absent enum is an `FND-03` writeback, never a local string union | Would block CHECK/contract parity | PRD §35.1, §20.1, §8.9; plan §4.1 |
| **QX-10** | **The `/v1/exports` paths must exist in `schemas/openapi/openapi.yaml`** (serial-owned, `FND-04`): create, get, cancel and download. PRD §16.2 names *"`POST /v1/exports`, get/cancel export jobs"* but not the download path or the payload shapes. | `00-foundation` (`FND-04`) | `XPRT-01` verifies its paths against the generated bindings first; an absent path is a docs PR against `FND-04`, then `--sync`, then code. Never a hand-edit (PRD §20.1). | Would block `XPRT-01` if unresolved | PRD §16.2, §34, §20.1; `DEV-001`; plan §4.1 |

## Work breakdown

Lane is `19-exports` and agent is `builder` for all five tickets (breakdown plan §1.1). File-scopes
are relative to the repository root, are exactly breakdown plan §5.20 (plus each ticket's own
co-located test directory per **D16**, and the handler-area entry file per **D10**), and are disjoint
between tickets. `depends-on` is exactly breakdown plan §5.20.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`XPRT-01`](tickets/XPRT-01-export-job-admission-s3-lifecycle-and-signed-urls.md) — Export job admission, S3 lifecycle and signed URLs | L | `19-exports` | `apps/api/src/routes/exports/**`, `apps/worker/src/handlers/export/index.ts`, `apps/worker/src/handlers/export/pipeline/**`, `apps/api/test/exports/**`, `apps/worker/test/exports/pipeline/**` | `RUNT-02`, `RUNT-04`, `DATA-06`, `RLSE-04` |
| [`XPRT-02`](tickets/XPRT-02-pdf-renderer.md) — PDF renderer | M | `19-exports` | `apps/worker/src/handlers/export/pdf/**`, `apps/worker/test/exports/pdf/**`, `docs/adr/NNNN-export-renderer-toolchain.md` | `XPRT-01`, `EVID-06` |
| [`XPRT-03`](tickets/XPRT-03-docx-renderer.md) — DOCX renderer | M | `19-exports` | `apps/worker/src/handlers/export/docx/**`, `apps/worker/test/exports/docx/**` | `XPRT-01`, `EVID-06` |
| [`XPRT-04`](tickets/XPRT-04-versioned-json-export.md) — Versioned JSON export | M | `19-exports` | `apps/worker/src/handlers/export/json/**`, `apps/worker/test/exports/json/**` | `XPRT-01` |
| [`XPRT-05`](tickets/XPRT-05-export-ui-request-status-download-expiry.md) — Export UI: request, status, download, expiry | M | `19-exports` | `apps/web/src/features/exports/**`, `apps/web/test/exports/**` | `XPRT-02`, `XPRT-03`, `XPRT-04`, `RCRD-08` |

Standing module-wide exceptions and shared reads (no ticket writes these):

- `infra/aws/**` — `18-ops-release` (`RLSE-04`): bucket, prefixes, credentials, lifecycle rule.
- `packages/database/**`, `packages/jobs/**` — `01-app-data` (**D1**).
- `packages/citations/**` — `12-evidence-safety` (`EVID-06`), consumed through **D5**'s ports.
- `packages/ui/**`, `apps/web/src/{app,shell,lib}/**` — `03-app-runtime` (`RUNT-05`, `RUNT-06`).
- `apps/{api,worker,web}/package.json` and `tsconfig.json` — `03-app-runtime` (**D15**, **QX-4**).
- `schemas/openapi/**`, `packages/contracts/**` — `00-foundation`, serial-owned (**QX-9**, **QX-10**).
- `docs/adr/NNNN-<slug>.md` — shared-additive with per-file ownership (plan **A9**); the only slug
  reserved by this module is `export-renderer-toolchain`, claimed by `XPRT-02` (**QX-5**).

Wave shape (breakdown plan §7: **3 minimum waves, 3 useful lanes, not fully serial**). External
blockers are shown in brackets:

```text
wave 1  XPRT-01 [RUNT-02, RUNT-04, DATA-06, RLSE-04]
wave 2  XPRT-02 [EVID-06] | XPRT-03 [EVID-06] | XPRT-04
wave 3  XPRT-05 [RCRD-08]
```

Take the authoritative concurrency from `docs/prd/dag.html`, not from this paragraph (CLAUDE.md).

## Acceptance — what makes the whole module done

The module is done when all five tickets are delivered (`/verify-delivery` green each) **and**:

1. **`EXP-001` — existing snapshots export to PDF, DOCX and versioned JSON without regeneration.**
   For each of the three formats and each of the four **D9** target kinds, an export of a committed
   snapshot fixture reproduces the snapshot's legal date, jurisdictions, corpus release id, status,
   claims (with support status), citations (with pinpoint, offsets, official URL, authority role and
   effective interval), assumptions with impact-if-false, next checks, limitations and correction
   status; the JSON export's `source_snapshot_sha256` equals the hash recomputed from the snapshot as
   read, and every citation identifier and offset in every format matches the snapshot exactly. An
   architecture test proves no export code path can reach retrieval, a model provider or the network.
   (PRD §30.2 `EXP-001` evidence *"Export hashes/citations match snapshot"*; §8.9.)
2. **`EXP-002` — private artifacts use S3 Sydney signed URLs and expire after seven days.** Artifacts
   are written only under the `exports/` prefix with the export credential; download URLs are minted
   on demand, are GET-only, single-object and ≤ 900 s; a URL requested at or after
   `finished_at + 7 days` is refused; the sweep deletes the object; and a request for another
   organisation's export job returns the byte-identical `404 RESOURCE_NOT_FOUND` (apart from
   `request_id`) that an unknown id returns. (PRD §30.2 `EXP-002` evidence *"Expired or other-tenant
   URL is inaccessible"*; §19.2; §16.5.)
3. **Nothing excluded by PRD §8.9 appears in any artifact.** A fixture whose internal fields carry
   distinct canaries — a prompt, a hidden reasoning field, an API key, a BYOK credential, an internal
   licensing note and an operator-only comment — renders to PDF, DOCX and JSON, and a **content scan
   of the produced bytes and their extracted text** finds none of them. (PRD §8.9; §9.4; §16.4;
   `SEC-003`.)
4. **Licence limits hold in every format.** Every quoted excerpt in every artifact is at or below the
   effective limit `EVID-06` computes for `EXPORT`; a `METADATA_AND_LINK_ONLY` or zero-limit citation
   carries no quote text and a complete metadata-plus-official-link block; a trimmed excerpt is
   visibly marked; required attribution is present and cannot be removed. With the port unbound the
   fail-closed default produces metadata-and-link-only — never unlimited. (PRD §11.1; §8.9; §36.6;
   **D5**.)
5. **The disclaimer is present and non-removable** in every artifact in every format, and no
   configuration, theme or trimming path can drop it or an attribution. (PRD §11.2; §8.10; **D14**.)
6. **Correction status is preserved.** An answer whose `correction_state` is not `NONE` exports with
   a visible correction banner in PDF and DOCX and the field in JSON, and the exported legal date and
   corpus release are the **original** ones. (PRD §8.9; §34.5; `UAT-EXP-01`.)
7. **`UAT-EXP-01`** (PRD §41.2): exporting an old corrected answer shows the original legal date and
   release and the correction banner, with no regeneration — run by the founder against the deployed
   surface, automated by `23-assurance`/`ASSR-06`.
8. **`UAT-EXP-02`** (PRD §41.2): a signed export URL used after expiry, and one used as another
   tenant, are both denied; the artifact is gone by seven days — run by the founder, automated by
   `ASSR-06`, with the tenant half also covered by `ASSR-01`.
9. **Tenant isolation, co-located.** Per plan **R8** every ticket carries its own cross-tenant matrix
   for create, read, cancel, download and the queued job: another organisation's target id, export
   job id and object key are all unreachable and indistinguishable from absent. (PRD §21.2 —
   *"Automated tests MUST cover read/write/delete/**export/download** and queued-job tenant
   attacks"*; `SEC-001`; `UAT-AUTH-03`.)
10. **PRD §41.1 universal UI acceptance** on `/exports` and `/exports/:exportJobId`: 360/768/1280 px;
    full keyboard operation; one programmatic page heading; colour never the only signal; dates as
    `3 Aug 2026`; request/job ids copyable; all ten PRD §31.3 states including `EXPIRED`; **no
    customer research content in URLs, analytics, telemetry or page titles**; refresh/back/forward
    duplicates no export job or charge.
11. **English throughout.** Every artifact and every screen string is English. (PRD §13.1:
    *"Application, API, SDK, widget, alerts, **exports** and generated answers MUST be English."*)
12. **Offline reproducibility.** Every `[machine]` and `[fixture]` item in every ticket runs with no
    network, no AWS credential and no model provider, against `XPRT-01`'s object-store stub:
    `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green on the merged default
    branch, and `pnpm generate && pnpm generated:check` clean. No Rust or Python surface exists in
    this module, so `cargo test --workspace` and `uv run pytest` are unaffected. (PRD §20.3, §45.3.)

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.20 (5 tickets,
  `XPRT-01` … `XPRT-05`). Records decisions D1–D18, rejects 12 alternatives, and opens QX-1 … QX-10.
  Three are **plan-edge findings** raised rather than fixed, because `blocked_by` must equal plan
  §5.20 exactly: `DATA-05` is not a declared blocker of `XPRT-01` although export jobs use the `job`
  table (QX-1), `EVID-06` is not a declared blocker of `XPRT-04` although PRD §8.9's excerpt rule
  applies to JSON (QX-2, neutralised by **D5**), and no `DATA-07` edge exists for an export
  `audit_event` (QX-8). One **interpretation** of plan §5.20, recorded as **D10**: the handler-area
  entry file `apps/worker/src/handlers/export/index.ts` is unassigned by the §5.20 sub-directory
  split and is given to `XPRT-01`, since `RUNT-04`'s A1 contract requires it and plan §4 gives the
  whole subtree to this module. One ADR candidate: the PDF/DOCX renderer toolchain (QX-5, `XPRT-02`,
  slug `export-renderer-toolchain`).
