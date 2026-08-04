---
id: XPRT-01
title: "Export job admission, S3 lifecycle and signed URLs"
module: 19-exports
lane: 19-exports
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-02, RUNT-04, DATA-06, RLSE-04]
blocks: [XPRT-02, XPRT-03, XPRT-04, ASSR-05]
---

# XPRT-01 — Export job admission, S3 lifecycle and signed URLs

Implements PRD §8.9 and §19.2 — requirements **EXP-001** (admission and no-regeneration half) and
**EXP-002** (artifact lifecycle), epic `E26-EXPORT`.
No ADR — the decision is already made in PRD §8.9 (what an export preserves and excludes), §19.2 (the
prefix, the seven-day lifecycle and the separate least-privilege permissions) and §39.2/§39.4 (which
process may write and which may sign); this is build ticket 1 of 5 against it.
Parent sub-PRD: [19-exports README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `RUNT-02` — Admission middleware chain and `RUNT-04` — Worker runtime
([`03-app-runtime`](../../03-app-runtime/README.md)) · `DATA-06` — Research and evidence tables
(immutable) ([`01-app-data`](../../01-app-data/README.md)) · `RLSE-04` — S3 Sydney backup and export
prefixes with least privilege ([`18-ops-release`](../../18-ops-release/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §8.9/§19.2 already decide the artifact's storage, delivery and lifetime, and `RUNT-01`/`RUNT-04`
already froze the route-area and handler-area contracts this composes; not a new subsystem decision.

## Background + basis

**PRD §8.9 — Exports**, reproduced in full because every deliverable below traces to one of its
sentences:

> The product MUST export Research Records, Answer Snapshots, comparisons, coverage assessments,
> search results and organisation data as applicable in PDF, DOCX and JSON. **Exports MUST preserve
> legal date, corpus release, claims, citations, assumptions, limitations and correction status. They
> MUST NOT regenerate the answer using current law.**
>
> **Private export artifacts MUST be stored in S3 Sydney under a separately permissioned prefix,
> delivered through short-lived signed URLs and deleted after seven days by default. Licensing rules
> MUST restrict excerpt length. Hidden prompts/reasoning, secrets and internal licensing notes MUST be
> excluded.**

**PRD §19.2 — Object-store boundary**, verbatim:

> Cloudflare R2 stores only public/rebuildable legal artifacts … It MUST NOT contain customer
> identities, Research Records, answers, **exports** or backups.
>
> AWS S3 Sydney stores:
> - `backups/`: encrypted mutable customer-database recovery material;
> - `exports/`: **private customer export artifacts with seven-day lifecycle**.
>
> **The prefixes MUST use separate least-privilege permissions.**

**PRD §39.2 fixes which process holds which permission** — this is the reason the ticket spans two
apps:

| Process | Network/data access |
|---|---|
| `app` | app/ephemeral DB, worker enqueue, **export read/sign permission**, search localhost |
| `worker` | app/ephemeral DB, search, **export write permission**, approved model providers, outbox deliveries |

and PRD §39.4 adds the row *"`app/worker` → S3 Sydney export prefix — **Export artifact lifecycle
only**"* plus *"Backup and export use different credentials and prefixes."* The worker's memory limit
is **384 MiB** (PRD §39.2), which bounds how an artifact may be produced and uploaded.

**PRD §16.2** gives the endpoints: *"`POST /v1/exports`, get/cancel export jobs"*, and PRD §16.3 lists
the service scope `exports:create`. **PRD §38.1** gives the permission row *"Export accessible records
— Owner ✓, Admin ✓, Researcher ✓, Viewer read-only export if granted, Developer —, Service account
scoped"*. **PRD §38.5** gives *"Concurrent export | 1 | 1 | 1 initial"* as a **separate ledger**
(*"exhausting one does not misreport the others"*). **PRD §39.5** puts exports in their own queue
class: *"`exports` | PDF/DOCX/JSON | priority 3 | 1 when no interactive pressure"*.

**PRD §30.2**, the two requirements this module exists for:

> | `EXP-001` | Existing snapshots export to PDF, DOCX and versioned JSON without regeneration |
> Record/answer export | export endpoints | App | **Export hashes/citations match snapshot** |
> | `EXP-002` | Private artifacts use S3 Sydney signed URLs and expire after seven days | Export
> status | export download | App/S3 | **Expired or other-tenant URL is inaccessible** |

**PRD §41.2** gives the two founder scripts: `UAT-EXP-01` *"Export old corrected answer → Export shows
original legal date/release and correction banner; no regeneration"*; `UAT-EXP-02` *"Use signed export
URL after expiry/as other tenant → Access denied; artifact lifecycle removes it by seven days"*.

**PRD §10.4** forbids exporting ephemeral content: *"Durable audit/export/review/version
comparison/change alerts require `SAVE` mode"*, and ephemeral content *"MUST NOT enter Litestream,
daily/weekly backups, **exports** or support tools"*.

**PRD §34.5** is the snapshot payload this ticket reads and that the renderers must reproduce (status,
short answer, legal date, knowledge cutoff, jurisdictions, corpus release, claims, citations with
offsets and official URL, assumptions with impact-if-false, next checks, limitations,
`correction_state`), closing with: *"Provider prompts, hidden reasoning and raw provider responses are
never part of this customer contract."*

**Upstream contracts this ticket composes, not re-derives:**

- **`RUNT-01`'s A1 route registration contract** — a route area is a directory under
  `apps/api/src/routes/`; it exports a default Fastify plugin from `index.ts`, optionally
  `export const area: RouteAreaConfig` with `prefix`, `admission` (`'public' | 'probe' | 'tenant' |
  'internal'`) and `order`; the default prefix is `/v1/<area-id>`; *"If two areas would register the
  same method+path, boot fails … Last-wins is forbidden"*; *"Adding, renaming or removing a route area
  produces zero diff outside that area's own directory."*
- **`RUNT-02`'s admission chain** — the ordered stages
  `['request-limits','authenticate','resolve-organisation','verify-membership','evaluate-permission','rate-limit','pii-admission','schema-validate','legal-scope','budget-admission','idempotency']`,
  installed once at root scope so *"no route can opt out by omission"*; an organisation id in a body,
  query or header is rejected `400 INVALID_REQUEST`; a denied permission on an addressable resource
  returns *"the same `404 RESOURCE_NOT_FOUND` body as an absent id"*; `Idempotency-Key` is 16–128
  characters and *"a repeat with the same body returns the original stored result"*; rate limits are
  *separate ledgers* keyed by organisation.
- **`RUNT-04`'s A1 worker registration contract** — every immediate child directory of
  `apps/worker/src/handlers/` is a handler area with `index.ts` default-exporting a
  `JobHandlerModule`; a handler declares `type`, `queue` (one of the five PRD §39.5 classes) and an
  ordered `stages` list of `{ name, idempotent }`; `run` is called **once per stage** and *"Returning
  from a stage is the yield point"*; `JobContext` is `{ jobId, jobType, tenant, payload, attempt,
  checkpoint, logger, signal }` with **no unscoped database handle**; boot fails, naming the area, for
  a missing default export, an unknown `type`, a `queue` outside the five classes, a duplicate `type`
  or an empty `stages` list — *"Silent skip is forbidden"*; `exports` *"does not claim while an
  `interactive_quick` or `interactive_research` job is queued or running"*.
- **`DATA-06`'s immutable research repositories** — the ten PRD §35.5 tables, with
  `writeAnswerSnapshot` as the only snapshot write path, no `update`/`delete` member on any immutable
  repository, `BEFORE UPDATE`/`BEFORE DELETE` triggers behind them, and reads scoped by `DATA-02`'s
  `TenantContext` returning the indistinguishable `ResourceNotFound`.
- **`RLSE-04`** — the S3 bucket, the `exports/` prefix, the export credential and the seven-day bucket
  lifecycle rule (plan §5.19: *"Two prefixes, two credentials, seven-day export lifecycle"*). This
  ticket **consumes** them as configuration and defines none of them (plan §4.2).

**Accepted caveats carried forward, documented not enforced here:**

- **No `blocked_by DATA-05` edge exists** although export jobs live in the PRD §35.6 `job` table
  (sub-PRD **QX-1**). It is reachable transitively — `RUNT-04` is `blocked_by DATA-05` and its
  `JobContext`/lease loop are built on `packages/jobs`, and `RUNT-02` owns idempotency storage. If a
  needed job repository operation is missing, **stop and write back**; never add a table here
  (plan **A3**/**R4**).
- **No `blocked_by DATA-07` edge exists**, so this ticket writes **no `audit_event`** (sub-PRD
  **QX-8**). Export activity is recorded as bounded structured logs through `packages/observability`
  (`RUNT-07`), ids and codes only.
- **No `blocked_by EVID-06` edge exists**, so licence limits and the export-exclusion assertion are
  consumed through **ports with fail-closed strict defaults** (sub-PRD **D5**, **QX-2**) — the same
  shape `RUNT-02` uses for its PII provider. The strict default is *stricter* than any real
  assessment, so an unbound port can never widen a licence.
- **The signed-URL TTL number is not in the PRD** (*"short-lived"*). Sub-PRD **D11** ships 300 s with
  a 900 s hard maximum, taking PRD §38.4's *"maximum 15-minute lifetime"* as the product's own
  precedent. Recorded as **QX-7**.
- **`docs/PRD.md` is frozen** (plan §4). Where the PRD leaves a gap — the `/v1/exports/{id}/download`
  path shape (**QX-10**), the export enums (**QX-9**) — the writeback target is `FND-04`/`FND-03` plus
  this module's README, never a local invention that outlives the ticket.

## Goal

Produce the export **admission surface**, the **export handler area** and the **artifact lifecycle**:
`apps/api/src/routes/exports/**` serving `POST /v1/exports`, `GET /v1/exports/{export_job_id}`,
`POST /v1/exports/{export_job_id}/cancel` and `GET /v1/exports/{export_job_id}/download`; and
`apps/worker/src/handlers/export/{index.ts,pipeline/**}` running a four-stage job that loads an
existing immutable snapshot through `DATA-06`, builds a frozen `ExportDocument` with licence limits
and the PRD §8.9 exclusion assertion already applied, hands it to a renderer discovered by directory
convention, uploads the bytes to a deterministic key under the `exports/` prefix with the worker's
write credential, and deletes it at `finished_at + 7 days`. Completion is mechanically checkable: an
architecture test proves nothing under `apps/worker/src/handlers/export/**` can reach retrieval, a
model provider or the network; a registry conformance test proves a throw-away renderer directory is
discovered with **zero** diff to any tracked file; a lifecycle test proves a URL requested at or after
expiry is refused and the object is swept; a cross-tenant matrix proves another organisation's export
job and object key are indistinguishable from absent; and every one of those runs offline against an
in-process object-store stub with no AWS credential.

## Non-goals

- **No PDF, DOCX or JSON rendering.** `XPRT-02`, `XPRT-03`, `XPRT-04`, each of which is `blocked_by`
  this ticket and owns exactly one directory under `apps/worker/src/handlers/export/`. This ticket
  ships the registry, the contract and a **test-only** fixture renderer that never leaves
  `apps/worker/test/`.
- **No export screen.** `XPRT-05` (`apps/web/src/features/exports/**`), `blocked_by` this ticket's
  three renderer siblings.
- **No S3 bucket, prefix, IAM policy, credential or bucket lifecycle rule.** `18-ops-release`
  (`RLSE-04`, `infra/aws/**`); plan §4.2 names this contested path and gives it one owner. This ticket
  reads bucket/prefix/region/credential from configuration and asserts nothing about how they were
  created.
- **No table, migration or repository.** `01-app-data` (`DATA-05` job/outbox, `DATA-06`
  research/evidence, `DATA-07` audit/usage). Plan **A3**, **R4**; PRD §45.2. Sub-PRD **D1**, **D2**.
- **No licence assessment, quote-limit rule, trimming algorithm or export-exclusion field list.**
  `12-evidence-safety` (`EVID-06`). This ticket declares the ports and the fail-closed defaults and
  calls them (**D5**).
- **No disclaimer, Terms, Privacy or AUP prose.** `24-launch` (`LNCH-01`); `LNCH-02` supplies the
  approved copy through **D14**'s port. This ticket ships a neutral committed default only.
- **No answer synthesis, evidence pack, validator, retrieval, model gateway or corpus access.**
  `15-answer-product`, `12-evidence-safety`, `11-retrieval-engine`, `04-corpus-contract`. Reaching any
  of them from this file-scope is a build failure by design (**D4**).
- **No worker runtime, queue configuration, lease loop, fairness rule or `handlers/maintenance/**`.**
  `RUNT-04`. This ticket registers one handler area and one `maintenance`-class sweep **inside its own
  directory**, which `RUNT-04`'s decision D8 explicitly permits (*"the `maintenance` row is a queue
  class, not a file location"*).
- **No admission stage, permission table, rate-limit ledger, PII detection or idempotency store.**
  `RUNT-02`, `FND-06`, `FND-09`, `EVID-01`. Routes here *declare*; they do not implement.
- **No OpenAPI authoring, enum authoring or generated bindings.** `FND-03`/`FND-04`, serial-owned
  (plan §4.1). An absent path or enum is a writeback (**QX-9**, **QX-10**), never a hand-edit
  (PRD §20.1).
- **No cross-boundary suites.** `tests/**` is `23-assurance` — `ASSR-05` (integration: idempotency,
  SSE resume, cancel, charge invariants) is `blocked_by` this ticket. Co-located assertions here per
  plan **R8**.
- **No `apps/api/package.json`, `apps/worker/package.json` or their `tsconfig.json`.**
  `03-app-runtime` (sub-PRD **D15**); a new dependency is a docs change against `RUNT-01`/`RUNT-04`
  first (**QX-4**).

## File-scope (write-owns)

- `apps/api/src/routes/exports/**` — the route area (plan §5.20).
- `apps/worker/src/handlers/export/index.ts` — the `RUNT-04` handler-area entry file. Sub-PRD **D10**:
  plan §5.20 splits `handlers/export/` into four sibling directories and leaves the area entry
  unassigned; `RUNT-04`'s contract item 2 requires it and plan §4 gives the whole subtree to this
  module, so it belongs to the ticket that owns the pipeline.
- `apps/worker/src/handlers/export/pipeline/**` — the pipeline, contract, registry, ports,
  object-store adapter and retention sweep (plan §5.20).
- `apps/api/test/exports/**` and `apps/worker/test/exports/pipeline/**` — this ticket's own tests and
  fixtures, including the shared object-store stub and the shared snapshot fixtures the three renderer
  tickets reuse (sub-PRD **D16**).

Does not touch:

- `apps/worker/src/handlers/export/{pdf,docx,json}/**` and `apps/worker/test/exports/{pdf,docx,json}/**`
  — `XPRT-02`, `XPRT-03`, `XPRT-04`.
- `apps/web/**` — `RUNT-05` and `XPRT-05` (`features/exports/**`).
- `apps/worker/src/{main.ts,runtime,queues}/**`, `apps/worker/src/handlers/maintenance/**` — `RUNT-04`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01`, `RUNT-02`,
  `RUNT-03`; every other `apps/api/src/routes/<area>/**` — `RUNT-08` and the other product modules.
- `packages/database/**`, `packages/jobs/**` — `01-app-data`; `packages/citations/**`,
  `packages/pii/**`, `packages/model-gateway/**` — `12-evidence-safety`; `packages/contracts/**`,
  `packages/domain/**`, `schemas/openapi/**` — `00-foundation` (serial-owned); `packages/ui/**`,
  `packages/observability/**` — `03-app-runtime`.
- `infra/aws/**` and everything else under `infra/**` — `18-ops-release` (`RLSE-04`) and `RUNT-09`.
- `tests/**` — `23-assurance`. `docs/policies/**` — `24-launch`. `docs/PRD.md` — frozen.
- `apps/{api,worker}/package.json`, `apps/{api,worker}/tsconfig.json` — `03-app-runtime` (**D15**).
- `docs/adr/NNNN-export-renderer-toolchain.md` — reserved to `XPRT-02` (plan **A9**, **QX-5**).

**Serial-safety analysis.** This is the **first** decomposition (plan §1: phase 1, `append: false`,
`usedIds: []`, `existingFiles: ['.gitkeep']`): nothing is merged, no ticket is in flight, and no prior
ticket has written any path above. Sibling tickets in this module are disjoint by construction —
`XPRT-02`/`XPRT-03`/`XPRT-04` own three named sibling directories under
`apps/worker/src/handlers/export/`, `XPRT-05` owns `apps/web/src/features/exports/**`, and all four are
`blocked_by` this ticket, so none is ever in flight with it. Under plan **A1** and `RUNT-01`'s
contract, `apps/api/src/routes/` is discovered by directory scan, so adding the `exports` area
produces zero diff outside it and the seven route areas owned by other modules are seven disjoint
directories; under `RUNT-04`'s contract the same holds for `apps/worker/src/handlers/export/` against
the nine sibling handler areas. Sub-PRD **D10**'s renderer registry applies the same rule one level
down, so the three renderer tickets can run as three concurrent lanes (plan §7: 5 tickets, 3 waves,
3 useful lanes). Per plan **A3** this ticket writes no table and no repository; per PRD §45.2 it
enforces no tenant or PII boundary of its own — both stay in `packages/database` and `RUNT-02`.

## The renderer registry contract (normative for `XPRT-02`, `XPRT-03`, `XPRT-04`)

This section is the contract three sibling tickets build against. It must be implementable without any
of them editing a file this ticket owns (plan **A1** applied one level down, sub-PRD **D10**).

**1. Discovery.** Every immediate child directory of `apps/worker/src/handlers/export/` other than
`pipeline/` is a **renderer area**; its directory name, upper-cased, is the format id. Areas are
discovered at boot by directory scan, sorted lexicographically, and registered in that order.

**2. Required entry file.** A renderer area MUST contain `index.ts` with a **default export** of type
`ExportRenderer`:

```ts
import type { ExportRenderer, ExportDocument, ExportRenderContext, RenderedArtifact }
  from '../pipeline/contract';

const renderer: ExportRenderer = {
  format: 'PDF',              // ExportFormat from packages/contracts (FND-03); must equal the dir name upper-cased
  templateVersion: 'pdf-1',   // bumped whenever output bytes change; recorded in the artifact metadata
  extension: 'pdf',
  contentType: 'application/pdf',
  async render(doc: ExportDocument, ctx: ExportRenderContext): Promise<RenderedArtifact> { /* … */ },
};
export default renderer;
```

**3. Validation at boot, never at first job.** A directory without a default-exporting `index.ts`, a
`format` absent from the `packages/contracts` `ExportFormat` enum, a `format` that does not equal the
directory name upper-cased, or a duplicate `format` across two areas **fails boot** with an error
naming the area and the offence. Silent skip is forbidden. A request for a format with no registered
renderer fails admission with `400 INVALID_REQUEST` naming the field — never a job that can never run.

**4. What a renderer receives, and nothing more.** `render` is given a deeply frozen `ExportDocument`
(already licence-limited and already asserted export-safe) and an `ExportRenderContext` of
`{ now, exportId, templateBaseDir, logger, signal }`. There is **no** database handle, no repository,
no HTTP client, no object store, no corpus and no model gateway reachable from either value — the
mechanical form of PRD §8.9's *"MUST NOT regenerate"* (sub-PRD **D4**).

**5. Determinism.** `render` must be a pure function of `(doc, ctx)`: no ambient `Date.now()`, no
`Math.random()`, no `process.env`, no locale-dependent formatting, no embedded build timestamp and no
random document identifier. Two calls with equal arguments produce byte-identical output (sub-PRD
**D13**). The pipeline asserts this by rendering twice and comparing hashes.

**6. Stability guarantee.** Adding, renaming or removing a renderer area produces **zero** diff outside
that area's own directory.

**7. Obligations a renderer inherits and may not weaken.** It may narrow a quote further but never
lengthen one; it must place the disclaimer block and every required attribution; it must treat all
document text as literal data, never markup (sub-PRD **D6**); and it must not emit any field the
document does not carry.

## Deliverables

1. **`apps/api/src/routes/exports/index.ts`** — the `RUNT-01` route area. `export const area = {
   admission: 'tenant' } satisfies RouteAreaConfig` (default prefix `/v1/exports`, exactly PRD §16.2).
   Four routes, each declaring its own per-route flags for `RUNT-02` to enforce:
   - `POST /v1/exports` — `idempotent: true`, permission *"Export accessible records"* (PRD §38.1),
     service scope `exports:create` (PRD §16.3), `requiresPiiAdmission: false` (the request body
     carries opaque ids only — no free text is accepted, so there is nothing for the PII boundary to
     assess; see Deliverable 2).
   - `GET /v1/exports/{export_job_id}` — read permission on the same resource.
   - `POST /v1/exports/{export_job_id}/cancel` — `idempotent: true`.
   - `GET /v1/exports/{export_job_id}/download` — read permission; returns `302` to a freshly minted
     signed URL (Deliverable 10).
   Every path is verified against the generated `packages/contracts` bindings first; an absent path is
   an `FND-04` writeback (**QX-10**), never a hand-edit.
2. **Request contract, ids only.** `POST /v1/exports` body:
   `{ target_kind: ExportTargetKind, target_id: string, format: ExportFormat, options?: { include_evidence_appendix?: boolean } }`.
   No organisation field is accepted in body, query or header (`RUNT-02` rejects it
   `400 INVALID_REQUEST` naming the field; PRD §34.1). No free text, no title, no filename and no URL
   is accepted from the client — everything customer-readable is read from the snapshot (sub-PRD
   **D18**). `target_kind` is one of the four sub-PRD **D9** kinds; an unknown kind or a format with no
   registered renderer is `400 INVALID_REQUEST` naming the field.
3. **Admission (the app process).** In one `withTenantTransaction`:
   (a) resolve the target through `DATA-06`'s tenant-scoped repositories — a target in another
   organisation or an absent id both raise the indistinguishable `ResourceNotFound` mapped to
   `404 RESOURCE_NOT_FOUND` (PRD §16.5, §34.9);
   (b) refuse a non-durable target — an `EPHEMERAL` job id or any id that resolves only in
   `ephemeral.sqlite` is `400 INVALID_REQUEST` naming the field, and no ephemeral connection is opened
   at all (sub-PRD **D8**; PRD §10.4);
   (c) claim the job through `packages/jobs`' idempotent admission with `job_type` the export type from
   `packages/contracts`, `queue_class` `exports` (PRD §39.5), `resource_id = target_id`,
   `retention_mode = SAVE`, and a payload of `{ target_kind, target_id, format, options }` — opaque ids
   and enums only, no customer text;
   (d) return `202` with `{ export_job_id, status, events_url? , request_id }`.
   A repeat with the same actor/route/`Idempotency-Key`/body returns the **original** job
   (`RUNT-02` deliverable 10); a changed body returns `409 IDEMPOTENCY_CONFLICT`. Concurrency is the
   PRD §38.5 *concurrent export* ledger, enforced by `RUNT-02`'s `rate-limit` stage — this ticket
   declares the ledger name and performs no arithmetic.
4. **`apps/worker/src/handlers/export/index.ts`** — the `RUNT-04` handler area (sub-PRD **D10**),
   default-exporting a `JobHandlerModule` with two handlers:
   - the **export render handler**: `queue: 'exports'`, stages
     `[{ name: 'LOAD', idempotent: true }, { name: 'RENDER', idempotent: true },
     { name: 'UPLOAD', idempotent: true }, { name: 'FINALISE', idempotent: false }]`. Every stage
     except `FINALISE` is safely repeatable because the object key is deterministic (**D2**) and the
     render is deterministic (**D13**), which is exactly what PRD §39.5's *"only idempotent stages are
     retried"* requires;
   - the **retention sweep handler**: `queue: 'maintenance'`, priority 4, cooperative and bounded
     (Deliverable 11). `RUNT-04`'s decision D8 permits a `maintenance`-class handler to live in its
     owning module's directory.
   The file contains no rendering, no S3 call and no business logic — it wires `pipeline/**` into the
   contract.
5. **`pipeline/contract.ts`** — the types the registry contract above names: `ExportFormat` (imported
   from `packages/contracts`, never redeclared), `ExportTargetKind`, `ExportDocument`,
   `ExportRenderContext`, `RenderedArtifact`
   (`{ bytes: Uint8Array; contentType: string; extension: string; byteLength: number; sha256: string;
   templateVersion: string }`), `ExportRenderer`, `ExportLicencePort`, `ExportSafetyPort`,
   `DisclaimerPort`, `ObjectStorePort`.
6. **`pipeline/registry.ts`** — `loadRenderers(opts?: { root?: string }): RendererRegistry` with the
   discovery, boot-time validation, duplicate detection and named failures the contract states, plus
   `RendererRegistry.byFormat(format)`. Ships
   `apps/worker/test/exports/pipeline/renderer-conformance.ts`: a reusable harness that writes a
   throw-away renderer area, boots the registry, runs one job through the whole pipeline against the
   object-store stub, asserts the artifact, removes the directory and asserts `git status --porcelain`
   is clean — **exported for `XPRT-02`, `XPRT-03` and `XPRT-04` to reuse**, so all three prove
   conformance the same way.
7. **`pipeline/source.ts` — the `ExportDocument` builder, the heart of `EXP-001`.** For each sub-PRD
   **D9** target kind it reads the immutable rows through `DATA-06`'s tenant-scoped repositories and
   produces a **deeply frozen, JSON-serialisable** document carrying exactly the PRD §8.9 preservation
   list and the PRD §34.5 shape:
   - `legal_as_at`, `knowledge_cutoff_at`, `jurisdictions`, `corpus_release_id`, answer `status`,
     `short_answer`;
   - `claims[]` with `sequence`, `kind`, `text`, `support_status`, `citation_ids`, `assumption_ids`;
   - `citations[]` with `id`, `role`, `document_version_id`, `node_version_id`, `pinpoint`,
     `start_offset`, `end_offset`, `official_url`, `legal_status`, `effective_from`, `effective_to`,
     and the **licence-limited** `quote` plus `quote_trimmed`, `quote_limit_applied`, `attribution`;
   - `assumptions[]` with `text`, `source`, `confirmed`, `impact_if_false`;
   - `next_checks[]`, `limitations[]`, `correction_state` and, when it is not `NONE`, a
     `correction_notice` block naming the correction id and that the answer was superseded;
   - record/turn context for `RESEARCH_RECORD` exports (title, stable id, owner, reviewer, workflow
     status, tags, created/updated) and the record's answer versions in order;
   - `provenance`: `source_kind`, `source_id`, `source_snapshot_sha256` (Deliverable 8),
     `snapshot_created_at`, `model_profile`/`model_version`/`prompt_version`/`validator_version` as
     recorded on the snapshot (these are **snapshot metadata**, not hidden reasoning — PRD §34.5's
     `ANS-004` requirement that the snapshot names its release, profile and actual model version);
   - `export`: `export_job_id`, `generated_at` (injected), `document_schema_version`, `disclaimer`.
   The builder **never** computes, infers or reformats a legal conclusion; it copies. It opens no
   corpus database (PRD §18.3 — `corpus.sqlite` is not this process's) and uses only the ids the
   snapshot already carries (PRD §35.5: *"corpus IDs copied as stable references"*).
8. **Snapshot hashing.** `pipeline/hash.ts::snapshotDigest(snapshot): string` — a canonical,
   key-sorted, UTF-8 JSON serialisation of the PRD §34.5 payload **as read from the database, before
   any licence trimming**, hashed with SHA-256 and recorded on the document as
   `provenance.source_snapshot_sha256`. This is what makes `EXP-001`'s *"Export hashes/citations match
   snapshot"* checkable by a third party: recompute from `GET /v1/answers/{id}` and compare. The
   function is pure and its canonicalisation rules are stated in the file and covered by a fixture.
9. **Ports with fail-closed strict defaults (sub-PRD D5).** `pipeline/ports.ts`:
   - `ExportLicencePort` — the `EVID-06` `applyQuotationLimits(citation, assessment, 'EXPORT')` shape.
     **Default when unbound:** `METADATA_AND_LINK_ONLY` for every citation — no quote text at all,
     metadata plus the code-generated official URL. Never unlimited.
   - `ExportSafetyPort` — the `EVID-06` `assertExportSafe(payload)` shape. **Default when unbound:** a
     built-in deny-by-shape scan that rejects any field whose name or path matches the internal set
     (`prompt`, `system_prompt`, `reasoning`, `chain_of_thought`, `thinking`, `raw_response`,
     `provider_payload`, `secret`, `token`, `api_key`, `credential`, `byok`, `notes_internal`,
     `internal_*`, `licence_notes`, `assessment_notes`, `operator_*`) at any depth, plus a value scan
     for credential-shaped strings. Basis: PRD §8.9, §9.4, §16.4, §35.3 (`notes_internal` is a real
     column name on `licence_assessment`).
   - `DisclaimerPort` — returns the disclaimer block. **Default when unbound:** a committed neutral
     English default; a renderer that cannot place it fails the render (sub-PRD **D14**).
   - `bindExportPort(kind, impl)` where `impl` carries a stable `id`. Binding the same `id` twice is a
     no-op; binding a **different** `id` for an already-bound kind fails boot naming both — so
     `XPRT-02` and `XPRT-03` may both bind `EVID-06`'s implementation without contending, and `XPRT-04`
     inherits it (**QX-2**).
   Order of application in `source.ts` is fixed and asserted: build raw document → apply licence port
   per citation → assert safety port over the whole document → freeze. A renderer never sees unlimited
   text, and nothing unsafe is ever handed to one.
10. **`pipeline/object-store.ts` — the `ObjectStorePort` and its two implementations.**
    `putObject(key, bytes, { contentType, sha256 })`, `headObject(key)`, `deleteObject(key)`,
    `signGetUrl(key, ttlSeconds)`. Implementations: an S3 adapter configured from PRD §39.6 layers
    (bucket, region `ap-southeast-2`, prefix, credential from the *S3 export credential* secret group)
    and an **in-process stub** (`apps/worker/test/exports/pipeline/object-store-stub.ts`, also exported
    for `apps/api` tests and for the three renderer tickets). Rules:
    - the key is exactly sub-PRD **D2**'s
      `exports/{organization_id}/{export_job_id}/{format}/{export_job_id}.{ext}` — opaque ids only, no
      title, no question, no filename from the client (**D18**);
    - the adapter refuses any key outside the configured `exports/` prefix, so a bug cannot write into
      `backups/` (PRD §19.2's separate least-privilege prefixes, defence in depth on top of
      `RLSE-04`'s credential);
    - **write and delete are worker-only; sign is app-only** — each implementation asserts its process
      role at construction and throws otherwise (PRD §39.2, sub-PRD **D3**);
    - server-side encryption is requested where the store supports it, and object metadata carries only
      `export_job_id`, `format`, `template_version` and `sha256` — never customer text.
11. **Lifecycle: expiry, refusal and sweep (`EXP-002`).**
    - `expires_at = job.finished_at + EXPORT_RETENTION_DAYS` (committed safe default **7**, PRD §8.9).
      Derived, not stored (**D2**).
    - `GET …/download` refuses at or after `expires_at` with `404 RESOURCE_NOT_FOUND` — identical to
      the body an unknown or foreign id produces (sub-PRD **D7**); `GET /v1/exports/{id}` still returns
      `200` with `artifact_state: 'EXPIRED'` so `XPRT-05` can explain it (PRD §16.1: HTTP status and
      domain status are separate).
    - `pipeline/retention.ts` — the `maintenance`-class sweep: for each export job past `expires_at`
      with an artifact recorded as produced, `deleteObject` the key, tolerate an already-absent object,
      bound the batch, yield, and emit a bounded log line with counts only. It never deletes a `job`
      row and never touches a snapshot (`DATA-06`'s triggers would abort it anyway).
    - If the export credential denies `DeleteObject` (**QX-7**), the sweep records a distinct,
      alertable failure code and continues — it must never fail silently, and `RLSE-04`'s bucket
      lifecycle rule remains the backstop.
12. **Signed URL minting (`EXP-002`).** `apps/api/src/routes/exports/download.ts`: resolve the job
    under `TenantContext` → check terminal success and `expires_at` → `headObject` → mint a **GET-only,
    single-object** signed URL with `min(configuredTtl, 900)` seconds, default 300 (sub-PRD **D11**) →
    `302` with `Cache-Control: no-store`. The URL is never persisted, never logged, never placed in an
    error body and never returned in a list response; logs carry `export_job_id`, `format`, the key's
    SHA-256 and the TTL only (PRD §22; §16.4's *"excluded from logs/exports/support"* standard).
13. **Cancellation.** `POST …/cancel` calls the job repository's cancellation request; the worker
    observes `ctx.signal` at the next stage boundary (`RUNT-04` deliverable 8), and a cancelled job
    that had already uploaded deletes its object before settling. A cancelled export never leaves a
    downloadable artifact, and `GET …/download` on a cancelled job is `404 RESOURCE_NOT_FOUND`.
14. **Failure semantics.** A renderer throw, an oversize document or an upload failure settles the job
    `FAILED` with a bounded failure code and **no partial artifact**: the upload stage writes the
    complete object in one call, and a failure after upload deletes it. No half-rendered file is ever
    downloadable (the export analogue of PRD §33.2's *"never publishes a partial supported answer"*).
15. **Observability, bounded.** All logging goes through `packages/observability` (`RUNT-07`): job id,
    export job id, target kind, format, stage, duration, byte length, failure code. **Never** a quote,
    a claim, a record title, a signed URL, a credential or an object's bytes (PRD §22, §37.3's
    *"Operational IDs/status/timing/cost — bounded"* row).
16. **Committed fixtures, shared with the renderer tickets** (`apps/worker/test/exports/pipeline/fixtures/`):
    `answer-snapshot.json` (PRD §34.5-shaped, `correction_state: 'NONE'`),
    `answer-snapshot-corrected.json` (`correction_state` set, an older `legal_as_at` and an older
    `corpus_release_id` — the `UAT-EXP-01` fixture), `research-record.json` with three answer versions,
    `comparison-snapshot.json`, `coverage-assessment.json`, `licence-cases.json` (a
    `METADATA_AND_LINK_ONLY`, an over-limit and an attribution-required citation) and
    `contaminated-snapshot.json` — a snapshot whose *internal* fields carry six distinct canaries (a
    prompt, a reasoning field, an API key, a BYOK credential, an internal licensing note and an
    operator comment) used by this ticket and by all three renderer tickets to prove the PRD §8.9
    exclusion mechanically. All synthetic; no customer content and nothing from `evals/gold/**`
    (PRD §45.1 item 6; plan **R9**).
17. **`pipeline/README.md`** — a short module note stating the four stages, the registry contract, the
    port defaults, the key derivation, the two enforcement points for the seven-day rule and the
    documented non-capabilities (no network, no model, no corpus, no ephemeral read, no audit write).

## Acceptance checklist (classified)

- [ ] `[machine]` **No regeneration is reachable (EXP-001, PRD §8.9).** An architecture test over
      `apps/worker/src/handlers/export/**` and `apps/api/src/routes/exports/**` finds no import of
      `packages/model-gateway`, `packages/retrieval-client`, a search client, `node:http`, `node:https`,
      `node:dns`, `undici` or a global `fetch` call, and no `ExportRenderContext` field can reach a
      database, repository or object store — asserted structurally, not by comment (sub-PRD **D4**)
- [ ] `[machine]` The route area registers exactly `POST /v1/exports`,
      `GET /v1/exports/{export_job_id}`, `POST /v1/exports/{export_job_id}/cancel` and
      `GET /v1/exports/{export_job_id}/download` under admission profile `tenant`, and no other path
      (PRD §16.2; `RUNT-01` contract items 1–4)
- [ ] `[machine]` **Renderer registry conformance:** a throw-away renderer directory created at test
      time is discovered, runs a full job and produces an artifact, with **zero** diff to any tracked
      file outside that directory; `git status --porcelain` is clean at suite end
      (plan **A1**, sub-PRD **D10**)
- [ ] `[machine]` Registry boot fails, naming the area and the offence, for: no default export; a
      `format` absent from the `packages/contracts` enum; a `format` that does not equal the directory
      name upper-cased; a duplicate `format`. None is a silent skip (`RUNT-04` contract item 3)
- [ ] `[machine]` A `POST /v1/exports` for a format with no registered renderer returns
      `400 INVALID_REQUEST` naming the field and creates **no** job
- [ ] `[fixture]` **`ExportDocument` golden.** Building the document from `answer-snapshot.json`,
      `research-record.json`, `comparison-snapshot.json` and `coverage-assessment.json` matches four
      committed golden JSON files byte for byte under the injected clock and export id, and every
      PRD §8.9 preserved element is present — legal date, corpus release, claims, citations,
      assumptions, limitations **and** correction status (PRD §8.9; §34.5; `EXP-001`)
- [ ] `[fixture]` **Correction status is preserved (`UAT-EXP-01` precondition).** Building from
      `answer-snapshot-corrected.json` yields the **original** `legal_as_at` and `corpus_release_id`,
      `correction_state !== 'NONE'` and a populated `correction_notice`; nothing in the document is
      recomputed from a current release (PRD §8.9; §41.2 `UAT-EXP-01`)
- [ ] `[machine]` **`EXP-001` hash comparability.** `snapshotDigest` over the snapshot as read equals
      the digest recomputed from the same payload with keys reordered and whitespace changed, and
      differs when any citation offset, id or claim text differs; the value is carried on the document
      as `provenance.source_snapshot_sha256` (PRD §30.2 `EXP-001` *"Export hashes/citations match
      snapshot"*)
- [ ] `[machine]` **Citations are copied, never re-derived.** Every citation on the document has the
      same `id`, `document_version_id`, `node_version_id`, `start_offset`, `end_offset`, `role`,
      `legal_status` and effective interval as the snapshot row; a property test over generated
      snapshots finds no divergence (PRD §15.3; §35.5; `EXP-001`)
- [ ] `[machine]` **Licence limits are applied once, and fail closed (PRD §8.9, §11.1).** With the
      `ExportLicencePort` **unbound**, every citation on the document carries **no quote text** and a
      complete metadata-plus-official-link block; with a stub bound, no quote exceeds the effective
      limit for any generated input, a trimmed quote is marked `quote_trimmed: true` with the applied
      limit, and required attribution is present. No code path yields an unlimited quote
      (sub-PRD **D5**; `EVID-06` deliverables 2–6)
- [ ] `[machine]` Binding the same port `id` twice is a no-op; binding a different `id` for an already
      bound kind fails boot naming both — so `XPRT-02` and `XPRT-03` can both bind `EVID-06`'s
      implementation and `XPRT-04` inherits it (**QX-2**)
- [ ] `[fixture]` **Nothing PRD §8.9 excludes survives.** Building the document from
      `contaminated-snapshot.json` rejects or strips **all six** canaries — prompt, hidden reasoning,
      API key, BYOK credential, internal licensing note, operator comment — and a recursive scan of the
      serialised document finds none of them by value or by field name; with the safety port unbound
      the built-in deny-by-shape default produces the same result (PRD §8.9; §9.4; §16.4; `SEC-003`)
- [ ] `[machine]` **The disclaimer is present and non-removable.** Every built document carries a
      non-empty disclaimer block; no configuration value, option or port implementation can produce a
      document without one, asserted at type level and at runtime (PRD §11.2; §8.10; sub-PRD **D14**)
- [ ] `[machine]` **Ephemeral content is unreachable (PRD §10.4).** An `EPHEMERAL` target is refused
      `400 INVALID_REQUEST` naming the field; a source scan proves no import of
      `packages/database`'s ephemeral entry point anywhere in this file-scope (sub-PRD **D8**;
      `DATA-08`)
- [ ] `[machine]` **Tenant isolation, co-located (PRD §21.2, `SEC-001`, `UAT-AUTH-03`).** For create,
      get, cancel and download: another organisation's target id and export job id return a
      `404 RESOURCE_NOT_FOUND` body byte-identical (apart from `request_id`) to an unknown id; the
      worker re-authorises tenant and actor **before each stage** (`RUNT-04` deliverable 5); and an
      object key built for organisation A is never readable through organisation B's job
- [ ] `[machine]` **Idempotency (`ANS-003` shape, PRD §34.1).** The same actor/route/`Idempotency-Key`
      /body returns the original export job and creates exactly one job row under 20 concurrent
      admissions; a changed body returns `409 IDEMPOTENCY_CONFLICT`; a key shorter than 16 or longer
      than 128 characters returns `400 INVALID_REQUEST` (`RUNT-02` deliverable 10; `ASSR-05` confirms)
- [ ] `[machine]` **The seven-day rule is enforced twice (`EXP-002`).** A download requested at
      `expires_at - 1s` succeeds; at `expires_at` and after it returns `404 RESOURCE_NOT_FOUND` even
      though the object still exists in the stub; the sweep then deletes the object, is idempotent
      against an already-absent object, and records an alertable failure code when delete is denied
      (PRD §8.9; §19.2; sub-PRD **D2**, **QX-7**)
- [ ] `[machine]` **Signed URLs are short-lived and never leak.** The minted URL is GET-only, bound to
      one key, has TTL ≤ 900 s (default 300), and appears in **no** log line, error body, list
      response or job row — asserted by a canary scan over captured logs and responses
      (PRD §8.9; §22; sub-PRD **D11**)
- [ ] `[machine]` **Process-role split (PRD §39.2, §39.4).** The object-store adapter refuses
      `putObject`/`deleteObject` when constructed in the app role and refuses `signGetUrl` in the
      worker role; any key outside the configured `exports/` prefix is refused (sub-PRD **D3**)
- [ ] `[machine]` **Nothing customer-readable leaves in a key or a header.** The object key, the object
      metadata and the `Content-Disposition` filename contain only opaque ids and the format; a fixture
      whose record title and question carry canaries produces none of them in any of the three
      (PRD §41.1; §19.2; sub-PRD **D18**)
- [ ] `[machine]` **Queue class and fairness.** The render handler registers on `queue: 'exports'` and
      the sweep on `queue: 'maintenance'`; a `RUNT-04` fairness test shows the export job does not
      claim while an `interactive_quick` or `interactive_research` job is queued or running
      (PRD §39.5)
- [ ] `[machine]` **Retry safety.** Re-running `LOAD`, `RENDER` and `UPLOAD` after a simulated crash
      produces the same key and byte-identical content (deterministic render, deterministic key), and
      the `FINALISE` stage — declared `idempotent: false` — is never executed twice, asserted with a
      side-effect counter equal to 1 (PRD §39.5 *"only idempotent stages are retried"*; §18.5)
- [ ] `[machine]` **Cancel and failure leave nothing downloadable.** A job cancelled after upload has
      its object deleted and returns `404` on download; a renderer throw settles `FAILED` with a
      bounded code and no artifact remains (PRD §42.5; §33.2's partial-result principle)
- [ ] `[machine]` **Bounded observability.** A canary scan over every log line emitted during a full
      export finds no quote, claim, record title, signed URL or credential — ids, codes, counts and
      timings only (PRD §22; §37.3)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — enums and request/response types are
      consumed from generated `packages/contracts`; no binding is hand-edited (PRD §20.1; `DEV-001`)
- [ ] `[machine]` **Writeback item:** sub-PRD **QX-7** in `docs/prd/19-exports/README.md` records the
      TTL actually shipped and whether `RLSE-04`'s credential grants `DeleteObject`; **QX-9**/**QX-10**
      record which enums and OpenAPI paths were found versus requested (plan §1.1; CLAUDE.md issue #53)
- [ ] `[human]` **`UAT-EXP-02`** (PRD §41.2): using a signed export URL after expiry, and using one as
      another tenant, are both denied, and the artifact is gone by seven days. Run by the founder
      against the deployed surface with `RLSE-04`'s real bucket; automated offline by `ASSR-06`, with
      the tenant half also covered by `ASSR-01`
- [ ] `[human]` **`UAT-EXP-01` precondition** (PRD §41.2): the document built from an old corrected
      answer shows the original legal date and release plus the correction notice. The visible artifact
      half is `XPRT-02`/`XPRT-03`/`XPRT-04`'s
- [ ] `[human]` **PRD §43.4 founder review**, item 1 (*"any cross-tenant/PII/security failure"*): the
      founder reviews the tenant matrix and the signed-URL policy — TTL, no persistence, no logging —
      before the first paid pilot
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md): request an export of a saved answer, watch it reach
      `COMPLETED`, download it, and confirm the link stops working after the configured TTL
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**EXP-001**, **EXP-002**,
      `UAT-EXP-01`, `UAT-EXP-02`, `UAT-AUTH-03`, `E26-EXPORT`), user-visible change and non-goals,
      schema/API/event compatibility (consumes generated types; new `/v1/exports` paths), tenant/PII/
      security **and retention** impact (seven-day artifact lifetime, signed-URL TTL, no ephemeral
      read, no audit row — **QX-8**), source/licence impact (licence limits applied once, fail-closed),
      cost/memory/latency impact against the PRD §39.2 384 MiB worker budget, rollback path (revert;
      `XPRT-02`…`XPRT-05` and `ASSR-05` consume this ticket), known gaps (**QX-1**, **QX-2**, **QX-7**,
      **QX-8**)
