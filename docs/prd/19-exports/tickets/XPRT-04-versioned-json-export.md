---
id: XPRT-04
title: "Versioned JSON export"
module: 19-exports
lane: 19-exports
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [XPRT-01]
blocks: [XPRT-05]
---

# XPRT-04 — Versioned JSON export

Implements PRD §8.9 and §34.5 — requirement **EXP-001**, epic `E26-EXPORT`.
No ADR — the decision is already made in PRD §34.5 (the Answer Snapshot payload, which this export
reproduces), §34.1 (*"`/v1` URL plus response `schema_version`; breaking property/meaning changes
require `/v2`"*) and §8.9 (what an export preserves and excludes); this is build ticket 4 of 5 against
it.
Parent sub-PRD: [19-exports README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [XPRT-01 — Export job admission, S3 lifecycle and signed URLs](XPRT-01-export-job-admission-s3-lifecycle-and-signed-urls.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`XPRT-01` froze the `ExportRenderer` contract and PRD §34.5 already fixes the payload shape; this
serialises one into the other with a version and a hash. Not a new subsystem decision.

## Background + basis

**PRD §8.9**, the sentences this renderer is accountable for:

> **Exports MUST preserve legal date, corpus release, claims, citations, assumptions, limitations and
> correction status. They MUST NOT regenerate the answer using current law.**
>
> **Licensing rules MUST restrict excerpt length. Hidden prompts/reasoning, secrets and internal
> licensing notes MUST be excluded.**

**PRD §34.5 — Answer Snapshot** is the customer-facing shape this export reproduces: `schema_version`,
`id`, `record_id`, `answer_version`, `status`, `short_answer`, `legal_as_at`, `knowledge_cutoff_at`,
`jurisdictions`, `corpus_release_id`, `claims[]` (`id`, `sequence`, `kind`, `text`, `support_status`,
`citation_ids`, `assumption_ids`), `citations[]` (`id`, `role`, `document_version_id`,
`node_version_id`, `pinpoint`, `quote`, `start_offset`, `end_offset`, `official_url`, `legal_status`,
`effective_from`, `effective_to`), `assumptions[]` (`id`, `text`, `source`, `impact_if_false`),
`next_checks[]`, `limitations[]`, `correction_state`, `created_at`. It closes with the boundary this
ticket must not cross:

> **Provider prompts, hidden reasoning and raw provider responses are never part of this customer
> contract.** An internal immutable execution record stores hashes, versions, tokens, latency and cost,
> not hidden chain-of-thought.

**PRD §30.2 `EXP-001`**: *"Existing snapshots export to PDF, DOCX and versioned JSON without
regeneration | Record/answer export | export endpoints | App | **Export hashes/citations match
snapshot**."* This ticket is the one that makes *"hashes match"* literally checkable: the JSON export
carries `provenance.source_snapshot_sha256` (computed by `XPRT-01`'s `snapshotDigest`) so a third party
can recompute the digest from `GET /v1/answers/{id}` and compare.

**PRD §34.1** fixes the conventions the payload must obey: opaque resource-prefixed ids that clients
never parse; Australian legal dates as `YYYY-MM-DD` and timestamps as ISO 8601 UTC; *"Omit values that
are not applicable; use `null` only when 'known to be empty' is meaningful"*; integer micro-AUD for
money; **`schema_version` on the response**.

**PRD §11.1/§11.2** bind this format exactly as they bind PDF and DOCX: *"Customer exports MUST apply
the same restrictions"* and *"It MUST include clear disclaimers in the Web app, widget and exports."* A
JSON file is an export, so it carries the disclaimer as a field and its excerpts obey the same licence
limits.

**PRD §13.1**: exports MUST be English. **PRD §20.1**: generated bindings MUST NOT be hand-edited, and
`DEV-001` requires a clean generated-client diff — so this export's type comes from
`packages/contracts` (`FND-04`), not from a local interface.

**The contract this ticket implements** — `XPRT-01`'s renderer registry contract, items 2, 4, 5, 6 and
7: a default-exported `ExportRenderer` in `apps/worker/src/handlers/export/json/index.ts`;
`render(doc, ctx)` receives a **deeply frozen `ExportDocument`** that is already licence-limited and
already asserted export-safe, plus `{ now, exportId, templateBaseDir, logger, signal }` and **nothing
else**; output must be deterministic; adding this directory produces zero diff outside it; and *"It may
narrow a quote further but never lengthen one; it must place the disclaimer block and every required
attribution; it must treat all document text as literal data, never markup."*

**Accepted caveats carried forward, documented not enforced here:**

- **This ticket has no `blocked_by EVID-06` edge** (sub-PRD **QX-2**), so it must **not** import
  `packages/citations`. It inherits licence limits because `XPRT-01` applies them once, in the
  pipeline, behind a port whose default is *stricter* than any real assessment (sub-PRD **D5**). This
  ticket's job is to **assert** that the limits held, never to compute one. If `XPRT-02`/`XPRT-03` have
  not yet bound `EVID-06`'s implementation, the excerpt fields are simply absent and the export is
  metadata-and-link-only — a correct, licence-safe outcome, not a failure.
- **A JSON export is not an API response.** It is a file that outlives the request, so it carries its
  own `schema_version` independent of `/v1`, and adding a field is a minor bump while removing or
  re-meaning one is a major bump (PRD §34.1's versioning rule applied to a file).
- **The disclaimer copy is `24-launch`'s** (`LNCH-01`), delivered through `XPRT-01`'s `DisclaimerPort`;
  this ticket ships no policy prose.

## Goal

Produce `apps/worker/src/handlers/export/json/**`: a registered `ExportRenderer` for format `JSON` that
serialises the frozen `ExportDocument` into a **schema-versioned, canonical, deterministic** JSON
document reproducing the PRD §34.5 shape, carrying `provenance.source_snapshot_sha256` so the export is
hash-comparable to the snapshot, preserving every PRD §8.9 element including correction status,
carrying the disclaimer and every required attribution, excluding every internal field, and validating
against the generated `packages/contracts` type. Completion is mechanically checkable: two renders of
the same document are byte-identical; a golden comparison over `XPRT-01`'s shared fixtures passes; the
export's citation ids, corpus ids and offsets are equal to the snapshot's; the recomputed snapshot
digest matches; a scan of the serialised bytes finds none of the six PRD §8.9 canaries; every excerpt
is within `EVID-06`'s effective limit (or absent); and the renderer boots with zero diff outside its
own directory.

## Non-goals

- **No PDF or DOCX output.** `XPRT-02`, `XPRT-03` — sibling directories, same registry, same document.
- **No job admission, S3 upload, signed URL, expiry, sweep, registry, document builder, port,
  disclaimer default or snapshot hashing.** `XPRT-01`, which is `blocked_by`-ordered before this
  ticket. `snapshotDigest` is **called**, never re-implemented — two digest implementations would make
  `EXP-001`'s evidence unfalsifiable.
- **No licence limit computation and no `packages/citations` import.** No edge exists (sub-PRD
  **QX-2**); limits arrive already applied (**D5**). This ticket asserts, it does not compute.
- **No `/v1` API response shape, no OpenAPI authoring, no generated bindings.** `FND-04`,
  serial-owned. If the export type is missing from `packages/contracts`, that is a writeback
  (**QX-10**), not a local interface.
- **No disclaimer, Terms, Privacy or AUP prose.** `24-launch` (`LNCH-01`, `LNCH-02`).
- **No retrieval, model, corpus or network access.** Structurally impossible under `XPRT-01`'s contract
  item 4 and asserted again here (sub-PRD **D4**; PRD §8.9).
- **No export screen.** `XPRT-05`, which is `blocked_by` this ticket.
- **No `apps/worker/package.json` edit.** `03-app-runtime` (**D15**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`. Co-located assertions here per plan **R8**.

## File-scope (write-owns)

- `apps/worker/src/handlers/export/json/**` (exactly plan §5.20's `.../export/json/**`).
- `apps/worker/test/exports/json/**` — this ticket's own tests, goldens and JSON Schema fixture
  (sub-PRD **D16**).

Does not touch:

- `apps/worker/src/handlers/export/{index.ts,pipeline/**}` — `XPRT-01`;
  `apps/worker/src/handlers/export/{pdf,docx}/**` — `XPRT-02`, `XPRT-03`;
  `apps/worker/test/exports/{pipeline,pdf,docx}/**` — the same three tickets.
- `docs/adr/**` — per-file ownership (plan **A9**); this ticket claims no ADR.
- `apps/worker/src/{main.ts,runtime,queues}/**`, `handlers/maintenance/**` — `RUNT-04`.
- `apps/api/**` — `RUNT-01`/`RUNT-02`/`XPRT-01`; `apps/web/**` — `RUNT-05`/`XPRT-05`.
- `packages/citations/**` — `12-evidence-safety` (**no edge — do not import**);
  `packages/database/**`, `packages/jobs/**` — `01-app-data`; `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`, serial-owned; `packages/ui/**`,
  `packages/observability/**` — `03-app-runtime`.
- `infra/**` — `18-ops-release`/`RUNT-09`; `tests/**` — `23-assurance`; `docs/policies/**` —
  `24-launch`; `docs/PRD.md` — frozen.
- `apps/worker/package.json`, `apps/worker/tsconfig.json` — `03-app-runtime` (**D15**).

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/worker/src/handlers/export/json/**` and nothing
contends for it. `XPRT-01` is merged before this ticket starts (`blocked_by`) and writes no file under
a renderer directory. The two concurrent siblings are `XPRT-02` (`handlers/export/pdf/**` plus its own
ADR file) and `XPRT-03` (`handlers/export/docx/**`) — different directories, no shared file. Under
`XPRT-01`'s registry contract (plan **A1** one level down, sub-PRD **D10**) discovery is a **directory
scan, not a list**, so all three add their area with zero diff outside it and run as three concurrent
lanes (plan §7: 5 tickets, 3 waves, 3 useful lanes). This ticket needs **no** new runtime dependency,
so it does not touch **QX-4**. Per plan **A3** it writes no table; per PRD §45.2 it enforces no tenant
or PII boundary — the document arrives already resolved under `TenantContext` by `XPRT-01`.

## Deliverables

1. **`apps/worker/src/handlers/export/json/index.ts`** — the default-exported `ExportRenderer`:
   `format: 'JSON'` (from `packages/contracts`), `extension: 'json'`,
   `contentType: 'application/json'`, `templateVersion: 'json-1'`, and `render(doc, ctx)`.
2. **The export document shape**, versioned independently of `/v1` and stated once in this file:
   ```jsonc
   {
     "schema_version": "1.0",            // this file format's version, not the API's
     "export": {
       "export_job_id": "exp_…",
       "generated_at": "…",              // from ctx.now — the only variable field
       "target_kind": "ANSWER_SNAPSHOT", // one of the four sub-PRD D9 kinds
       "target_id": "ans_…"
     },
     "provenance": {
       "source_snapshot_sha256": "…",    // XPRT-01's snapshotDigest over the snapshot as read
       "snapshot_created_at": "…",
       "corpus_release_id": "cr_…",
       "model_profile": "…", "model_version": "…", "validator_version": "…"
     },
     "answer": { /* the PRD §34.5 payload, field for field */ },
     "licence": {                        // per-citation limit outcome; ids only, no internal notes
       "citations": [{ "id": "cit_…", "quote_included": true, "quote_trimmed": false,
                       "quote_limit_applied": 300, "attribution": "…" }]
     },
     "disclaimer": "…"                   // from XPRT-01's DisclaimerPort — mandatory, non-empty
   }
   ```
   For `RESEARCH_RECORD` targets the `answer` member is a `record` member carrying the record context
   and an ordered `answers[]` array of §34.5 payloads; for `COMPARISON_SNAPSHOT` and
   `COVERAGE_ASSESSMENT` it is the corresponding immutable result payload. The **envelope is identical
   in all four cases**, so a consumer can parse provenance, licence and disclaimer without knowing the
   kind.
3. **Field-for-field fidelity with PRD §34.5.** Every field in the §34.5 example is emitted with the
   same name, the same type and the same meaning: claims with `citation_ids` and `assumption_ids`;
   citations with `document_version_id`, `node_version_id`, `pinpoint`, `start_offset`, `end_offset`,
   `official_url`, `legal_status`, `effective_from`, `effective_to` and `role`; assumptions with
   `source` and `impact_if_false`; `next_checks`; `limitations`; `correction_state`. A committed
   fixture transcribed from PRD §34.5 is asserted against the emitted shape so a renamed or dropped
   field fails loudly. PRD §34.1's null/omission rule is honoured: inapplicable values are **omitted**;
   `null` appears only where "known to be empty" is meaningful (for example `effective_to`).
4. **Canonical, deterministic serialisation.** One canonicaliser: keys sorted lexicographically at
   every level, arrays in document order, UTF-8 without a BOM, `\n` line endings, no insignificant
   whitespace differences between runs, numbers emitted as integers where the source is an integer
   (PRD §34.1's *"Integer micro-AUD … never floating point"* discipline), and no ambient clock or
   randomness — `generated_at` comes from `ctx.now` and `export_job_id` from `ctx.exportId`
   (sub-PRD **D13**).
5. **Hash comparability (`EXP-001`).** `provenance.source_snapshot_sha256` is taken from the document
   `XPRT-01` built (`snapshotDigest`, computed over the snapshot **as read from the database, before
   licence trimming**). This ticket calls it and never re-implements it. A test proves the digest in
   the export equals the digest recomputed from the fixture payload, and that it **changes** when any
   claim text, citation id or offset changes — so *"Export hashes/citations match snapshot"* is a real
   assertion rather than a self-consistent tautology.
6. **Citation identity is copied, never re-derived.** Every `id`, `document_version_id`,
   `node_version_id`, `start_offset` and `end_offset` in the export equals the snapshot's value
   exactly; offsets are not recomputed from the (possibly trimmed) quote. Basis: PRD §15.3 (*"Citations
   MUST target DocumentVersion + NodeVersion + exact offsets + source snapshot, never a SearchChunk"*)
   and `DATA-06` deliverable 5.
7. **Licence outcomes are reported, not recomputed.** The `licence.citations[]` block mirrors what the
   document already carries: whether a quote was included, whether it was trimmed, the applied limit
   and the attribution. Where the document carries no quote (metadata-and-link-only, zero limit, or the
   `XPRT-01` fail-closed default because no port is bound) the `quote` field is **absent** from the
   citation and `quote_included` is `false` — a first-class outcome. No code path in this ticket
   lengthens, reconstructs or re-fetches a quote (sub-PRD **D5**; PRD §11.1, §36.6).
8. **Exclusion by allow-list.** The serialiser emits **only** the fields named in Deliverable 2 — it
   walks the document with an explicit field allow-list rather than serialising whatever the document
   happens to carry, so a future field added upstream cannot leak into the file by default. Combined
   with `XPRT-01`'s `ExportSafetyPort`, this gives the PRD §8.9 exclusion two independent enforcements
   (PRD §8.9; §34.5's *"Provider prompts, hidden reasoning and raw provider responses are never part of
   this customer contract"*; §16.4).
9. **Contract validation.** The emitted document validates against the export type generated from
   `packages/contracts` (`FND-04`) — or, until that type exists (**QX-10**), against a **committed
   JSON Schema in this ticket's test tree** that is asserted equal in shape to the PRD §34.5 fixture.
   `pnpm generate && pnpm generated:check` stays clean; no binding is hand-edited (PRD §20.1;
   `DEV-001`).
10. **Bounded resources and cancellation.** Serialisation streams array members rather than building
    one large string where the document is large; a document beyond a configured byte ceiling fails
    with a bounded error code instead of exhausting the worker (PRD §39.2's 384 MiB); `ctx.signal` is
    honoured between members and an aborted render produces no artifact.
11. **`apps/worker/test/exports/json/goldens/**`** — a committed golden file per shared `XPRT-01`
    fixture (`answer-snapshot`, `answer-snapshot-corrected`, `research-record`, `comparison-snapshot`,
    `coverage-assessment`, `licence-cases`, `contaminated-snapshot`), compared **byte for byte** under
    a fixed clock and export id. Plus `prd-34-5-shape.json` — the PRD §34.5 field list transcribed
    verbatim and asserted against the emitted `answer` member, so a PRD-shape drift fails here first.

## Acceptance checklist (classified)

- [ ] `[machine]` The renderer registers through `XPRT-01`'s registry with `format: 'JSON'` matching its
      directory name, and adding this directory produces **zero** diff outside it — asserted with
      `apps/worker/test/exports/pipeline/renderer-conformance.ts` (`XPRT-01` deliverable 6; plan **A1**)
- [ ] `[fixture]` **Golden comparison** for every shared fixture: the emitted bytes match the committed
      golden exactly under a fixed clock and export id (sub-PRD **D13**; `EXP-001`)
- [ ] `[fixture]` **PRD §34.5 shape parity.** `prd-34-5-shape.json` matches the emitted `answer`
      member field for field; a renamed, dropped or re-typed field fails (PRD §34.5; §34.1)
- [ ] `[fixture]` **PRD §8.9 preservation.** The export carries legal date, corpus release, every claim
      with support status, every citation with pinpoint/role/offsets/official URL/effective interval,
      every assumption **with impact-if-false**, every limitation and `correction_state` — asserted
      element by element against a literal expectation list (PRD §8.9)
- [ ] `[fixture]` **`UAT-EXP-01` data half.** The `answer-snapshot-corrected` export carries the
      **original** `legal_as_at` and `corpus_release_id` and a `correction_state` other than `NONE`;
      no current-law value appears (PRD §41.2 `UAT-EXP-01`; §8.9)
- [ ] `[machine]` **`EXP-001` hash comparability.** `provenance.source_snapshot_sha256` equals the
      digest recomputed from the fixture snapshot payload; changing any claim text, citation id or
      offset changes it; the digest is produced by `XPRT-01`'s `snapshotDigest` and is not
      re-implemented here — asserted by an import check (PRD §30.2 `EXP-001`)
- [ ] `[machine]` **Citation identity is exact.** Every `id`, `document_version_id`, `node_version_id`,
      `start_offset` and `end_offset` equals the snapshot's; offsets are never recomputed from a
      trimmed quote — a property test over generated snapshots finds no divergence (PRD §15.3)
- [ ] `[machine]` **Excerpt-length licence limits hold.** For every citation in `licence-cases.json`,
      the emitted `quote` is at or below `EVID-06`'s effective `EXPORT` limit or **absent** with
      `quote_included: false`; the applied limit, trimming flag and attribution are reported; no code
      path lengthens or reconstructs a quote (PRD §11.1; §8.9; §36.6; sub-PRD **D5**, **QX-2**)
- [ ] `[machine]` With the licence port **unbound** (the `XPRT-01` fail-closed default), the export
      contains **no quote field at all** and is still a complete, valid document — the JSON format's
      proof that the missing `EVID-06` edge (**QX-2**) is harmless (sub-PRD **D5**)
- [ ] `[machine]` **No `packages/citations` import exists** in this file-scope — asserted by a source
      scan, because no `blocked_by` edge grants it (**QX-2**; plan §5.20, §6.2)
- [ ] `[fixture]` **Nothing PRD §8.9 excludes appears in the file.** Rendering
      `contaminated-snapshot.json` and scanning the serialised bytes finds none of the six canaries —
      prompt, hidden reasoning, API key, BYOK credential, internal licensing note, operator comment —
      and none of their field names; a field added to the document but absent from the allow-list does
      **not** appear in the output (PRD §8.9; §9.4; §16.4; §34.5)
- [ ] `[machine]` **The disclaimer is present and non-removable.** Every export carries a non-empty
      `disclaimer`; a stubbed empty disclaimer makes the render **fail** rather than emit a file
      without one (PRD §11.2; §8.10; sub-PRD **D14**)
- [ ] `[machine]` **Determinism and canonical form.** Two renders with the same `ctx` produce
      byte-identical output; keys are sorted at every level; re-serialising a parsed export reproduces
      the same bytes; a source scan finds no `Date.now()`, `Math.random()` or `process.env`
      (sub-PRD **D13**)
- [ ] `[machine]` **Versioning.** `schema_version` is present and is this file format's version, not
      `/v1`; a change to a field's meaning or removal of a field requires a major bump, asserted by a
      test that pins the current version against the golden set (PRD §34.1)
- [ ] `[machine]` **No regeneration is reachable.** A source scan of `handlers/export/json/**` finds no
      import of `packages/model-gateway`, `packages/retrieval-client`, a search client,
      `packages/database`, `node:http(s)`, `node:dns` or `fetch` (sub-PRD **D4**; PRD §8.9)
- [ ] `[machine]` **Bounded resources.** Serialising the largest fixture stays under the configured peak
      memory ceiling; an over-ceiling document fails with a bounded error code; cancellation via
      `ctx.signal` returns promptly and produces no artifact (PRD §39.2; §42.5)
- [ ] `[machine]` **English only** — every product-supplied string this renderer emits (labels inside
      the envelope, the disclaimer fallback) is English (PRD §13.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the export type and every enum come
      from generated `packages/contracts`; no binding is hand-edited (PRD §20.1; `DEV-001`)
- [ ] `[human]` **`UAT-EXP-01` (JSON half)** (PRD §41.2): the founder exports an old corrected answer as
      JSON and confirms the original legal date and release and the correction state, with no
      regeneration. Automated by `23-assurance`/`ASSR-06`
- [ ] `[human]` **PRD §43.4 founder review**, item 6: the founder (or a pilot customer's developer)
      confirms the file is usable as an integration artifact — parseable, self-describing, with a
      documented `schema_version` and a verifiable snapshot hash
- [ ] `[human]` **Gate 2 smoke test** (CLAUDE.md): download an exported JSON from the running product,
      parse it and recompute the snapshot digest against `GET /v1/answers/{id}`
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**EXP-001**, `UAT-EXP-01`,
      `E26-EXPORT`), user-visible change and non-goals, **schema/API/event compatibility — the export
      file's `schema_version` and its bump policy**, tenant/PII/security and retention impact (none
      enforced here), source/licence impact (limits reported, never computed; **QX-2** neutralised by
      **D5**), model/token/cost impact (**none — no model is called**), memory/latency impact against
      the 384 MiB budget, rollback path (revert; `XPRT-05` consumes this ticket), known gaps
      (**QX-2**, **QX-10**)
- [ ] No further `[fixture]` classes — the fixtures are `XPRT-01`'s synthetic snapshots plus this
      ticket's goldens and the PRD §34.5 transcription (plan §1.1)
- No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Every `[machine]` and `[fixture]` step is offline: **no network, no AWS credential, no
model provider**. Rendering is exercised through the `ExportRenderer` interface and through `XPRT-01`'s
pipeline against the in-process object-store stub.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter <the apps/worker package name>`; suites live under
   `apps/worker/test/exports/json/`. Then `pnpm test`, `pnpm test:integration` and
   `pnpm generate && pnpm generated:check` from the root.
3. **Harness.** Reuse `XPRT-01`'s `renderer-conformance.ts` and shared fixtures. Copy the
   PRD-table-as-fixture construction pattern from `EVID-06`'s
   `packages/citations/test/licensing/fixtures/prd-11-1-states.json` for `prd-34-5-shape.json`.
4. **`conformance.test.ts`** — registry discovery, format/directory agreement, `git status
   --porcelain` clean at suite end.
5. **`golden.test.ts`** — render each shared fixture with a fixed clock and export id; compare bytes
   against the committed goldens. Add a field to the document on a scratch branch and confirm the
   golden does **not** change (the allow-list holds), then remove it.
6. **`shape.test.ts`** — `prd-34-5-shape.json` against the emitted `answer` member; assert the
   null/omission rule (an inapplicable value is absent, `effective_to` may be `null`).
7. **`digest.test.ts`** — assert the export's digest equals the recomputed one; mutate a claim text, a
   citation id and an offset in turn and assert the digest changes each time; assert by import scan
   that `snapshotDigest` is imported from `XPRT-01`'s pipeline and not redefined.
8. **`citation-identity.test.ts`** — property test over generated snapshots: every citation identity
   field and offset in the export equals the snapshot's.
9. **`licence.test.ts`** — per-citation limit assertions over `licence-cases.json`; the
   metadata-and-link-only case emits no `quote`; then unbind the licence port and assert a complete
   export with no `quote` anywhere.
10. **`exclusion.test.ts`** — render `contaminated-snapshot.json`; scan the serialised bytes for all six
    canaries and their field names; assert none. Add a synthetic `internal_debug` field to the document
    and assert it is absent from the output (allow-list proof).
11. **`disclaimer.test.ts`** — presence in every export; stubbed empty disclaimer makes the render fail.
12. **`determinism.test.ts`** — render twice, compare bytes; re-serialise a parsed export and compare;
    source-scan for `Date.now()`, `Math.random()`, `process.env`.
13. **`imports.test.ts`** — assert no import of `packages/citations`, `packages/database`,
    `packages/model-gateway`, `packages/retrieval-client`, `node:http(s)`, `node:dns` or `fetch`.
14. **`resources.test.ts`** — largest fixture under a memory watcher; over-ceiling failure code;
    cancellation.
15. **Reviewer focus.** Confirm that (a) the digest is computed once, upstream, and only reported here;
    (b) offsets are copied, never recomputed from a trimmed quote — the subtle bug that would make
    citations unverifiable; (c) the field allow-list is genuinely an allow-list, not a deny-list;
    (d) an unbound licence port yields an excerpt-free but complete file; (e) `schema_version` is the
    file's, not the API's.
16. **`[human]` steps**, last, against a deployed or locally composed stack (`pnpm stack:up`):
    `UAT-EXP-01` (JSON half); the developer usability read; the Gate 2 digest recomputation.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/19-exports/README.md` (version +0.1 with a changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The `ExportDocument` lacks a field the envelope needs.** → Add it in `XPRT-01`'s
  `pipeline/source.ts` through a docs change to **`XPRT-01`'s ticket** plus
  `docs/prd/19-exports/README.md`, `--sync`, then consume it here. Never read a repository or call an
  endpoint from a renderer (sub-PRD **D4**).
- **The excerpt fields are empty because no renderer has bound `EVID-06`'s port yet** (**QX-2**). →
  That is the **designed** fail-closed outcome (**D5**), not a defect: emit a metadata-and-link-only
  export and record it. If the product genuinely needs JSON exports to carry excerpts before
  `XPRT-02`/`XPRT-03` land, that is a **missing plan edge**: write back to
  `docs/prd/breakdown-plan.md` §5.20 + §6.2 for an `EVID-06 → XPRT-04` edge and to
  `docs/prd/19-exports/README.md` **QX-2** *before* importing `packages/citations`.
- **`packages/contracts` has no generated export type** (**QX-10**). → Raise a docs change against
  `FND-04`, merge, `--sync`, regenerate, then consume it. Until then the committed JSON Schema in this
  ticket's test tree is the binding shape — never a hand-edited generated binding (PRD §20.1).
- **A consumer asks for a field the PRD §34.5 contract does not carry** (a rendered HTML body, a
  scoring value, a model rationale). → `PRD §34.5` is explicit that prompts, hidden reasoning and raw
  provider responses *"are never part of this customer contract"*. Record the request in
  `docs/prd/19-exports/README.md` with the **Founder** as owner (PRD §45.5 "Product change"); never add
  it because a consumer found it convenient.
- **Canonical serialisation disagrees with an existing canonicaliser in the repository.** → Use the
  same one `XPRT-01`'s `snapshotDigest` uses; two canonicalisations would make the digest
  irreproducible. If they must differ, state the difference in `XPRT-01`'s `pipeline/hash.ts` docs and
  in this ticket, in one docs PR, `--sync` both.

**3. Escalation — two non-negotiable classes.**

- **Anything that would regenerate, re-retrieve or recompute answer content at export time** — including
  recomputing citation offsets, re-deriving a support status or re-summarising a claim — overturns
  PRD §8.9's *"They MUST NOT regenerate the answer using current law"* and `EXP-001`, and it would make
  the exported hash meaningless. Stop and escalate through the PRD §45.5 product-change path.
- **Anything that emits a field PRD §8.9 or §34.5 excludes** — a prompt, a reasoning trace, a raw
  provider payload, a credential or an internal licensing note — is a data-exposure defect in a file
  that leaves the building, and JSON is the format where it is most likely to be added "because a
  consumer wanted it". Escalate for re-review; never widen the allow-list without a Founder-approved
  product change.
