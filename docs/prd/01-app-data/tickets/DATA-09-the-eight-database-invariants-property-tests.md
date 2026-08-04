---
id: DATA-09
title: The eight database invariants + property tests
module: 01-app-data
lane: 01-app-data
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-06, DATA-07]
blocks: [ASSR-05]
---

# DATA-09 — The eight database invariants + property tests

Implements PRD §35.8, §15.3 and §15.4 (`E04-APPDB`; the "invariant tests" half of the PRD §44.2
`E04` exit evidence). No ADR — the decision is already made in PRD §35.8, which enumerates the eight
invariants normatively; this is build ticket 9 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-06 — Research and evidence tables (immutable)](DATA-06-research-and-evidence-tables-immutable.md)
· [DATA-07 — Usage, monitor, issue/correction, audit, incident tables](DATA-07-usage-monitor-issue-correction-audit-incident-tables.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.8's eight numbered invariants) — not a new subsystem decision.

## Background + basis

The individual table-group tickets each enforce the invariants that touch their own tables. This
ticket makes the set **enumerable and mechanically checked as a set**, so that "each §35.8 invariant
is enforced" is itself a machine-checkable claim rather than a reading of eight scattered test
files. It is the last ticket in the module and gates `ASSR-05` (`23-assurance`'s integration suite:
idempotency, SSE resume, cancel, charge invariants).

**PRD §35.8 — Required database invariants**, quoted in full:

> 1. An Answer Snapshot and its claims/citations/assumptions commit atomically.
> 2. A job cannot settle more cost than its reservation without an explicit additional prepaid/BYOK
>    reservation.
> 3. A citation's node version must belong to the answer's pinned corpus release.
> 4. Tenant child rows cannot point to another tenant's parent rows.
> 5. Formal snapshots and legal corpus versions have no UPDATE/DELETE application path; corrections
>    append replacements.
> 6. Outbox event and corresponding business state commit in one transaction.
> 7. `CUSTOMER_REVIEWED` can be reached only through a ReviewAction.
> 8. Active corpus promotion never mutates an existing release bundle.

**PRD §15.3 — Node and citation invariants** (the corpus-side rules invariant 3 leans on):

> - Provision labels are version-specific display values, not permanent IDs.
> - Node lineage supports renumber/replacement/split/merge.
> - SearchChunks MUST NOT cross independent legal nodes merely for convenience.
> - SearchChunks and embeddings may be deleted/rebuilt.
> - **Citations MUST target DocumentVersion + NodeVersion + exact offsets + source snapshot, never a
>   SearchChunk.**

**PRD §15.4**: *"Every tenant-owned row MUST include `organization_id`. Organisation-scoped composite
keys/foreign keys MUST prevent cross-tenant relationships where feasible."* — invariant 4's basis.

**PRD §44.2** `E04-APPDB` exit evidence: *"Migration/invariant/isolation tests"*. This ticket is the
"invariant" third.

Two boundaries are fixed by the decomposition and must be respected literally:

- **Sub-PRD D5.** This ticket's file-scope (plan §5.2) contains **no migration path**, so it cannot
  add triggers. Enforcement therefore runs through `DATA-02`'s `registerPreCommitInvariant(id, fn)`
  hook registry, executed inside `withTenantTransaction` before commit. This ticket does **not**
  edit `DATA-06`'s or `DATA-07`'s repositories; those already enforce locally, and this ticket adds
  the cross-cutting, black-box layer over the public repository API.
- **Sub-PRD M-Q1 (open question).** Invariant 8 concerns the **corpus release bundle**, and the
  PRD §35.4–35.6 app dictionary contains no table for the active-release pointer (PRD §39.3 says only
  "Pointer recorded in app DB/audit"). Its owner is `RLSE-07` (promotion files) with `CRPS-06`
  (candidate build). This ticket records invariant 8 as `OUT_OF_MODULE` with that owner named, and
  asserts the app-side half that *is* in reach: no repository in `packages/database` exposes an
  update path to a corpus-release-identifying column — those are copied stable references, immutable
  with their parent snapshot (PRD §35.5).

Accepted caveat: the property-testing library is not named by the PRD. Sub-PRD **M-Q3** classifies
the choice as an *Implementation detail* under PRD §45.5 (documented in code/tests) — unless it adds
a **runtime** dependency, in which case it becomes an Architecture decision needing an ADR. A
dev-only dependency still regenerates `pnpm-lock.yaml` as a build artifact; regenerate, never
hand-merge (PRD §44.3, plan §4.1).

## Goal

Produce `packages/database/src/invariants/**` and `packages/database/test/invariants/**`: a
machine-readable `INVARIANTS` registry with one entry per PRD §35.8 invariant carrying its verbatim
PRD text, its enforcement mechanism and its owner; pre-commit hook implementations registered through
`DATA-02`'s registry for the invariants that need cross-table enforcement; a property-test suite that
exercises each invariant through the **public repository API only**; and a coverage test that fails
when any registry entry lacks a test or when the registry does not contain exactly eight entries.
Completion is mechanically checkable: `pnpm test` green plus the coverage test proving the mapping
is complete.

## Non-goals

- **No schema or migration changes.** This ticket owns no path under
  `packages/database/migrations/**`; `DATA-01` and `DATA-04`…`DATA-07` own those files. If an
  invariant genuinely needs a trigger, that is a change to the owning group's ticket (see the
  feedback obligation).
