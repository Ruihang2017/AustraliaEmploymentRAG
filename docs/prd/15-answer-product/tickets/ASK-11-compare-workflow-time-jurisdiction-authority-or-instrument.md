---
id: ASK-11
title: Compare workflow (TIME / JURISDICTION / AUTHORITY_OR_INSTRUMENT)
module: 15-answer-product
lane: 15-answer-product
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-02]
blocks: [ASK-12]
---

# ASK-11 — Compare workflow (TIME / JURISDICTION / AUTHORITY_OR_INSTRUMENT)

Implements PRD §8.6 (Compare), §32.5 (Compare screen contract) and §34.6 (comparison request),
carrying requirements **CMP-001** and **CMP-002** (`E23`).
**No ADR — the decision is already made in PRD §8.6; this is build ticket 11 of 12 against it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-02` — Quick workflow in worker](ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §8.6's per-dimension isolation rule, PRD §32.5's three comparison types and PRD §34.6's request
payload) — not a new subsystem decision.

## Background + basis

Compare is where symmetry is seductive. A side-by-side layout invites the system to fill every cell,
and a language model will happily produce a plausible sentence for a jurisdiction whose source was
unavailable. PRD §8.6 forbids exactly that, in one sentence.

**PRD §8.6 — Compare** is normative and reproduced in full:

> Compare MUST support jurisdiction, time and authority/instrument dimensions. **Each dimension MUST
> run its own date, jurisdiction and status filtering and MUST have its own claims/citations.** The
> product MUST distinguish **textual changes from changes in legal effect**. **An evidence failure in
> one dimension MUST NOT cause fabricated symmetry in other dimensions.**

**PRD §32.5 — Compare** fixes the three types and their bounds, and the result shape:

> The setup screen requires **exactly one comparison type per job**:
>
> - `TIME`: same issue/instrument at **2–4 legal dates**;
> - `JURISDICTION`: same issue at **2–9 jurisdictions** and one legal date;
> - `AUTHORITY_OR_INSTRUMENT`: **2–4 named documents/versions**.
>
> The result includes a common issue row, one column per dimension, textual change, legal-effect
> change, claim/citation set, gaps and **a synthesis that never hides a missing column**. Users can
> open any cell as an evidence panel.

**PRD §34.6 — Comparison request** is normative:

```json
{
  "comparison_type": "TIME",
  "question": "How did the applicable official rule change?",
  "dimensions": [
    {"label": "Before", "legal_as_at": "2024-08-03", "jurisdictions": ["CTH"]},
    {"label": "Current", "legal_as_at": "2026-08-03", "jurisdictions": ["CTH"]}
  ],
  "document_ids": ["doc_..."],
  "retention_mode": "SAVE",
  "research_record_id": "rec_..."
}
```

> Coverage/Compare jobs use the **same job, SSE, idempotency, cancellation, retention and budget
> semantics as answers**. Their completed snapshots contain dimension/stage-specific claims,
> citations, assumptions and gaps.

**PRD §16.2 — Compare and coverage:** `POST /v1/comparisons` and `GET /v1/comparison-jobs/{job_id}`.

**PRD §35.5** gives the persistence shape (owned by `DATA-06`):

> `comparison_snapshot` | `id`, tenant/record/job linkage, `comparison_type`, `dimensions_json`,
> result ciphertext, release/model metadata | **immutable formal result**

**PRD §30.2** register rows this ticket carries:

> `CMP-001` — *"Compare supports time, jurisdiction and instrument/authority dimensions"*, evidence
> *"Each dimension has independent filters and citations"*.
> `CMP-002` — *"A missing side remains unavailable rather than being made symmetrical"*, evidence
> *"One-sided-source fixture passes"*.

**PRD §41.2** acceptance scripts:

> `UAT-CMP-01` — Compare same instrument across two legal dates → *Each column uses its own version;
> textual and legal-effect changes distinguished*
> `UAT-CMP-02` — One jurisdiction source unavailable → *Available columns remain; missing column
> clearly unavailable, not fabricated*

**PRD §36.2** eligibility applies **per dimension**: requested date within the effective interval,
jurisdiction intersection, permitted status, licence-permitted use, and membership of the pinned
CorpusRelease. PRD §15.2's temporal model and PRD §36.2's *"Future/proposed research changes the
allowed status set but never relabels future material as current"* apply to each column independently.

**PRD §9.4 applies unchanged** to every dimension: `retrieve → evidence pack → structured claims →
deterministic validation → render → final status check`, with unsupported claims removed and the
answer downgraded or refused.

**PRD §8.3's release rule applies to the whole job**: *"preserve a single pinned CorpusRelease for the
entire answer"* — a `TIME` comparison varies the **legal date**, not the release.

**Contracts this ticket builds against (all already published):**

- `RUNT-01`'s A1 route-area contract; `RUNT-02`'s admission chain; `RUNT-04`'s A1 worker handler
  contract.
- `ASK-01`'s exported `admitAnswerJob` — Compare admission reuses the identical PRD §18.5 step 2
  transaction (sub-PRD **D5**), per PRD §34.6's "same job … semantics as answers".
- `ASK-02`'s `pipeline/index.ts` exported surface and `commit.ts` — the PRD §9.4 sequence is imported,
  never copied (sub-PRD **D7**).
- `ASK-05`'s `createAnswerEventEmitter` with a supplied stage vocabulary.
- `ASK-04`'s serialiser helpers for PRD §34.5-shaped claims and citations, `EVID-06`'s licence quote
  limits and the code-generated `official_url` rule.
- `DATA-06`'s immutable `comparison_snapshot` repository.
- `packages/domain/src/legal` (`FND-10`) for temporal applicability and the PRD §9.1 authority
  hierarchy — used to decide *legal-effect* change rather than restating the rules here.

**Accepted caveats carried forward:**

- **The comparison result read endpoint is not literally in PRD §16.2.** §16.2 lists only the create
  and job-status endpoints, but PRD §31.2 requires a `/comparisons/:snapshotId` screen. This ticket
  adopts `GET /v1/comparisons/{comparisonSnapshotId}` — sub-PRD open question **Q-ASK-2**, to be
  reconciled with `FND-04`'s OpenAPI root.
- Distinguishing a **textual** change from a change in **legal effect** is a legal judgement bounded by
  evidence: where the evidence supports only "the text differs", the result says exactly that and
  marks the legal-effect determination `INSUFFICIENT_EVIDENCE`. It never infers effect from wording
  alone (PRD §8.6, §9.4).

## Goal

Ship the `comparison` worker handler area and the `comparisons` route area so a comparison job runs
each dimension as an **independent execution** — its own PRD §36.2 hard filters, its own retrieval,
its own evidence pack, its own claims and citations, its own validation — and commits an immutable
snapshot with one column per dimension, a common issue row, textual-change and legal-effect-change
findings, per-dimension gaps and a synthesis that never hides a missing column. Completion is
mechanically checkable: a one-sided-source fixture leaves the available columns intact and marks the
failed column explicitly unavailable with **zero** claims, citations or values derived from a sibling
dimension; and a `TIME` comparison opens each column at its own legal date with its own version.

## Non-goals

- **No new admission transaction.** Compare admission calls `ASK-01`'s exported `admitAnswerJob`
  (PRD §34.6).
- **No copy of the PRD §9.4 pipeline.** `ASK-02`'s `pipeline/index.ts` is imported (sub-PRD **D7**).
- **No SSE transport or event allowlist.** `RUNT-03` and `ASK-05`.
- **No screens.** `apps/web/src/features/compare/**` is `ASK-12`, which is `blocked_by` this ticket.
- **No retrieval, ranking, hard-filter implementation or version timeline.** `11-retrieval-engine`;
  document/version reads are `14-search-product`'s endpoints where a screen needs them.
- **No validator, evidence pack, licence limits or sanitisation.** `12-evidence-safety`.
- **No temporal or authority-hierarchy rules.** `packages/domain/src/legal` (`FND-10`); this ticket
  calls it.
- **No tables, migrations or repositories.** `01-app-data` — breakdown plan **A3**, PRD §45.2/§44.3.
- **No Coverage or Deep.** `ASK-08` and `ASK-10`.
- **No export rendering of comparisons.** `19-exports` (PRD §8.9 includes comparisons).

## File-scope (write-owns)

- `apps/worker/src/handlers/comparison/**`
- `apps/api/src/routes/comparisons/**`
- `apps/worker/test/comparison/**` and `apps/api/test/comparisons/**` — this ticket's own tests
  (breakdown plan §1.1).
- `apps/worker/package.json`, `apps/api/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/worker/src/handlers/answer/**` — `ASK-02` (and `events/**` — `ASK-05`);
  `handlers/deep/**` — `ASK-10`; `handlers/coverage/**` — `ASK-08`;
  `handlers/{change-matching,alerts,notifications,rerun,correction,export}/**` — `16`, `17`, `19`;
  `apps/worker/src/{main.ts,runtime,queues}/**` and `handlers/maintenance/**` — `RUNT-04`.
- `apps/api/src/routes/answers/**` — `ASK-01`; `routes/answer-jobs/**` — `ASK-03`;
  `routes/answer-snapshots/**` — `ASK-04`; `routes/coverage-assessments/**` — `ASK-08`; every other
  route area — `13`, `14`, `16`, `17`, `19`, `20`, `22`;
  `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` — `03-app-runtime`.
- `apps/web/**` — `RUNT-05` and the product feature areas, including `features/compare/**`
  (`ASK-12`).
- `packages/**`, `services/**`, `pipelines/**`, `schemas/**`, `infra/**`, `evals/**`, `tests/**` —
  `00`, `01`, `02`, `03`, `04`, `05`, `11`, `12`, `18`, `21`, `23`; root manifests and lockfiles —
  `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so neither `apps/worker/src/handlers/comparison/**` nor
`apps/api/src/routes/comparisons/**` has been written and nothing contends for them. Under breakdown
plan **A1** both directories self-register by convention, so adding them produces **zero** diff to
`03-app-runtime`'s files or to any sibling area — the property that keeps
`handlers/{answer,deep,coverage,comparison}` and the five `routes/*` subtrees disjoint here and
disjoint from the other modules owning `apps/worker/src/handlers/*` and `apps/api/src/routes/*`. This
ticket registers job type `COMPARISON`; `RUNT-04` fails boot on a duplicate `type`, so the value is
fixed in the sub-PRD ownership table. The URL-space hazard is resolved the same way: this area declares
`area.prefix: '/v1'` and registers only the three comparison paths, with the module-wide parameter
names `:jobId` and `:comparisonSnapshotId` (sub-PRD **D3**). Concurrent siblings at this wave are
`ASK-07` (`apps/web/src/features/answers/**`) and `ASK-10` (`handlers/deep/**`) — different
directories; both import `ASK-02`'s pipeline read-only. Per breakdown plan **A3**, **this ticket
writes no table, no migration and no repository**; `comparison_snapshot` is `DATA-06`'s.

## Deliverables

1. **`apps/api/src/routes/comparisons/index.ts`** — the route area. Default-exports the Fastify plugin
   and exports `export const area = { prefix: '/v1', admission: 'tenant' } satisfies RouteAreaConfig`
   (sub-PRD **D1**). It registers **exactly three** routes (sub-PRD **D2**): `POST /comparisons`,
   `GET /comparison-jobs/:jobId`, `GET /comparisons/:comparisonSnapshotId`.
2. **Admission and validation.** `POST /comparisons` declares `idempotent: true` and
   `requiresPiiAdmission: true` (the `question` is free text). It validates the PRD §34.6 body and the
   PRD §32.5 bounds — **exactly one** `comparison_type` per job, and:
   - `TIME` — 2–4 dimensions, each with its own `legal_as_at`, the same issue/instrument;
   - `JURISDICTION` — 2–9 dimensions over the controlled jurisdiction list, **one** shared
     `legal_as_at`;
   - `AUTHORITY_OR_INSTRUMENT` — 2–4 named `document_ids`/version ids.
   Out-of-range counts, a mixed type, a duplicate `label` and an unknown jurisdiction are
   `400 INVALID_REQUEST` naming the offending field. It then calls **`ASK-01`'s `admitAnswerJob`**
   with `job_type: 'COMPARISON'` and implements no transaction of its own.
3. **`GET /comparison-jobs/:jobId`** — job status in the shape `ASK-01` returns, with no provider
   payload, prompt, reasoning or cost detail, and `410 EPHEMERAL_CONTENT_EXPIRED` for an expired
   ephemeral job (PRD §10.4).
4. **`GET /comparisons/:comparisonSnapshotId`** — the immutable comparison read (sub-PRD
   **Q-ASK-2**): `schema_version`, `id`, `record_id`, `job_id`, `comparison_type`, `question`,
   `legal_context`, `corpus_release_id`, `created_at`, **`common_issue`**, **`dimensions[]`** and
   **`synthesis`**. Each dimension carries
   `{ label, availability, legal_as_at, jurisdictions, document_version_ids, claims[], citations[],
   assumptions[], gaps[], textual_change, legal_effect_change, unavailable_reason? }`. Claims and
   citations use the PRD §34.5 shapes, licence-limited by `EVID-06` and with code-generated
   `official_url`s — reuse `ASK-04`'s serialiser helpers rather than re-deriving them.
5. **`apps/worker/src/handlers/comparison/index.ts`** — the `JobHandlerModule` with one `JobHandler`:
   `type: 'COMPARISON'`, `queue: 'interactive_research'` (PRD §39.5), and the ordered `stages` list:

   | # | Stage name | `idempotent` | Purpose |
   |---|---|---|---|
   | 1 | `RESOLVE_COMMON_ISSUE` | `true` | fix the single issue every column answers (PRD §32.5 "common issue row") |
   | 2 | `RUN_DIMENSIONS` | `true` | each dimension's independent PRD §9.4 execution |
   | 3 | `DIFF` | `true` | textual change vs legal-effect change, per pair (PRD §8.6) |
   | 4 | `SYNTHESISE` | `false` | the cross-column synthesis that never hides a missing column |
   | 5 | `VALIDATE` | `true` | `EVID-05` over the synthesis, plus at most one `REPAIR` |
   | 6 | `COMMIT` | `false` | §18.5 step 6 |

6. **Dimension isolation, enforced as a type boundary (sub-PRD D11).** `DimensionExecution` is
   constructed from `{ label, legalAsAt, jurisdictions, documentVersionIds, statusSet }` and its
   retrieval, evidence pack, claims and citations are reachable **only** through that value. There is
   no shared mutable evidence pool, no cross-dimension evidence id space, and no code path that can
   read another dimension's pack or claims while building one. This is the structural expression of
   PRD §8.6's *"Each dimension MUST run its own date, jurisdiction and status filtering and MUST have
   its own claims/citations."*
7. **Per-dimension filters.** Each dimension applies PRD §36.2's eligibility with **its own** requested
   date, **its own** jurisdiction set and **its own** permitted status set, against the job's single
   pinned `corpus_release_id` (sub-PRD **D6**). A `TIME` comparison varies `legal_as_at` only — the
   release is the same for every column, so a 2024 column opens the version effective in 2024 rather
   than the current text (PRD §8.3, §15.2; `UAT-CMP-01`, and the search-side analogue `UAT-SRCH-03`).
   Future/proposed material is never relabelled current in any column (PRD §36.2).
8. **Per-dimension availability.** `availability` is one of `AVAILABLE`, `UNAVAILABLE_SOURCE_MISSING`,
   `UNAVAILABLE_SOURCE_NOT_CURRENT`, `UNAVAILABLE_LICENCE_RESTRICTED`,
   `UNAVAILABLE_INSUFFICIENT_EVIDENCE` (values from `packages/contracts`, `FND-03`). A dimension that
   fails **commits with zero claims, zero citations and an `unavailable_reason`** — it is never
   dropped from `dimensions[]`, never merged into a sibling, and never filled from one (PRD §8.6,
   §32.5; `CMP-002`).
9. **`diff.ts` — textual change vs legal-effect change.** For each comparable pair the stage produces:
   - `textual_change` — a deterministic comparison of the exact source text at each column's
     `node_version_id`/offsets, with **no model involvement**;
   - `legal_effect_change` — a claim-level determination, produced by the PRD §9.4 sequence and
     validated by `EVID-05`, using `packages/domain/src/legal` (`FND-10`) for temporal applicability
     and the PRD §9.1 hierarchy. Where the evidence supports only "the text differs", it is
     `INSUFFICIENT_EVIDENCE`, explicitly **not** "no change in effect" — absence of evidence is not
     evidence of equivalence (PRD §8.6, §9.4).
   A pair in which either side is unavailable produces **no** diff, only a recorded gap.
10. **`synthesis.ts` — the cross-column synthesis that never hides a missing column.** Its hosted call
    receives, per column, only that column's **validated** claims and its availability, plus the
    explicit list of unavailable columns and their reasons. The prompt inputs make an unavailable
    column an explicit fact rather than an absence. After validation, the synthesis is rejected — and
    the status downgraded — if it (a) makes an assertion about an unavailable column, (b) cites a
    citation id belonging to a different column than the claim it supports, or (c) asserts symmetry
    ("the same applies in …") over a column with no claims. All three checks are deterministic
    post-conditions, not prompt instructions (PRD §8.6, §32.5; `CMP-002`).
11. **Citation ownership.** Every citation is stamped with its owning dimension label, and a claim may
    reference only citations from its **own** dimension. `EVID-05` runs per dimension with that
    dimension's evidence pack, so a cross-dimension citation cannot validate. The synthesis's claims
    cite per-column claim ids, never raw evidence from a column it did not run.
12. **`events/vocabulary.ts`** — the comparison stage vocabulary for `ASK-05`'s emitter, mapping each
    stage to a user-readable name (for example `Fixing the common issue`, `Comparing <label>`,
    `Identifying textual and legal-effect changes`, `Drafting the comparison`,
    `Validating citations`) with the dimension label as bounded context. It declares no new SSE event
    type and emits no reasoning (PRD §32.3, §34.4).
13. **`commit.ts`** — one transaction writing the immutable `comparison_snapshot` through `DATA-06`
    (`comparison_type`, `dimensions_json`, the per-dimension claims/citations/assumptions/gaps and the
    synthesis), the model/retrieval metadata, `EVID-08`'s settlement, the terminal job status, the
    audit event and the outbox event, with `job.completed` emitted only afterwards (PRD §18.5
    steps 6–7, §35.5, §35.8 invariants 1 and 2). A comparison produces **one** snapshot; dimensions are
    internal structure, not separate answers.
14. **Cancellation and limits.** `JobContext.signal` is checked at every stage boundary and between
    dimension executions; the `interactive_research` class caps apply (PRD §39.5, §36.7 Deep column as
    the class default). Full reservation release before any hosted call, actual-cost settlement after
    (PRD §33.2).

## Acceptance checklist (classified)

- [ ] `[machine]` **`CMP-001`**: all three comparison types are accepted with their PRD §32.5 bounds —
      `TIME` 2–4 dates, `JURISDICTION` 2–9 jurisdictions at one date, `AUTHORITY_OR_INSTRUMENT` 2–4
      named documents — and exactly one type per job; out-of-range, mixed-type and duplicate-label
      requests return `400 INVALID_REQUEST` naming the field (PRD §32.5, §34.6)
- [ ] `[machine]` **`CMP-001` isolation**: each dimension applies its **own** date, jurisdiction and
      status filters — asserted by instrumenting the retrieval client and comparing per-dimension
      filter arguments; a shared or merged filter set fails (PRD §8.6; §30.2 `CMP-001` *"Each dimension
      has independent filters and citations"*)
- [ ] `[machine]` A claim may cite only citations from its own dimension — asserted at the type level
      and by a runtime attempt to attach a sibling column's citation (PRD §8.6)
- [ ] `[fixture]` **`CMP-002` / `UAT-CMP-02`**: a one-sided-source fixture (one jurisdiction's source
      unavailable) commits with the available columns intact and the failed column present in
      `dimensions[]` with `availability != AVAILABLE`, an `unavailable_reason`, **zero claims and zero
      citations** — and no value in the available columns is derived from it (§30.2 `CMP-002`)
- [ ] `[machine]` The synthesis is rejected and the status downgraded if it asserts anything about an
      unavailable column, cites across columns, or asserts symmetry over a column with no claims —
      three deterministic post-condition tests (PRD §8.6, §32.5)
- [ ] `[fixture]` **`UAT-CMP-01`**: a `TIME` comparison of one instrument at 2024 and 2026 opens **each
      column at its own version**; `textual_change` is computed from exact source text with no model
      involvement, and `legal_effect_change` is a validated claim-level determination (PRD §8.6, §15.2)
- [ ] `[machine]` Where evidence supports only "the text differs", `legal_effect_change` is
      `INSUFFICIENT_EVIDENCE` and never "no change in effect" (PRD §8.6, §9.4)
- [ ] `[machine]` A pair with either side unavailable produces no diff, only a recorded gap (PRD §8.6)
- [ ] `[machine]` **`ANS-004` equivalent**: one pinned `corpus_release_id` for the whole job; a `TIME`
      comparison varies `legal_as_at` only; a test that swaps the active release mid-job still yields
      the originally pinned value (PRD §8.3, §36.2; sub-PRD **D6**)
- [ ] `[machine]` Future/proposed material is never relabelled current in any column (PRD §36.2)
- [ ] `[machine]` **`ANS-005`**: every dimension runs `ASK-02`'s exported PRD §9.4 sequence — asserted
      by per-dimension call-order instrumentation; a claim rejected by `EVID-05` is absent from the
      committed snapshot; the sequence is **not** re-implemented here (source scan; sub-PRD **D7**)
- [ ] `[machine]` Admission uses `ASK-01`'s `admitAnswerJob`: one transaction, one reservation, one
      job, one outbox event; a forced failure leaves none of them; the route is idempotent and returns
      `409 IDEMPOTENCY_CONFLICT` on a changed body (PRD §34.6, §18.5, §34.1)
- [ ] `[machine]` A comparison commits **one** `comparison_snapshot` and one settlement; dimensions
      produce no additional snapshot (PRD §18.5, §35.5)
- [ ] `[machine]` The committed `comparison_snapshot` is immutable — no update or delete path exists in
      this area (PRD §35.8 invariant 5)
- [ ] `[machine]` `GET /v1/comparisons/{id}` returns per-dimension claims/citations in PRD §34.5 shape
      with licence-limited quotes and code-generated `official_url`s, and **no** prompt, reasoning or
      provider payload — canary asserted absent (PRD §34.6, §36.6, §11.1)
- [ ] `[machine]` **Tenant isolation**: another organisation's `jobId`/`comparisonSnapshotId` and an
      absent id return byte-identical `404 RESOURCE_NOT_FOUND` bodies apart from `request_id`
      (PRD §16.5)
- [ ] `[machine]` The SSE stage vocabulary declares no new event type and emits no reasoning; an
      undeclared payload key throws at `ASK-05`'s emitter (PRD §32.3, §34.4)
- [ ] `[machine]` These two areas register exactly the three method+path pairs in the sub-PRD ownership
      table (`RUNT-01`; sub-PRD **D2**)
- [ ] `[machine]` **A3 guard**: no import of `packages/database/migrations`, a schema module or an
      unscoped connection in either area (breakdown plan **A3**/**R4**; PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `CMP-001`, `CMP-002`, `UAT-CMP-01` and
      `UAT-CMP-02`