- [ ] No further `[fixture]` classes — the fixtures here are synthetic snapshots authored by this
      ticket; PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays belong to other modules
      (plan §1.1)
- No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: **no network, no AWS account, no
AWS credential, no model provider, no corpus database**. The object store is `XPRT-01`'s in-process
stub throughout (sub-PRD **D16**).

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/api package name> --filter <the apps/worker package name>`; suites
   live under `apps/api/test/exports/` and `apps/worker/test/exports/pipeline/`. Then `pnpm test` and
   `pnpm test:integration` from the root, and `pnpm generate && pnpm generated:check`.
3. **Harness.** Copy the construction patterns already in the repository rather than inventing new
   ones: `RUNT-04`'s `apps/worker/test/handler-area-conformance.ts` (temp handler area + fake clock),
   `RUNT-02`'s `apps/api/test/admission/**` (route + admission assertions),
   `packages/database/test/architecture/**` (`DATA-02`'s unscoped-import scan) for the architecture
   test, and `DATA-06`'s `packages/database/test/research/factories.ts` for seeding a snapshot.
4. **`architecture.test.ts`** — scan `apps/worker/src/handlers/export/**` and
   `apps/api/src/routes/exports/**` for the forbidden imports and for any `fetch(`; assert none. Then
   assert by construction that `ExportRenderContext` has no field of a database, repository or object
   store type.
5. **`registry-conformance.test.ts`** — the exported harness: create `handlers/export/zz-test/`, boot,
   run a job, assert the artifact and the key, delete the directory, assert `git status --porcelain` is
   clean. Then the four boot-failure cases, each asserting the area name appears in the error.
6. **`document-golden.test.ts`** — build the document from each of the four target fixtures with a
   fixed clock and export id; compare against the committed goldens; assert the PRD §8.9 preservation
   list element by element against a literal expectation list so a dropped field fails loudly.
7. **`correction-preserved.test.ts`** — `answer-snapshot-corrected.json`: assert the original
   `legal_as_at` and `corpus_release_id` survive and `correction_notice` is populated; mutate the
   fixture's release id and assert the document follows the *fixture*, never a current release.
8. **`snapshot-digest.test.ts`** — canonicalisation properties (key order, whitespace, unicode
   normalisation) and sensitivity (one changed offset changes the digest).
9. **`licence-port.test.ts`** — unbound port: assert every citation is metadata-and-link-only. Bound
   stub: property test over ≥ 1,000 generated citations asserting no quote exceeds the effective limit,
   trimmed quotes are marked, attribution survives. Then attempt to bind a second, different port id
   and assert the named boot failure.
10. **`export-safety.test.ts`** — `contaminated-snapshot.json`: assert each of the six canaries is
    absent from the serialised document by value **and** by field name, with the port unbound and with
    a stub bound.
11. **`admission.test.ts`** — cross-tenant matrix (create/get/cancel/download × foreign id × unknown
    id) asserting byte-identical bodies apart from `request_id`; ephemeral refusal; unknown format
    refusal; idempotency replay, conflict and key-length bounds; the concurrent-export ledger
    rejection shape (`429 RATE_LIMITED` with `Retry-After`, no other-tenant data).
12. **`lifecycle.test.ts`** — with a controllable fake clock: sign at `expires_at - 1s` (success), at
    `expires_at` and after (`404`, body compared against the unknown-id body); run the sweep and assert
    the stub no longer holds the object; run it again and assert idempotence; make the stub deny delete
    and assert the alertable failure code with no exception escaping the batch.
13. **`signed-url.test.ts`** — assert GET-only, single-key, TTL ≤ 900 with default 300, `no-store`, and
    scan captured logs/responses for the URL substring: none.
14. **`process-role.test.ts`** — construct the adapter in each role and assert the refusals; attempt a
    key outside the `exports/` prefix and assert refusal.
15. **`retry.test.ts`** — abort the worker after `UPLOAD` commits its checkpoint, restart, drain;
    assert the same key, byte-identical content, and a `FINALISE` side-effect counter of exactly 1.
16. **`cancel-and-failure.test.ts`** — cancel after upload (object deleted, download `404`); renderer
    throw (job `FAILED`, no object); upload failure (no partial object).
17. **`logging.test.ts`** — canary scan over every emitted log line.
18. **Reviewer focus.** Confirm that (a) there is genuinely no path from a renderer to retrieval, a
    model or the network; (b) licence limits are applied in exactly one place and cannot be bypassed by
    a renderer; (c) the download refusal for expired, cancelled, failed, foreign and unknown ids is
    the *same* response; (d) the object key contains no customer text; (e) the sweep cannot delete
    anything outside the `exports/` prefix; (f) no signed URL is persisted anywhere.
19. **`[human]` steps**, last, against a deployed stack (`pnpm stack:up` for the local half,
    `RLSE-04`'s bucket for the real half): `UAT-EXP-02` end to end; the founder review of the
    signed-URL policy; the Gate 2 smoke path.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/19-exports/README.md` (version +0.1 with a changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Derived artifact identity (sub-PRD D2) proves insufficient** — for example the product genuinely
  needs a stored `sha256`, byte length or expiry per artifact that cannot be derived or recomputed. →
  Do **not** create a table, a migration or a column: plan **A3**/**R4** and PRD §45.2 forbid it. Write
  the requirement into `docs/prd/breakdown-plan.md` §5.2 (a new `01-app-data` ticket) and §5.20/§6.2
  (the new `blocked_by` edge), plus `docs/prd/19-exports/README.md` **D2**, and only then implement.