- **No edits to `DATA-06`/`DATA-07` repositories.** Their local enforcement stays theirs; this
  ticket layers the cross-cutting check and the black-box tests.
- **No corpus-side enforcement.** Invariant 8's bundle immutability is `RLSE-07` (promotion) and
  `CRPS-06`/`CRPS-02` (candidate build and signing). This package never opens `corpus.sqlite`
  (PRD §45.2, §18.3).
- **No cross-boundary integration suite.** `ASSR-05` owns `tests/integration/{jobs,sse,idempotency}/**`
  (PRD §20.1) and is `blocked_by` this ticket; it confirms end-to-end what this ticket proves at the
  repository boundary (plan §9 risk R8).
- **No performance tuning or benchmark.** `RLSE-11` owns the 2 GB benchmark.

## File-scope (write-owns)

- `packages/database/src/invariants/**`
- `packages/database/test/invariants/**`
- `packages/database/package.json` — append-only (a dev dependency for property testing; sub-PRD D9)

- Does not touch: `packages/database/migrations/**` (`DATA-01`, `DATA-04`–`DATA-07`) ·
  `src/migrate/**` (`DATA-01`) · `src/tenant/**`, `test/architecture/**` (`DATA-02`) ·
  `src/crypto/**` (`DATA-03`) · `src/schema/*.ts`, `src/repos/**` (`DATA-04`–`DATA-07`) ·
  `src/ephemeral/**` (`DATA-08`) · `packages/jobs/**` (`DATA-05`) · `apps/**` · `tests/**`
  (`23-assurance`) · `infra/**` (`18-ops-release`) · `pipelines/**` (`04-corpus-contract`).

**Serial safety.** First decomposition — nothing merged, no in-flight contention. This ticket is
alone in wave 6: every sibling (`DATA-01`…`DATA-08`) is upstream and merged before it starts, so no
concurrent write to any shared path is possible. It authors **no migration**, so plan **A5**'s
timestamp-prefixed expand-only rule is not engaged. The only file it shares with the module is
`packages/database/package.json`, which is append-only (sub-PRD D9); a conflict there resolves by
re-running pnpm, never by hand-merge (PRD §44.3).

## Deliverables

