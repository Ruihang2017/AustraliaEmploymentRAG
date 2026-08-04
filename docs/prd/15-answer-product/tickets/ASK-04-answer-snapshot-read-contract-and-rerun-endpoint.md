---
id: ASK-04
title: Answer snapshot read contract and rerun endpoint
module: 15-answer-product
lane: 15-answer-product
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [ASK-02]
blocks: [ASK-07, RCRD-03]
---

# ASK-04 — Answer snapshot read contract and rerun endpoint

Implements PRD §34.5 (Answer Snapshot) and §16.2's answer read/rerun endpoints, carrying requirements
**ANS-006** and the API half of **REC-002** (`E21`).
**No ADR — the decision is already made in PRD §34.5 and §35.8 invariant 5; this is build ticket 4 of
12 against it.**
Parent sub-PRD: [15-answer-product README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`ASK-02` — Quick workflow in worker](ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(PRD §34.5's literal payload and PRD §35.8's immutability invariant) — not a new subsystem decision.

## Background + basis

An Answer Snapshot is the product's durable artifact: it is what gets exported, cited, reviewed,
corrected and compared. PRD §8.7 states *"Formal answers MUST be immutable Answer Snapshots"* and
*"Rerun under current law MUST create a new version and support comparison with the prior answer."*
This ticket is the read contract for that artifact plus the admission of a rerun.

**PRD §34.5 — Answer Snapshot** is normative and reproduced in full:

```json
{
  "schema_version": "1.0",
  "id": "ans_...",
  "record_id": "rec_...",
  "answer_version": 2,
  "status": "CONDITIONAL",
  "short_answer": "It depends on the unresolved facts listed below.",
  "legal_as_at": "2026-08-03",
  "knowledge_cutoff_at": "2026-08-03T02:51:00Z",
  "jurisdictions": ["CTH", "VIC"],
  "corpus_release_id": "cr_...",
  "claims": [
    {
      "id": "clm_...",
      "sequence": 1,
      "kind": "APPLICATION",
      "text": "Conditional application stated in customer-readable English.",
      "support_status": "CONDITIONAL",
      "citation_ids": ["cit_..."],
      "assumption_ids": ["asm_..."]
    }
  ],
  "citations": [
    {
      "id": "cit_...",
      "role": "SUPPORTS",
      "document_version_id": "dv_...",
      "node_version_id": "nv_...",
      "pinpoint": "cl 4.1",
      "quote": "Exact permitted source excerpt…",
      "start_offset": 44,
      "end_offset": 92,
      "official_url": "https://official.example/...",
      "legal_status": "IN_FORCE",
      "effective_from": "2026-07-01",
      "effective_to": null
    }
  ],
  "assumptions": [
    {
      "id": "asm_...",
      "text": "The employer is a constitutional corporation.",
      "source": "USER_NOT_CONFIRMED",
      "impact_if_false": "The workplace-relations system and applicable instruments may differ."
    }
  ],
  "next_checks": ["Confirm the unresolved employer fact."],
  "limitations": ["No customer contract or employee record was reviewed."],
  "correction_state": "NONE",
  "created_at": "2026-08-03T03:00:12Z"
}
```

> **Provider prompts, hidden reasoning and raw provider responses are never part of this customer
> contract.** An internal immutable execution record stores hashes, versions, tokens, latency and
> cost, not hidden chain-of-thought.

**PRD §16.2 — Answers** fixes the two endpoints this ticket owns:

> - `GET /v1/answers/{answer_snapshot_id}`
> - `POST /v1/answers/{answer_snapshot_id}/rerun`

**PRD §35.8 invariant 5:** *"Formal snapshots and legal corpus versions have no UPDATE/DELETE
application path; corrections append replacements."* **PRD §30.2 `REC-002`** states the rerun
promise and its evidence: *"Rerun under current law creates a new answer and diff"*, evidence
*"Original legal date/release/output are unchanged"* — tested manually as `UAT-REC-01`: *"Rerun a 2024
saved answer under current law → New snapshot/version and diff; original remains byte-for-byte
unchanged."*

**PRD §15.5** gives the two controlled vocabularies the payload uses:

> Claim support values: `DIRECTLY_SUPPORTED`, `SUPPORTED_BY_INFERENCE`, `CONDITIONAL`,
> `CONTRADICTED`, `NOT_SUPPORTED`. Citation roles: `SUPPORTS`, `QUALIFIES`, `CONTRADICTS`, `DEFINES`,
> `BACKGROUND_ONLY`. **`BACKGROUND_ONLY` evidence cannot independently support a definitive legal
> claim.**

**PRD §11.1/§11.2 licensing** bounds what may be returned: `EVID-06` owns the quote limits, and this
read applies them identically to the UI and to exports — PRD §8.9 requires export quote limits, and
an unbounded read endpoint would be the bypass.

**PRD §31.2** gives the surface and its audience:

> `/answers/:snapshotId` | Answer snapshot | **authorised record members** | Read/cite/report/export |
> Correction/review banner if applicable

**PRD §10.4** bounds the ephemeral case: an ephemeral answer is readable until expiry, and after
expiry every read returns `410 EPHEMERAL_CONTENT_EXPIRED`.

**PRD §30.2 `ANS-006`:** *"Answer renders status, short answer, explanation, assumptions, authorities,
next checks and limitations"*, evidence *"Contract snapshot and accessibility test pass"* — the
contract-snapshot half is this ticket; the accessibility half is `ASK-07`.

**Contracts this ticket builds against (all already published):**

- `RUNT-01`'s A1 route-area contract and typed `ApiError` factories over PRD §34.9.
- `RUNT-02`'s admission chain; this area declares `admission: 'tenant'`, and the rerun route declares
  `idempotent: true`.
- `DATA-06`'s research repositories: immutable snapshot/claim/citation/assumption reads, the
  `UNIQUE (organization_id, record_id, answer_version)` and `UNIQUE (job_id)` constraints, and the
  repository types that expose **no** `update`/`delete` member for immutable tables.
- `ASK-01`'s `service.ts` admission surface (`admitAnswerJob`) — reused by rerun so a rerun is an
  ordinary admitted job with its own reservation, pinned release and outbox event.
- `EVID-06`'s licence-aware quotation limits.

**Accepted caveats carried forward:**

- The **worker** side of rerun — executing it and producing the version diff — is `RCRD-03`
  (`apps/worker/src/handlers/rerun/**` and `apps/api/src/routes/record-answers/**`), which is
  `blocked_by` this ticket. This ticket freezes the rerun **job type and payload**; a `RCRD-03`
  requirement the frozen shape cannot express is a docs PR against this ticket (sub-PRD **Q-ASK-4**).
- `correction_state` is displayed here but owned by `17-records-collab` (`RCRD-07`) and `DATA-07`'s
  `correction` table. This ticket reads it and never writes it.

## Goal

Ship the `answer-snapshots` route area so `GET /v1/answers/{answerSnapshotId}` returns the PRD §34.5
payload exactly — property for property, with no prompt, reasoning or provider payload — and
`POST /v1/answers/{answerSnapshotId}/rerun` admits a **new** job that will produce a **new** snapshot
and a new `answer_version`, leaving the original byte-for-byte unchanged. Completion is mechanically
checkable: a contract-snapshot test compares the response to the literal PRD §34.5 JSON; a rerun leaves
the original row and its serialised bytes identical; and there is no code path in this area that can
update or delete a snapshot, a claim, a citation or an assumption.

## Non-goals

- **No job admission transaction of its own.** Rerun calls `ASK-01`'s exported `admitAnswerJob`;
  the reservation, pinning, job creation and outbox semantics are `ASK-01`'s and are not restated.
- **No worker rerun execution and no version diff.** `RCRD-03` (`17-records-collab`) owns
  `apps/worker/src/handlers/rerun/**` and the diff surface, and is `blocked_by` this ticket.
- **No record CRUD, turns, review actions, comments, issues or corrections.** `17-records-collab`
  (`RCRD-01`…`RCRD-07`).
- **No job status, SSE, cancel or clarification endpoints.** `ASK-01` and `ASK-03`.
- **No coverage or comparison snapshot reads.** `ASK-08` and `ASK-11` own their own read endpoints.
- **No export rendering.** `19-exports` (`XPRT-01`…`XPRT-04`), which reads this same snapshot and must
  apply the identical licence limits (`EVID-06`).
- **No screens.** `apps/web/src/features/answers/**` is `ASK-07`, which is `blocked_by` this ticket.
- **No tables, migrations or repositories.** `01-app-data` — breakdown plan **A3**, PRD §45.2/§44.3.
- **No licence-limit implementation.** `EVID-06` owns it; this ticket calls it.
- **No OpenAPI authoring.** `FND-04` (serial-owned).

## File-scope (write-owns)

- `apps/api/src/routes/answer-snapshots/**`
- `apps/api/test/answer-snapshots/**` — this ticket's own unit/integration tests (breakdown plan
  §1.1).
