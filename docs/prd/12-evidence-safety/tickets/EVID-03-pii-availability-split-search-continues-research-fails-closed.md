---
id: EVID-03
title: "PII availability split (search continues, research fails closed)"
module: 12-evidence-safety
lane: 12-evidence-safety
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-02]
blocks: [ASK-01, GOLD-14]
---

# EVID-03 — PII availability split (search continues, research fails closed)

Implements PRD §10.1 (final bullet) — requirement **PII-002**; epic `E19-PII`.
No ADR — the decision is already made in PRD §10.1 (*"If authoritative detection is unavailable,
public legal search MAY continue but free-text Ask/Compare/Coverage MUST fail closed"*); this is build
ticket 3 of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-02 — Local NER, public-entity context rules, combination risk](EVID-02-local-ner-public-entity-context-rules-combination-risk.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §10.1 states the split in one sentence; this makes it a callable, total decision function instead
of a per-route judgement call.

## Background + basis

**PRD §10.1, the sentence this ticket implements, quoted verbatim:**

> If authoritative detection is unavailable, **public legal search MAY continue but free-text
> Ask/Compare/Coverage MUST fail closed.**

**Requirement PII-002** (PRD §30.2): *"Search can continue if PII service is unavailable; free-text
research fails closed | Search/Ask | health/admission | **None** | **Dependency-failure test matches
this split**"*. The acceptance evidence is a *test of the split*, not a health endpoint.

**Why the split exists.** PRD §8.2: Search is public-corpus retrieval — it carries no customer free
text into storage or into a provider, so an unavailable detector changes nothing about its risk
profile. Ask/Compare/Coverage carry customer-authored facts (PRD §32.2) into persistence and into a
hosted call (PRD §18.5 steps 1–5), which is exactly what PRD §10.1's boundary protects. PRD §26 makes
the availability half a Definition-of-Done item in its own right: *"Search remains available
independently of hosted-generation budget."*

**PRD §36.8 refusal/status decision table**, last two relevant rows, quoted verbatim:

| Condition | Result |
|---|---|
| Employee PII detected | Request rejected before job; no answer status |
| Provider/budget unavailable | Job unavailable; **Search and saved records remain available** |

**PRD §34.9 error catalogue**, the row this ticket maps onto — no new code is invented, because
`packages/contracts` is `00-foundation`'s and PRD §44.3 serial-owned:

| HTTP | Code | Retry | User action |
|---:|---|---:|---|
| 503 | `GENERATION_UNAVAILABLE` | After recovery | **Search remains available; retry when status recovers** |

**PRD §42.1/§22** require the state to be observable without content: *"Search, answer, source, budget
and backup degradation are observable without content logs"* (`OPS-002`), and PRD §22 lists
*"app/auth/PII"* among the required metric groups.

**Inherited, unchanged:** `EVID-01`'s admission contract and pipeline, and `EVID-02`'s
`readiness(): 'READY' | 'DEGRADED' | 'UNAVAILABLE'` accessor on the recogniser port. This ticket adds
no detection logic; it decides what an operation may do given a health state.

**Sub-PRD decision carried forward: D5** — degradation is by **operation class**, not global, and the
fail-closed outcome maps to the existing `GENERATION_UNAVAILABLE` (503) rather than a new error code.

**Accepted caveats carried forward:**

- **"Authoritative detection is unavailable" is a compound state.** PRD §10.1 requires the server
  detector to *combine* three techniques. This ticket must define which degradations still count as
  authoritative (see deliverable 2) rather than treating any single sub-detector's state as the whole.
- **`DEGRADED` is not a licence to accept.** Where the deterministic stage is healthy but the entity
  stage is not, the conservative reading of PRD §10.1 is that authoritative detection is *not*
  available for free-text research. This ticket takes that reading and records it as its own decision
  with the PRD sentence attached; it is testable and is written back if `21-evaluation-600` falsifies
  it.
- **This ticket owns no route and no probe schedule.** `RUNT-08` owns `/v1/system-status` and `RUNT-02`
  owns admission; both consume this decision function.

## Goal

Produce `packages/pii/src/availability/**`: a total, pure decision function mapping
(operation class, detector health) to an admission outcome that implements PRD §10.1's split exactly —
`PUBLIC_LEGAL_SEARCH` continues, free-text `ASK`/`COMPARE`/`COVERAGE` fail closed with
`GENERATION_UNAVAILABLE` — plus the health-aggregation rule over the three §37.2 detector stages and a
content-free status projection for `/v1/system-status`. Completion is mechanically checkable: an
exhaustive matrix over every (operation class × health state) pair replays green, and a
dependency-failure test proves no partially-detected payload is ever accepted.

## Non-goals

- **No detection logic** — `EVID-01` (`src/{deterministic,contract}/**`) and `EVID-02`
  (`src/{entity,context}/**`), both merged before this ticket starts. This ticket reads health; it
  never scans.
- **No HTTP route, status endpoint, middleware or probe scheduler** — `03-app-runtime` (`RUNT-02`
  admission chain, `RUNT-08` health/readiness/`/v1/system-status`). This ticket exports a decision and
  a projection; the API surfaces them.
- **No answer-job admission, credit reservation or job creation** — `15-answer-product` (`ASK-01`,
  which is `blocked_by` this ticket).
- **No provider or budget availability** — `EVID-07`/`EVID-08`. Both produce the same customer-facing
  `GENERATION_UNAVAILABLE`, and this ticket must not conflate the causes: the decision returns a named
  reason so `RUNT-02` and `INTL-09` can tell a detector outage from a budget stop.
- **No incident record or kill switch** — `01-app-data` (`DATA-07`) and `22-internal-admin`
  (`INTL-09`). A kill switch is an *input* here, not a thing this ticket owns.
- **No metrics backend or alerting** — `03-app-runtime` (`RUNT-07`) and `18-ops-release` (`RLSE-08`).
- **No cross-boundary dependency-failure suite** — `23-assurance` (`ASSR-03`). Unit/integration tests
  live in this package (breakdown plan §1.1).

## File-scope (write-owns)

Owned by this ticket:

- `packages/pii/src/availability/**`
- `packages/pii/test/availability/**` (sub-PRD **D21**)
- `packages/pii/package.json`, `packages/pii/src/index.ts` — **append-only**, own entries only

Does not touch:

- `packages/pii/src/{deterministic,contract}/**` — `EVID-01`; `packages/pii/src/{entity,context}/**` —
  `EVID-02`. Both are merged; this ticket reads their exported types and never edits them.
- `packages/citations/**` — `EVID-04`, `EVID-05`, `EVID-06`, `EVID-10`; `packages/model-gateway/**` —
  `EVID-07`, `EVID-08`, `EVID-09`.
- `packages/contracts/**`, `packages/domain/**` — `00-foundation` (PRD §44.3 serial-owned; the §34.9
  code is **consumed**, never redefined). `packages/database/**` — `01-app-data`.
  `packages/observability/**`, `packages/ui/**` — `03-app-runtime`.
- `apps/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`, `docs/adr/**` — other
  modules/tickets per breakdown plan §4 and A9. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/pii/src/availability/**` is written by no other ticket in the plan (plan
§5.13). This is a wave-3 ticket; its concurrent siblings are `EVID-06`
(`packages/citations/src/licensing/**`), `EVID-10` (`packages/citations/src/render/**`) and `EVID-09`
(`packages/model-gateway/src/byok/**`) — different packages, disjoint trees, no shared file. Both
intra-package neighbours (`EVID-01`, `EVID-02`) are transitive blockers and are merged first. Shared
append-only files: `packages/pii/package.json` and `src/index.ts`.

## Deliverables

1. **`src/availability/operations.ts` — the operation classes**, as a frozen tuple with a runtime
   guard, drawn directly from PRD §10.1's sentence:
   `PUBLIC_LEGAL_SEARCH`, `FREE_TEXT_ASK`, `FREE_TEXT_COMPARE`, `FREE_TEXT_COVERAGE`,
   `SAVED_RECORD_READ`, `EXISTING_ANSWER_READ`, `EXPORT_OF_EXISTING_SNAPSHOT`. Each member carries a
   doc comment stating whether it admits customer free text and quoting the PRD sentence that places
   it: PRD §10.1 for the first four, PRD §36.8's *"Search and saved records remain available"* for the
   read/export classes. The classification rule is stated once: **an operation fails closed if and only
   if it admits customer-authored free text into persistence or a provider call.**
2. **`src/availability/health.ts` — the aggregation rule over the §37.2 detector stages.**
   `aggregateDetectorHealth({ limits, deterministic, entity, context })` maps the per-stage
   `'READY' | 'DEGRADED' | 'UNAVAILABLE'` values into one `DetectorAvailability`:
   - all stages `READY` → `AUTHORITATIVE`;
   - any stage `DEGRADED` or `UNAVAILABLE` → `NOT_AUTHORITATIVE`, carrying the **names** of the
     affected stages.

   There is deliberately no middle grade: PRD §10.1 requires detection to *combine* the three
   techniques, so a partial detector is not the authoritative boundary the sentence describes. The
   conservative reading is recorded here with its basis and is a writeback candidate, not a silent
   choice.
3. **`src/availability/decide.ts` — the split, as a total function.**
   `decideOperationAdmission(operation, availability): AvailabilityDecision`:

   | Detector availability | Operation class | Decision |
   |---|---|---|
   | `AUTHORITATIVE` | any | `PROCEED` |
   | `NOT_AUTHORITATIVE` | `PUBLIC_LEGAL_SEARCH` | `PROCEED` |
   | `NOT_AUTHORITATIVE` | `SAVED_RECORD_READ`, `EXISTING_ANSWER_READ`, `EXPORT_OF_EXISTING_SNAPSHOT` | `PROCEED` |
   | `NOT_AUTHORITATIVE` | `FREE_TEXT_ASK`, `FREE_TEXT_COMPARE`, `FREE_TEXT_COVERAGE` | `FAIL_CLOSED` |

   `FAIL_CLOSED` carries `{ errorCode: 'GENERATION_UNAVAILABLE', httpStatus: 503, reason: 'PII_DETECTION_UNAVAILABLE', affectedStages: readonly string[] }`
   — the §34.9 code is referenced, never redefined (see Non-goals), and the `reason` distinguishes this
   cause from `EVID-08`'s budget stop and `EVID-07`'s provider stop. The function is **total**: an
   exhaustiveness check makes a new operation class a compile error rather than a silent `PROCEED`.
   Basis: PRD §10.1; §34.9; §36.8; sub-PRD **D5**.
4. **No partial acceptance path.** A type-level test asserts there is no decision variant meaning
   "proceed with reduced detection", no `force` parameter, and no way for a caller to convert a
   `FAIL_CLOSED` into a payload — the `SanitizedPayload` brand `EVID-01` owns is still the only key to
   a provider call. Basis: PRD §10.1 (*"MUST fail closed"*, *"MUST NOT bypass"*); sub-PRD D2/D5.
5. **`src/availability/probe.ts` — a health-probe contract, not a scheduler.**
   `DetectorProbe { check(): StageHealthSnapshot }` — a synchronous, side-effect-free inspection of the
   already-loaded stages (has the deterministic ruleset loaded; is the entity runtime `READY`; did the
   last N admissions throw). It performs **no** network call, opens no socket, and never scans sample
   text — a probe that ran a canary through the detector would create the exact PII-handling path PRD
   §37.2 restricts. `RUNT-08` calls it on its own schedule.
6. **`src/availability/status.ts` — a content-free status projection** for `/v1/system-status` and the
   `OPS-002` metrics: `{ component: 'pii_detection', state: 'AUTHORITATIVE' | 'NOT_AUTHORITATIVE',
   affectedStages: readonly string[], since: string | null }`. It contains no request text, no field
   names from customer payloads, no counts of detected values and no tenant identity. Basis: PRD §22
   (*"Logs MUST exclude research/evidence content, PII text"*), §42.1, `OPS-002`.
7. **Kill switch as an input, not a state of its own.** The decision function accepts an optional
   `killSwitch: { piiDetection?: boolean }` supplied by the caller from `DATA-07`/`INTL-09` state; when
   set it forces `NOT_AUTHORITATIVE`, producing exactly the same split. It never widens access. Basis:
   PRD §42.5 (*"Tenant/key | Only named scope denied"*; *"Global generation | Search/records/source
   reading continue"*); §12.4.
8. **Purity and determinism.** No clock (`since` is an input), no randomness, no `process.env`, no I/O,
   no logger. The same inputs always produce the same decision — asserted by a repeat-invocation test.
   Basis: PRD §39.1, §45.2.
9. **`test/availability/matrix.json` — the exhaustive decision matrix** as a committed fixture: every
   (operation class × detector availability × kill-switch state) combination with its expected decision,
   error code, HTTP status and reason. This fixture, not the implementation, is the assertion target,
   and `23-assurance`/`ASSR-03` may replay it.
10. **`README.md` update in `packages/pii`** — append the split table, the "no middle grade" rule with
    its PRD basis, the distinct `reason` values, and the statement that the probe never scans sample
    text.

## Acceptance checklist (classified)

- [ ] `[fixture]` **The PRD §10.1 split replays exactly**: every row of
      `test/availability/matrix.json` returns the tabled decision — `PUBLIC_LEGAL_SEARCH` proceeds
      under `NOT_AUTHORITATIVE`, and `FREE_TEXT_ASK`/`FREE_TEXT_COMPARE`/`FREE_TEXT_COVERAGE` fail
      closed. (PRD §10.1; `PII-002` *"Dependency-failure test matches this split"*)
- [ ] `[fixture]` **Saved records and existing answers stay readable** under `NOT_AUTHORITATIVE`,
      including export of an existing snapshot. (PRD §36.8 *"Search and saved records remain
      available"*; §26)
- [ ] `[machine]` **Fail-closed means no payload**: a type-level test proves there is no
      "proceed with reduced detection" variant, no `force` parameter, and no path from a `FAIL_CLOSED`
      decision to a `SanitizedPayload`. (PRD §10.1; sub-PRD D2/D5)
- [ ] `[machine]` **Aggregation has no middle grade**: any stage below `READY` yields
      `NOT_AUTHORITATIVE` with the affected stage names; a test covers each single-stage degradation.
      (PRD §10.1 *"MUST combine"*)
- [ ] `[machine]` **Totality**: an exhaustiveness test proves adding an operation class without a rule
      is a compile error, not a silent `PROCEED`. (PRD §10.1)
- [ ] `[machine]` **Reason codes are distinguishable**: the detector-outage `FAIL_CLOSED` carries
      `reason: 'PII_DETECTION_UNAVAILABLE'`, distinct from budget (`EVID-08`) and provider (`EVID-07`)
      causes, while all three map to `GENERATION_UNAVAILABLE` (503). (PRD §34.9; §36.8; `ANS-007`)
- [ ] `[machine]` **No new error code**: a test asserts the module references the §34.9 code and does
      not declare an error enum of its own. (PRD §34.9; §44.3 — `packages/contracts` is serial-owned)
- [ ] `[machine]` **Kill switch narrows only**: with `killSwitch.piiDetection` set, free-text research
      fails closed and Search/records still proceed; no combination widens access. (PRD §42.5, §12.4)
- [ ] `[machine]` **The probe does not scan**: a test asserts `check()` performs no network call, no
      file read and no detection over sample text, and is side-effect free. (PRD §37.2, §22)
- [ ] `[machine]` **Status projection is content-free**: a canary in a recent request never appears in
      the projection; the projection has no field able to carry request text or a tenant id.
      (PRD §22; `OPS-002`)
- [ ] `[machine]` **Purity/determinism**: no clock, randomness, `process.env` or I/O; repeated calls
      are deeply equal. (PRD §39.1, §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**PII-002**; `UAT-ANS-08`'s
      sibling behaviour is `EVID-08`'s), user-visible change and non-goals, schema/API/event
      compatibility impact (none — consumes `FND-03`/`FND-04` codes), **tenant/PII/security and
      retention impact** (no payload is admitted under degradation; nothing is stored),
      source/licence impact (none), cost/memory/latency impact (a pure decision; negligible), rollback
      path (revert; `ASK-01` and `GOLD-14` consume it), known gaps (the "no middle grade" reading is
      this ticket's conservative decision and is a writeback candidate).

Absent classes: no `[human]` criteria — this is a pure decision function. Its human-visible
consequence is a degraded-state message on the Ask form, owned by `15-answer-product` (`ASK-06`/
`ASK-07`) and exercised at Gate 2; the cross-boundary dependency-failure test is
`23-assurance`/`ASSR-03`. The `[fixture]` items are a committed decision-matrix replay authored here
(sub-PRD D22) — the PRD §14/§43 evaluation replays are `21-evaluation-600`/`GOLD-14`.

## Test plan

Every step runs offline: no network, no provider key, no model.

1. **Read the matrix against the PRD.** Compare `packages/pii/test/availability/matrix.json` with
   `docs/PRD.md` §10.1's final bullet and §36.8's last two rows. Confirm every operation class is
   present and that no row lets free-text research proceed under `NOT_AUTHORITATIVE`.
2. **Run the suite.** `pnpm --filter @<scope>/pii test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `FND-07`'s `packages/domain/test/answers/prd-36-8-refusal.json` replay — a PRD
   table transcribed to a fixture and asserted row by row.
3. **Dependency-failure test** (`PII-002`'s named evidence): stub each detector stage as
   `UNAVAILABLE` in turn, then all together; assert Search proceeds and Ask/Compare/Coverage fail
   closed with `GENERATION_UNAVAILABLE`/`PII_DETECTION_UNAVAILABLE` in every case.
4. **Fail-closed negative test.** On a scratch branch add a `PROCEED_WITH_DEGRADED_DETECTION` variant
   and route free-text Ask to it; assert the type-level test and the matrix replay both fail; discard.
5. **Totality test.** Add a new operation class in a scratch branch without extending the rule table;
   assert the build fails; discard.
6. **Kill-switch test.** Set `killSwitch.piiDetection` with all stages `READY`; assert the same split
   as a detector outage, and assert no combination of inputs produces a wider outcome than
   `AUTHORITATIVE` would.
7. **Probe test.** Assert `check()` makes no network call (inject a failing global `fetch`), reads no
   file, and does not invoke any detector on text.
8. **Status-projection canary.** Submit a request containing a canary, force degradation, and assert the
   canary appears nowhere in the projection or in any metrics call.
9. **Purity.** Grep `src/availability/**` for `Date.now`, `new Date(`, `Math.random`, `process.env`,
   `fetch(` — none. Repeat-invocation deep-equality test.
10. **Append-only manifest.** `git diff packages/pii/package.json packages/pii/src/index.ts` shows
    additions only.
11. **Reviewer focus.** Confirm there is no state in which a free-text research operation proceeds with
    an incompletely-checked payload; confirm the three `GENERATION_UNAVAILABLE` causes stay
    distinguishable so `INTL-09` can act on the right one; confirm the probe cannot become a covert
    detection path; confirm the module declares no error enum of its own.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The "no middle grade" rule makes the product unusable whenever the entity runtime is flaky* →
     record the observed flap rate in `docs/prd/12-evidence-safety/README.md` **D5** first. The
     legitimate fixes are upstream (make the deterministic recogniser the default so the runtime is
     optional — `EVID-02` deliverable 3) or operational (`RLSE-08` alerting). Relaxing the rule so
     free-text research proceeds under partial detection is a **product change** requiring Founder
     approval (PRD §45.5), because it changes what `PII-001` guarantees.
   - *`RUNT-02` needs an operation class this table does not have* (e.g. a widget-originated Ask) →
     extend the class list **in this ticket** in a docs PR and re-run `--sync`; the totality check will
     force the rule. Never let `apps/api` classify an operation locally — two classifications of the
     same route is exactly how a free-text path ends up on the `PROCEED` side.
   - *A caller wants a single "generation unavailable" boolean and ignores `reason`* → keep the reason.
     `INTL-09`'s incident scoping (PRD §42.5) and `RLSE-08`'s alert routing (PRD §22) both depend on
     telling a detector outage from a budget stop. Record any pressure to collapse them in
     `docs/prd/12-evidence-safety/README.md`.
   - *`RUNT-08` wants the probe to actively test the detector with a sample string* → refuse; PRD §37.2
     restricts where customer-shaped text may be processed and a synthetic canary path in production is
     a new PII-handling surface. If active probing is genuinely required, it is a writeback to
     `docs/prd/12-evidence-safety/README.md` and a `RUNT-08` ticket change, decided before any code.
   - *A kill switch is wanted that keeps free-text research running while detection is off* → that is
     the bypass PRD §10.1 forbids, dressed as an operational control. Refuse and escalate (item 3).
3. **Falsified protocol.** If PRD §10.1's split proves unimplementable — for example if Search cannot in
   fact be separated from free-text admission in the runtime — that overturns `PII-002` and PRD §26's
   *"Search remains available"* commitment simultaneously. Stop, escalate for re-review, raise an ADR
   under `docs/adr/`, and write back to `docs/prd/12-evidence-safety/README.md` and
   `docs/prd/breakdown-plan.md` before any code. **Never resolve it by letting free-text research
   proceed**: failing closed is the specified behaviour, and an outage is a better outcome than an
   unchecked payload reaching a provider.
