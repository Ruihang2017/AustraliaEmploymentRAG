---
id: FND-08
title: "Domain: record workflow state machine and ETag rules"
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [WTCH-03, RCRD-04]
---

# FND-08 — Domain: record workflow state machine and ETag rules

Implements PRD §8.7, §32.6 and §34.1, requirement **REC-004** (epic `E03-DOMAIN`).
No ADR — the decision is already made in PRD §32.6 (the allowed-transition table) and §34.1/§16.2
(ETag + `If-Match`, `409 CONCURRENT_MODIFICATION`); this is build ticket 8 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §32.6 is a finished transition table; this makes the illegal states unrepresentable.

## Background + basis

**PRD §32.6 allowed workflow transitions, transcribed verbatim** — the acceptance target:

| From | To | Actor | Condition |
|---|---|---|---|
| `DRAFT` | `IN_REVIEW` | owner/researcher | reviewer assigned; at least one saved answer |
| `IN_REVIEW` | `DRAFT` | reviewer/owner | reason required |
| `IN_REVIEW` | `CUSTOMER_REVIEWED` | reviewer | explicit disclaimer acknowledgement |
| Any active state | `REVIEW_REQUIRED` | system/admin/reviewer | correction, source change or material issue; reason required |
| `REVIEW_REQUIRED` | `IN_REVIEW` | owner/reviewer | replacement/rerun linked |
| Any non-archived | `ARCHIVED` | owner/admin | confirmation; watches optionally retained |
| `ARCHIVED` | `DRAFT` | owner/admin | reason required |

with the surrounding rules from the same section:

> Header fields: title, stable ID, owner, reviewer, workflow status, legal context, tags,
> created/updated time and correction badge. Tabs: **Timeline**, **Answers**, **Evidence**, **Comments**,
> **Watch**, **Audit**. **The Timeline is append-only. Editable title/tags/assignments use ETag; formal
> turns/answers are never edited.**

**PRD §8.7 Research Records and collaboration:**

> - Research Records MUST persist questions/facts, legal date, jurisdiction, topics, owner, reviewer and
>   workflow status.
> - **Research turns MUST be immutable; corrections supersede rather than overwrite prior turns.**
> - Formal answers MUST be immutable Answer Snapshots.
> - Rerun under current law MUST create a new version and support comparison with the prior answer.
> - Comments MAY target a record, answer, claim or citation.
> - **Concurrent edits MUST use version/ETag checks.**
> - Workflow states: `DRAFT`, `IN_REVIEW`, `CUSTOMER_REVIEWED`, `REVIEW_REQUIRED`, `ARCHIVED`.
> - `CUSTOMER_REVIEWED` means customer-internal review and MUST NOT imply legal verification by the
>   product owner or a lawyer.

**PRD §34.1** (concurrency row): *"Mutable resources return `ETag`; writes require `If-Match` where
documented."* **PRD §16.2**: *"Editable resources MUST use ETag/version + `If-Match`; conflicts return
`409 CONCURRENT_MODIFICATION`."* **PRD §35.1**: *"Every mutable table has `created_at`; mutable metadata
tables also have `updated_at` and integer `row_version`."*

**Requirement REC-004** (PRD §30.2): *"Workflow transitions enforce actor, ETag and audit | Record header
| review-action endpoint | App | **Invalid transition and stale ETag return 409**"*.
**PRD §41.2 `UAT-REC-02`**: *"Two browsers update title with same ETag → First succeeds; second receives
409 and reload guidance"* — an end-to-end script owned by `17-records-collab`/`23-assurance`; the
staleness *decision* is this ticket's.

**The wildcard rows expanded.** Two §32.6 rows use wildcards; the closed set they denote must be fixed
here so the machine can be exhaustive. `ARCHIVED` is the only non-active state, so "any active state" and
"any non-archived" both mean `{DRAFT, IN_REVIEW, CUSTOMER_REVIEWED, REVIEW_REQUIRED}`, minus the
self-transition in each case. The full closed set is therefore **12 ordered pairs**:

| # | From → To |
|---:|---|
| 1 | `DRAFT` → `IN_REVIEW` |
| 2 | `IN_REVIEW` → `DRAFT` |
| 3 | `IN_REVIEW` → `CUSTOMER_REVIEWED` |
| 4 | `DRAFT` → `REVIEW_REQUIRED` |
| 5 | `IN_REVIEW` → `REVIEW_REQUIRED` |
| 6 | `CUSTOMER_REVIEWED` → `REVIEW_REQUIRED` |
| 7 | `REVIEW_REQUIRED` → `IN_REVIEW` |
| 8 | `DRAFT` → `ARCHIVED` |
| 9 | `IN_REVIEW` → `ARCHIVED` |
| 10 | `CUSTOMER_REVIEWED` → `ARCHIVED` |
| 11 | `REVIEW_REQUIRED` → `ARCHIVED` |
| 12 | `ARCHIVED` → `DRAFT` |

Every other ordered pair of the 5 states (20 non-self pairs in total) is **invalid** — including
`CUSTOMER_REVIEWED` → `IN_REVIEW`, `CUSTOMER_REVIEWED` → `DRAFT` and `REVIEW_REQUIRED` → `DRAFT`. Self
transitions are invalid. This expansion is mechanical, but it is an interpretation of the wildcards and
is therefore stated here, in the ticket, rather than assumed.

**PRD §45.2** bounds the package: `packages/domain` owns *"Pure permissions, state transitions,
evidence/budget rules"* and must not own *"Framework, database or network code"*; PRD §39.1 forbids
framework imports.

**Accepted caveats carried forward:**

- The 409 HTTP mapping, the audit write and the review-action endpoint are
  `17-records-collab`/`RCRD-04` (`apps/api/src/routes/review-actions/**`), which is `blocked_by` this
  ticket. The system-triggered `REVIEW_REQUIRED` path from a source change is
  `16-monitor-alerts`/`WTCH-03`, also `blocked_by` this ticket.
- `CUSTOMER_REVIEWED`'s disclaimer **copy** is `24-launch`/`LNCH-01` (`docs/policies/**`); this ticket
  models only the acknowledgement flag PRD §32.6 requires.

## Goal

Produce `packages/domain/src/workflow/**`: the PRD §32.6 transition table as data with the wildcard rows
expanded to the twelve ordered pairs above, a `canTransition()` decision closed by construction, the
per-transition actor and condition predicates, and ETag/`row_version` staleness rules — all pure and
framework-free. Completion is mechanically checkable: an exhaustive test over all 25 ordered state pairs
proves exactly the twelve listed pairs are representable, and a stale ETag can never apply a transition.

## Non-goals

- **No HTTP status mapping, endpoints or audit writes** — `17-records-collab`/`RCRD-04` maps
  `STALE`/`INVALID_TRANSITION` to `409 CONCURRENT_MODIFICATION` and writes the audit row.
- **No record, turn, answer or comment storage** — `01-app-data`/`DATA-06` owns
  `packages/database/src/schema/research.ts` and its repositories; PRD §35.8's invariants are `DATA-09`.
- **No rerun, diff or correction workflow** — `17-records-collab` (`RCRD-03`, `RCRD-05`, `RCRD-07`) and
  `15-answer-product`.
- **No change detection or alert fan-out** — `16-monitor-alerts` (`WTCH-02`, `WTCH-03`). This ticket only
  guarantees that the system-triggered `REVIEW_REQUIRED` transition is expressible with a reason.
- **No permission checks** — `FND-06` owns the §38.1 matrix. This module takes an *actor role* as an
  input and checks only the §32.6 actor column; whether that actor may act in the organisation at all is
  `FND-06`'s decision and the caller composes the two.
- **No record screens** — `17-records-collab`/`RCRD-08` (`apps/web/src/features/records/**`).
- **No enum definitions** — `FND-03` owns `RecordWorkflowState`.
- **No ETag transport syntax** (weak/strong validators, header quoting) — `03-app-runtime`/`RUNT-01`
  owns the HTTP layer; this module produces and compares an opaque token value.

## File-scope (write-owns)

Owned by this ticket:

- `packages/domain/src/workflow/**`
- `packages/domain/test/workflow/**` (sub-PRD D14)
- `packages/domain/package.json` — **append-only**, own entries only (sub-PRD D16)

Does not touch:

- `packages/domain/src/{access,answers,budget,legal}/**` — `FND-06`, `FND-07`, `FND-09`, `FND-10`
  (same wave, sibling leaves; sub-PRD D10 forbids imports between them).
- `packages/contracts/**` — `FND-03` (merged), `FND-04`/`FND-05` (same wave, different package).
- `packages/database/**` — `01-app-data`; `apps/**` — `03-app-runtime`, `16-monitor-alerts`,
  `17-records-collab`.