- `apps/api/package.json` — **append-only** (breakdown plan §1.1).

Does not touch:

- `apps/api/src/routes/answers/**` — `ASK-01`; `apps/api/src/routes/answer-jobs/**` — `ASK-03`;
  `apps/api/src/routes/coverage-assessments/**` — `ASK-08`; `apps/api/src/routes/comparisons/**` —
  `ASK-11`.
- `apps/api/src/{server.ts,app.ts,bootstrap,errors,plugins,middleware,sse}/**` and
  `routes/{health,system-status}/**` — `03-app-runtime`.
- Every other `apps/api/src/routes/<area>/**` — `13`, `14`, `16`, `17`, `19`, `20`, `22`. In
  particular `routes/record-answers/**` is `RCRD-03`'s.
- `apps/worker/**`, `apps/web/**` — `03-app-runtime` plus the product subtrees.
- `packages/**`, `schemas/**`, `infra/**`, `tests/**` — `00`, `01`, `02`, `03`, `11`, `12`, `18`,
  `23`; root manifests and lockfiles — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `apps/api/src/routes/answer-snapshots/**` and
nothing contends for it. Under breakdown plan **A1** this directory self-registers, producing zero
diff outside itself. Concurrent siblings at this wave are `ASK-03` (`routes/answer-jobs/**`),
`ASK-05` (`apps/worker/src/handlers/answer/events/**`) and `ASK-08` — all different directories. The
URL-space hazard is real and is resolved by the sub-PRD's ownership table: this area declares
`area.prefix: '/v1'` and registers **only** `GET /answers/:answerSnapshotId` and
`POST /answers/:answerSnapshotId/rerun`, which never collide with `ASK-01`'s `POST /v1/answers`
because `RUNT-01` detects collisions on **method + path** and these are different paths; the parameter
name `:answerSnapshotId` is fixed module-wide (sub-PRD **D3**) so no sibling area can declare a
conflicting name at the same position. Per breakdown plan **A3**, **this ticket writes no table, no
migration and no repository**.

