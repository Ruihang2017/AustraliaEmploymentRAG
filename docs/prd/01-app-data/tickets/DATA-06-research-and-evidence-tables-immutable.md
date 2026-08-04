---
id: DATA-06
title: Research and evidence tables (immutable)
module: 01-app-data
lane: 01-app-data
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-05]
blocks: [DATA-09, ASK-01, RCRD-01, XPRT-01]
---

# DATA-06 — Research and evidence tables (immutable)

Implements PRD §15.5 and §35.5 — persistence half of **REC-001** and **ANS-004** (`E04-APPDB`).
No ADR — the decision is already made in PRD §35.5 and §35.8 invariants 1, 3, 5 and 7; this is build
ticket 6 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-05 — Execution tables + packages/jobs lease primitives](DATA-05-execution-tables-packages-jobs-lease-primitives.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.5's table list plus the §35.8 immutability invariants) — not a new subsystem
decision.

## Background + basis

This group holds the product's durable customer value: the saved research and the immutable answer
snapshots every export, rerun, diff, correction and alert refers to.

**PRD §35.5 — App database: research and evidence** is normative and reproduced in full:

> | Table | Required columns | Critical constraints/indexes |
> |---|---|---|
> | `research_record` | `id`, `organization_id`, `title`, `owner_user_id`, `reviewer_user_id`, `workflow_status`, `legal_context_json`, `tags_json`, `row_version`, `deleted_at` | tenant composite FKs; soft delete lifecycle |
> | `research_turn` | `id`, `organization_id`, `record_id`, `sequence`, `turn_type`, `content_ciphertext`, `supersedes_turn_id`, `actor_id`, `created_at` | immutable; unique record sequence |
> | `answer_snapshot` | `id`, `organization_id`, `record_id`, `answer_version`, `job_id`, `status`, `short_answer_ciphertext`, `legal_as_at`, `jurisdictions_json`, `knowledge_cutoff_at`, `corpus_release_id`, model/profile/prompt/validator versions, `correction_state`, `created_at` | immutable; unique record/version and job/result |
> | `answer_claim` | `id`, `organization_id`, `answer_id`, `sequence`, `kind`, `text_ciphertext`, `support_status` | immutable; unique answer/sequence |
> | `claim_citation` | `id`, `organization_id`, `answer_id`, `claim_id`, `role`, `document_version_id`, `node_version_id`, `start_offset`, `end_offset`, `quote_ciphertext`, `validation_json` | exact offsets; corpus IDs copied as stable references |
> | `answer_assumption` | `id`, `organization_id`, `answer_id`, `sequence`, `text_ciphertext`, `source`, `confirmed`, `impact_if_false_ciphertext` | immutable with answer |
> | `coverage_assessment` | `id`, tenant/record/job linkage, `legal_as_at`, `stage_results_ciphertext`, `status`, release/model metadata | immutable formal result |
> | `comparison_snapshot` | `id`, tenant/record/job linkage, `comparison_type`, `dimensions_json`, result ciphertext, release/model metadata | immutable formal result |
> | `comment` | `id`, `organization_id`, target type/id, `body_ciphertext`, `actor_id`, `resolved_at`, `row_version` | target must belong to same tenant |
> | `review_action` | `id`, `organization_id`, `record_id`, `from_status`, `to_status`, `actor_id`, `reason_ciphertext`, `created_at` | append-only; drives state transition |

**PRD §15.5** gives the entity meanings and the two controlled vocabularies:

> Claim support values: `DIRECTLY_SUPPORTED`, `SUPPORTED_BY_INFERENCE`, `CONDITIONAL`,
> `CONTRADICTED`, `NOT_SUPPORTED`.
> Citation roles: `SUPPORTS`, `QUALIFIES`, `CONTRADICTS`, `DEFINES`, `BACKGROUND_ONLY`.
> `BACKGROUND_ONLY` evidence cannot independently support a definitive legal claim.

(The enum values themselves are `FND-03`'s canonical enums; the CHECK constraints are generated from
them, PRD §35.1.)

**PRD §35.8** — the four invariants this group must make structurally true:

> 1. An Answer Snapshot and its claims/citations/assumptions **commit atomically**.
> 3. A citation's node version must belong to the answer's **pinned corpus release**.
> 5. Formal snapshots and legal corpus versions have **no UPDATE/DELETE application path**;
>    corrections append replacements.
> 7. `CUSTOMER_REVIEWED` can be reached **only through a ReviewAction**.

**PRD §15.3**: *"Citations MUST target DocumentVersion + NodeVersion + exact offsets + source
snapshot, never a SearchChunk."*
**PRD §34.3**: *"For `SAVE`, exactly one of `research_record_id` or `new_record` is required.
**Creating a record and admitting the job occur in the same transaction.** For `EPHEMERAL`, both
fields must be absent."* — this is why record creation must be callable inside `ASK-01`'s
transaction, and it is the concrete basis of plan §2.1 **A3**.
**PRD §34.1**: *"Concurrency | Mutable resources return `ETag`; writes require `If-Match` where
documented."* **PRD §34.9**: `409 CONCURRENT_MODIFICATION` — *"Reload latest ETag"*.
**PRD §30.2**: REC-001 — *"Saved research stores immutable turns and Answer Snapshots"*, evidence
*"No update path mutates an existing formal snapshot"*; REC-004 — evidence *"Invalid transition and
stale ETag return 409"*; ANS-004 — *"Each answer uses one pinned corpus release and approved model
profile"*, evidence *"Snapshot contains release, profile and actual model version"*.
**PRD §10.3**: *"Deleted customer records: 30-day recoverable period, then primary deletion"* — the
basis for `deleted_at` soft deletion rather than row removal.
**PRD §37.3**: `SAVE` content lives in "Encrypted app rows"; the `*_ciphertext` columns use
`DATA-03`'s codec.

Accepted caveats carried forward:

- `document_version_id`, `node_version_id` and `corpus_release_id` live in `corpus.sqlite`
  (PRD §18.3), so they are **copied stable references**, exactly as PRD §35.5 says. Invariant 3 is
  therefore an application invariant checked at write time against the snapshot's own pinned
  release, not a SQL foreign key.
- The legal workflow transition table (PRD §32.6) is `FND-08`'s
  (`packages/domain/src/workflow/**`), and this ticket is **not** `blocked_by` it. This ticket
  therefore enforces only the structural half of invariant 7 — a `workflow_status` change requires a
  `review_action` row written in the same transaction — and `RCRD-04` (which is `blocked_by FND-08`)
  enforces which transitions are legal. Do not import `FND-08` here; the edge does not exist.

## Goal

Add the ten PRD §35.5 tables as one expand-only, timestamp-prefixed migration with
`packages/database/src/schema/research.ts` and `packages/database/src/repos/research/**`, such that:
a formal snapshot and its claims, citations and assumptions can only be written by a single
all-or-nothing call; the immutable tables have no update or delete path in either the repository API
or the database (BEFORE UPDATE/DELETE triggers); every citation is rejected unless its
`corpus_release_id` equals its answer's pinned release; `research_record` supports `row_version`
compare-and-swap for `If-Match` and `deleted_at` soft deletion; and `workflow_status` cannot move
without a `review_action` in the same transaction. Completion is mechanically checkable by the
schema assertion plus the immutability, atomicity and concurrency suites.

## Non-goals

- **No routes, screens or diffing.** `17-records-collab` (`RCRD-01`…`RCRD-09`) owns
  `apps/api/src/routes/{research-records,research-turns,record-answers,review-actions,comments,issues,corrections}/**`
  and `apps/web/src/features/records/**`; `15-answer-product` owns the answer surfaces. Both are
  `blocked_by` this ticket.
- **No workflow transition table.** `FND-08` (`packages/domain/src/workflow/**`); see the caveat
  above — this ticket is deliberately not `blocked_by` it and must not import it.
- **No answer generation, evidence packing, validation or refusal logic.** `12-evidence-safety`
  (`EVID-*`), `15-answer-product` (`ASK-*`), `FND-07`.
- **No corrections or issue reports.** `issue_report`/`correction` are PRD §35.6 tables owned by
  `DATA-07` (sub-PRD D3). This ticket only guarantees the original answer stays immutable so a
  correction can link a replacement.
- **No export rendering.** `19-exports` (`XPRT-*`), which is `blocked_by` this ticket.
- **No usage/cost rows.** `DATA-07`; `model_execution` is `DATA-05`.
- **No invariant registry.** `DATA-09` owns `src/invariants/**` and registers the cross-cutting
  property tests through `DATA-02`'s pre-commit hook registry; this ticket enforces at its own
  repository and trigger boundary (sub-PRD D5).

## File-scope (write-owns)

- `packages/database/src/schema/research.ts`
- `packages/database/src/repos/research/**`
- `packages/database/migrations/<UTC YYYYMMDDHHMMSS>_research.sql` (matches plan §5.2's
  `migrations/*_research.sql`)
- `packages/database/test/research/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json` — append-only (sub-PRD D9)

- Does not touch: `src/migrate/**`, `migrations/0001_*` (`DATA-01`) · `src/tenant/**` (`DATA-02`) ·
  `src/crypto/**` (`DATA-03`) · `src/schema/tenancy.ts`, `src/repos/tenancy/**`,
  `migrations/*_tenancy.sql` (`DATA-04`) · `src/schema/execution.ts`, `src/repos/execution/**`,
  `migrations/*_execution.sql`, `packages/jobs/**` (`DATA-05`) · `src/schema/operations.ts`,
  `src/repos/operations/**`, `migrations/*_operations.sql` (`DATA-07`) · `src/ephemeral/**`
  (`DATA-08`) · `src/invariants/**`, `test/invariants/**` (`DATA-09`) · `apps/**`, `tests/**`.

**Serial safety.** First decomposition — nothing merged, no in-flight contention. The concurrent
sibling is `DATA-07` (wave 5, `src/schema/operations.ts`, `src/repos/operations/**`,
`migrations/*_operations.sql`); the two file-scopes are disjoint, and because migrations are
timestamp-prefixed and expand-only (plan **A5**), the two groups do **not** serialise on the
migrations directory even though both reference `job` from `DATA-05` — that shared dependency is
already ordered by both tickets' `blocked_by: [DATA-05]`. `src/schema/*.ts` is a glob, not a barrel
(sub-PRD D4).

## Deliverables

1. **Migration** `<timestamp>_research.sql`, expand-only, created with
   `nextMigrationFilename('research')`, creating the ten tables with `DATA-01`'s §35.1 conventions,
   `DATA-02`'s `tenantForeignKey`/`tenantUnique`, and `DATA-03`'s `encryptedColumnDdl` for every
   `*_ciphertext` column. All ten tables are `TENANT`-scoped.
2. **Uniqueness and indexes stated by PRD §35.5**: `research_turn` `UNIQUE (organization_id,
   record_id, sequence)`; `answer_snapshot` `UNIQUE (organization_id, record_id, answer_version)`
   **and** `UNIQUE (job_id)` ("unique record/version and job/result" — the second is what makes
   at-least-once worker execution produce one observable answer, PRD §18.5); `answer_claim`
   `UNIQUE (organization_id, answer_id, sequence)`; `answer_assumption`
   `UNIQUE (organization_id, answer_id, sequence)`; `claim_citation` indexed by
   `(organization_id, answer_id, claim_id)`.
3. **Immutability, enforced twice.** For `research_turn`, `answer_snapshot`, `answer_claim`,
   `claim_citation`, `answer_assumption`, `coverage_assessment`, `comparison_snapshot` and
   `review_action`:
   - the repository type produced by `defineTenantRepository` has **no** `update`/`delete` member
     (`mutability: 'IMMUTABLE' | 'APPEND_ONLY'`, `DATA-02`); and
   - the migration adds `BEFORE UPDATE` and `BEFORE DELETE` triggers that `RAISE(ABORT, …)`, so even
     a raw statement cannot mutate them (PRD §35.8 invariant 5; REC-001 "No update path mutates an
     existing formal snapshot").
   The only permitted mutation on a snapshot is `correction_state`, and only if it is modelled as an
   append elsewhere — if a column must actually change, state the exception explicitly in the schema
   file with its PRD citation, and raise it per the feedback obligation.
4. **Atomic snapshot write (invariant 1).**
   `writeAnswerSnapshot(tx, ctx, { snapshot, claims, citations, assumptions })` — one call, one
   transaction, all-or-nothing. There is **no** public API that writes a claim, citation or
   assumption independently of its snapshot (PRD §35.8 invariant 1; PRD §18.5 step 6).
5. **Pinned-release check (invariant 3).** `claim_citation` carries `corpus_release_id`
   denormalised; `writeAnswerSnapshot` rejects any citation whose `corpus_release_id`,
   `document_version_id` or `node_version_id` set is inconsistent with the snapshot's pinned release,
   with a typed `CITATION_RELEASE_MISMATCH` error. Citations target
   DocumentVersion + NodeVersion + exact `start_offset`/`end_offset`, never a chunk (PRD §15.3);
   the repository rejects `start_offset >= end_offset` and negative offsets.
6. **`research_record` mutability.** `update(ctx, id, patch, { ifMatch: rowVersion })` performing a
   compare-and-swap (`WHERE row_version = ?` and increment); a stale version returns a typed
   `CONCURRENT_MODIFICATION` (PRD §34.1, §34.9, REC-004). `etagFor(record)` derives the ETag value
   from `row_version` so `RCRD-01` does not invent its own.
7. **Soft delete lifecycle.** `softDelete(ctx, id, now)` sets `deleted_at`; every default read and
   list excludes soft-deleted rows; `restore(ctx, id)` works within the 30-day window;
   `purgeDeletedBefore(cutoff)` is the only hard-delete path and is exposed for the maintenance job
   (PRD §10.3 "Deleted customer records: 30-day recoverable period, then primary deletion"). Purging
   a record must not orphan its immutable children — cascade explicitly and record the order.
8. **Invariant 7 (structural half).** `workflow_status` can only be changed by
   `applyReviewAction(tx, ctx, { recordId, fromStatus, toStatus, actorId, reason })`, which writes the
   `review_action` row and the status change in the same transaction and refuses when
   `fromStatus` does not match the current value. There is no other write path to `workflow_status`;
   in particular, `update()`'s patch type excludes it. Which transitions are *legal* is `RCRD-04`'s
   (via `FND-08`).
9. **Record creation inside a caller's transaction.** `createRecord(tx, ctx, spec)` takes the `Tx`
   handle so `ASK-01` can create a record and admit a job in one transaction (PRD §34.3). No
   repository in this group opens its own transaction implicitly.
10. **`comment` tenant-target check.** `comment` stores `target_type` + `target_id`; the repository
    verifies in the same transaction that the target row exists **in the same organisation** before
    insert (PRD §35.5 "target must belong to same tenant"). Allowed target types: record, answer,
    claim, citation (REC-003).
11. **`packages/database/src/schema/research.ts`** exporting `tableManifest` with
    `group: 'research'`, `scope: 'TENANT'` for all ten, `mutability` `MUTABLE_METADATA` for
    `research_record` and `comment` and `IMMUTABLE`/`APPEND_ONLY` for the rest, `encryptedColumns`
    listing every `*_ciphertext` column, and the full `requiredColumns` from PRD §35.5. No barrel
    file (sub-PRD D4).

## Acceptance checklist (classified)

- [ ] `[machine]` A clean database migrates to head and contains the ten PRD §35.5 tables with every
      listed required column, asserted against a literal expectation table (PRD §35.5)
- [ ] `[machine]` `DATA-01`'s `assertSchemaConventions` passes for the research manifest; every enum
      column's CHECK equals the `packages/contracts` value set, including the five claim-support
      values and five citation roles (PRD §15.5, §35.1, `FND-03`)
- [ ] `[machine]` **Invariant 1 / ANS-004**: `writeAnswerSnapshot` commits snapshot + claims +
      citations + assumptions atomically; a forced failure on the last citation leaves **no**
      snapshot, claim, citation or assumption row (PRD §35.8 invariant 1)
- [ ] `[machine]` **Invariant 5 / REC-001**: the immutable repositories expose no `update`/`delete`
      member (compile-time), **and** a raw `UPDATE`/`DELETE` against each immutable table aborts via
      the trigger (PRD §35.8 invariant 5; §30.2 REC-001 "No update path mutates an existing formal
      snapshot")
- [ ] `[machine]` **Invariant 3**: a citation whose `corpus_release_id` differs from its snapshot's
      pinned release is rejected with `CITATION_RELEASE_MISMATCH`; a matching one is accepted
      (PRD §35.8 invariant 3)
- [ ] `[machine]` Citations require DocumentVersion + NodeVersion + exact offsets; inverted,
      negative or equal offsets are rejected; no chunk id is storable (PRD §15.3)
- [ ] `[machine]` **ANS-004**: `answer_snapshot` cannot be written without `corpus_release_id`,
      model/profile/prompt/validator versions and `knowledge_cutoff_at` (PRD §30.2 ANS-004
      "Snapshot contains release, profile and actual model version")
- [ ] `[machine]` `UNIQUE (job_id)` on `answer_snapshot`: two completions of the same job produce one
      snapshot and a typed conflict on the second (PRD §18.5 "one observable answer")
- [ ] `[machine]` **Invariant 7 (structural)**: `workflow_status` cannot be changed through
      `update()`; `applyReviewAction` writes both rows in one transaction and refuses a mismatched
      `fromStatus`; a rollback leaves the status unchanged and no `review_action` row
      (PRD §35.8 invariant 7)
- [ ] `[machine]` **REC-004 / ETag**: a stale `ifMatch` returns the typed `CONCURRENT_MODIFICATION`;
      two concurrent updates from two connections produce exactly one success (PRD §34.1, §34.9)
- [ ] `[machine]` Soft delete: deleted records are excluded from reads/lists, restorable within the
      window, and `purgeDeletedBefore` removes the record and its children in a defined order with
      no orphans (PRD §10.3)
- [ ] `[machine]` `comment` insert against a target owned by another organisation is rejected in the
      same transaction (PRD §35.5 "target must belong to same tenant")
- [ ] `[machine]` `createRecord(tx, …)` composes with `DATA-05`'s `claimIdempotentJob` inside one
      `withTenantTransaction`, and a rollback leaves neither the record nor the job (PRD §34.3
      "Creating a record and admitting the job occur in the same transaction")
- [ ] `[machine]` Encryption canary: a distinctive question, short answer, claim text and quote do
      not appear in the raw `.sqlite`/`-wal` bytes (PRD §37.3, `DATA-03`)
- [ ] `[machine]` Cross-tenant matrix over the ten tables returns the indistinguishable
      `ResourceNotFound` (PRD §16.5, `DATA-02`)
- [ ] `[machine]` The migration passes `assertExpandOnly` and its filename matches
      `MIGRATION_FILENAME` with the `research` group suffix (plan A5)
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — nothing recorded is replayed; corpus ids in tests are synthetic
      opaque strings (the signed synthetic corpus fixture is `CRPS-08`'s, and this package never
      opens `corpus.sqlite`)
- [ ] No `[human]` criteria — `UAT-REC-01` (rerun leaves the original byte-for-byte unchanged) and
      `UAT-REC-02` (two browsers, same ETag) are PRD §41.2 manual scripts run against the product
      surfaces by `17-records-collab` and `23-assurance`
- [ ] No Rust or Python is touched (PRD §45.3)

## Test plan

Offline; no network, no corpus database, no model provider.

1. `pnpm test`; focused run with `pnpm --filter <the packages/database package name> test`.
2. Reuse `withTempDatabase` (`DATA-01`), the tenancy factories (`DATA-04`) and the execution
   factories (`DATA-05`) to seed an organisation, actor and job. Add
   `packages/database/test/research/factories.ts` for records, snapshots, claims and citations.
3. Atomicity: call `writeAnswerSnapshot` with a citation that violates the release check as the last
   element; assert every participating table is empty afterwards. Repeat with a valid set and assert
   all four tables are populated with matching counts.
4. Immutability: for each immutable table, (a) assert at type level that `update`/`delete` are absent
   (a `@ts-expect-error` compile assertion), and (b) execute a raw `UPDATE`/`DELETE` on the temp
   database and assert the trigger aborts.
5. Concurrency: two `worker_threads`, each with its own connection, both calling `update()` on the
   same record with the same `ifMatch`; assert exactly one success and one typed conflict. Then two
   threads calling `applyReviewAction` with the same `fromStatus`; assert one success.
6. Purge ordering: create a record with turns, snapshots, claims, citations, assumptions and
   comments; soft-delete; run `purgeDeletedBefore`; assert zero orphans by checking each child table
   for rows whose parent no longer exists.
7. Encryption canary: as in `DATA-03`'s test plan — write, `PRAGMA wal_checkpoint(TRUNCATE)`, read
   the raw file bytes, assert absence.
8. Reviewer greps the diff for any `UPDATE`/`DELETE` statement targeting an immutable table, any
   snapshot write path that does not go through `writeAnswerSnapshot`, and any import of
   `packages/domain/src/workflow` (that edge does not exist — see the caveat).

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *A formal snapshot genuinely needs a mutable column* (for example `correction_state` must be
     updated in place when a correction lands) → PRD §35.8 invariant 5 says corrections **append
     replacements**. Do not relax the trigger first. Record the exact column, the PRD citation and
     the agreed mechanism in `docs/prd/01-app-data/README.md`, coordinate with `DATA-07`
     (`correction`) and `INTL-08`, and only then change the trigger set.
   - *Invariant 3 cannot be checked without reading `corpus.sqlite`* → it must not: this package may
     not open the corpus database (PRD §45.2, §18.3). Keep the denormalised `corpus_release_id`
     check, and if a stronger check is needed record the requirement against `RETR-*`/`ASK-01` in
     `docs/prd/01-app-data/README.md` rather than adding a cross-database read here.
   - *`ASK-01` needs a write this group does not expose* → add it here, in this ticket's files, and
     record the API in `docs/prd/01-app-data/README.md`. `15-answer-product` must not write
     `packages/database/**` (plan §9 risk R4, PRD §44.3/§45.2). If it arrives after this ticket is
     delivered, it is a **new** ticket in `01-app-data` plus a `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.2/§6.2.
   - *The structural half of invariant 7 is insufficient* — e.g. `RCRD-04` needs the legal transition
     table enforced at the database layer → that requires a `blocked_by FND-08` edge this ticket does
     not have. Record the gap in `docs/prd/01-app-data/README.md`'s open questions with `FND-08` and
     `RCRD-04` named; do not import `packages/domain/src/workflow` without the edge.
   - *Soft-delete purge conflicts with the 30-day backup ageing rule* (PRD §10.3) → that is a
     retention promise; classify as a **Product change** under PRD §45.5 and raise it with the
     Founder before altering the window.
3. **Falsified decision.** If append-only formal snapshots prove unworkable — for instance if the
   raw-SQL triggers cannot express the guard (plan §8 **Q13** keeps triggers and CHECK constraints in
   explicit SQL and gives Kysely typed queries only, so any such limit is SQLite's, not an
   access-layer choice to revisit), or if a product flow genuinely requires mutating an answer —
   that falsifies REC-001 and PRD §35.8 invariant 5, both customer-facing promises.
   Stop, escalate for re-review, and route it through the PRD §45.5 product-change path. Never make
   a snapshot mutable as a local convenience.