- Root manifests, lockfiles, `README.md`, `tools/**` — `FND-01`; `.github/workflows/**` — `FND-02`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. One of seven wave-3
siblings, all `blocked_by FND-03`; the five `packages/domain` tickets own five disjoint leaf directories
and may not import one another (sub-PRD D10). Only `packages/domain/package.json` is shared, append-only
per breakdown plan §1.1. `packages/domain/src/workflow/**` is written by no other ticket in the plan
(breakdown plan §4).

## Deliverables

1. **`TRANSITIONS`** — a frozen array of exactly the **twelve** ordered pairs listed in Background, each
   carrying `from`, `to`, `allowedActors` and `conditions`, with the actor and condition values taken
   verbatim from the §32.6 row that generated it:
   - `DRAFT → IN_REVIEW` — actors `owner`, `researcher`; conditions `REVIEWER_ASSIGNED`,
     `AT_LEAST_ONE_SAVED_ANSWER`;
   - `IN_REVIEW → DRAFT` — actors `reviewer`, `owner`; condition `REASON_REQUIRED`;
   - `IN_REVIEW → CUSTOMER_REVIEWED` — actor `reviewer`; condition `DISCLAIMER_ACKNOWLEDGED`;
   - `{DRAFT, IN_REVIEW, CUSTOMER_REVIEWED} → REVIEW_REQUIRED` — actors `system`, `admin`, `reviewer`;
     conditions `MATERIAL_TRIGGER` (correction, source change or material issue), `REASON_REQUIRED`;
   - `REVIEW_REQUIRED → IN_REVIEW` — actors `owner`, `reviewer`; condition
     `REPLACEMENT_OR_RERUN_LINKED`;
   - `{DRAFT, IN_REVIEW, CUSTOMER_REVIEWED, REVIEW_REQUIRED} → ARCHIVED` — actors `owner`, `admin`;
     condition `CONFIRMATION` (watches optionally retained — a flag on the transition input, not a
     separate transition);
   - `ARCHIVED → DRAFT` — actors `owner`, `admin`; condition `REASON_REQUIRED`.
   Note the expansion of `REVIEW_REQUIRED → REVIEW_REQUIRED` is **excluded** (self-transition).
2. **`canTransition({ from, to, actor, conditions }): TransitionDecision`** — returns
   `{ ok: true; transition }` or `{ ok: false; reason }` with `reason` in
   `INVALID_TRANSITION` | `ACTOR_NOT_PERMITTED` | `CONDITION_NOT_MET` (naming the missing condition).
   **Closed by construction**: any pair not in `TRANSITIONS` is `INVALID_TRANSITION` with no fallback
   branch. Adding a state to the enum without adding its rows must fail the exhaustive test, not silently
   allow or deny.
3. **`applyTransition(record, request): Result`** — a pure function returning the next state plus the
   fields the caller must persist (`row_version + 1`, the new ETag, the reason and the trigger). It
   performs no I/O; the caller (`RCRD-04`) persists atomically and writes the audit row.
4. **ETag and version rules**:
   - `computeETag(rowVersion: number, resourceId: string): string` — deterministic, collision-resistant
     across resources, and dependent on `row_version` only (PRD §35.1's `row_version` is the authority;
     `updated_at` is not, because two writes in the same clock tick must still differ).
   - `checkIfMatch(provided: string | undefined, current: string): 'OK' | 'STALE' | 'MISSING'` —
     `MISSING` when `If-Match` is absent on a documented-required write (PRD §34.1), `STALE` on a
     mismatch (PRD §16.2 → the caller returns `409 CONCURRENT_MODIFICATION`).
   - A property test proves `row_version` is strictly increasing and that a transition computed against
     a stale ETag is never returned as applicable.
5. **Immutability predicates** (PRD §8.7, §32.6):
   - `EDITABLE_FIELDS` — exactly `title`, `tags`, `assignments` (owner/reviewer). Everything else on a
     record is not editable through this path.
   - `isEditableField(field): boolean` and `assertNotFormalArtifact(kind)` returning
     `IMMUTABLE_RESOURCE` for a research turn or an answer snapshot — PRD §8.7: *"Research turns MUST be
     immutable"*, *"Formal answers MUST be immutable Answer Snapshots"*; §32.6: *"formal turns/answers
     are never edited"*.
   - `TIMELINE_IS_APPEND_ONLY = true` as an exported invariant the record repository (`DATA-06`) and the
     screens (`RCRD-08`) both cite.