## Deliverables

1. **`apps/api/src/routes/answer-snapshots/index.ts`** — the route area. Default-exports the Fastify
   plugin and exports
   `export const area = { prefix: '/v1', admission: 'tenant' } satisfies RouteAreaConfig`
   (sub-PRD **D1**). It registers **exactly two** routes (sub-PRD **D2**):
   `GET /answers/:answerSnapshotId` and `POST /answers/:answerSnapshotId/rerun`.
2. **`apps/api/src/routes/answer-snapshots/serialise.ts`** — the PRD §34.5 payload assembled from
   `DATA-06`'s repositories, **property for property in the PRD's order**: `schema_version`, `id`,
   `record_id`, `answer_version`, `status`, `short_answer`, `legal_as_at`, `knowledge_cutoff_at`,
   `jurisdictions`, `corpus_release_id`, `claims[]`, `citations[]`, `assumptions[]`, `next_checks`,
   `limitations`, `correction_state`, `created_at`. Claim objects carry `id`, `sequence`, `kind`,
   `text`, `support_status`, `citation_ids`, `assumption_ids`; citation objects carry `id`, `role`,
   `document_version_id`, `node_version_id`, `pinpoint`, `quote`, `start_offset`, `end_offset`,
   `official_url`, `legal_status`, `effective_from`, `effective_to`. Claims are ordered by `sequence`
   and assumptions by their stored sequence, so two reads of one snapshot are byte-identical.