- **A job repository operation this pipeline needs does not exist** (**QX-1**, no `DATA-05` edge). →
  Same path: a new or amended `01-app-data` ticket plus the plan edge, written first. Never write
  `packages/database/**` or `packages/jobs/**` from here.
- **`RLSE-04`'s export credential denies `DeleteObject`, or the bucket/prefix/region config keys differ
  from what this ticket assumes** (**QX-7**). → The credential and the prefix are `RLSE-04`'s
  (plan §4.2). Record the actual key names and the delete grant in
  `docs/prd/19-exports/README.md` **QX-7**, raise a docs change against `RLSE-04` if the grant is
  needed, and keep the sweep's alertable failure path until it is granted. Never widen the credential
  from here and never write `infra/aws/**`.
- **`packages/contracts` has no `ExportFormat`, export job type or `ExportTargetKind`** (**QX-9**), or
  `schemas/openapi/openapi.yaml` has no `/v1/exports` paths (**QX-10**). → Raise a docs change against
  `FND-03`/`FND-04`, merge, `--sync`, regenerate, then code. A local string union or a hand-edited
  binding violates PRD §20.1 and `DEV-001`, and would strand `XPRT-05` and the SDKs.
- **`EVID-06`'s port shape does not match `ExportLicencePort`/`ExportSafetyPort`.** → Amend **this
  ticket** and `EVID-06` in one docs PR and `--sync` both; never write `packages/citations/**` from
  here and never let the pipeline compute its own limit — `EVID-06`'s own feedback obligation names
  that as the way a licence breach ships unnoticed.
