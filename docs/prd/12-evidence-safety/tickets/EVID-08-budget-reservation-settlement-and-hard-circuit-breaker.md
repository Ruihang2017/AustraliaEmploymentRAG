---
id: EVID-08
title: "Budget reservation/settlement and hard circuit breaker"
module: 12-evidence-safety
lane: 12-evidence-safety
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [EVID-07, FND-09, DATA-07]
blocks: [EVID-09, ASK-01, INTL-07]
---

# EVID-08 — Budget reservation/settlement and hard circuit breaker

Implements PRD §24.1, §24.4, §42.6 and §17.3 — requirements **OPS-003** and **ANS-007**; epic
`E20-MODEL-GATEWAY`.
No ADR — the decision is already made in PRD §42.6 (*"The monthly A$50 ceiling is an admission-control
requirement, not a spreadsheet hope"*) and PRD §24.4 (the two funding ledgers); this is build ticket 8
of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [EVID-07 — Model gateway: profiles, providers, schema enforcement](EVID-07-model-gateway-profiles-providers-schema-enforcement.md), [FND-09 — Domain: budget, quota and funding-ledger rules](../../00-foundation/tickets/FND-09-domain-budget-quota-and-funding-ledger-rules.md), [DATA-07 — Usage, monitor, issue/correction, audit, incident tables](../../01-app-data/tickets/DATA-07-usage-monitor-issue-correction-audit-incident-tables.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`FND-09` supplies the arithmetic, `DATA-07` the ledger table and `EVID-07` the call boundary; this
wires them into admission control that stops before founder liability.

## Background + basis

**PRD §42.6 cost ledger and circuit breaker, quoted verbatim** — the acceptance target:

> **The monthly A$50 ceiling is an admission-control requirement, not a spreadsheet hope.** Daily
> provider prices and month-to-date spend are normalised into micro-AUD. **Before a hosted call the
> gateway computes a conservative reservation from model profile, maximum input/output tokens and
> current price. Admission requires both operation quota and funding-ledger balance. Settlement records
> actual provider usage and releases the remainder.**
>
> Founder-funded reserve order:
>
> 1. production incident/synthetic safety check allowance;
> 2. active trial commitments;
> 3. internal testing;
> 4. discretionary Deep runs.
>
> Paid pilot variable use draws `CUSTOMER_PREPAID_OR_BYOK`. **BYOK still records estimated usage/cost
> for visibility but does not debit founder funds.** Exchange rate uses a recorded daily rate plus
> configurable safety margin. **If price or currency data is unavailable, new founder-funded calls fail
> closed.**

**PRD §24.1**: the A$42–50 monthly table with *"Hosted model hard budget | approximately A$12"*, and:
*"Actual provider billing MUST be monitored; **the system MUST stop before exceeding the founder-funded
ceiling**."*

**PRD §24.4 funding ledgers, quoted verbatim:**

> - `FOUNDER_PLATFORM_BUDGET`: trial/internal usage.
> - `CUSTOMER_PREPAID_OR_BYOK`: customer-funded variable model cost.
>
> **Customer variable cost MUST be prepaid or BYOK; the system MUST NOT create unsecured founder
> liability.** Default per-organisation concurrency: two Quick, one Deep and one export …

**PRD §38.5:** *"Search, answer credits, advanced-task credits, API calls and provider cost are separate
ledgers; exhausting one does not misreport the others."*

**PRD §17.3:** *"No unvalidated fallback is permitted during provider failure or **budget
exhaustion**."* **PRD §36.8** final row: *"Provider/budget unavailable → Job unavailable; **Search and
saved records remain available**."* **PRD §26**: *"Cost forecast and hard circuit breakers fit A$50
founder funding"* and *"Search remains available independently of hosted-generation budget."*

**PRD §35.8 invariant 2:** *"A job cannot settle more cost than its reservation without an explicit
additional prepaid/BYOK reservation."* **PRD §18.5** makes worker execution at-least-once, so settlement
must be idempotent per job attempt.

**Requirements.** `OPS-003` (PRD §30.2): *"Founder-funded monthly spend stops at A$50 and search remains
usable | Usage/admin | usage/budget | App | **90% warning and 100% hard-stop tests pass**"*.
`ANS-007`: *"Budget/provider/source failure never selects an unvalidated model … Failure matrix produces
explicit unavailable/status response"*. `UAT-OPS-03`: *"Trigger A$50 projected/actual circuit breaker
fixture → **Paid generation admissions stop before founder liability increases**"*. `UAT-ANS-07`:
*"Cancel before provider stage → Job cancelled; **full reserved credit released**"*. `UAT-ANS-08`:
*"Hosted budget hits hard stop → Search remains available; Answer reports explicit generation
unavailability."*

**What is already built.** `FND-09` owns the pure arithmetic: `MicroAud`, `BUDGET_PROFILE_V1`
(A$50 ceiling, ≈A$12 hosted budget, 0.9 warning ratio), `LIMIT_DEFAULTS_V1`, `reserve`, `settle`
(`debit + release === reservation` exactly), `admit` (both quota **and** ledger balance, with the named
reasons), the fail-closed rule for missing price/FX, `FOUNDER_RESERVE_ORDER`, the structural ledger
separation, `isFounderLiability`, `recordByokEstimate`, `isSearchAffected` (always `false`) and
`crossesWarningThreshold`. `DATA-07` owns the `usage_ledger` table — *"append-only double-entry-style
balance invariant"* — and its TenantContext repository. `EVID-07` declared the `HeldReservation` token
and refuses to call without one.

**Sub-PRD decisions carried forward:** **D17** (a hosted call is impossible without a held reservation;
settlement is idempotent per attempt), **D18** (Search is never gated on a generation ledger), **D16**
(no unvalidated fallback on budget exhaustion).

**Accepted caveats carried forward:**

- **This ticket adds no arithmetic.** PRD §45.2 puts *"evidence/budget rules"* in `packages/domain`;
  duplicating `FND-09`'s functions here would be the *"Duplicated business rules"* §45.2 forbids. This
  ticket is admission control, persistence wiring and the breaker state machine.
- **Price and FX data are inputs, not fetched here.** PRD §42.6 says *"recorded daily rate"*; the
  gateway consumes a supplied snapshot and **fails closed** when it is absent or stale (PRD §42.6 final
  sentence). Which job records the daily rate is an operations concern (`18-ops-release`/`22-internal-admin`);
  this ticket defines the snapshot contract and the staleness rule.
- **The cost console is `INTL-07`** (`blocked_by` this ticket). This ticket exposes state; it renders
  nothing.

## Goal

Produce `packages/model-gateway/src/budget/**`: conservative pre-call reservation and `HeldReservation`
minting, idempotent settlement that releases the remainder, the 90%/100% founder circuit breaker with a
fail-closed rule for missing price/FX data, founder-reserve ordering, ledger separation, and
append-only `usage_ledger` writes through `DATA-07`'s TenantContext repository — with Search
structurally unaffected in every state. Completion is mechanically checkable: the 90% warning fires
exactly once at the crossing, the 100% hard stop denies founder-funded admission with no model
substitution, cancellation releases the full reservation, and no test can make Search depend on a
generation ledger.

## Non-goals

- **No budget arithmetic, limit tables, reserve ordering constants or ledger algebra** — `FND-09`
  (merged; this ticket's blocker). Consumed, never re-implemented (PRD §45.2).
- **No `usage_ledger` schema, migration or repository implementation** — `01-app-data` (`DATA-07`,
  merged). This ticket writes **through** the repository port.
- **No provider adapter, profile registry, schema enforcement or failure matrix** — `EVID-07` (merged).
  This ticket mints the token `EVID-07` requires.
- **No BYOK credential storage, decryption or provider routing** — `EVID-09` (`src/byok/**`,
  `blocked_by` this ticket). This ticket owns the **ledger** side of BYOK (routing a charge to
  `CUSTOMER_PREPAID_OR_BYOK` and debiting zero founder funds); `EVID-09` owns the key.
- **No answer-job admission, credit reservation at the API boundary, idempotency keys or job creation** —
  `15-answer-product` (`ASK-01`, `blocked_by` this ticket) and `03-app-runtime` (`RUNT-02`). PRD §18.5
  step 2 puts the transaction in the app; this ticket supplies the gateway-side reservation it wraps.
- **No cost console, spend dashboard, alert delivery or kill-switch UI** — `22-internal-admin`
  (`INTL-07`, `blocked_by` this ticket) and `18-ops-release` (`RLSE-08`).
- **No price fetching, FX fetching or scheduled rate recording** — an operations concern; this ticket
  consumes a snapshot and defines its staleness rule.
- **No search quota, API rate limiting or export credits** — `03-app-runtime` (`RUNT-02`) using
  `FND-09`'s separate ledgers. This ticket touches the **provider-cost** ledger only.

## File-scope (write-owns)

Owned by this ticket:

- `packages/model-gateway/src/budget/**`
- `packages/model-gateway/test/budget/**` (sub-PRD **D21**)
- `packages/model-gateway/package.json`, `packages/model-gateway/src/index.ts` — **append-only**, own
  entries only

Does not touch:

- `packages/model-gateway/src/{profiles,providers,schema}/**` — `EVID-07` (merged); `src/byok/**` —
  `EVID-09`.
- `packages/pii/**` — `EVID-01`…`EVID-03`; `packages/citations/**` — `EVID-04`…`EVID-06`, `EVID-10`.
- `packages/domain/**`, `packages/contracts/**` — `00-foundation` (PRD §44.3 serial-owned); `FND-09`'s
  functions are **consumed**, never copied. `packages/database/**` — `01-app-data`; `DATA-07`'s
  repository is **consumed**, and this ticket writes no schema, migration or SQL.
  `packages/observability/**` — `03-app-runtime`.
- `apps/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`, `docs/adr/**` — other
  modules per breakdown plan §4 and A9. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/model-gateway/src/budget/**` is written by no other ticket in the plan (plan
§5.13). This is a wave-2 ticket; its concurrent siblings are `EVID-02` (`packages/pii/**`) and
`EVID-05` (`packages/citations/**`) — different packages, disjoint trees, no shared file. Its
intra-package neighbours are `EVID-07` (merged; blocker) and `EVID-09` (`blocked_by` this ticket,
therefore never concurrent). All three declared blockers land first: `EVID-07` (module wave 1),
`FND-09` (`00-foundation` wave 3) and `DATA-07` (`01-app-data` wave 5). Shared append-only files: this
package's manifest and `src/index.ts`.

## Deliverables

1. **`src/budget/reservation.ts::reserveForCall(profile, request, ledgerState, prices, quota): ReservationOutcome`** —
   the PRD §42.6 pre-call step. It calls `FND-09`'s `reserve` with the profile's **maximum** input and
   output tokens (never an estimate of likely usage) and `FND-09`'s `admit` for the dual gate
   (*"Admission requires both operation quota and funding-ledger balance"*). On success it mints the
   `HeldReservation` token `EVID-07` requires (sub-PRD **D17**) carrying
   `{ reservationId, ledger, amountMicroAud, profileId, jobId, attempt, expiresAt, priceSnapshotId,
   fxSnapshotId }`. The token is **branded and unforgeable outside this module** — a type-level test
   proves no other package can construct one.
2. **Append-only ledger writes through `DATA-07`.** Reservation, settlement and release each append a
   `usage_ledger` row through the injected TenantContext repository port — never an update, never a
   raw connection. An architecture test asserts this package imports no SQLite driver and no unscoped
   connection factory (PRD §21.2, §45.2; `SEC-001`). Basis: PRD §35.6 (*"append-only double-entry-style
   balance invariant"*), §42.6.
3. **`src/budget/settlement.ts::settleCall(reservation, actualUsage, prices): Settlement`** — calls
   `FND-09`'s `settle` so `debit + release === reservation.amountMicroAud` exactly, appends both rows,
   and is **idempotent per `(jobId, attempt, reservationId)`**: a repeated settlement under
   at-least-once worker delivery appends nothing further and returns the original result. A settlement
   larger than the reservation is **refused** unless an explicit additional prepaid/BYOK reservation is
   supplied — PRD §35.8 invariant 2. Basis: PRD §42.6, §18.5, §35.8; `UAT-ANS-01` (*"one job, one
   snapshot, one charge"*).
4. **Full release on cancellation or non-execution.** `releaseReservation(reservation, reason)` releases
   the entire amount when the provider call never ran — cancellation before the provider stage, a kill
   switch, a schema failure before billing, or a `PROFILE_NOT_APPROVED` refusal. A test asserts the
   released amount equals the reservation exactly, with no retained fee. Basis: PRD §42.6 (*"releases
   the remainder"*); `UAT-ANS-07` (*"full reserved credit released"*); PRD §42.5 (*"settle actual cost
   only"*).
5. **`src/budget/breaker.ts` — the founder circuit breaker as a state machine** over month-to-date
   founder-funded spend in micro-AUD:

   | State | Trigger | Behaviour |
   |---|---|---|
   | `NORMAL` | MTD < 90% of `BUDGET_PROFILE_V1.hostedModelHardBudget` | founder-funded admission proceeds |
   | `WARNING` | crossing 90% (`FND-09`'s `crossesWarningThreshold`, true **exactly once**) | admission proceeds; a warning event is emitted once |
   | `HARD_STOP` | MTD ≥ 100% of the hosted budget, or projected settlement would exceed the A$50 ceiling | **founder-funded admission denied** with `CREDIT_LIMIT_REACHED`; no substitution |
   | `FAIL_CLOSED` | price or FX snapshot absent, stale beyond the configured maximum age, or malformed | **new founder-funded calls denied** with `PRICE_DATA_UNAVAILABLE` |

   The projection is conservative: admission is denied when *reservation + MTD* would cross the ceiling,
   not when the *actual* spend has already crossed it — PRD §24.1 *"the system MUST stop **before**
   exceeding the founder-funded ceiling"* and `UAT-OPS-03` *"stop before founder liability increases"*.
   Basis: PRD §42.6, §24.1, §22 (90/100% alerts); **`OPS-003`**.
6. **Founder reserve ordering.** Admission for founder-funded work consults `FND-09`'s
   `FOUNDER_RESERVE_ORDER` and `hasReserveFor(class, ledgerState)`, so a discretionary Deep run cannot
   consume the production-incident/synthetic-safety allowance. The work class is a required parameter —
   there is no default that silently claims the highest reserve. Basis: PRD §42.6's four priorities.
7. **`src/budget/ledgerRouting.ts` — which ledger pays.** Founder-funded work debits
   `FOUNDER_PLATFORM_BUDGET`; customer variable cost draws `CUSTOMER_PREPAID_OR_BYOK` and must be
   **prepaid or BYOK before admission**, never after (PRD §24.4 *"MUST NOT create unsecured founder
   liability"*). BYOK-funded work uses `FND-09`'s `recordByokEstimate` to append an estimate with a
   founder debit of **exactly zero** (PRD §42.6). A property test asserts founder liability never
   increases on a BYOK path. The key handling itself is `EVID-09`.
8. **Ledger separation is structural.** This module exposes **no** function that can debit a search,
   API-call, advanced-task or export ledger, and exhaustion of the provider-cost ledger changes no other
   ledger's reported remaining balance. A type-level test asserts the absent cross-debit surface. Basis:
   PRD §38.5; `FND-09` deliverable 9.
9. **Search is structurally unaffected** (sub-PRD **D18**). This module exports nothing on the Search
   path, and a test asserts `FND-09`'s `isSearchAffected(state)` is `false` for every breaker state,
   including `HARD_STOP` and `FAIL_CLOSED`. `UAT-ANS-08`'s and PRD §26's *"Search remains available"*
   commitment is thereby a property of the code shape, not of a caller's discipline. Basis: PRD §8.2,
   §26, §36.8.
10. **No unvalidated fallback under budget pressure.** A denied admission returns
    `Unavailable{reason: 'CREDIT_LIMIT_REACHED' | 'PRICE_DATA_UNAVAILABLE'}` mapping to the §34.9 codes
    `CREDIT_LIMIT_REACHED` (429) and `GENERATION_UNAVAILABLE` (503) — consumed from `FND-03`/`FND-04`,
    never redeclared — and **never** selects a cheaper model, a shorter profile or a cached answer. A
    test asserts no provider call occurs after a denial. Basis: PRD §17.3, §14.4; **`ANS-007`**;
    §34.9.
11. **Concurrency limits.** Per-organisation concurrency (two Quick, one Deep, one export — PRD §24.4,
    §38.5) is checked as part of admission via `FND-09`'s limit data; exceeding it returns
    `CONCURRENCY_LIMIT`, distinct from a budget denial so `INTL-07` and `RUNT-02` can report the right
    cause.
12. **Content-free observability.** The module emits, through an injected sink,
    `{ ledger, state, mtdMicroAud, ceilingMicroAud, reservationMicroAud, reason, jobId, profileId }` —
    no question text, no evidence, no answer, no tenant name. The 90% and 100% events are the ones PRD
    §22 requires alerting on and `RLSE-08` wires up. Basis: PRD §22; `OPS-002`.
13. **`test/budget/fixtures/**` — the breaker and settlement corpora** (synthetic per sub-PRD D22):
    a month-long spend timeline crossing 90% and 100%; a reservation/settlement/release triple for each
    profile; a repeated-settlement idempotency case; a cancel-before-provider case; a
    price-snapshot-absent and a stale-snapshot case; a BYOK case asserting zero founder debit; an
    over-settlement attempt; and a concurrency-limit case. Plus `prd-42-6-reserve-order.json` — the four
    §42.6 priorities transcribed verbatim.
14. **`README.md` update in `packages/model-gateway`** — append the reservation/settlement lifecycle,
    the breaker states, the fail-closed rule, the ledger routing, and the statement that Search is
    structurally unaffected.

## Acceptance checklist (classified)

- [ ] `[fixture]` **90% warning and 100% hard stop** (`OPS-003`'s named evidence): the spend timeline
      fires the warning **exactly once** at the crossing, and founder-funded admission is denied at and
      above 100% with `CREDIT_LIMIT_REACHED`. (PRD §42.6; §24.1; **`OPS-003`**)
- [ ] `[fixture]` **Stop before liability** (`UAT-OPS-03`): admission is denied when
      *reservation + MTD* would cross the A$50 ceiling, not after the fact. (PRD §24.1; §42.6)
- [ ] `[machine]` **No call without a reservation**: `HeldReservation` is unforgeable outside this
      module — a type-level test proves another package cannot construct one — and `EVID-07` refuses
      without it. (PRD §42.6; sub-PRD D17)
- [ ] `[machine]` **Conservative reservation**: the reserved amount uses the profile's **maximum** input
      and output tokens and rounds upward; a property test asserts the reservation is never smaller than
      the settled amount for the same inputs. (PRD §42.6; `FND-09` deliverable 4)
- [ ] `[machine]` **Settlement conserves value**: `debit + release === reservation` exactly, for every
      fixture; over-settlement is refused without an explicit additional prepaid/BYOK reservation.
      (PRD §42.6; §35.8 invariant 2)
- [ ] `[machine]` **Settlement is idempotent**: repeating settlement for the same
      `(jobId, attempt, reservationId)` appends no further ledger rows and returns the original result.
      (PRD §18.5 at-least-once; `UAT-ANS-01`)
- [ ] `[fixture]` **Cancel releases everything** (`UAT-ANS-07`): a cancellation before the provider
      stage releases the full reservation with no retained amount. (PRD §42.6; §42.5)
- [ ] `[fixture]` **Fail closed on missing price/FX**: absent, stale and malformed snapshots each deny
      new founder-funded calls with `PRICE_DATA_UNAVAILABLE`. (PRD §42.6 final sentence)
- [ ] `[machine]` **Search is unaffected in every state**: `isSearchAffected` is `false` for `NORMAL`,
      `WARNING`, `HARD_STOP` and `FAIL_CLOSED`, and this module exports nothing on the Search path.
      (PRD §8.2; §26; §36.8; **`OPS-003`** *"search remains usable"*; sub-PRD D18)
- [ ] `[machine]` **No substitution under denial**: after any denial, no provider call occurs and no
      alternative profile or model is selected. (PRD §17.3; §14.4; **`ANS-007`**)
- [ ] `[machine]` **BYOK debits zero founder funds**: a property test asserts founder liability is
      unchanged on every BYOK path while the estimate is still recorded. (PRD §42.6; §24.4)
- [ ] `[machine]` **Ledgers are separate**: no cross-debit function exists; exhausting provider cost
      changes no other ledger's reported remaining balance. (PRD §38.5; `FND-09` deliverable 9)
- [ ] `[fixture]` **Reserve order**: `prd-42-6-reserve-order.json` matches
      `FOUNDER_RESERVE_ORDER`, and a discretionary Deep run cannot consume the incident allowance.
      (PRD §42.6)
- [ ] `[machine]` **Append-only through TenantContext**: every ledger write is an append through
      `DATA-07`'s repository port; an architecture test finds no SQLite driver or unscoped connection
      import. (PRD §35.6; §21.2; §45.2; `SEC-001`)
- [ ] `[machine]` **No arithmetic duplication**: a test asserts the module contains no local money
      arithmetic, threshold constant or limit table — all come from `FND-09`. (PRD §45.2)
- [ ] `[machine]` **Observability carries no content**: a canary in the question never appears in any
      emitted budget event, metric or error. (PRD §22)
- [ ] `[machine]` **Determinism**: no clock (the current time and all prices/rates are inputs), no
      randomness beyond the reservation id, no `process.env`. (PRD §39.1, §45.2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Offline**: the whole suite passes with the network globally stubbed to throw and no
      provider key present; every provider interaction comes from `EVID-07`'s stub or a cassette.
      (PRD §20.2, §20.3; sub-PRD D15)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**OPS-003**, **ANS-007**;
      `UAT-OPS-03`, `UAT-ANS-07`, `UAT-ANS-08` are run end to end by `15-answer-product` and
      `23-assurance`/`ASSR-05`), user-visible change and non-goals, schema/API/event compatibility
      impact (the reservation token and budget state consumed by `EVID-07`, `EVID-09`, `ASK-01`,
      `INTL-07`), tenant/PII/security impact (append-only TenantContext writes; no content in events),
      source/licence impact (none), **cost impact — the substance of this ticket: the A$50 ceiling, the
      ≈A$12 hosted budget and the measured reservation conservatism**, rollback path (revert; a reverted
      breaker means no hosted calls, which is the safe direction), known gaps (price/FX snapshot
      producer is an operations concern outside this module).

Absent classes: no `[human]` criteria — admission control is verified mechanically. The human-facing
acceptance is `UAT-OPS-03`/`UAT-ANS-07`/`UAT-ANS-08` at Gate 2 through `15-answer-product` and
`22-internal-admin`/`INTL-07`. The `[fixture]` items are synthetic spend timelines and recorded
settlements authored here (sub-PRD D22) — the PRD §14/§43 evaluation replays are `21-evaluation-600`.

## Test plan

Every step runs offline: **no network, no provider key, no real billing API**. Time, prices and FX are
inputs in every test.

1. **Read the fixtures against the PRD.** Compare `test/budget/fixtures/prd-42-6-reserve-order.json`
   with `docs/PRD.md` §42.6's four priorities and the breaker thresholds with §24.1's table and
   `FND-09`'s `BUDGET_PROFILE_V1`.
2. **Run the suite.** `pnpm --filter @<scope>/model-gateway test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `FND-09`'s `packages/domain/test/budget/**` (PRD tables as committed fixtures) and
   `DATA-09`'s invariant property tests.
3. **Spend timeline.** Replay the month-long timeline; assert the warning fires exactly once at the
   crossing and that the hard stop denies at and above 100%; assert Search proceeds in every state.
4. **Conservatism property test** (≥ 10,000 cases): reservation ≥ settlement for the same inputs, all
   rounding upward, no floating-point money.
5. **Conservation and idempotency.** For each profile: reserve, settle, assert `debit + release`
   equals the reservation; settle again with the same key and assert no new ledger rows; attempt an
   over-settlement and assert refusal.
6. **Cancellation.** Cancel before the provider stage; assert the full amount is released and the ledger
   nets to zero for that job.
7. **Fail-closed matrix.** Absent, stale (beyond max age) and malformed price/FX snapshots; assert
   `PRICE_DATA_UNAVAILABLE` and that no provider call occurred.
8. **No-substitution test.** After every denial cell, assert `EVID-07`'s stub recorded zero calls and no
   alternative profile was resolved.
9. **BYOK property test.** For every BYOK path, assert the founder-liability total is unchanged and the
   estimate row exists.
10. **Ledger-separation test.** Exhaust the provider-cost ledger; assert the search, API and export
    ledgers report unchanged remaining balances, and that no cross-debit function is exported.
11. **Architecture tests.** No SQLite driver, no unscoped connection factory, no local money arithmetic
    or threshold constants. On a scratch branch inline a `0.9` threshold; assert the no-duplication test
    fails; discard.
12. **Canary test.** Put a canary in the question; assert it appears in no budget event, metric or
    error.
13. **Append-only manifest.** `git diff packages/model-gateway/package.json … src/index.ts` shows
    additions only; confirm no file under `src/{profiles,providers,schema}/**` changed.
14. **Reviewer focus.** Confirm admission denies **before** the ceiling is crossed, not after; confirm
    the reservation token cannot be constructed outside this module; confirm settlement cannot exceed a
    reservation; confirm no path lets a denial pick a different model; confirm nothing in the module can
    make Search unavailable; confirm every threshold and limit comes from `FND-09`.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The conservative reservation is so large that ordinary Quick answers are denied* → the fix is a
     tighter profile ceiling in **`EVID-07`**'s registry (a docs PR against that ticket), or a Founder
     decision on the ≈A$12 hosted budget line in PRD §24.1 — **not** a smaller reservation. PRD §42.6
     requires the reservation to be conservative precisely so that settlement cannot exceed it. Record
     the measurement in `docs/prd/12-evidence-safety/README.md`.
   - *`FND-09` lacks a function this admission path needs* → extend it **in `FND-09`** (docs PR against
     `00-foundation`; that ticket's own feedback item 2 anticipates this) and record it in
     `docs/prd/12-evidence-safety/README.md`. Never add local arithmetic — PRD §45.2 forbids duplicated
     business rules, and two money implementations is how a ceiling silently stops holding.
   - *`DATA-07`'s `usage_ledger` columns cannot express a needed reservation field* → that table is
     `01-app-data`'s (breakdown plan **A3**, PRD §45.2). Raise the ticket change there, take the
     `blocked_by` edge in `docs/prd/breakdown-plan.md` §5.13/§6.2 if sequencing is required, and record
     it in `docs/prd/12-evidence-safety/README.md`. Never write a migration from this package.
   - *An operator wants to raise the ceiling temporarily during an incident* → PRD §42.6's reserve order
     already allocates a *"production incident/synthetic safety check allowance"* **inside** the ceiling.
     Raising the ceiling itself is a Founder decision against PRD §24.1 (a product change, §45.5), and
     it must not be reachable from code. Record any such request in
     `docs/prd/12-evidence-safety/README.md`.
   - *The price/FX snapshot producer does not exist yet* → the fail-closed state is the correct interim
     behaviour (PRD §42.6). Record the gap in `docs/prd/12-evidence-safety/README.md` and raise the
     producer as a ticket in the owning module (`18-ops-release` or `22-internal-admin`) via
     `docs/prd/breakdown-plan.md` §5 — never by adding a fetch to this package, which has no network
     surface by design (`EVID-07` **D13**).
3. **Falsified protocol.** If admission control cannot in fact stop before the founder-funded ceiling —
   for example if provider billing is only knowable after the fact with an error larger than the
   remaining budget — that falsifies PRD §42.6's opening sentence and **`OPS-003`**, and the failure mode
   is unsecured personal liability for the founder (PRD §24.4). **Stop.** Do not proceed with an
   optimistic estimate. Escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/12-evidence-safety/README.md` **and** `docs/prd/breakdown-plan.md` before any code. The
   safe interim state is `HARD_STOP` with Search still available — PRD §26 accepts exactly that trade.
