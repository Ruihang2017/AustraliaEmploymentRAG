---
id: XPRT-03
title: "DOCX renderer"
module: 19-exports
lane: 19-exports
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [XPRT-01, EVID-06]
blocks: [XPRT-05]
---

# XPRT-03 — DOCX renderer

Implements PRD §8.9 and §11.2 — requirement **EXP-001**, epic `E26-EXPORT`.
No ADR — the decision is already made in PRD §8.9 (what an export preserves and excludes), §11.1/§11.2
(licence limits and the mandatory disclaimer) and §32.3 (the fixed presentation order); the durable
library choice is recorded once in `docs/adr/NNNN-export-renderer-toolchain.md`, which **`XPRT-02`
owns** (plan **A9**, sub-PRD **QX-5**) and this ticket **reads**. This is build ticket 3 of 5 against
those decisions.
Parent sub-PRD: [19-exports README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [XPRT-01 — Export job admission, S3 lifecycle and signed URLs](XPRT-01-export-job-admission-s3-lifecycle-and-signed-urls.md)
· `EVID-06` — Licence-aware quotation, display and export limits
([`12-evidence-safety`](../../12-evidence-safety/README.md))
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`XPRT-01` froze the `ExportRenderer` contract and hands over an already-limited, already-safety-checked
frozen document; this serialises it into OOXML. Not a new subsystem decision.

## Background + basis

**PRD §8.9**, the two sentences this renderer is accountable for, identically to `XPRT-02`:

> **Exports MUST preserve legal date, corpus release, claims, citations, assumptions, limitations and
> correction status. They MUST NOT regenerate the answer using current law.**
>
> **Licensing rules MUST restrict excerpt length. Hidden prompts/reasoning, secrets and internal
> licensing notes MUST be excluded.**

**PRD §11.1**: *"Unclear rights default to metadata, limited quotation and official links … **Customer
exports MUST apply the same restrictions**."* **PRD §11.2**: *"It MUST include clear disclaimers in the
Web app, widget and exports."* **PRD §8.10**: *"The disclaimer, citations and product-source indicator
MUST NOT be removable by customer theming."* `EVID-06` is the single implementation of the limit rule
and `XPRT-01` applies it once, before this renderer is called (sub-PRD **D5**).

**PRD §32.3** fixes the presentation order this document follows (status and short answer; legal date,
jurisdictions, corpus release; numbered claims; assumptions with impact-if-false; next checks;
limitations; authority table), so a customer who reads the answer on screen recognises the file.

**PRD §30.2 `EXP-001`**: *"Existing snapshots export to PDF, DOCX and versioned JSON without
regeneration … Export hashes/citations match snapshot."*
**PRD §41.2 `UAT-EXP-01`** requires the **correction banner** and the original legal date/release in the
visible artifact.
**PRD §13.1**: exports MUST be English.
**PRD §37.5**: *"all links and source metadata are constructed from system records."*
**PRD §39.2** caps the worker at **384 MiB**; PRD §19.1 forbids production to compile code; PRD §20.3
requires production to run one immutable CI-built artifact *"without floating installs or builds"*.

**Why DOCX carries a security obligation PDF does not.** A `.docx` is a zip of XML parts, and the
format has several *content-carried execution and data-exfiltration* surfaces: VBA macros (a `.docm`
part), OLE embedded objects, DDE/`DDEAUTO` field codes, `INCLUDEPICTURE`/`INCLUDETEXT` and other field
codes that fetch remote content, external relationships in `.rels` parts (remote images, templates,
`attachedTemplate`), and `settings.xml`'s `updateFields` flag that makes a reader re-evaluate fields on
open. PRD §37.5 (*"Generated text never directly triggers an email, webhook, corpus promotion, record
transition, credential use or external action"*), PRD §21.1 and requirement `SEC-003` mean none of them
may appear in a product-generated document. Sub-PRD **D6** states the rule positively: **snapshot text
is data, never markup** — this ticket is where that is enforced for OOXML.

**The contract this ticket implements** — `XPRT-01`'s renderer registry contract, items 2, 4, 5, 6 and
7: a default-exported `ExportRenderer` in `apps/worker/src/handlers/export/docx/index.ts`;
`render(doc, ctx)` receives a **deeply frozen `ExportDocument`** that is already licence-limited and
already asserted export-safe, plus `{ now, exportId, templateBaseDir, logger, signal }` and **nothing
else**; output must be deterministic; adding this directory produces zero diff outside it; and *"It may
narrow a quote further but never lengthen one; it must place the disclaimer block and every required
attribution; it must treat all document text as literal data, never markup."*

**Accepted caveats carried forward, documented not enforced here:**

- **The DOCX library is chosen and justified in `XPRT-02`'s ADR** (`docs/adr/NNNN-export-renderer-toolchain.md`,
  sub-PRD **QX-5**). This ticket **uses** that decision and does not write the ADR. If the ADR's DOCX
  choice proves wrong, the writeback amends **that** file and `XPRT-02`'s ticket — see the Feedback
  obligation.
- **The dependency must be declared in `apps/worker/package.json`, which `03-app-runtime` owns**
  (sub-PRD **D15**, **QX-4**). Docs change against `RUNT-04` first, merge, `--sync`, then implement.
- **The disclaimer copy is `24-launch`'s** (`LNCH-01`), delivered through `XPRT-01`'s `DisclaimerPort`.
  `LNCH-02` is `blocked_by XPRT-02`, not this ticket, so this renderer must work correctly with the
  committed neutral default and pick up the approved copy automatically when it lands.
- **Zip archives are timestamped by default.** Deterministic OOXML therefore requires fixed entry
  timestamps, fixed entry order and fixed compression settings; the format's `w:rsid` values and
  `docId`/`paraId` attributes are randomised by many writers and must be pinned or omitted (sub-PRD
  **D13**). Recorded here so it is designed for, not discovered.

## Goal

Produce `apps/worker/src/handlers/export/docx/**`: a registered `ExportRenderer` for format `DOCX` that
lays the frozen `ExportDocument` out in the PRD §32.3 order with the **same fidelity and the same
licence limits as the PDF**, preserves every PRD §8.9 element (legal date, corpus release, claims,
citations, assumptions, limitations, correction status), carries the disclaimer and every required
attribution non-removably, emits an **inert** `.docx` with no macro, OLE object, field code, external
relationship or auto-update flag, and produces deterministic bytes within the worker's memory budget.
Completion is mechanically checkable: two renders of the same document are byte-identical; golden
comparison over `XPRT-01`'s shared fixtures passes on extracted text, normalised OOXML structure and
byte hash; the produced package contains no forbidden part, relationship or field code; extracting the
contaminated fixture's artifact finds none of the six PRD §8.9 canaries; no excerpt exceeds `EVID-06`'s
effective limit; and the renderer boots with zero diff outside its own directory.

## Non-goals

- **No PDF or JSON output.** `XPRT-02`, `XPRT-04` — sibling directories, same registry, same document.
- **No job admission, S3 upload, signed URL, expiry, sweep, registry, document builder, port or
  hashing.** `XPRT-01`. A missing document field is added there, never fetched here.
- **No licence limit, trimming rule, attribution rule or export-exclusion list.** `EVID-06`. This
  ticket binds `EVID-06`'s implementation into `XPRT-01`'s ports (idempotent by id, so binding the same
  implementation as `XPRT-02` is a no-op) and performs no limit arithmetic.
- **No ADR authorship.** `docs/adr/NNNN-export-renderer-toolchain.md` is `XPRT-02`'s file under plan
  **A9**; this ticket reads it and never edits it.
- **No disclaimer, Terms, Privacy or AUP prose.** `24-launch` (`LNCH-01`, `LNCH-02`).
- **No retrieval, model, corpus or network access.** Structurally impossible under `XPRT-01`'s contract
  item 4 and asserted again here (sub-PRD **D4**; PRD §8.9).
- **No markup interpretation or sanitisation.** `EVID-10` owns screen sanitisation; this renderer never
  interprets markup (sub-PRD **D6**).
- **No export screen.** `XPRT-05`, which is `blocked_by` this ticket.
- **No `apps/worker/package.json` edit.** `03-app-runtime` (**D15**, **QX-4**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`. Co-located assertions here per plan **R8**.

## File-scope (write-owns)

- `apps/worker/src/handlers/export/docx/**` (exactly plan §5.20's `.../export/docx/**`).
- `apps/worker/test/exports/docx/**` — this ticket's own tests and golden files (sub-PRD **D16**).

Does not touch:

- `apps/worker/src/handlers/export/{index.ts,pipeline/**}` — `XPRT-01`;
  `apps/worker/src/handlers/export/{pdf,json}/**` — `XPRT-02`, `XPRT-04`;
  `apps/worker/test/exports/{pipeline,pdf,json}/**` — the same three tickets.
- `docs/adr/**` — per-file ownership (plan **A9**); the toolchain ADR is `XPRT-02`'s.
- `apps/worker/src/{main.ts,runtime,queues}/**`, `handlers/maintenance/**` — `RUNT-04`.
- `apps/api/**` — `RUNT-01`/`RUNT-02`/`XPRT-01`; `apps/web/**` — `RUNT-05`/`XPRT-05`.
- `packages/citations/**` — `12-evidence-safety`; `packages/database/**`, `packages/jobs/**` —
  `01-app-data`; `packages/contracts/**` — `00-foundation`; `packages/ui/**`,
  `packages/observability/**` — `03-app-runtime`.
- `infra/**` — `18-ops-release`/`RUNT-09`; `tests/**` — `23-assurance`; `docs/policies/**` —
  `24-launch`; `docs/PRD.md` — frozen.
- `apps/worker/package.json`, `apps/worker/tsconfig.json` — `03-app-runtime` (**D15**).

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/worker/src/handlers/export/docx/**` and nothing
contends for it. `XPRT-01` is merged before this ticket starts (`blocked_by`) and writes no file under
a renderer directory. The two concurrent siblings are `XPRT-02` (`handlers/export/pdf/**`, plus
`docs/adr/NNNN-export-renderer-toolchain.md`, a **different file** under the shared-additive ADR
directory) and `XPRT-04` (`handlers/export/json/**`) — different directories, no shared file. Under
`XPRT-01`'s registry contract (plan **A1** one level down, sub-PRD **D10**) discovery is a **directory
scan, not a list**, so all three add their area with zero diff outside it and run as three concurrent
lanes (plan §7: 5 tickets, 3 waves, 3 useful lanes). The one *ordering* coupling with `XPRT-02` is
informational, not file-level: this ticket reads the toolchain ADR. If it has not landed yet, the DOCX
library choice is still made against the same recorded constraints and the ADR is amended by `XPRT-02`
(Feedback obligation) — no file is co-written. Per plan **A3** this ticket writes no table; per
PRD §45.2 it enforces no tenant or PII boundary — the document arrives already resolved under
`TenantContext` by `XPRT-01`.

## Deliverables

1. **`apps/worker/src/handlers/export/docx/index.ts`** — the default-exported `ExportRenderer`:
   `format: 'DOCX'` (from `packages/contracts`), `extension: 'docx'`,
   `contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'`,
   `templateVersion: 'docx-1'` (bumped whenever output bytes change), and `render(doc, ctx)`.
2. **Port binding (sub-PRD D5).** Bind `EVID-06`'s `applyQuotationLimits` and `assertExportSafe`
   implementations into `XPRT-01`'s ports through `bindExportPort` using `EVID-06`'s stable ids.
   Binding is idempotent by id, so this is a no-op when `XPRT-02` has already bound the same
   implementations, and `XPRT-04` inherits them (**QX-2**). No limit arithmetic happens here.
3. **The same eight sections as the PDF, in the PRD §32.3 order** — status and short answer; legal
   context banner (`legal_as_at` as `3 Aug 2026`, jurisdictions, `corpus_release_id`,
   `knowledge_cutoff_at`, and the **correction banner** above it when `correction_state !== 'NONE'`);
   numbered claims with support status and citation markers; assumptions with `source`, `confirmed` and
   **impact if false**; practical next checks; limitations; the authority table (number, authority,
   pinpoint, legal status, effective interval, authority role, licence-limited excerpt with its
   trimming note, attribution, official URL as visible text); provenance and the disclaimer block.
   **Fidelity parity with `XPRT-02` is a requirement, not an aspiration**: a shared expectation list
   (Deliverable 9) asserts the same elements appear in both artifacts for the same fixture.
4. **Real document structure, not a flat text dump.** Headings use Word heading styles so the
   navigation pane and a screen reader see the section order; the authority table is a real table with
   a header row; lists are real numbered/bulleted lists. Styles are defined in the package, never
   inherited from a user template.
5. **The package is inert (sub-PRD D6; PRD §37.5, §21.1, `SEC-003`).** The produced `.docx` contains:
   **no** macro part (`vbaProject.bin`; the package is `.docx`, never `.docm`), **no** OLE or embedded
   object part, **no** field codes at all — in particular no `DDE`, `DDEAUTO`, `INCLUDEPICTURE`,
   `INCLUDETEXT`, `IMPORT`, `LINK`, `HYPERLINK` field instruction — **no** external or remote
   relationship in any `.rels` part (no `attachedTemplate`, no remote image, no external
   `oleObject`/`frame`), **no** `w:updateFields` set true in `settings.xml`, and **no** embedded font
   with a remote source. Links to official URLs are rendered as **visible literal text**; where a real
   hyperlink relationship is used it must be `TargetMode="External"` pointing at a URL that appears in
   the document's own citation list, and the URL is printed as text as well.
6. **Licence rendering rules, verbatim from the document, never re-derived.** A citation with no
   `quote` (metadata-and-link-only or zero effective limit) renders metadata plus the official link and
   a human-readable note that the excerpt is unavailable under the source licence. A citation with
   `quote_trimmed: true` renders the excerpt, the marker the document carries, and a visible "excerpt
   limited by licence" note. Attribution is rendered adjacent to its excerpt and no option suppresses
   it.
7. **Determinism (sub-PRD D13).** Zip entries are written in a fixed order with **fixed timestamps**
   and fixed compression settings; `docProps/core.xml` dates come from `ctx.now`; no `w:rsid`,
   `w14:paraId`/`w14:textId` or document id is randomised (pin or omit them); no build timestamp or
   machine identifier appears in any part. `render()` calls no `Date.now()`, `Math.random()` or
   `process.env`. Two renders with equal arguments produce byte-identical output.
8. **Bounded resources and cancellation.** Sections are streamed into the package rather than
   accumulated as one large string; a document beyond a configured ceiling fails with a bounded error
   code instead of exhausting the worker (PRD §39.2's 384 MiB); `ctx.signal` is honoured between
   sections and an aborted render produces no artifact.
9. **`apps/worker/test/exports/docx/goldens/**` and `extract.ts`.** Committed goldens for each of
   `XPRT-01`'s shared fixtures: extracted **text** (document order), a **normalised OOXML structure**
   JSON (part list, relationship list, style names, heading/paragraph/table outline, field-code list —
   which must be empty) and the **SHA-256** of the package bytes. `extract.ts` mirrors `XPRT-02`'s
   extraction helper shape for OOXML, and the **shared preservation expectation list** used by both
   renderers lives in this ticket's test tree as a copy of `XPRT-02`'s literal list, asserted equal to
   the fixture-derived list so parity failures are visible.
10. **Document metadata.** `docProps` carries an opaque title (`Export {export_job_id}`), the product
    as creator/application, language `en-AU` (PRD §13.1), and **no** author, subject, keyword,
    company, manager or comment field carrying customer text (sub-PRD **D18**).

## Acceptance checklist (classified)

- [ ] `[machine]` The renderer registers through `XPRT-01`'s registry with `format: 'DOCX'` matching its
      directory name, and adding this directory produces **zero** diff outside it — asserted with
      `apps/worker/test/exports/pipeline/renderer-conformance.ts` (`XPRT-01` deliverable 6; plan **A1**)
- [ ] `[fixture]` **Golden comparison** for every shared fixture: extracted text, normalised OOXML
      structure and package SHA-256 all match the committed goldens (sub-PRD **D13**; `EXP-001`)
- [ ] `[fixture]` **PRD §8.9 preservation, read from the artifact.** The extracted text contains the
      legal date, every jurisdiction, the corpus release id, every claim's text and support status,
      every citation's pinpoint/role/effective interval/official URL, every assumption **and its
      impact-if-false**, every limitation and the correction status — asserted element by element
      against the literal expectation list (PRD §8.9; §32.3)
- [ ] `[fixture]` **Fidelity parity with the PDF.** For the same fixture, the DOCX expectation list and
      `XPRT-02`'s PDF expectation list contain the same elements; a divergence fails
      (plan §5.20's *"Same fidelity and licence limits as PDF"*)
- [ ] `[fixture]` **`UAT-EXP-01` artifact half.** The `answer-snapshot-corrected` artifact shows a
      **correction banner** and the **original** legal date and corpus release; no current-law value
      appears anywhere in the extracted text (PRD §41.2 `UAT-EXP-01`; §8.9)
- [ ] `[machine]` **No regeneration is reachable.** A source scan of `handlers/export/docx/**` finds no
      import of `packages/model-gateway`, `packages/retrieval-client`, a search client,
      `packages/database`, `node:http(s)`, `node:dns` or `fetch`, and no filesystem read outside
      `ctx.templateBaseDir` (sub-PRD **D4**; PRD §8.9)
- [ ] `[fixture]` **Nothing PRD §8.9 excludes appears in the artifact.** Rendering
      `contaminated-snapshot.json` and scanning **every part of the produced package** (all XML parts,
      `docProps`, the relationship parts) plus the extracted text finds none of the six canaries —
      prompt, hidden reasoning, API key, BYOK credential, internal licensing note, operator comment —
      and none of their field names (PRD §8.9; §9.4; §16.4; `SEC-003`)
- [ ] `[machine]` **The package is inert.** The produced `.docx` contains no `vbaProject.bin`, no OLE or
      embedded-object part, **no field codes at all** (the extracted field-code list is empty — in
      particular no `DDE`/`DDEAUTO`/`INCLUDE*`/`LINK`), no external relationship other than an
      allow-listed `TargetMode="External"` hyperlink whose target appears in the document's citation
      list, and no `w:updateFields` set true — asserted by unzipping and parsing the produced bytes
      (PRD §37.5; §21.1; `SEC-003`; sub-PRD **D6**)
- [ ] `[machine]` **Excerpt-length licence limits hold in the artifact.** For every citation in
      `licence-cases.json`, the excerpt extracted from the package is at or below `EVID-06`'s effective
      `EXPORT` limit; a `METADATA_AND_LINK_ONLY` citation yields **no excerpt text** and a complete
      metadata-plus-official-link block; a trimmed excerpt carries its marker and the visible note;
      required attribution is present. No option or layout path lengthens a quote (PRD §11.1; §8.9;
      §36.6; `EVID-06`)
- [ ] `[machine]` With the licence port **unbound** (the `XPRT-01` fail-closed default), the artifact
      contains no excerpt text at all and still renders completely (sub-PRD **D5**)
- [ ] `[machine]` **The disclaimer is present and non-removable.** Every fixture's artifact contains the
      `DisclaimerPort` block; no option, configuration value or trimming path removes it or an
      attribution; a stubbed empty disclaimer makes the render **fail** rather than emit an artifact
      without one (PRD §11.2; §8.10; sub-PRD **D14**)
- [ ] `[machine]` **Determinism.** Two renders of the same document with the same `ctx` produce
      byte-identical packages — including zip entry order and timestamps; a source scan finds no
      `Date.now()`, `Math.random()` or `process.env`; no `w:rsid`/`paraId` or document id is
      randomised (sub-PRD **D13**)
- [ ] `[machine]` **No customer text in metadata.** `docProps` title/creator/subject/keywords/company
      carry only opaque ids and product strings; a fixture whose record title and question carry
      canaries produces neither in any metadata part (sub-PRD **D18**; PRD §41.1)
- [ ] `[machine]` **Readable structure.** Heading styles, a real table with a header row and real lists
      are present; extraction returns the section headings in document order; every status is text plus
      label, never colour alone (PRD §13.1; §41.1's principle)
- [ ] `[machine]` **Bounded resources.** Rendering the largest fixture stays under the configured peak
      memory ceiling and completes within the configured deadline; an over-ceiling document fails with a
      bounded error code (PRD §39.2's 384 MiB worker limit)
- [ ] `[machine]` Cancellation via `ctx.signal` returns promptly between sections and produces no
      artifact (`RUNT-04` deliverable 8; PRD §42.5)
- [ ] `[machine]` **English only** — a language check over every product-supplied string this renderer
      emits (PRD §13.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — `ExportFormat` and every enum come
      from generated `packages/contracts` (PRD §20.1; `DEV-001`)
- [ ] `[human]` **`UAT-EXP-01` (DOCX half)** (PRD §41.2): the founder exports an old corrected answer as
      DOCX and confirms the correction banner and the original legal date and release, with no
      regeneration. Automated by `23-assurance`/`ASSR-06`
- [ ] `[human]` **Opens correctly in a real word processor**: the founder opens the artifact in
      Microsoft Word and in one alternative (LibreOffice Writer or Google Docs) and confirms no
      security prompt, no "update fields?" dialog, no broken table, correct headings and a complete
      disclaimer. This is irreducibly human — no offline parser proves a reader's behaviour
- [ ] `[human]` **PRD §43.4 founder review**, item 6 (*"UI/manual acceptance failures"*): the founder
      reads a full exported DOCX end to end and confirms parity with the PDF
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md): download an exported DOCX from the running product
      and open it
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**EXP-001**, `UAT-EXP-01`,
      `E26-EXPORT`), user-visible change and non-goals, schema/API/event compatibility (none — consumes
      `XPRT-01`'s document contract), tenant/PII/security and retention impact (**the inert-package
      assertions belong here explicitly** — no macros, no field codes, no external relationships),
      source/licence impact (excerpt limits and attributions carried in the artifact), model/token/cost
      impact (**none — no model is called**), memory/latency impact against the 384 MiB budget, rollback
      path (revert; `XPRT-05` consumes this ticket), known gaps (**QX-4**; the toolchain ADR is
      `XPRT-02`'s)
- [ ] No further `[fixture]` classes — the fixtures are `XPRT-01`'s synthetic snapshots plus this
      ticket's goldens (plan §1.1)
- No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: **no network, no AWS credential, no
model provider, no word processor**. Rendering is exercised through the `ExportRenderer` interface and
through `XPRT-01`'s pipeline against the in-process object-store stub.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites live under
   `apps/worker/test/exports/docx/`. Then `pnpm test`, `pnpm test:integration` and
   `pnpm generate && pnpm generated:check` from the root.
3. **Harness.** Reuse `XPRT-01`'s `renderer-conformance.ts` and shared fixtures, and mirror `XPRT-02`'s
   golden/extraction construction pattern for OOXML. Do not author a second snapshot fixture set and do
   not fork the preservation expectation list — copy it and assert equality (Deliverable 9).
4. **`conformance.test.ts`** — registry discovery, format/directory agreement, `git status
   --porcelain` clean at suite end.
5. **`golden.test.ts`** — render each shared fixture with a fixed clock and export id; compare extracted
   text, normalised OOXML structure and package SHA-256 against the committed goldens. Change one
   heading on a scratch branch, observe all three fail, discard.
6. **`preservation.test.ts`** — the PRD §8.9 element list against the extracted text, element by
   element; then the parity assertion against `XPRT-02`'s list.
7. **`correction.test.ts`** — the corrected fixture: banner present, original legal date and release
   preserved.
8. **`inert-package.test.ts`** — unzip the artifact; enumerate parts and relationships; assert no
   `vbaProject.bin`, no OLE/embedded-object part, an **empty** field-code list, no external
   relationship other than allow-listed citation hyperlinks, and `w:updateFields` absent or false. Then
   plant a fixture whose claim text literally contains `{ DDEAUTO c:\\windows\\system32\\cmd.exe }` and
   `=cmd|'/c calc'!A1` and assert both appear as **literal text** and produce no field code — the
   mechanical form of sub-PRD **D6**.
9. **`exclusion.test.ts`** — render `contaminated-snapshot.json`; scan every part of the package plus
   the extracted text for all six canaries and their field names; assert none. Repeat with the safety
   port unbound.
10. **`licence.test.ts`** — per-citation excerpt length against `EVID-06`'s effective limit; the
    metadata-and-link-only case; the trimming marker; attribution. Then unbind the licence port and
    assert a complete, excerpt-free artifact.
11. **`disclaimer.test.ts`** — presence in every fixture; stubbed empty disclaimer makes the render
    fail.
12. **`determinism.test.ts`** — render twice, compare package bytes; assert fixed zip timestamps and
    entry order; source-scan for `Date.now()`, `Math.random()`, `process.env`; assert no randomised
    `rsid`/`paraId`.
13. **`metadata.test.ts`** — no customer text in `docProps`; language `en-AU`.
14. **`resources.test.ts`** — largest fixture under a memory watcher; over-ceiling failure code.
15. **`cancel.test.ts`** — abort mid-render; prompt return, no artifact.
16. **Reviewer focus.** Confirm that (a) no code path lengthens a quote or reconstructs one from
    offsets; (b) no field code, macro, OLE object or external relationship can enter the package from
    *document text* — this is the DOCX-specific attack surface and the reason the literal-text fixture
    exists; (c) the disclaimer cannot be configured away; (d) the correction banner is driven only by
    `correction_state`; (e) determinism survives a rebuild on a different machine.
17. **`[human]` steps**, last: `UAT-EXP-01` (DOCX half); opening the artifact in Word and in one
    alternative reader; the founder read-through; the Gate 2 smoke path.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/19-exports/README.md` (version +0.1 with a changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).
PRD §45.4 requires the **source/licence impact** section on this PR specifically.

**2. Foreseeable frictions, each with its exact writeback target.**

- **The `ExportDocument` lacks a field this layout needs.** → Add it in `XPRT-01`'s
  `pipeline/source.ts` through a docs change to **`XPRT-01`'s ticket** plus
  `docs/prd/19-exports/README.md`, `--sync`, then consume it here. Never read a repository, open a
  database or call an endpoint from a renderer (sub-PRD **D4**).
- **The DOCX library chosen in `XPRT-02`'s ADR cannot produce deterministic packages or stay inside the
  memory ceiling.** → Amend `docs/adr/NNNN-export-renderer-toolchain.md` **through a docs change to
  `XPRT-02`'s ticket** (the ADR is that ticket's file under plan **A9**) plus this ticket, `--sync`
  both, and record the measurement. Do not fork a second library silently, and do not edit the ADR from
  here.
- **A word processor still prompts on open** (a field, a template reference, an external relationship
  the parser did not catch). → That is a `SEC-003`/PRD §37.5 defect, not a cosmetic one. Add the
  offending construct to the inert-package assertion **first**, then fix the writer. Record the class of
  construct in `docs/prd/19-exports/README.md` **D6** so `XPRT-02`'s and any future renderer's checks
  gain it too.
- **A licence-limited excerpt is too short to make a readable document.** → Refuse; PRD §11.1 and §8.9
  bind exports to the same restrictions as the screen, and `EVID-06`'s answer is *"metadata plus the
  official link"*. Record the pressure in `docs/prd/19-exports/README.md`; the correct fix is a better
  `LicenceAssessment` from `INGF-04`.
- **The dependency cannot be added because `apps/worker/package.json` is `03-app-runtime`'s**
  (**QX-4**). → Docs change against `RUNT-04`, merge, `--sync`, then implement; the lockfile is
  regenerated, never hand-merged (plan §4.1).
- **Byte-level determinism is impossible.** → Record the exact non-deterministic field in
  `docs/prd/19-exports/README.md` **D13** and in `XPRT-02`'s ADR through its ticket, keep the extracted
  text and structure goldens as binding, and downgrade **only** the byte-hash golden — never all three.

**3. Escalation — two non-negotiable classes.**

- **Anything that would regenerate, re-retrieve or re-summarise content at render time** overturns
  PRD §8.9's *"They MUST NOT regenerate the answer using current law"* and `EXP-001`. Stop and escalate
  through the PRD §45.5 product-change path; never add a retrieval, model or network dependency to this
  file-scope.
- **Anything that puts an executable, self-updating or externally-fetching construct into a customer
  artifact** — a macro, an OLE object, a DDE or INCLUDE field, a remote image, an attached template,
  `updateFields` — overturns PRD §37.5 and §21.1 and turns an evidence document into a delivery vector
  on the customer's own machine. It is also the one export defect a customer's security team will find
  first. Escalate before it ships; never allow it "because a template needed it".