- [ ] `[human]` `UAT-CMP-01` and `UAT-CMP-02` rehearsed end to end once `ASK-12` has merged, plus
      PRD §43.4 founder review of the synthesis wording when a column is unavailable (PRD §41.2,
      §43.4) — **not required to merge this ticket**; the `[machine]`/`[fixture]` rows are the merge
      gate
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/worker` and `pnpm test --filter @aer/api`. Suites live under
   `apps/worker/test/comparison/` and `apps/api/test/comparisons/`.
3. **Harness.** `ASK-02`'s worker test factories and pipeline doubles; a fake
   `packages/retrieval-client` seeded from the committed `CRPS-08` fixture bundle plus synthetic
   fixtures committed under `apps/worker/test/comparison/fixtures/`: one instrument with **two
   versions** effective in 2024 and 2026 (`UAT-CMP-01`), two jurisdictions where one has **no**
   eligible source (`UAT-CMP-02`), a pair whose text differs but whose legal effect is unevidenced, and
   a licence-restricted source. `EVID-07`'s recorded-response provider double; a temp-file
   `app.sqlite` migrated with `DATA-01`'s runner. No socket, no network, no provider key.
4. **`request.test.ts`** — the PRD §32.5 bounds: 1 and 5 dimensions for `TIME`, 1 and 10 for
   `JURISDICTION`, 1 and 5 for `AUTHORITY_OR_INSTRUMENT`; two types in one body; duplicate labels; an
   unknown jurisdiction. Assert `400 INVALID_REQUEST` naming the field and no job created.
5. **`isolation.test.ts`** — instrument the retrieval client; run a three-column `JURISDICTION` job;
   assert three distinct filter argument sets. Then attempt, at the type level and at runtime, to
   attach column B's citation to column A's claim; assert both fail.
6. **`one-sided.test.ts`** (`UAT-CMP-02`) — the unavailable-jurisdiction fixture; assert the failed
   column is present with `availability != AVAILABLE`, an `unavailable_reason`, zero claims and zero
   citations; assert every claim in the available columns cites only its own column; diff the available
   columns against a control run without the failing column and assert they are unchanged.
7. **`synthesis-guard.test.ts`** — feed three recorded provider syntheses that respectively (a) assert
   a fact about the unavailable column, (b) cite across columns, (c) assert "the same applies in
   <unavailable column>". Assert each is rejected and the status downgraded.
8. **`time.test.ts`** (`UAT-CMP-01`) — the two-version instrument at 2024-08-03 and 2026-08-03; assert
   each column resolved a different `node_version_id`, that `textual_change` was computed without any
   gateway invocation, and that `legal_effect_change` carries validated claims.
9. **`effect-vs-text.test.ts`** — the text-differs-but-effect-unevidenced fixture; assert
   `legal_effect_change === 'INSUFFICIENT_EVIDENCE'` and that the string "no change in effect" appears
   nowhere in the committed snapshot.
10. **`pinning.test.ts`** — swap the active release between dimension executions; assert every column
    used the originally pinned id and that only `legal_as_at` varied.
11. **`pipeline-reuse.test.ts`** — instrument `ASK-02`'s exported stage functions; assert per-dimension
    PRD §9.4 call order; source-scan this area for any local retrieval/pack/synthesis/validation
    implementation.
12. **`admission.test.ts`** — post the literal PRD §34.6 comparison JSON; assert one job, one
    reservation, one outbox event; fault-inject and assert none; repeat the key and assert one job;
    mutate the body and assert `409`.
13. **`read.test.ts`** and **`isolation-http.test.ts`** — the snapshot read shape, licence limits,
    code-generated URLs, canary absence, and the cross-tenant 404 matrix.
14. **`routes.test.ts`** — boot this area with `ASK-01`'s, `ASK-04`'s and `ASK-08`'s fixture areas;
    assert three method+path pairs here and no collision or parameter-name conflict.
15. Reviewer greps the diff for: any shared evidence pool across dimensions, any citation without an
    owning dimension label, any synthesis input containing a sibling column's raw evidence, any
    "no change in effect" default, any copy of the PRD §9.4 sequence, any `CREATE TABLE`, and any
    second resolution of the corpus release.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`GET /v1/comparisons/{comparisonSnapshotId}` is not in PRD §16.2** → sub-PRD **Q-ASK-2**. Confirm
  the path here, record it in `docs/prd/15-answer-product/README.md`, and raise a `FND-04` ticket so
  the OpenAPI root carries it. A different path is a docs PR against **this** ticket plus `ASK-12`,
  then `--sync` both.
- **Running every dimension independently is expensive** (N dimensions ⇒ N retrievals and up to N
  hosted calls, against PRD §24.1's A$50 ceiling) → the answer is **bounds**, not sharing:
  PRD §32.5 already caps dimensions at 4/9/4 and the `interactive_research` class caps concurrency.
  Record the measurement in `docs/prd/15-answer-product/README.md` and coordinate with `EVID-08` on
  the reservation. **Never** share an evidence pack across dimensions to save a call — that is the
  mechanism by which fabricated symmetry appears (PRD §8.6).
- **The synthesis reads better when it fills a missing column with "presumably similar"** → PRD §8.6
  and §32.5 forbid it outright, and `UAT-CMP-02` tests it. Do not soften the post-conditions. Record
  any pressure in `docs/prd/15-answer-product/README.md` and route it to the Founder as a product
  change.
- **`FND-10` cannot express a legal-effect determination the diff needs** → record the gap in
  `docs/prd/15-answer-product/README.md`, raise a `00-foundation` ticket, and **fail closed**:
  `INSUFFICIENT_EVIDENCE`, never an inferred equivalence. Do not restate PRD §9.1's hierarchy locally
  (PRD §45.2).
- **`DATA-06`'s `comparison_snapshot` cannot hold the per-dimension result** → do not write
  `packages/database/**` (breakdown plan **A3**/**R4**). Raise a new `01-app-data` ticket, add the
  `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.16/§6.2, and record it in the sub-PRD.
- **`ASK-02`'s exported pipeline surface does not fit a dimension execution** → change it there, in one
  docs PR against `ASK-02` plus this ticket, and `--sync` both. Never fork the PRD §9.4 sequence.

**3. Escalation.** PRD §8.6's sentence — *"An evidence failure in one dimension MUST NOT cause
fabricated symmetry in other dimensions"* — is the product's central invariant for this feature. Any
change that shares an evidence pool across dimensions, lets a claim cite a sibling column, drops an
unavailable column from the result, or permits the synthesis to speak about a column with no claims
manufactures an unvalidated legal statement and overturns PRD §8.6 and §9.4. Stop, escalate for
re-review through the PRD §45.5 product-change path, and record the outcome in
`docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never relax a
dimension-isolation guard inside this ticket.
