---
id: XPRT-02
title: "PDF renderer"
module: 19-exports
lane: 19-exports
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [XPRT-01, EVID-06]
blocks: [XPRT-05, LNCH-02]
---

# XPRT-02 — PDF renderer

Implements PRD §8.9 and §11.2 — requirement **EXP-001**, epic `E26-EXPORT`.
No ADR **for the behaviour** — the decision is already made in PRD §8.9 (what an export preserves and
excludes), §11.1/§11.2 (licence limits and the mandatory disclaimer) and §32.3 (the fixed order in
which an answer is presented); this is build ticket 2 of 5 against it. This ticket **does** create one
ADR for a durable dependency choice — `docs/adr/NNNN-export-renderer-toolchain.md`, sub-PRD **QX-5**,
PRD §45.5 *"Architecture decision"* — because the PDF/DOCX library is a permanent, release-archived,
memory-bounded dependency the PRD does not name.
Parent sub-PRD: [19-exports README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [XPRT-01 — Export job admission, S3 lifecycle and signed URLs](XPRT-01-export-job-admission-s3-lifecycle-and-signed-urls.md)
· `EVID-06` — Licence-aware quotation, display and export limits
([`12-evidence-safety`](../../12-evidence-safety/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`XPRT-01` froze the `ExportRenderer` contract and hands over an already-limited, already-safety-checked
frozen document; this lays it out on a page. Not a new subsystem decision.

## Background + basis

**PRD §8.9**, the two sentences this renderer is accountable for:

> **Exports MUST preserve legal date, corpus release, claims, citations, assumptions, limitations and
> correction status. They MUST NOT regenerate the answer using current law.**
>
> **Licensing rules MUST restrict excerpt length. Hidden prompts/reasoning, secrets and internal
> licensing notes MUST be excluded.**

**PRD §11.2 — legal positioning**, verbatim:

> - The product provides information, evidence-grounded research and conditional guidance, not legal
>   representation.
> - **It MUST include clear disclaimers in the Web app, widget and exports.**
> - It MUST NOT state that a customer is definitely compliant.

and **PRD §8.10**'s non-removability principle, which sub-PRD **D14** applies to the artifact: *"The
disclaimer, citations and product-source indicator MUST NOT be removable by customer theming."*

**PRD §11.1**, the licensing rule that binds the artifact exactly as it binds the screen: *"Unclear
rights default to metadata, limited quotation and official links. The product MUST NOT reproduce
third-party commercial headnotes or imply government endorsement. **Customer exports MUST apply the
same restrictions.**"* `EVID-06` is the single implementation of that rule (its sub-PRD **D12**: *"one
limit function, used identically by display and export; trimming is visible, never silent"*), and
`XPRT-01` applies it once, before this renderer is called (sub-PRD **D5**).

**PRD §32.3** fixes the order in which a completed answer is presented to a human. The PDF follows it,
so the document a customer prints is recognisably the document they read:

> 1. status badge and short answer;
> 2. legal date, jurisdictions, corpus release and freshness banner;
> 3. numbered explanation/application claims;
> 4. conditions and assumptions with "impact if false";
> 5. practical next checks;
> 6. limitations/missing facts;
> 7. authority table;
> 8. actions …

(Item 8 is a screen affordance and has no print equivalent; the artifact ends with provenance and the
disclaimer instead.)

**PRD §30.2 `EXP-001`**: *"Existing snapshots export to PDF, DOCX and versioned JSON without
regeneration … **Export hashes/citations match snapshot**."*
**PRD §41.2 `UAT-EXP-01`**: *"Export old corrected answer → **Export shows original legal date/release
and correction banner; no regeneration**."* The correction **banner** is a visible-artifact
obligation, and this ticket is one of the two places it becomes visible.
**PRD §13.1**: *"Application, API, SDK, widget, alerts, **exports** and generated answers MUST be
English."*
**PRD §37.5**: *"all links and source metadata are constructed from system records"* — every URL in the
artifact is the code-generated `official_url` the snapshot carries, rendered as visible text.
**PRD §39.2** caps the worker at **384 MiB** and PRD §19.1 forbids production to *"compile application
code"*; PRD §20.3 requires CI to build *"one immutable app artifact"* that production runs *"without
floating installs or builds"*. Together these rule out a browser engine and any system binary that is
not inside `RLSE-01`'s release archive — the constraint behind sub-PRD **QX-5**.

**The contract this ticket implements** — `XPRT-01`'s renderer registry contract, items 2, 4, 5, 6 and
7: a default-exported `ExportRenderer` in `apps/worker/src/handlers/export/pdf/index.ts`;
`render(doc, ctx)` receives a **deeply frozen `ExportDocument`** that is already licence-limited and
already asserted export-safe, plus `{ now, exportId, templateBaseDir, logger, signal }` and **nothing
else** — no database, no repository, no object store, no client; output must be deterministic; adding
this directory produces zero diff outside it; and *"It may narrow a quote further but never lengthen
one; it must place the disclaimer block and every required attribution; it must treat all document text
as literal data, never markup."*

**Accepted caveats carried forward, documented not enforced here:**

- **The PDF/DOCX library is not named by the PRD** (sub-PRD **QX-5**). This ticket chooses it, records
  the choice and the rejected alternatives in `docs/adr/NNNN-export-renderer-toolchain.md`
  (plan **A9**, slug reserved to this ticket), and `XPRT-03` follows it. The constraints are fixed and
  non-negotiable: offline, deterministic bytes, bounded memory under 384 MiB, no browser engine, no
  system binary outside the release archive, embedded fonts, extractable text layer.
- **The dependency must be declared in `apps/worker/package.json`, which `03-app-runtime` owns**
  (sub-PRD **D15**, **QX-4**). Raise it as a docs change against `RUNT-04` **first**, merge, `--sync`,
  then implement. Do not edit the manifest from this ticket.
- **The disclaimer copy is `24-launch`'s** (`LNCH-01`, `docs/policies/**`), and `LNCH-02` — which is
  `blocked_by` this ticket — supplies the approved wording through `XPRT-01`'s `DisclaimerPort`. This
  ticket renders whatever the port returns and ships no policy prose of its own.
- **WCAG 2.2 AA is a screen target** (PRD §13.1 lists *"Web and widget"*). A PDF cannot be held to the
  same automated bar, so this ticket requires document language and title metadata, a real extractable
  text layer, a logical reading order and text-plus-label status indicators (never colour alone), and
  states explicitly that full PDF/UA tagging is **not** claimed. Recorded as a known gap in the PR.

## Goal

Produce `apps/worker/src/handlers/export/pdf/**`: a registered `ExportRenderer` for format `PDF` that
lays the frozen `ExportDocument` out in the PRD §32.3 order, preserves every PRD §8.9 element
(legal date, corpus release, claims, citations, assumptions, limitations, correction status), carries
the disclaimer and every required attribution non-removably, renders licence-limited excerpts with a
visible "excerpt limited by licence" marker and the official link, treats all text as literal data,
and produces deterministic bytes within the worker's memory budget. Completion is mechanically
checkable: two renders of the same document are byte-identical; a golden comparison over committed
fixtures passes on extracted text, structure and byte hash; extracting the text of the contaminated
fixture's artifact finds none of the six PRD §8.9 canaries; no quote in the artifact exceeds
`EVID-06`'s effective limit; the disclaimer is present in every fixture; and the renderer boots with
zero diff outside its own directory.

## Non-goals

- **No DOCX or JSON output.** `XPRT-03`, `XPRT-04` — sibling directories, same registry, same document.
- **No job admission, S3 upload, signed URL, expiry, sweep, registry, document builder, port or
  hashing.** `XPRT-01`, which is `blocked_by`-ordered before this ticket. If the document lacks a field
  this layout needs, it is added **there** (see Feedback obligation), never fetched here.
- **No licence limit, trimming rule, attribution rule or export-exclusion list.** `EVID-06`
  (`packages/citations/src/licensing/**`). This ticket **binds** `EVID-06`'s implementation into
  `XPRT-01`'s ports and calls nothing else; it may narrow a quote (for layout) but never lengthen one.
- **No disclaimer, Terms, Privacy or AUP prose.** `24-launch` (`LNCH-01`); `LNCH-02` is `blocked_by`
  this ticket and supplies the copy through the port.
- **No retrieval, model, corpus or network access of any kind.** Structurally impossible under
  `XPRT-01`'s contract item 4 and asserted again here (sub-PRD **D4**; PRD §8.9).
- **No markup interpretation or sanitisation.** `EVID-10` owns sanitisation for the screen; this
  renderer needs none because it never interprets markup (sub-PRD **D6**).
- **No export screen.** `XPRT-05`, which is `blocked_by` this ticket.
- **No `apps/worker/package.json` edit.** `03-app-runtime` (**D15**, **QX-4**).
- **No cross-boundary suites.** `tests/**` is `23-assurance` (`ASSR-06` automates `UAT-EXP-01`).
  Co-located assertions here per plan **R8**.

## File-scope (write-owns)

- `apps/worker/src/handlers/export/pdf/**` (exactly plan §5.20).
- `apps/worker/test/exports/pdf/**` — this ticket's own tests, golden files and fonts fixture
  (sub-PRD **D16**).
- `docs/adr/NNNN-export-renderer-toolchain.md` — a **new** file claimed by this ticket under plan
  **A9** (*"ownership is per file, claimed by the ticket that creates `NNNN-<slug>.md`"*). Take the
  lowest unused four-digit number at build time; the slug `export-renderer-toolchain` is reserved to
  this ticket by sub-PRD **QX-5**.

Does not touch:

- `apps/worker/src/handlers/export/{index.ts,pipeline/**}` — `XPRT-01`;
  `apps/worker/src/handlers/export/{docx,json}/**` — `XPRT-03`, `XPRT-04`;
  `apps/worker/test/exports/{pipeline,docx,json}/**` — the same three tickets.
- `apps/worker/src/{main.ts,runtime,queues}/**`, `handlers/maintenance/**` — `RUNT-04`.
- `apps/api/**` — `RUNT-01`/`RUNT-02` and `XPRT-01`; `apps/web/**` — `RUNT-05`/`XPRT-05`.
- `packages/citations/**` — `12-evidence-safety` (`EVID-06`); `packages/database/**`,
  `packages/jobs/**` — `01-app-data`; `packages/contracts/**` — `00-foundation`;
  `packages/ui/**`, `packages/observability/**` — `03-app-runtime`.
- `infra/**` — `18-ops-release`/`RUNT-09`; `tests/**` — `23-assurance`; `docs/policies/**` —
  `24-launch`; `docs/PRD.md` — frozen.
- `apps/worker/package.json`, `apps/worker/tsconfig.json` — `03-app-runtime` (**D15**).

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/worker/src/handlers/export/pdf/**` and nothing
contends for it. `XPRT-01` is merged before this ticket starts (`blocked_by`), and it deliberately
writes no file under a renderer directory. The two concurrent siblings are `XPRT-03`
(`handlers/export/docx/**`) and `XPRT-04` (`handlers/export/json/**`) — different directories, no
shared file: under `XPRT-01`'s registry contract (plan **A1** one level down, sub-PRD **D10**) the
registry is a **directory scan, not a list**, so all three add their area with zero diff outside it and
run as three concurrent lanes (plan §7: 5 tickets, 3 waves, 3 useful lanes). The only shared-additive
path is `docs/adr/`, where ownership is per file (**A9**) and this slug is reserved to this ticket;
`XPRT-03` reads that ADR and does not write it. Per plan **A3** this ticket writes no table; per
PRD §45.2 it enforces no tenant or PII boundary — the document it receives was already resolved under
`TenantContext` by `XPRT-01`.

## Deliverables

1. **`docs/adr/NNNN-export-renderer-toolchain.md`** (PRD §45.5 *"Architecture decision"*, plan **A9**,
   sub-PRD **QX-5**). States: the constraint list (offline; deterministic bytes; bounded memory under
   the PRD §39.2 **384 MiB** worker limit; no browser engine; no system binary outside `RLSE-01`'s
   release archive; embedded fonts; extractable text layer; permissive licence compatible with the
   product's own distribution); the chosen PDF library and the chosen DOCX library (so `XPRT-03`
   inherits a decided answer); the measured peak RSS and wall time for the largest fixture; the
   rejected alternatives **with reasons** (headless browser — memory and release-archive violation;
   LaTeX/system binary — PRD §19.1/§20.3; server-side HTML-to-PDF service — PRD §19.2's object-store
   and data-boundary rules and a new network dependency in a path that must have none); and the
   consequence that `XPRT-03`, `XPRT-05` and `LNCH-02` depend on it.
2. **`apps/worker/src/handlers/export/pdf/index.ts`** — the default-exported `ExportRenderer`:
   `format: 'PDF'` (from `packages/contracts`), `extension: 'pdf'`,
   `contentType: 'application/pdf'`, `templateVersion: 'pdf-1'` (bumped whenever output bytes change,
   recorded in the artifact metadata by `XPRT-01`), and `render(doc, ctx)`.
3. **Port binding (sub-PRD D5).** On module load, bind `EVID-06`'s implementations into `XPRT-01`'s
   ports through `bindExportPort` with `EVID-06`'s stable ids: the licence matrix
   (`applyQuotationLimits`) and `assertExportSafe`. Binding is idempotent by id, so `XPRT-03` binding
   the same implementations is a no-op and `XPRT-04` inherits them (**QX-2**). This renderer performs
   **no** limit arithmetic of its own.
4. **Layout in the PRD §32.3 order**, one section per item, each with a visible heading:
   1. **Status and short answer** — the answer `status` as **text plus a shape/label**, never colour
      alone (PRD §41.1's principle applied to print), followed by the short answer.
   2. **Legal context banner** — `legal_as_at` rendered as `3 Aug 2026` (PRD §41.1), jurisdictions,
      `corpus_release_id`, `knowledge_cutoff_at`, and — when `correction_state !== 'NONE'` — the
      **correction banner** immediately above it, stating that the answer was corrected/superseded and
      naming the correction id (`UAT-EXP-01`).
   3. **Numbered claims** — `sequence`, `kind`, text, `support_status` as text, and the citation
      markers linking to the authority table entries by number.
   4. **Assumptions** — text, `source`, `confirmed`, and **impact if false** (PRD §32.3 item 4 names it
      explicitly; PRD §8.9 lists assumptions among the preserved elements).
   5. **Practical next checks** — the `next_checks` list.
   6. **Limitations and missing facts** — the `limitations` list.
   7. **Authority table** — one row per citation: number, authority/title, pinpoint, legal status,
      effective interval, authority role (`SUPPORTS`/`QUALIFIES`/`CONTRADICTS`/`DEFINES`/
      `BACKGROUND_ONLY`), the **licence-limited excerpt** with its trimming marker where trimmed, the
      attribution where required, and the official URL **as visible text** (PRD §37.5).
   8. **Provenance and disclaimer** — export job id, generated-at, source id and
      `source_snapshot_sha256`, snapshot created-at, corpus release, model profile/version and
      validator version as recorded on the snapshot (PRD §34.5/`ANS-004` metadata, not reasoning),
      then the disclaimer block from the `DisclaimerPort`.
5. **Licence rendering rules, verbatim from the document, never re-derived.** A citation whose
   `quote` is absent (metadata-and-link-only, or a zero effective limit) renders its metadata and
   official link with an explicit, human-readable note that the excerpt is unavailable under the source
   licence — a first-class outcome, not an error and not an empty cell. A citation with
   `quote_trimmed: true` renders the excerpt, the ellipsis marker the document already carries, and a
   visible "excerpt limited by licence" note. Attribution, where the document carries it, is rendered
   adjacent to the excerpt and cannot be suppressed by any option.
6. **Everything is literal text (sub-PRD D6).** No HTML or Markdown is parsed; no external resource
   (image, font, stylesheet, URL) is fetched; no JavaScript, embedded file, launch/URI action,
   auto-print action or open-action is written into the PDF; annotations are limited to plain link
   annotations pointing at the document's own code-generated `official_url` values, and the URL is
   always **also** printed as text so the artifact survives a printout.
7. **Determinism (sub-PRD D13).** `CreationDate`/`ModDate` come from `ctx.now`; the document id is
   derived from `ctx.exportId` (never random); no producer string carries a build timestamp; fonts are
   embedded from a committed fixture with a fixed subsetting order; object ordering, XRef layout and
   compression settings are fixed. `render()` calls no `Date.now()`, `Math.random()` or `process.env` —
   asserted by a source scan and by rendering twice and comparing SHA-256.
8. **Bounded resources.** Rendering streams section by section and never materialises more than one
   configured chunk in memory; a document exceeding a configured page/byte ceiling fails with a bounded
   error code rather than exhausting the worker (PRD §39.2's 384 MiB). Peak RSS and wall time for the
   largest fixture are measured and recorded in the ADR and in the PR's cost/memory/latency line
   (PRD §45.4).
9. **Cancellation.** `ctx.signal` is honoured between sections; an aborted render returns promptly and
   produces no artifact (`XPRT-01` deletes any object and settles the job).
10. **Document metadata.** Title (opaque: `Export {export_job_id}`), language `en-AU` (PRD §13.1),
    producer/creator naming the product, and **no** author, subject or keyword field carrying customer
    text (sub-PRD **D18**).
11. **`apps/worker/test/exports/pdf/goldens/**`** — committed goldens for each of `XPRT-01`'s shared
    fixtures: the extracted **text layer** (`.txt`), a normalised **structure outline**
    (`.structure.json`: sections, headings, table rows, annotation targets, font list, page count) and
    the **SHA-256** of the rendered bytes. A change to any of the three fails loudly and must be
    accompanied by a `templateVersion` bump.
12. **`apps/worker/test/exports/pdf/extract.ts`** — the text/structure extraction helper used by the
    goldens and by every content assertion, exported so `XPRT-03` can copy its shape for OOXML and so
    the exclusion scans in this ticket run against **what a reader actually sees**, not against the
    input document.

## Acceptance checklist (classified)

- [ ] `[machine]` The renderer registers through `XPRT-01`'s registry with `format: 'PDF'` matching its
      directory name, and adding this directory produces **zero** diff outside it — asserted with
      `apps/worker/test/exports/pipeline/renderer-conformance.ts` (`XPRT-01` deliverable 6; plan **A1**)
- [ ] `[fixture]` **Golden comparison** for every shared fixture (`answer-snapshot`,
      `answer-snapshot-corrected`, `research-record`, `comparison-snapshot`, `coverage-assessment`,
      `licence-cases`): extracted text, normalised structure outline and byte SHA-256 all match the
      committed goldens (sub-PRD **D13**; `EXP-001`)
- [ ] `[fixture]` **PRD §8.9 preservation, read from the artifact.** The extracted text of the
      `answer-snapshot` artifact contains the legal date, every jurisdiction, the corpus release id,
      every claim's text and support status, every citation's pinpoint/role/effective interval/official
      URL, every assumption **and its impact-if-false**, every limitation and the correction status —
      asserted element by element against a literal expectation list derived from the fixture
      (PRD §8.9; §32.3)
- [ ] `[fixture]` **`UAT-EXP-01` artifact half.** The `answer-snapshot-corrected` artifact shows a
      **correction banner** and the **original** legal date and corpus release; no current-law value
      appears anywhere in the extracted text (PRD §41.2 `UAT-EXP-01`; §8.9)
- [ ] `[machine]` **No regeneration is reachable.** A source scan of `handlers/export/pdf/**` finds no
      import of `packages/model-gateway`, `packages/retrieval-client`, a search client,
      `packages/database`, `node:http(s)`, `node:dns` or `fetch`, and no filesystem read outside
      `ctx.templateBaseDir` (sub-PRD **D4**; PRD §8.9)
- [ ] `[fixture]` **Nothing PRD §8.9 excludes appears in the artifact.** Rendering
      `contaminated-snapshot.json` and scanning the **produced bytes and the extracted text** finds
      none of the six canaries — prompt, hidden reasoning, API key, BYOK credential, internal licensing
      note, operator comment — and none of their field names (PRD §8.9; §9.4; §16.4; `SEC-003`)
- [ ] `[machine]` **Excerpt-length licence limits hold in the artifact.** For every citation in
      `licence-cases.json`, the excerpt text extracted from the PDF is at or below `EVID-06`'s
      effective `EXPORT` limit; a `METADATA_AND_LINK_ONLY` citation yields **no excerpt text** and a
      complete metadata-plus-official-link block; a trimmed excerpt carries its marker and the visible
      "excerpt limited by licence" note; required attribution is present. No option, flag or layout
      path lengthens a quote (PRD §11.1; §8.9; §36.6; `EVID-06`)
- [ ] `[machine]` With the licence port **unbound** (the `XPRT-01` fail-closed default), the artifact
      contains no excerpt text at all and still renders completely — proof that the strict default is a
      usable outcome and not a crash (sub-PRD **D5**)
- [ ] `[machine]` **The disclaimer is present and non-removable.** Every fixture's artifact contains the
      `DisclaimerPort` block; no option, configuration value or trimming path removes it or an
      attribution; a test that stubs an empty disclaimer asserts the render **fails** rather than
      emitting a disclaimer-free artifact (PRD §11.2; §8.10; sub-PRD **D14**)
- [ ] `[machine]` **Determinism.** Two renders of the same document with the same `ctx` produce
      byte-identical output; a source scan finds no `Date.now()`, `Math.random()` or `process.env`; the
      PDF carries no build timestamp and no random document id (sub-PRD **D13**)
- [ ] `[machine]` **The PDF is inert.** The produced file contains no `/JavaScript`, `/JS`,
      `/OpenAction`, `/AA`, `/Launch`, `/EmbeddedFile` or `/RichMedia` entry, and every link annotation
      targets a URL that appears in the document's own citation list — asserted by parsing the produced
      bytes (PRD §37.5; §21.1; `SEC-003`; sub-PRD **D6**)
- [ ] `[machine]` **No customer text in metadata.** Title, author, subject, keywords and producer carry
      only opaque ids and product strings; a fixture whose record title and question carry canaries
      produces neither in any metadata field (sub-PRD **D18**; PRD §41.1)
- [ ] `[machine]` **Readable output.** Every artifact has a real extractable text layer (extraction
      returns the expected section headings in order), document language `en-AU` and a logical reading
      order; every status is text plus label, never colour alone (PRD §13.1; §41.1's principle)
- [ ] `[machine]` **Bounded resources.** Rendering the largest fixture stays under the configured peak
      memory ceiling and completes within the configured deadline; a document exceeding the configured
      page/byte ceiling fails with a bounded error code instead of exhausting the process
      (PRD §39.2's 384 MiB worker limit)
- [ ] `[machine]` Cancellation via `ctx.signal` returns promptly between sections and produces no
      artifact (`RUNT-04` deliverable 8; PRD §42.5)
- [ ] `[machine]` **English only** — a language check over every product-supplied string this renderer
      emits (headings, labels, notes, disclaimer fallback) (PRD §13.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — `ExportFormat` and every enum come
      from generated `packages/contracts`; no binding is hand-edited (PRD §20.1; `DEV-001`)
- [ ] `[machine]` **Writeback item:** `docs/adr/NNNN-export-renderer-toolchain.md` exists, records the
      chosen libraries, the measured memory/time and the rejected alternatives, and is referenced from
      the PR; `docs/prd/19-exports/README.md` **QX-4**/**QX-5** are updated with the outcome
      (PRD §45.5; plan **A9**, §1.1)
- [ ] `[human]` **`UAT-EXP-01`** (PRD §41.2): the founder exports an old corrected answer and confirms
      the PDF shows the original legal date and release plus the correction banner, and that nothing was
      regenerated. Automated by `23-assurance`/`ASSR-06`
- [ ] `[human]` **PRD §43.4 founder review**, item 6 (*"UI/manual acceptance failures"*): the founder
      reads a full exported PDF end to end and confirms it is a document they would put in front of a
      customer's auditor — legible, complete, unambiguous about legal date and limits, and carrying the
      disclaimer. A wording change is a `24-launch`/`LNCH-01` policy question, recorded not patched
- [ ] `[human]` **PRD §11.1 licence spot-check**: for one `PERMITTED_WITH_ATTRIBUTION` and one
      `METADATA_AND_LINK_ONLY` source, the founder confirms the printed page carries the attribution
      and the official link and no excerpt beyond the permitted length
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md): download an exported PDF from the running product and
      open it in a normal PDF reader
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**EXP-001**, `UAT-EXP-01`,
      `E26-EXPORT`), user-visible change and non-goals, schema/API/event compatibility (none — consumes
      `XPRT-01`'s document contract), tenant/PII/security and retention impact (none enforced here; the
      document was resolved under `TenantContext` by `XPRT-01`), **source/licence impact — the excerpt
      limits and attributions this artifact carries**, model/token/cost impact (**none — no model is
      called; state it explicitly, because "no model" is the requirement**), memory/latency impact
      (measured peak RSS and wall time against the 384 MiB budget), rollback path (revert; `XPRT-05` and
      `LNCH-02` consume this ticket), known gaps (no PDF/UA tagging claim; **QX-4**, **QX-5**)
- [ ] No further `[fixture]` classes — the fixtures are `XPRT-01`'s synthetic snapshots plus this
      ticket's goldens; PRD §40.8 adapter fixtures and PRD §14/§43 evaluation replays belong to other
      modules (plan §1.1)
- No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: **no network, no AWS credential, no
model provider, no browser engine**. Rendering is exercised directly through the `ExportRenderer`
interface and through `XPRT-01`'s pipeline against the in-process object-store stub.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites live under
   `apps/worker/test/exports/pdf/`. Then `pnpm test`, `pnpm test:integration` and
   `pnpm generate && pnpm generated:check` from the root.
3. **Harness.** Reuse `XPRT-01`'s `apps/worker/test/exports/pipeline/renderer-conformance.ts` and its
   shared fixtures; copy the golden-file construction pattern from `EVID-06`'s
   `packages/citations/test/licensing/fixtures/**` (a PRD table as a committed fixture asserted against
   frozen data). Do not author a second snapshot fixture set.
4. **`conformance.test.ts`** — registry discovery, format/directory agreement, and `git status
   --porcelain` clean at suite end.
5. **`golden.test.ts`** — render each shared fixture with a fixed clock and export id; compare
   extracted text, structure outline and byte SHA-256 against the committed goldens. To confirm the
   goldens are real, change one heading on a scratch branch, observe all three fail, discard.
6. **`preservation.test.ts`** — assert the PRD §8.9 element list against the extracted text, element by
   element, from the literal expectation list.
7. **`correction.test.ts`** — the corrected fixture: assert the banner, the original legal date and
   release, and that a "current law" canary planted in a *different* fixture never appears.
8. **`exclusion.test.ts`** — render `contaminated-snapshot.json`; scan both the raw bytes and the
   extracted text for all six canaries and their field names; assert none. Repeat with the safety port
   unbound.
9. **`licence.test.ts`** — for each citation in `licence-cases.json`, extract the excerpt from the PDF
   and assert its length against `EVID-06`'s effective limit; assert the metadata-and-link-only case
   emits no excerpt; assert the trimming marker and attribution. Then unbind the licence port and
   assert a complete, excerpt-free artifact.
10. **`disclaimer.test.ts`** — assert presence in every fixture; stub an empty disclaimer and assert the
    render fails rather than emitting an artifact without one.
11. **`determinism.test.ts`** — render twice, compare hashes; source-scan for `Date.now()`,
    `Math.random()`, `process.env`.
12. **`inert-pdf.test.ts`** — parse the produced bytes; assert the absence of `/JavaScript`, `/JS`,
    `/OpenAction`, `/AA`, `/Launch`, `/EmbeddedFile`, `/RichMedia`; assert every link annotation target
    appears in the document's citation list.
13. **`metadata.test.ts`** — assert no customer text in any metadata field; assert language `en-AU`.
14. **`resources.test.ts`** — render the largest fixture under a memory watcher; assert peak stays
    under the configured ceiling and the run completes within the deadline; assert the over-ceiling
    document fails with the bounded code.
15. **`cancel.test.ts`** — abort mid-render; assert prompt return and no artifact.
16. **Reviewer focus.** Confirm that (a) no code path lengthens a quote or reconstructs one from
    offsets; (b) the disclaimer cannot be configured away; (c) the correction banner is driven by
    `correction_state` from the document and by nothing else; (d) nothing outside `ctx` is read at
    render time; (e) the ADR genuinely justifies the library against the 384 MiB and release-archive
    constraints rather than restating them.
17. **`[human]` steps**, last, against a deployed or locally composed stack (`pnpm stack:up`):
    `UAT-EXP-01`; the founder read-through; the PRD §11.1 licence spot-check; the Gate 2 smoke path.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/19-exports/README.md` (version +0.1 with a changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).
PRD §45.4 requires the **source/licence impact** section on this PR specifically.

**2. Foreseeable frictions, each with its exact writeback target.**

- **The `ExportDocument` lacks a field the layout needs** (a heading, an ordinal, a freshness note). →
  Add it to `XPRT-01`'s `pipeline/source.ts` through a docs change to **`XPRT-01`'s ticket** plus
  `docs/prd/19-exports/README.md`, `--sync`, then implement there and consume it here. Never read a
  repository, open a database or call an endpoint from a renderer — that dismantles sub-PRD **D4**,
  the only mechanical guarantee behind PRD §8.9's no-regeneration rule.
- **A licence-limited excerpt is too short to make a readable page.** → Refuse. PRD §11.1 and §8.9 bind
  exports to the same restrictions as the screen, and `EVID-06`'s own feedback obligation answers this
  case explicitly: *"the supported answer is metadata plus the official link."* Record the pressure in
  `docs/prd/19-exports/README.md`; the correct fix is a better `LicenceAssessment` from `INGF-04`,
  never a longer quote here.
- **No library satisfies the ADR constraints** (deterministic + bounded + offline + no system binary).
  → Write `docs/adr/NNNN-export-renderer-toolchain.md` **first**, recording the measurement that
  falsifies each candidate, and raise it in `docs/prd/19-exports/README.md` **QX-5**. If the only
  viable option needs a system binary or a browser engine, that collides with PRD §19.1, §20.3 and
  §39.2 and is an escalation (below), not a local decision.
- **The dependency cannot be added because `apps/worker/package.json` is `03-app-runtime`'s**
  (**QX-4**). → Docs change against `RUNT-04`, merge, `--sync`, then implement. The lockfile is
  regenerated as a build artifact and never hand-merged (plan §4.1).
- **Byte-level determinism is impossible with the chosen library.** → Record the exact non-deterministic
  field in the ADR and in `docs/prd/19-exports/README.md` **D13**, keep the extracted-text and
  structure goldens as the binding assertion, and downgrade **only** the byte-hash golden — never all
  three. A renderer with no golden at all is not acceptable: `EXP-001`'s evidence is that the export
  matches the snapshot.
- **`LNCH-02` proposes disclaimer copy that does not fit the page.** → The copy is `24-launch`'s and the
  *meaning* is PRD §11.2. Adjust the layout, not the text; if it genuinely cannot fit, record it in
  `docs/prd/19-exports/README.md` with the **Founder** as owner. Never truncate, abbreviate or
  conditionally hide a disclaimer.

**3. Escalation — two non-negotiable classes.**

- **Anything that would regenerate, re-retrieve or re-summarise content at render time** — including
  "just re-fetching the citation text because the excerpt is short" — overturns PRD §8.9's *"They MUST
  NOT regenerate the answer using current law"* and `EXP-001`. Stop and escalate through the PRD §45.5
  product-change path; never add a retrieval, model or network dependency to this file-scope.
- **Anything that removes, hides, shortens or conditionalises the disclaimer, a required attribution,
  or the licence excerpt limit** overturns PRD §11.1, §11.2 and §8.10 and puts the product in breach of
  a source licence or of its own legal positioning in a document that leaves the building. Escalate for
  re-review before it ships; this is a legal-exposure boundary, not a layout preference.