1. **Registry.** `packages/database/src/invariants/registry.ts`:
   ```ts
   export type Enforcement = 'DB_TRIGGER' | 'DB_CONSTRAINT' | 'PRE_COMMIT_HOOK' | 'REPOSITORY_GUARD' | 'OUT_OF_MODULE'
   export interface InvariantSpec {
     id: 'INV-1' | 'INV-2' | 'INV-3' | 'INV-4' | 'INV-5' | 'INV-6' | 'INV-7' | 'INV-8'
     prdText: string        // verbatim PRD §35.8 sentence
     enforcement: Enforcement[]
     owner: string          // ticket id(s) that implement the enforcement
     note?: string
   }
   export const INVARIANTS: readonly InvariantSpec[]   // exactly eight entries, INV-1..INV-8
   ```
   Expected mapping (record any deviation found during implementation, per the feedback obligation):
   | id | Enforcement | Owner |
   |---|---|---|
   | INV-1 | `REPOSITORY_GUARD` (single atomic `writeAnswerSnapshot`) + `PRE_COMMIT_HOOK` | `DATA-06`, this ticket |
   | INV-2 | `REPOSITORY_GUARD` + `PRE_COMMIT_HOOK` | `DATA-07`, this ticket |
   | INV-3 | `REPOSITORY_GUARD` (denormalised `corpus_release_id` check) + `PRE_COMMIT_HOOK` | `DATA-06`, this ticket |
   | INV-4 | `DB_CONSTRAINT` (composite tenant FKs) + `REPOSITORY_GUARD` | `DATA-02`, `DATA-04`–`DATA-07` |
   | INV-5 | `DB_TRIGGER` + `REPOSITORY_GUARD` (no update/delete member) | `DATA-06`, `DATA-07` |
   | INV-6 | `REPOSITORY_GUARD` (`enqueueOutbox` requires a `Tx`) + `PRE_COMMIT_HOOK` | `DATA-05`, this ticket |
   | INV-7 | `REPOSITORY_GUARD` (`applyReviewAction` is the only writer) + `PRE_COMMIT_HOOK` | `DATA-06`, this ticket |
   | INV-8 | `OUT_OF_MODULE` | `RLSE-07` with `CRPS-06`; sub-PRD **M-Q1** |
2. **Pre-commit hooks.** `packages/database/src/invariants/hooks.ts` registering, through `DATA-02`'s
   `registerPreCommitInvariant(id, fn)`, the checks that must hold **at commit time across tables**:
   - `INV-1` — if the transaction wrote an `answer_snapshot`, it must also have written that
     snapshot's claims/citations/assumptions (or none at all); a partial set aborts.
   - `INV-2` — for every job touched by a settlement in this transaction, settled ≤ reserved
     (evaluated against the ledger inside the transaction).
   - `INV-3` — every `claim_citation` written carries the same `corpus_release_id` as its
     `answer_snapshot`.
   - `INV-6` — if the transaction wrote an `outbox_event`, it also wrote at least one business row
     (an outbox row alone is a defect), and vice versa for the event types that require one.
   - `INV-7` — any change to `research_record.workflow_status` in this transaction is accompanied by
     a `review_action` row for the same record with matching `from_status`/`to_status`.
   Each hook is registered with its `INV-n` id, is idempotent, and must be cheap: it inspects the
   transaction's change set (`DATA-02`'s `changeSet`), not the whole database.
3. **Enable/disable discipline.** `installInvariantHooks()` / `uninstallInvariantHooks()` exported so
   tests can prove that a violation **is** caught (hooks on) and that the guard is not the only line
   of defence (hooks off, database constraints and triggers still reject INV-4 and INV-5). The hooks
   must be installed by default at package initialisation for the public entry point.
4. **Property-test suite.** `packages/database/test/invariants/`, one file per invariant, exercising
   the **public repository API only** (no raw SQL except in the explicit "raw statement" negative
   cases for INV-4 and INV-5). Each generates randomised but bounded scenarios — orderings,
   interleavings, partial failures, duplicate keys, cross-tenant ids — and asserts the invariant
   holds after every operation and after every rollback.
5. **Coverage test.** `packages/database/test/invariants/coverage.test.ts` asserting: `INVARIANTS`
   contains exactly eight entries `INV-1`…`INV-8`; each `prdText` matches the corresponding PRD
   §35.8 sentence character-for-character (transcribed in the test, not imported from the module
   under test); every entry with an enforcement other than `OUT_OF_MODULE` has at least one property
   test file; and every `OUT_OF_MODULE` entry names an owning ticket.