3. **The exclusion list, enforced by construction.** The serialiser is built from an explicit
   **allowlist** of fields; a field present on the repository row but absent from the allowlist is
   never emitted. This is how PRD §34.5's *"Provider prompts, hidden reasoning and raw provider
   responses are never part of this customer contract"* is enforced mechanically rather than by
   review. Internal execution metadata (`model_execution`, `retrieval_run`, prompt/validator versions,
   token counts, cost) is **not** in the allowlist.
4. **`apps/api/src/routes/answer-snapshots/licence.ts`** — applies `EVID-06`'s per-source
   `licence_quote_limit` to every `citation.quote` before serialisation, trimming or reducing to
   metadata/link-only exactly as the licence assessment requires (PRD §11.1, §36.6 *"Quote/display/
   export is licence-permitted — Trim/metadata-link-only; never bypass"*). The same helper is what
   `19-exports` must use, so the UI and the export cannot diverge.
5. **`official_url` is code-generated.** Every citation's `official_url` is constructed from the
   stored `document_version_id`/`node_version_id` through the system's own URL builder, never read
   from model output (PRD §9.4, §36.6 *"URL is code-generated official URL"*). If a stored citation
   somehow carries a foreign URL, the read fails closed with `500 INTERNAL_ERROR` rather than emitting
   it.
6. **Read authorisation.** `GET` resolves the snapshot through the `TenantContext`-scoped repository
   and additionally checks record membership per PRD §31.2 ("authorised record members") using
   `packages/domain/src/access` (`FND-06`). A snapshot in another organisation, a snapshot the caller
   may not read, and an absent id all return the **same** `404 RESOURCE_NOT_FOUND` (PRD §16.5,
   §34.9).
7. **Ephemeral reads.** An answer produced by an `EPHEMERAL` job is readable from `DATA-08`'s
   ephemeral store until expiry; after expiry the read returns `410 EPHEMERAL_CONTENT_EXPIRED`
   (PRD §10.4, §34.9). The response never mixes ephemeral content into an `app.sqlite`-backed payload.
8. **`ETag` and caching.** Because the snapshot is immutable, the response carries a strong `ETag`
   derived from the snapshot id plus `correction_state`, and honours `If-None-Match` with `304`. It is
   marked `Cache-Control: private, no-store` so customer research content is not cached by shared
   infrastructure (PRD §10.3 *"API request/response bodies: not logged by default"*; PRD §34.1).
9. **`apps/api/src/routes/answer-snapshots/rerun.ts`** — `POST /answers/:answerSnapshotId/rerun`.
   It loads the original snapshot, builds a **new** job payload from the original's question, facts,
   jurisdictions and record linkage, applies the requested legal context (default: today, i.e. "under
   current law" — PRD §8.7), and calls `ASK-01`'s `admitAnswerJob`. The result is the same PRD §34.3
   `202` job object. Load-bearing rules:
   - the rerun job **pins the release current at rerun time**, not the original's (that is the point
     of a rerun — PRD §8.7 "under current law"), while the original's pinned release is untouched;
   - the original snapshot row and every child row are **not written** by this route in any way —
     there is no update or delete path (PRD §35.8 invariant 5);
   - the new snapshot's `answer_version` is allocated by `DATA-06`'s
     `UNIQUE (organization_id, record_id, answer_version)` constraint, not by this route;
   - `retention_mode` is inherited, and a rerun of an `EPHEMERAL` answer whose content has expired
     returns `410 EPHEMERAL_CONTENT_EXPIRED` rather than reconstructing the question;
   - the route declares `idempotent: true`, so a network retry returns the original rerun job
     (PRD §33.2).
10. **The frozen rerun job payload.** `rerun.ts` exports `RerunJobPayload`
    (`{ source_answer_snapshot_id, record_id, legal_as_at, jurisdictions, retention_mode }`) and the
    job type value from `packages/contracts` (`FND-03`). This is the contract `RCRD-03` builds its
    worker handler and diff against (sub-PRD **Q-ASK-4**); it does not change without a docs PR
    against this ticket.
11. **`apps/api/src/routes/answer-snapshots/errors.ts`** — mapping to `RUNT-01`'s typed factories
    using only PRD §34.9 codes: `RESOURCE_NOT_FOUND`, `EPHEMERAL_CONTENT_EXPIRED`,
    `IDEMPOTENCY_CONFLICT`, `CREDIT_LIMIT_REACHED`, `GENERATION_UNAVAILABLE`, `CORPUS_INCOMPATIBLE`,
    `RATE_LIMITED`, `INTERNAL_ERROR`. Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are
    returned as `status` in a `200` body and never as an HTTP error (PRD §34.9 closing paragraph).

## Acceptance checklist (classified)

- [ ] `[machine]` **`ANS-006`**: `GET /v1/answers/{id}` returns the literal PRD §34.5 JSON, property
      for property and in order, with only ids and timestamps substituted — a committed contract
      snapshot test (PRD §34.5; §30.2 `ANS-006` "Contract snapshot … test passes")
- [ ] `[machine]` The response contains **no** prompt, hidden reasoning, raw provider payload, token
      count, cost, prompt/validator version or retrieval internals — asserted by planting canaries in
      the stored `model_execution` and `retrieval_run` rows and requiring their absence from the
      response bytes (PRD §34.5, §16.2, §37.3)
- [ ] `[machine]` Claim `support_status` values are exactly PRD §15.5's five and citation `role` values
      exactly its five; a `BACKGROUND_ONLY` citation is never the sole support of a definitive claim
      in any served snapshot (PRD §15.5)
- [ ] `[machine]` Every `citation.quote` respects `EVID-06`'s `licence_quote_limit`; a source assessed
      metadata/link-only returns no quote at all (PRD §11.1, §36.6)
- [ ] `[machine]` Every `official_url` is produced by the system URL builder; a stored citation
      carrying a foreign URL fails closed rather than being emitted (PRD §9.4, §36.6)
- [ ] `[machine]` Two consecutive reads of one snapshot are byte-identical (claims ordered by
      `sequence`, assumptions by stored order) (PRD §34.5)
- [ ] `[machine]` **`REC-002` / `UAT-REC-01`**: after a rerun, the original snapshot row and its
      serialised bytes are **unchanged** — asserted by hashing the `GET` response before and after
      (PRD §8.7, §35.8 invariant 5)
- [ ] `[machine]` Rerun admits a **new** job with its own reservation, its own pinned release (current
      at rerun time) and its own outbox event, via `ASK-01`'s `admitAnswerJob` — asserted by row counts
      before/after (PRD §8.7, §18.5)
- [ ] `[machine]` This area exposes **no** update or delete path to a snapshot, claim, citation or
      assumption — asserted at type level against `DATA-06`'s immutable repository types plus a source
      scan for `UPDATE`/`DELETE` (PRD §35.8 invariant 5; `REC-001`)
- [ ] `[machine]` Rerun is idempotent: the same actor/route/`Idempotency-Key`/body returns the original
      rerun job; a changed body returns `409 IDEMPOTENCY_CONFLICT` (PRD §33.2, §34.1)
- [ ] `[machine]` **Tenant and membership isolation**: another organisation's snapshot, a snapshot the
      caller may not read, and an absent id return byte-identical `404 RESOURCE_NOT_FOUND` bodies apart
      from `request_id` (PRD §16.5, §31.2; `UAT-AUTH-03`)
- [ ] `[machine]` An expired ephemeral answer returns `410 EPHEMERAL_CONTENT_EXPIRED` on both `GET`
      and rerun (PRD §10.4, §34.9)
- [ ] `[machine]` `ETag`/`If-None-Match` returns `304` for an unchanged snapshot; the response is
      `Cache-Control: private, no-store` (PRD §34.1, §10.3)
- [ ] `[machine]` A snapshot whose status is `INSUFFICIENT_EVIDENCE` or `CONFLICTING_SOURCES` is served
      as `200` with that `status`, never as an HTTP error (PRD §34.9 closing paragraph)
- [ ] `[machine]` This area registers exactly the two method+path pairs in the sub-PRD ownership table
      and no others (`RUNT-01`; sub-PRD **D2**)
- [ ] `[machine]` **A3 guard**: no import of `packages/database/migrations`, a schema module or an
      unscoped connection (breakdown plan **A3**/**R4**; PRD §45.2, `SEC-001`)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ANS-006`, `REC-002` and `UAT-REC-01`
- [ ] `[fixture]` The contract snapshot test replays a committed synthetic answer fixture (produced by
      `ASK-02`'s recorded-provider run against the `CRPS-08` release) and reproduces the PRD §34.5
      shape offline — no network, no provider key (sub-PRD **D15**)
- [ ] `[human]` `UAT-REC-01` rehearsed end to end once `ASK-07` and `RCRD-03` have merged: rerun a 2024
      saved answer under current law and confirm the original is byte-for-byte unchanged (PRD §41.2) —
      **not required to merge this ticket**; the `[machine]` rows are the merge gate
- [ ] No `cargo test --workspace` / `uv run pytest` item — no Rust or Python is touched (PRD §45.3)

## Test plan

Reviewer steps, all reproducible offline with no network and no provider key.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/answer-snapshots/`.
3. **Harness.** Fastify `inject()`; temp-file `app.sqlite` + `ephemeral.sqlite` migrated with
   `DATA-01`'s runner; tenancy factories from `DATA-04`; research factories from
   `packages/database/test/research/factories.ts` (`DATA-06`); a committed synthetic snapshot fixture
   in `apps/api/test/answer-snapshots/fixtures/answer-snapshot.json` whose shape matches
   `packages/ui/test/fixtures/answer-snapshot.json` (`RUNT-06`) so the API and UI fixtures stay in
   step.
4. **`contract.test.ts`** — seed the fixture snapshot, `GET` it, and compare to the literal PRD §34.5
   JSON with ids/timestamps normalised. Assert key order and the absence of any key not in the PRD
   payload.
5. **`leak.test.ts`** — write `prompt-canary-<uuid>`, `reasoning-canary-<uuid>` and
   `provider-canary-<uuid>` into the seeded `model_execution`/`retrieval_run` rows; `GET`; assert none
   of the three appears in the response bytes.
6. **`licence.test.ts`** — seed two citations, one from a source with a 200-character quote limit and
   one assessed metadata/link-only; assert trimming and quote omission respectively. Assert the same
   helper is exported for `19-exports` to use.
7. **`url.test.ts`** — seed a citation whose stored URL is `https://evil.example/x`; assert the read
   fails closed and that a correctly stored citation's `official_url` is produced by the builder.
8. **`rerun.test.ts`** — hash the `GET` response; rerun; assert a new `job` row with its own
   reservation and its own `corpus_release_id`, assert the original response hash is unchanged, and
   assert `answer_snapshot` row count for the original is still 1. Repeat the rerun with the same
   idempotency key and assert one job; with a mutated body and assert `409`.
9. **`immutability.test.ts`** — a `@ts-expect-error` compile assertion that the repository types used
   here have no `update`/`delete` member, plus a source scan of this area for `UPDATE`/`DELETE`.
10. **`isolation.test.ts`** — the cross-tenant and cross-membership matrix; assert byte-identical 404
    bodies apart from `request_id`.
11. **`ephemeral.test.ts`** — read an ephemeral answer before and after expiry; assert `200` then
    `410 EPHEMERAL_CONTENT_EXPIRED` on both `GET` and rerun.
12. **`caching.test.ts`** — `ETag` round trip and `Cache-Control` header assertions.
13. **`routes.test.ts`** — boot this area together with `ASK-01`'s fixture area through
    `registerRouteAreas`; assert exactly two method+path pairs here, no collision with
    `POST /v1/answers`, and no parameter-name conflict.
14. Reviewer greps the diff for: any `UPDATE`/`DELETE` against a research table, any serialiser field
    not on the allowlist, any URL taken from stored model output, any second admission implementation
    that bypasses `ASK-01`'s `admitAnswerJob`, and any `CREATE TABLE`.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), then `docs/prd/15-answer-product/README.md`, then
`.claude/scripts/publish-tickets.mjs --sync`, and only then change code (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **PRD §34.5's payload is missing a field the result screen needs** (for example a per-claim
  freshness badge) → that is an **API/product change** under PRD §45.5, and PRD §34 says property
  names *"cannot drift from"* the examples *"without PRD/API change control"*. Raise it as an open
  question in `docs/prd/15-answer-product/README.md`, coordinate a `FND-04` OpenAPI ticket, and align
  `ASK-07` in the same docs PR. Do not add an undocumented property.
- **`RCRD-03` needs a rerun payload this ticket did not freeze** → sub-PRD **Q-ASK-4**. Amend
  `RerunJobPayload` here, in a docs PR against **this** ticket plus `RCRD-03`, then `--sync` both.
  Never let `17-records-collab` define a second rerun payload.
- **A snapshot genuinely needs a mutable field** (for example `correction_state` when a correction
  lands) → PRD §35.8 invariant 5 says corrections **append replacements**, and `DATA-06`'s ticket
  already carries this exact friction with the same instruction. Record it in
  `docs/prd/15-answer-product/README.md`, coordinate with `DATA-06`, `DATA-07` and `RCRD-07`, and
  never add an update path in this area.
- **`EVID-06`'s licence helper is not callable from the API process** → that would let the UI and the
  export diverge, which PRD §8.9 and §11.1 forbid. Record the constraint in
  `docs/prd/15-answer-product/README.md` and raise a `12-evidence-safety` docs PR; do not re-implement
  quote limits here.
- **Rerun needs to write a record link or a version diff** → those are `17-records-collab`'s
  (`RCRD-03`, `routes/record-answers/**`). Add the requirement there, not here.

**3. Escalation.** Two properties are customer-facing promises, not local design: **the snapshot is
immutable** (PRD §35.8 invariant 5, `REC-001`) and **provider prompts, hidden reasoning and raw
provider responses are never part of this contract** (PRD §34.5). A change that would make a snapshot
mutable, or that would let internal execution detail reach the customer payload, overturns PRD §34.5
and §35.8 and is exactly the path by which an unvalidated or private artifact reaches a user. Stop,
escalate for re-review through the PRD §45.5 product-change path, and record the outcome in
`docs/prd/15-answer-product/README.md` and `docs/prd/breakdown-plan.md`. Never widen the serialiser
allowlist as a convenience.