6. **`CUSTOMER_REVIEWED` semantics** — a `DISCLAIMER_ACKNOWLEDGED` condition flag plus an exported
   constant carrying PRD §8.7's meaning (*"customer-internal review … MUST NOT imply legal verification
   by the product owner or a lawyer"*) as a doc comment. The rendered disclaimer text is `24-launch`;
   this module holds no copy.
7. **Purity**: no imports outside `packages/contracts` and Node built-ins; no clock, randomness or I/O.
   Any timestamp is an input (PRD §39.1, §45.2).
8. **Fixture** `packages/domain/test/workflow/prd-32-6-transitions.json` — the §32.6 table transcribed
   verbatim (its seven rows, wildcards intact) **plus** the twelve-pair expansion, so a reviewer can
   check the expansion against the PRD without reading code.

## Acceptance checklist (classified)

- [ ] `[fixture]` §32.6 replay: each of the seven table rows is asserted with its actors and conditions,
      against `prd-32-6-transitions.json` (PRD §32.6, **REC-004**).
- [ ] `[machine]` Exhaustive closure: for all 5 × 5 = 25 ordered state pairs, `canTransition` permits
      **exactly** the twelve pairs listed in Background and rejects the other thirteen (including all
      five self-transitions) with `INVALID_TRANSITION` (PRD §32.6 — "Only PRD §32.6 transitions are
      representable").
- [ ] `[machine]` Actor enforcement: for each of the twelve transitions, an actor outside its
      `allowedActors` is rejected with `ACTOR_NOT_PERMITTED` (PRD §32.6 Actor column, REC-004).
- [ ] `[machine]` Condition enforcement: for each condition — `REVIEWER_ASSIGNED`,
      `AT_LEAST_ONE_SAVED_ANSWER`, `REASON_REQUIRED`, `DISCLAIMER_ACKNOWLEDGED`, `MATERIAL_TRIGGER`,
      `REPLACEMENT_OR_RERUN_LINKED`, `CONFIRMATION` — a transition with that condition unsatisfied is
      rejected with `CONDITION_NOT_MET` naming it (PRD §32.6 Condition column).
- [ ] `[machine]` Property test (≥10,000 cases): a transition computed against a stale ETag is never
      applicable, for any state pair, actor and condition set (PRD §8.7 *"Concurrent edits MUST use
      version/ETag checks"*; REC-004 *"Invalid transition and stale ETag return 409"*).
- [ ] `[machine]` `row_version` monotonicity: `applyTransition` always returns `row_version + 1`, and
      `computeETag` returns a different value for every distinct `row_version` on the same resource and
      for the same `row_version` on different resources (PRD §35.1).
- [ ] `[machine]` `checkIfMatch` returns `MISSING` for an absent header on a required write and `STALE`
      on a mismatch — the two are distinguishable to the caller so `RUNT-01`/`RCRD-04` can choose the
      correct §34.9 code (PRD §34.1, §16.2).
- [ ] `[machine]` Immutability: `isEditableField` is true only for `title`, `tags` and assignment fields;
      `assertNotFormalArtifact` rejects a research turn and an answer snapshot with `IMMUTABLE_RESOURCE`
      (PRD §8.7, §32.6).
- [ ] `[machine]` Enum-coverage guard: adding a `RecordWorkflowState` member in `FND-03` without adding
      its transition rows fails the exhaustive test rather than silently defaulting (PRD §8.7 state list).
- [ ] `[machine]` No sibling-leaf import: `src/workflow/**` does not import
      `src/{access,answers,budget,legal}/**` (sub-PRD D10).
- [ ] `[machine]` Import-graph purity and determinism: only `packages/contracts` and Node built-ins; no
      `Date.now`, `Math.random` or `process.env` (PRD §39.1, §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**REC-004**, `E03-DOMAIN`;
      `UAT-REC-02` is exercised downstream by `17-records-collab`/`23-assurance`), user-visible change and
      non-goals, schema/API/event compatibility impact (none — pure functions; `row_version` semantics
      are consumed by `DATA-06`), tenant/PII/security impact (none — no tenant lookup here; membership is
      `FND-06`), source/licence impact (none), cost/memory/latency impact (none), rollback path (revert;
      only `WTCH-03` and `RCRD-04` consume it), known gaps (**the wildcard-row expansion is an
      interpretation, stated in Background and in the fixture**).

Absent classes: no `[human]` criteria — pure logic with no rendered surface. `UAT-REC-02` (two browsers,
same ETag) and the record screens are `17-records-collab` and `23-assurance`. No `[fixture]` class beyond
the §32.6 table replay — there is no recorded adapter or evaluation data here.

## Test plan

Reviewer steps, all offline and deterministic:

1. **Read the fixture against the PRD.** Compare
   `packages/domain/test/workflow/prd-32-6-transitions.json` with `docs/PRD.md` §32.6 row by row, then
   check the twelve-pair expansion against the wildcard rows by hand. This expansion is the one
   interpretation in the ticket; verifying it is the reviewer's most valuable step.
2. **Run the suite.** `pnpm --filter @<scope>/domain test`. Confirm the exhaustive test enumerates all
   25 ordered pairs programmatically from the `RecordWorkflowState` enum rather than from a hand-written
   list — otherwise adding a state would not be caught.
3. **Closure negative test.** On a scratch branch add `CUSTOMER_REVIEWED → IN_REVIEW` to `TRANSITIONS`;
   assert the exhaustive test fails naming the extra pair; discard.
4. **Enum-coverage negative test.** Add a sixth `RecordWorkflowState` member locally; assert the
   exhaustive test fails rather than passing with the new state silently unreachable; discard.
5. **Condition matrix.** Verify there is one explicit failing case per named condition, not a single
   "conditions unmet" case.
6. **ETag property.** Confirm the staleness property generates random `row_version` pairs and includes
   the equal case (fresh) as well as mismatches.
7. **Immutability.** Verify `EDITABLE_FIELDS` contains exactly the three §32.6 fields, and that a test
   asserts a formal turn/answer edit is rejected.
8. **Purity checks.** Run the import-graph and sibling-leaf tests; grep `src/workflow/**` for
   `Date.now`, `Math.random`, `process.env` — none.
9. **Append-only manifest.** `git diff packages/domain/package.json` shows additions only.

Harness: the framework `FND-01` registered plus the property-testing library declared in
`packages/domain/package.json`. Fixture: `packages/domain/test/workflow/prd-32-6-transitions.json`. No
mocks, no network, no database.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing code; re-publish
with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **The twelve-pair wildcard expansion is wrong** — e.g. `CUSTOMER_REVIEWED → IN_REVIEW` turns out to be
   required by a real review flow, or `REVIEW_REQUIRED → REVIEW_REQUIRED` must be idempotent. → Update
   the expansion table **in this ticket's Background**, the fixture, and
   **`docs/prd/00-foundation/README.md`** before changing `TRANSITIONS`. Adding a transition is a
   customer-visible workflow change and needs founder approval per PRD §45.5 if it is not derivable from
   §32.6's wildcards.
2. **`RCRD-04` or `WTCH-03` needs a transition input this module does not accept** (for example the
   identity of the correction that triggered `REVIEW_REQUIRED`). → Extend the **transition input type
   here**, not in `apps/api` or `apps/worker`; PRD §45.2 forbids duplicated business rules outside
   `packages/domain`. Record the shape in `docs/prd/00-foundation/README.md`.
3. **ETag must be derived from something other than `row_version`** (e.g. a content hash, because a
   related-entity change must invalidate it). → That changes what `DATA-06` persists and what `RCRD-04`
   returns. Update this ticket and **`docs/prd/00-foundation/README.md`**, and coordinate with
   `01-app-data` through a writeback — do not let two modules compute ETags differently, which would
   make `UAT-REC-02` non-deterministic.
4. **`EDITABLE_FIELDS` proves too narrow** (a screen needs to edit another header field from §32.6's
   header list). → PRD §32.6 says *"Editable title/tags/assignments use ETag; formal turns/answers are
   never edited"* — widening the set is a product change (§45.5). Record it in
   `docs/prd/00-foundation/README.md` Open questions with a named owner and escalate; never widen it
   inside `17-records-collab`.
5. **A state needs to be added to `RecordWorkflowState`.** → That is `FND-03`'s enum plus a PRD §8.7
   change. Raise both; the enum-coverage guard will fail loudly until the transition rows exist, which is
   the intended behaviour, not an obstacle to work around.

**Escalation.** If PRD §32.6's transition table proves unimplementable as a closed machine — for example
a required transition depends on state this module cannot see without I/O — that overturns the
"pure state transitions in `packages/domain`" decision of PRD §45.2. Stop, raise an ADR under
`docs/adr/`, write back to `docs/prd/00-foundation/README.md`, and escalate to the human. Never move the
state machine into `apps/api`.