6. **Invariant-8 app-side assertion.** A test proving no repository in `packages/database` exposes a
   write path that changes an existing row's `corpus_release_id`, `document_version_id` or
   `node_version_id` — they are copied stable references, immutable with their parent snapshot
   (PRD §35.5). The registry entry's `note` states that bundle immutability itself is `RLSE-07`'s and
   points at sub-PRD **M-Q1**.
7. **Documentation of the enforcement map.** A short `packages/database/src/invariants/README.md`
   (inside this ticket's own file-scope) rendering the registry as a table so a reader sees, per
   invariant, where it is enforced and by which ticket.

## Acceptance checklist (classified)

- [ ] `[machine]` `INVARIANTS` contains exactly eight entries `INV-1`…`INV-8`, each with `prdText`
      matching the PRD §35.8 sentence transcribed independently in the coverage test (PRD §35.8)
- [ ] `[machine]` **INV-1**: a transaction writing a snapshot with a partial claim/citation/
      assumption set aborts; a complete set commits; a rollback leaves all four tables empty
      (PRD §35.8 invariant 1)
- [ ] `[machine]` **INV-2**: a settlement exceeding the sum of a job's reservations aborts; adding an
      explicit additional reservation makes it commit; randomised reservation/settlement/release
      sequences never leave settled > reserved (PRD §35.8 invariant 2, §42.6)
- [ ] `[machine]` **INV-3**: a citation whose `corpus_release_id` differs from its snapshot's pinned
      release aborts the transaction; matching citations commit (PRD §35.8 invariant 3)
- [ ] `[machine]` **INV-3 / PRD §15.3**: no repository accepts a chunk id in place of a NodeVersion,
      and offsets are required and validated (PRD §15.3 "never a SearchChunk")
- [ ] `[machine]` **INV-4**: randomised cross-tenant child inserts are rejected — both through the
      repository API and, with hooks uninstalled, by the composite foreign keys at the database level
      (PRD §35.8 invariant 4, §15.4)
- [ ] `[machine]` **INV-5**: for every immutable table, the repository exposes no update/delete
      member and, with hooks uninstalled, a raw `UPDATE`/`DELETE` still aborts via the trigger
      (PRD §35.8 invariant 5)
- [ ] `[machine]` **INV-6**: an outbox row without its business row aborts; both commit together; a
      rollback leaves neither (PRD §35.8 invariant 6)
- [ ] `[machine]` **INV-7**: `research_record.workflow_status` cannot reach `CUSTOMER_REVIEWED`
      without a matching `review_action` written in the same transaction; a mismatched
      `from_status` aborts (PRD §35.8 invariant 7)
- [ ] `[machine]` **INV-8**: the registry records it `OUT_OF_MODULE` naming `RLSE-07` (with
      `CRPS-06`), and the app-side test proves no repository can change an existing row's corpus
      reference columns (PRD §35.8 invariant 8; sub-PRD **M-Q1**)
- [ ] `[machine]` Coverage test fails if an invariant is removed from the registry, if an
      enforcement-bearing entry has no property-test file, or if an `OUT_OF_MODULE` entry names no
      owner
- [ ] `[machine]` Hooks are installed by default through the package's public entry; a violation is
      caught with hooks installed and the database-level defences still catch INV-4/INV-5 with hooks
      uninstalled (defence in depth)
- [ ] `[machine]` Hook cost: each hook inspects the transaction change set only — a test asserts the
      hooks issue no full-table scan on a database seeded with a few thousand rows
- [ ] `[machine]` **PRD §44.2 `E04` exit evidence**: `pnpm test` runs migration, invariant and
      isolation tests together and is green
- [ ] `[machine]` Writeback: if implementation shows an invariant is enforced differently from the
      expected mapping in deliverable 1, `docs/prd/01-app-data/README.md` is updated to match before
      merge (sub-PRD D5 / acceptance item 6)
- [ ] No `[fixture]` criteria — nothing recorded is replayed; all scenarios are generated
- [ ] No `[human]` criteria — `UAT-ANS-01`/`06`/`07` and the PRD §43.4 founder review queue are
      exercised end-to-end by `23-assurance` (`ASSR-05`), which is `blocked_by` this ticket
- [ ] No Rust or Python is touched (PRD §45.3)

## Test plan

Offline; no network, no corpus database, no provider.

1. `pnpm test`; focused run with `pnpm --filter <the packages/database package name> test`.
2. Reuse `withTempDatabase` (`DATA-01`) and the four factory modules from
   `packages/database/test/{tenancy,execution,research,operations}/factories.ts`
   (`DATA-04`…`DATA-07`) — do not build a fifth seeding path.
3. Property testing: bounded generators (at most a few hundred cases per property, deterministic
   seed printed on failure so a Reviewer can reproduce). Record the library choice and the seed
   policy in `packages/database/src/invariants/README.md` (sub-PRD **M-Q3**).
4. Per invariant, the suite runs three shapes: (a) a hand-written positive case, (b) a hand-written
   negative case asserting the exact error code, (c) a randomised sequence asserting the invariant
   after every step and after forced rollbacks.
5. Defence-in-depth runs: execute the INV-4 and INV-5 suites twice — once with hooks installed and
   once with `uninstallInvariantHooks()` — and assert both fail the violation, the second time from
   the database constraint/trigger.
6. Hook-cost check: seed a few thousand rows, wrap the connection to count statements executed during
   a hook, and assert no unbounded scan.
7. Reviewer re-runs the full suite in a fresh checkout, confirms the coverage test fails when an
   entry is deleted from `INVARIANTS` (a one-line temporary edit, reverted), and greps the diff for
   any file written under `packages/database/migrations/**`, `src/repos/**` or `src/schema/**`
   (all out of scope).

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *An invariant can only be enforced with a database trigger* → this ticket owns no migration
     (plan §5.2). Do not add one. Record the finding in `docs/prd/01-app-data/README.md` (D5), add
     the trigger requirement to the **owning** group ticket (`DATA-06` or `DATA-07`) as a docs
     change, and — because those tickets may already be delivered — take it as a new ticket in
     `01-app-data` with a `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.2/§6.2.
   - *The pre-commit hook registry from `DATA-02` cannot see the transaction's change set* → sub-PRD
     **D5** is falsified. Update `docs/prd/01-app-data/README.md` D5 and `DATA-02`'s deliverable 7
     **before** implementing an alternative (for example, enforcing inside each repository), because
     the alternative moves work into other tickets' file-scopes.
   - *Invariant 8 turns out to need an app table after all* → that is sub-PRD open question **M-Q1**,
     owned by `RLSE-07`. Record the answer in `docs/prd/01-app-data/README.md`'s open-questions table
     and raise the table as a new `01-app-data` ticket; do not add a table from this ticket.
   - *The property-test library needs to be a runtime dependency* → that reclassifies **M-Q3** from
     Implementation detail to Architecture decision (PRD §45.5): write
     `docs/adr/NNNN-property-testing.md` and note the PRD §21.1 dependency-scan impact before adding
     it.
   - *An enforcement in the expected mapping is absent from the delivered code* (e.g. `DATA-06` did
     not ship a trigger) → do not silently compensate with a hook and call it done. Record the actual
     mapping in `docs/prd/01-app-data/README.md`, state the residual risk, and raise the gap against
     the owning ticket.
3. **Falsified decision.** If any PRD §35.8 invariant proves unenforceable with the delivered schema,
   that is a release-blocking finding, not a local test adjustment — every one of the eight is a
   safety or correctness promise (PRD §26 "Quality" and "Security/privacy"). Stop, escalate for
   re-review, and update `docs/prd/01-app-data/README.md` plus the owning ticket before changing the
   registry. Never weaken a registry entry to make its test pass.
