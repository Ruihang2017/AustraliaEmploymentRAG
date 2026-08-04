---
id: ASSR-04
title: "Citation-validation and refusal-behaviour suite"
module: 23-assurance
lane: 23-assurance
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-05, ASK-02]
blocks: []
---

# ASSR-04 — Citation-validation and refusal-behaviour suite

Implements PRD §36.6 and §36.8 — requirement **ANS-005** (contributing to **SEC-003** and
**ANS-007**); epic `E21`; acceptance scripts `UAT-ANS-03` and `UAT-ANS-05`.
No ADR — the decision is already made in PRD §9.4 and §36.6 (deterministic validation is a mandatory
stage, with twelve checks and stated consequences) and PRD §36.8 (the refusal/status table); this is
build ticket 4 of 8 against it.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-05 — Deterministic claim/citation validator and bounded repair](../../12-evidence-safety/tickets/EVID-05-deterministic-claim-citation-validator-and-bounded-repair.md), [ASK-02 — Quick workflow in worker (retrieve→pack→gateway→validate→commit)](../../15-answer-product/tickets/ASK-02-quick-workflow-in-worker-retrieve-pack-gateway-validate-commit.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §36.6's twelve checks and §36.8's nine rows are finished tables; this asserts them on the
delivered artifact, and decides no new subsystem.

## Background + basis

**PRD §9.4, quoted verbatim — the sequence this suite exercises end to end:**

> The generation sequence MUST be:
>
> ```text
> retrieve → evidence pack → structured claims → deterministic validation → render → final status check
> ```
>
> The model may cite only system-supplied evidence IDs. Code MUST create source titles, links,
> pinpoints and status badges. The validator MUST check evidence identity, exact offsets, corpus
> membership, legal date, jurisdiction, status, authority role, contradictory evidence and licensing.
> **A bounded repair attempt MAY be made; remaining unsupported claims MUST be removed and the answer
> downgraded/refused.**

**PRD §36.6, the three consequences this suite asserts on the delivered artifact:**

> | Version/node belongs to pinned release | **Fail entire execution as integrity incident** |
> | Requested date is in effective interval | Reject claim; **critical date error counter** |
> | Jurisdiction applies | Reject claim; **critical jurisdiction error counter** |
>
> One repair call may receive only structured validation findings and the same evidence pack. It
> cannot retrieve new evidence or expand scope. **After repair, failed claims are deleted. If deletion
> removes the material conclusion, final status becomes `INSUFFICIENT_EVIDENCE` or
> `CONFLICTING_SOURCES`.**

**PRD §36.8, transcribed verbatim — the acceptance target for the refusal half:**

| Condition | Result |
|---|---|
| Evidence supports all material claims | `SUPPORTED` |
| Evidence supports branches but material fact is unknown | `CONDITIONAL` |
| No sufficient applicable evidence after retrieval | `INSUFFICIENT_EVIDENCE` |
| Applicable authorities materially conflict and cannot be reconciled | `CONFLICTING_SOURCES` |
| Request is outside employment-law/product function | `OUT_OF_SCOPE` |
| Relevant source is stale/unavailable and could change answer | `SOURCE_NOT_CURRENT` |
| Employee PII detected | Request rejected before job; no answer status |
| Unlawful operational-evasion request | Refusal with lawful compliance/remediation alternative |
| Provider/budget unavailable | Job unavailable; Search and saved records remain available |

> Words such as "definitely compliant", "guaranteed", "zero risk" and numeric model-confidence
> percentages are prohibited. Uncertainty is represented by status, assumptions, missing facts,
> conflicts and evidence roles.

**Requirements.** `ANS-005` (PRD §30.2): *"Every material claim has validated source evidence or is
removed/downgraded … **Unsupported definitive claim count is zero**."* `ANS-004`: *"Each answer uses
one pinned corpus release and approved model profile … Snapshot contains release, profile and actual
model version."* PRD §35.8 invariant 3: *"A citation's node version must belong to the answer's pinned
corpus release."* PRD §41.2 `UAT-ANS-05`: *"Citation uses wrong offset/date/jurisdiction fixture →
**Validator rejects; repaired or removed; critical metric increments**."* `UAT-ANS-03`: *"Evidence
pack lacks support for material conclusion → **`INSUFFICIENT_EVIDENCE`; no definitive conclusion**."*
PRD §26 Quality: *"No critical time/jurisdiction errors or unsupported definitive claims remain.
Claim-level citation validator and refusal/status behaviour pass."*

**Why this cannot live in `packages/citations` or `apps/worker`.** `EVID-05` proves the validator is a
correct pure function over a pack it is handed. `ASK-02` proves its own workflow calls the stages in
order. Neither can prove the property PRD §26 states — that **no unsupported definitive claim survives
into a persisted Answer Snapshot**, and that every §36.8 condition produces its tabled outcome through
the real API, worker, search boundary, gateway and database. That assertion crosses five modules; PRD
§45.2 assigns it to `tests`.

**What the `blocked_by` closure guarantees (sub-PRD D3).** Via `EVID-05` → `EVID-04` (evidence pack,
delimitation, `packHash`), `FND-07` (`decideAnswerStatus`, `isDefinitiveClaim`,
`containsProhibitedCertainty`), `FND-10` (eligibility, effective intervals, authority rank),
`RETR-09`. Via `ASK-02` → `RUNT-04` (worker lease loops), `RETR-08` → … → `RETR-01` → `CRPS-08` (a
**signed synthetic corpus fixture release**), `EVID-07` (gateway with a stub provider transport),
`ASK-01` → `RUNT-02`, `RUNT-03`, `DATA-06` (research and evidence tables), `EVID-03`, `EVID-08`.

**Accepted caveats carried forward, each a row in `coverage-gaps.md`:**

- **`ASK-04` (the `GET` snapshot read contract) is not in this closure.** Assertions are made on the
  **persisted** snapshot read through `DATA-06`'s repositories, not on the §34.5 response shape. The
  route-level contract is `ASK-04`'s own test plus `ASSR-06`.
- **`EVID-06` (licence limits) and `EVID-10` (sanitiser and URL allowlist) are siblings of this
  ticket's blocker, not blockers.** Checks 10 and 12 are therefore asserted through `EVID-05`'s
  `STRICT_PORT_DEFAULTS`, which that ticket guarantees are *stricter* than the final implementations —
  so a missing port cannot silently disable a check. Refined behaviour is `ASSR-02`'s XSS suite and
  `19-exports`' own tests.
- **The PRD §14.2 numeric gates are not asserted here** — recall@10, citation precision and the ≥95%
  correct-refusal rate are measured over the 600-case dataset by `21-evaluation-600` (`GOLD-02`,
  `GOLD-03`). This suite asserts **behaviour** on synthetic fixtures. Two owners for one number is how
  a gate drifts (sub-PRD rejected alternatives).

## Goal

Produce `tests/integration/citations/**`: a synthetic corpus-release fixture plus scripted provider
tapes that drive the real `POST /v1/answers` → worker → search → gateway → validator → commit path,
and assert on the **persisted** Answer Snapshot that zero unsupported definitive claims survive, that
every citation resolves inside the answer's pinned corpus release, that the `UAT-ANS-05` wrong
offset/date/jurisdiction fixtures are rejected with their critical counters incremented, that a
citation outside the pinned release fails the whole execution with nothing committed, that at most one
repair call is made, and that each of PRD §36.8's nine conditions produces its tabled result.
Completion is mechanically checkable: the §36.8 table is transcribed as data and every row has a
scenario; the counter names are asserted against `EVID-05`'s registry.

## Non-goals

- **No validator unit tests, per-check fixtures or repair-port type tests** — `12-evidence-safety`
  (`EVID-05`). Cited, never duplicated.
- **No workflow, stage-ordering, checkpoint or lease tests** — `15-answer-product` (`ASK-02`) and
  `03-app-runtime` (`RUNT-04`).
- **No idempotency, SSE resume, cancellation or charge-invariant assertions** — `ASSR-05`
  (`tests/integration/{jobs,sse,idempotency}/**`), this suite's concurrent sibling in the same
  workspace member.
- **No PII assertions** — `ASSR-03`. Row 7 of §36.8 is asserted here only as "no answer status is
  produced"; the no-leak proof is `ASSR-03`'s.
- **No prompt-injection, XSS or URL-allowlist assertions** — `ASSR-02`.
- **No evaluation metrics, gates, judge or the 600 cases** — `21-evaluation-600` (`GOLD-02`,
  `GOLD-03`, `GOLD-04`, `GOLD-14`). No read of `evals/**` (plan **R9**).
- **No licence-limit policy or export shaping** — `12-evidence-safety` (`EVID-06`) and `19-exports`.
- **No snapshot read-contract or rerun endpoint assertions** — `15-answer-product` (`ASK-04`) and
  `17-records-collab` (`RCRD-03`).
- **No Deep Research, Coverage or Compare workflows** — `15-answer-product` (`ASK-08`, `ASK-10`,
  `ASK-11`); Quick is the path this closure guarantees.

## File-scope (write-owns)

Owned by this ticket:

- `tests/integration/citations/**` — including `harness/**`, `fixtures/**`, `suites/**` and
  `coverage-gaps.md`.
- `tests/integration/package.json`, `tests/integration/tsconfig.json` — **append-only**, own scripts
  and dependencies only (created by `FND-01`; sub-PRD **D16**). Shared with `ASSR-05` and `ASSR-08`.

Does not touch:

- `tests/integration/{jobs,sse,idempotency}/**` — `ASSR-05`; `tests/integration/recovery/**` —
  `ASSR-08` (both concurrent siblings in the same member).
- `tests/tenant-isolation/**` — `ASSR-01`; `tests/security/**` — `ASSR-02`, `ASSR-03`;
  `tests/e2e/**` — `ASSR-06`, `ASSR-07`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to make an assertion pass (sub-PRD
  **D1**).
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation`.
- `docs/PRD.md` — frozen. `docs/prd/breakdown-plan.md` — docs PR only.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `tests/integration/citations/**` is written by no other ticket in the plan (plan §5.24). This
is a wave-1 ticket; its concurrent siblings inside the same workspace member are `ASSR-05`
(`{jobs,sse,idempotency}`) and `ASSR-08` (`recovery`) — disjoint subtrees. The three share
`tests/integration/package.json` and `tsconfig.json` as **append-only** files (plan §1.1) and nothing
else; conflicts there resolve by re-running the package manager and `/start-all` serialises delivery.
Both declared blockers land first by construction.

## Deliverables

1. **`harness/stack.ts` — the in-process Quick path** (sub-PRD **D4**, **D5**).
   `startAnswerStack({ tape, corpus })` returning `{ inject, runJob, db, providerTape, counters, stop }`:
   `mkdtemp` data directory migrated with `DATA-01`'s runner; API from `RUNT-01`'s `buildApp(config)`
   driven by `inject()`; `RUNT-04`'s `interactive_quick` lease loop stepped **deterministically** (one
   job per call, injected clock — sub-PRD **D17**); `services/search-rs` loaded read-only against the
   fixture bundle (deliverable 2); `EVID-07`'s stub provider transport replaying a scripted tape and
   recording every call. No network, no provider key.
2. **`fixtures/corpus/**` — the synthetic corpus-release fixture.** Built from `CRPS-08`'s signed
   synthetic fixture release shape, plus a **second** release id used only to construct the
   out-of-release citation in deliverable 6. Content covers what the checks need: two provisions with
   exact text and known offsets; one with a bounded effective interval (so a wrong `legal_as_at` is
   detectable); one confined to a single jurisdiction; one `ENACTED_NOT_IN_FORCE`; one guidance item
   whose authority role is `BACKGROUND_ONLY`; a pair of equal-authority items that materially
   conflict; one item marked stale/`FRESHNESS_LIMITED`; one `METADATA_AND_LINK_ONLY` licensed item.
   Provenance is documented in a header: authored here, synthetic, no official text copied, no
   `evals/**` content (sub-PRD **D6**, plan **R9**).
3. **`fixtures/tapes/**` — scripted provider outputs**, one per scenario, each a literal PRD §36.5
   payload: fully-supported; definitive claim with no support; wrong quote offsets; `legal_as_at`
   outside the effective interval; wrong jurisdiction; a citation naming a node from the **second**
   release; a `BACKGROUND_ONLY` item used to support a definitive claim; an unaddressed contradicting
   authority; a quote longer than the licence limit; a model-authored URL; embedded raw HTML; a
   prohibited-certainty phrase ("definitely compliant", "guaranteed", "zero risk", "97% confident");
   an unknown extra field (`reasoning`); and a repair-response pair (still-failing, and successfully
   repaired).
4. **`suites/no-unsupported-definitive-claim.test.ts` — `ANS-005`.** Run every scenario to completion
   and assert on the **persisted** snapshot rows (`DATA-06`): no surviving claim is both definitive
   (`FND-07`'s `isDefinitiveClaim`) and lacking direct sufficient support; the
   `unsupportedDefinitiveClaims` counter is **zero** on the delivered claim set; deleted claims are
   absent from the snapshot, not merely flagged; and the snapshot's status came from `FND-07`, not
   from the model's `proposed_status` (compare against a tape whose `proposed_status` is deliberately
   wrong).
5. **`suites/uat-ans-05.test.ts`.** For the wrong-offset, wrong-date and wrong-jurisdiction tapes:
   assert the citation or claim is rejected, that the answer is repaired or the claim removed, and
   that `criticalLegalDateErrors` / `criticalJurisdictionErrors` **increment** — read through the
   counter names `EVID-05` publishes, asserted against its registry so a rename fails here. (PRD §41.2
   `UAT-ANS-05`.)
6. **`suites/pinned-release-integrity.test.ts`.** A citation naming a node from the second release
   must **fail the entire execution as an integrity incident**: assert no `answer_snapshot` row, no
   claim rows, no citation rows, no partial commit, a job in a failed state, an incident record
   carrying both release ids, and **no repair attempt** in the provider tape. Separately assert PRD
   §35.8 invariant 3 positively: for every successful scenario, every persisted citation's node
   version belongs to the snapshot's `corpus_release_id`. (PRD §36.6 row 3; §35.8 invariant 3;
   **ANS-004**.)
7. **`suites/bounded-repair.test.ts`.** With the still-failing repair tape, assert the provider tape
   shows **at most two** synthesis calls for a Quick job (PRD §36.7: *"1 + optional repair"*), that
   the repair input carried only structured findings and the same pack (assert the pack hash in the
   recorded call), that all checks re-ran afterwards, that still-failing claims were **deleted**, and
   that the final status downgraded to `INSUFFICIENT_EVIDENCE` or `CONFLICTING_SOURCES`.
8. **`fixtures/prd-36-8-table.json` + `suites/refusal-table.test.ts`.** The PRD §36.8 table
   transcribed verbatim as data (condition, result), asserted complete — nine rows — and one scenario
   per row driven end to end:
   - `SUPPORTED`, `CONDITIONAL`, `INSUFFICIENT_EVIDENCE` (`UAT-ANS-03`), `CONFLICTING_SOURCES`,
     `OUT_OF_SCOPE`, `SOURCE_NOT_CURRENT` — each asserted on the persisted snapshot status;
   - **employee PII detected** → assert the request is rejected before any job exists and **no answer
     status** is produced (the no-leak proof is `ASSR-03`'s; cross-referenced, not duplicated);
   - **unlawful operational-evasion request** → assert a refusal that offers a lawful compliance or
     remediation alternative and contains no operational assistance (PRD §9.5);
   - **provider/budget unavailable** → with `EVID-08`'s breaker at 100%, assert the job reports
     explicit generation unavailability, that **no unvalidated fallback model was selected** (the
     provider tape shows no call to a non-approved profile), and that reading saved records still
     works (**ANS-007**, `UAT-ANS-08`'s API half).
9. **`suites/prohibited-language.test.ts`.** Assert no delivered snapshot contains "definitely
   compliant", "guaranteed", "zero risk" or a numeric model-confidence percentage, even when the tape
   supplies them — the phrase must be removed or the claim rejected, not passed through. (PRD §36.8
   closing paragraph; `FND-07`'s `containsProhibitedCertainty`.)
10. **`suites/code-generated-metadata.test.ts`.** Assert PRD §9.4's *"Code MUST create source titles,
    links, pinpoints and status badges"* on the delivered artifact: every persisted citation's title,
    official URL, pinpoint and status badge is byte-identical to the corpus fixture's record, and a
    tape supplying different values for any of them changes nothing in the snapshot. Assert every
    output URL is identical to a pack `officialUrl` (through `EVID-05`'s strict default port) and that
    a model-authored URL is removed and counted, never rewritten.
11. **`suites/negative-control.test.ts`.** A scenario whose tape is fully valid must produce a
    `SUPPORTED` snapshot with all checks passing — so a suite that always fails is not mistaken for a
    suite that works — and a deliberately-permissive local stub validator (registered only inside this
    suite's harness) must be **detected** by the assertions.
12. **`coverage-gaps.md`** (sub-PRD **D3**) — seeded with: the §34.5 snapshot read contract (`ASK-04`);
    licence-limit refinement (`EVID-06`); sanitiser/URL refinement (`EVID-10`, covered by `ASSR-02`);
    Deep, Coverage and Compare status behaviour (`ASK-08`, `ASK-10`, `ASK-11`); the PRD §14.2 numeric
    gates (`GOLD-02`/`GOLD-03`). Each row names the owning ticket and the exact plan §5.24/§6.2 edge
    that would close it.
13. **`package.json` script wiring** (sub-PRD **D10**): this suite runs under the member's `test`
    script — PRD §20.3 lists *"PII and citation validation suites"* as a **per-PR** gate. Keep the
    scenario count and the stepped lease loop fast enough to stay there; if it cannot be, say so in
    the README rather than moving a per-PR gate.
14. **`README.md` in `tests/integration/citations/`** — the scenario → PRD row map, the corpus fixture
    provenance, how to add a §36.8 row, and the rule that a failure is the owning module's defect
    (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[machine]` **Zero unsupported definitive claims survive into a persisted snapshot**, across
      every scenario; the counter is measured on the delivered claim set. (**ANS-005** *"Unsupported
      definitive claim count is zero"*; PRD §14.2; §26 Quality)
- [ ] `[fixture]` **`UAT-ANS-05`** — wrong-offset, wrong-date and wrong-jurisdiction tapes are
      rejected, the claim is repaired or removed, and the critical date/jurisdiction counters
      increment under the names `EVID-05` publishes. (PRD §41.2 `UAT-ANS-05`; §36.6)
- [ ] `[fixture]` **`UAT-ANS-03`** — a pack lacking support for the material conclusion yields
      `INSUFFICIENT_EVIDENCE` with no definitive conclusion in the persisted snapshot. (PRD §41.2
      `UAT-ANS-03`; §36.8)
- [ ] `[machine]` **A citation outside the pinned release fails the whole execution** — no snapshot,
      claim, citation or partial commit exists; an incident names both release ids; no repair is
      attempted. (PRD §36.6 row 3; §35.8 invariant 3)
- [ ] `[machine]` **Every persisted citation belongs to the snapshot's pinned release**, and the
      snapshot records release, profile and actual model version. (PRD §35.8 invariant 3; **ANS-004**)
- [ ] `[machine]` **At most one repair call** — the provider tape shows ≤ 2 synthesis calls for a Quick
      job, the repair input carried only findings plus the same pack (verified by pack hash), all
      checks re-ran, and still-failing claims were deleted. (PRD §36.6; §36.7)
- [ ] `[fixture]` **All nine PRD §36.8 rows produce their tabled result end to end**, asserted against
      the verbatim transcription; a missing or renamed row fails. (PRD §36.8; §26 Quality)
- [ ] `[machine]` **No unvalidated fallback under provider/budget failure** — explicit unavailability,
      no call to a non-approved profile, Search and saved records unaffected. (**ANS-007**; PRD §17.3;
      §36.8 final row)
- [ ] `[machine]` **Prohibited certainty language never survives** — "definitely compliant",
      "guaranteed", "zero risk" and numeric confidence percentages are removed or the claim rejected,
      even when supplied by the tape. (PRD §36.8; §11.2)
- [ ] `[machine]` **Source titles, links, pinpoints and status badges are code-generated** — identical
      to the corpus record regardless of what the tape supplies; a model-authored URL is removed and
      counted, never rewritten. (PRD §9.4; §36.6 row 11; **SEC-003**)
- [ ] `[machine]` **The status comes from `FND-07`, not from the model** — a tape with a deliberately
      wrong `proposed_status` does not change the persisted status. (PRD §36.8; `12-evidence-safety`
      **D10**)
- [ ] `[machine]` **Negative controls behave** — a fully valid tape yields `SUPPORTED`; a permissive
      local stub validator is detected. A suite that cannot fail proves nothing. (Sub-PRD **D3**)
- [ ] `[machine]` **Nothing outside `tests/integration/citations/**` is modified**, and the sibling
      integration subtrees are untouched. (Sub-PRD **D1**; plan §5.24)
- [ ] `[machine]` **Offline and credential-free** — network denied, no provider key, no `evals/**`
      read, corpus fixture authored here. (PRD §20.2; §45.1 item 6; plan §4.2, **R9**)
- [ ] `[machine]` **No skipped or conditional assertion**; every exclusion is a `coverage-gaps.md`
      row. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3), with
      this suite in the per-PR set. (PRD §20.3; sub-PRD **D10**)
- [ ] `[machine]` No Rust or Python written here; `services/search-rs` is **consumed** as a built
      artifact, so `cargo test --workspace` and `uv run pytest` are unaffected. (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**ANS-005**, contributing to
      **ANS-004**, **ANS-007**, **SEC-003**; `UAT-ANS-03`, `UAT-ANS-05`), user-visible change (none —
      tests only) and non-goals, schema/API/event compatibility impact (none), tenant/PII/security
      impact (fixtures are synthetic; no provider key), **source/licence impact** (the corpus fixture
      copies no official text), **an evaluation subset** (PRD §45.4 — name the `GOLD-14` cases this
      behaviour corresponds to), cost/memory/latency impact (per-PR CI runtime), rollback path, known
      gaps (`coverage-gaps.md`).

Absent classes: **no `[human]` criteria.** PRD §14.3 makes deterministic checks — not human or model
judgement — the controlling gate for citation and legal-date behaviour, and PRD §26 states the
requirement as tests passing. Human review of *failures* is PRD §43.4 and belongs to
`21-evaluation-600`; the Gate 2 re-run of `UAT-ANS-03`/`-05` is `24-launch`/`LNCH-05`. The `[fixture]`
items are replays of this suite's own synthetic corpus and provider tapes (sub-PRD **D6**).

## Test plan

Every step runs offline: network denied, no provider key, no `evals/**` access.

1. **Run the suite.** `pnpm --filter <tests-integration> test -- citations`. Confirm it prints the
   scenario count and that the count matches the tape directory.
2. **Read the §36.8 table as data.** Compare `fixtures/prd-36-8-table.json` with `docs/PRD.md` §36.8
   row by row — nine conditions, nine results, in order. A merged row silently deletes a behaviour.
3. **Corpus provenance.** Open `fixtures/corpus/**`'s header; confirm it states synthetic authorship
   and that no official text was copied; confirm nothing references `evals/**`.
4. **Determinism.** Run the suite three times; confirm identical results and no wall-clock sleep
   (grep for `setTimeout`-based synchronisation). Confirm the lease loop is stepped explicitly.
5. **Integrity abort.** Run `suites/pinned-release-integrity.test.ts` and confirm the database has no
   snapshot, claim or citation rows afterwards and that the provider tape shows exactly one call.
6. **Repair bound.** Confirm the tape for the still-failing scenario records exactly two calls, that
   the second carries only findings and the same pack hash, and that deleted claims are absent from
   the snapshot rows rather than marked.
7. **Status provenance.** Flip a tape's `proposed_status`; confirm the persisted status does not
   change. Discard.
8. **Code-generated metadata.** Change a tape's citation title and URL; confirm the persisted values
   still match the corpus fixture and that the URL change is counted as a removal.
9. **Counter names.** Confirm the assertions read `EVID-05`'s published counter names, and that
   renaming one in a scratch branch fails this suite. Discard.
10. **Negative controls.** Confirm the fully-valid scenario passes as `SUPPORTED`; register the
    permissive local stub validator and confirm the suite fails.
11. **Isolation of the suite.** `git diff --name-only` shows only `tests/integration/citations/**`
    plus the shared member manifest (append-only) and the lockfile.
12. **Construction pattern to copy.** `EVID-05`'s `test/validator/fixtures/**` and its `./testing`
    export for `ValidationResult` shapes, `ASK-02`'s own workflow tests for the job-driving pattern,
    and `RUNT-04`'s `apps/worker/test/handler-area-conformance.ts` for stepping a lease loop.
13. **Reviewer focus.** Confirm every assertion is on the **persisted** artifact, not on a function
    return; confirm the integrity scenario leaves *nothing* committed; confirm exactly one repair;
    confirm no §36.8 row was dropped; confirm the suite does not assert a PRD §14.2 numeric gate
    (that is `GOLD`'s); confirm no assertion was weakened to accommodate `EVID-05` or `ASK-02`.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   PRD §45.4 additionally requires an evaluation subset with any change to legal status/date/citation
   behaviour — that subset lives in `21-evaluation-600`.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A scenario fails because `EVID-05` or `ASK-02` is wrong* → **that module has the defect.** File
     it against `EVID-05` / `ASK-02` as a docs PR amending that ticket, and leave this assertion at
     full strength. Do not soften the scenario, delete a tape, or edit `packages/**` or `apps/**` from
     `tests/**` (sub-PRD **D1**).
   - *A §36.8 row cannot be produced end to end with this closure* (Deep, Coverage or Compare
     conditions) → `coverage-gaps.md` row **plus** the exact plan §5.24/§6.2 edge proposed by docs PR.
     Never add a `blocked_by` edge locally (plan §6.2).
   - *The counter names `EVID-05` publishes do not match what this suite expects* → align **here** and
     record it; if the name genuinely must change, that is a docs PR against `EVID-05` **and** the
     `GOLD-02`/`GOLD-03` consumers in one change, because three modules read the same names.
   - *`STRICT_PORT_DEFAULTS` reject something the final `EVID-06`/`EVID-10` implementation should
     allow* → that is expected and correct here (they are deliberately stricter). Record the
     divergence in `coverage-gaps.md`; do not relax the default from `tests/**`.
   - *A scenario needs real official text to be realistic* → refuse. PRD §11.1 licensing and plan
     **R9** both bite; realism comes from structure (offsets, intervals, jurisdictions, authority
     roles), not from provenance.
3. **Falsified protocol.** **If an unsupported definitive claim can survive into a persisted Answer
   Snapshot**, PRD §9.4's evidence-first sequence, PRD §21's *"trust a displayed answer only after
   deterministic validation"* and PRD §26's *"No … unsupported definitive claims remain"* are all
   falsified at once. That is a product-safety failure, not a test expectation to adjust. Stop. Do not
   downgrade the assertion to a warning, do not exclude the scenario, and do not compensate inside
   `tests/**`. Escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` before any code changes.