- **A renderer needs something the frozen `ExportDocument` does not carry** (`XPRT-02`/`XPRT-03`/
  `XPRT-04` will hit this first). → Add the field **here**, to the document builder, in this ticket's
  files, and record it in `docs/prd/19-exports/README.md`. Never hand a renderer a repository, a
  client or an unfrozen object as a workaround — that would dismantle sub-PRD **D4**, which is the
  only mechanical guarantee behind PRD §8.9's no-regeneration rule.
- **An export needs a PRD §35.6 `audit_event`** (**QX-8**). → Record it in
  `docs/prd/19-exports/README.md`, then take the plan edge (`DATA-07 → XPRT-01`) in
  `docs/prd/breakdown-plan.md` §5.20/§6.2. Bounded structured logs in the interim; never a local audit
  table.
- **The PRD §38.5 concurrent-export limit of 1 makes a required flow impossible.** → It is an *initial
  default* and therefore configuration with the PRD value as the committed safe default (PRD §39.6
  layer 1). A change to the shipped default is a **benchmark-selected configuration** decision
  (PRD §45.5) needing measured evidence in the PR's cost/latency line — not an implementation detail.

**3. Escalation — two non-negotiable classes.**

- **Anything that would require regenerating an answer at export time** — a missing field that "could
  just be re-retrieved", a citation that "could be re-fetched from the current corpus", a summary that
  "could be re-synthesised for the PDF" — overturns PRD §8.9's *"They MUST NOT regenerate the answer
  using current law"* and with it `EXP-001` and `UAT-EXP-01`. Stop, escalate for re-review through the
  PRD §45.5 product-change path, and write back to `docs/prd/19-exports/README.md` **and**
  `docs/prd/breakdown-plan.md` before any code. Never add a retrieval or model dependency to this
  file-scope as a local fix.
- **Anything that would put an artifact outside the seven-day, separately permissioned, signed-URL
  boundary** — a permanent public URL, an unexpiring link, an artifact written outside the `exports/`
  prefix, a URL stored on a row or emitted into a log — overturns PRD §8.9, §19.2 and `EXP-002`, and is
  a customer-data exposure, not a convenience trade-off. Escalate before it ships.
