---
id: FND-09
title: "Domain: budget, quota and funding-ledger rules"
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [RUNT-02, EVID-08]
---

# FND-09 — Domain: budget, quota and funding-ledger rules

Implements PRD §24.1, §24.4, §38.5 and §42.6, requirement **OPS-003** (epic `E03-DOMAIN`).
No ADR — the decision is already made in PRD §42.6 (*"The monthly A$50 ceiling is an admission-control
requirement, not a spreadsheet hope"*) and §24.1/§24.4/§38.5 (the budget, ledgers and limits); this is
build ticket 9 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the budget, ledgers and limit tables are already written in the PRD; this makes the arithmetic executable
and testable.

## Background + basis

**PRD §42.6 cost ledger and circuit breaker, quoted in full** — the load-bearing section:

> The monthly A$50 ceiling is an admission-control requirement, not a spreadsheet hope. Daily provider
> prices and month-to-date spend are normalised into micro-AUD. Before a hosted call the gateway computes
> a conservative reservation from model profile, maximum input/output tokens and current price.
> **Admission requires both operation quota and funding-ledger balance.** Settlement records actual
> provider usage and releases the remainder.
>
> Founder-funded reserve order:
> 1. production incident/synthetic safety check allowance;
> 2. active trial commitments;
> 3. internal testing;
> 4. discretionary Deep runs.
>
> Paid pilot variable use draws `CUSTOMER_PREPAID_OR_BYOK`. BYOK still records estimated usage/cost for
> visibility but does not debit founder funds. Exchange rate uses a recorded daily rate plus configurable
> safety margin. **If price or currency data is unavailable, new founder-funded calls fail closed.**

**PRD §24.1 monthly founder-funded budget** (transcribed — the numbers this module encodes):

| Item | Planning budget |
|---|---|
| Sydney Lightsail 2 GB | A$14–15 |
| 32 GB attached storage | A$4–5 |
| R2 public corpus | A$3–4 |
| S3 Sydney backups/private exports | A$1–2 |
| Cloudflare Pages/tunnel/free edge | A$0 target |
| **Hosted model hard budget** | **approximately A$12** |
| Domain/email/variance reserve | A$8–12 |
| **Total** | **A$42–50** |

> Actual provider billing MUST be monitored; the system MUST stop before exceeding the founder-funded
> ceiling.

**PRD §24.4 funding ledgers and concurrency:**

> - `FOUNDER_PLATFORM_BUDGET`: trial/internal usage.
> - `CUSTOMER_PREPAID_OR_BYOK`: customer-funded variable model cost.
>
> Customer variable cost MUST be prepaid or BYOK; **the system MUST NOT create unsecured founder
> liability.** Default per-organisation concurrency: two Quick, one Deep and one export, with separate
> API/search burst limits and webhook queues.

**PRD §38.5 initial rate and concurrency defaults** (transcribed):

| Boundary | Trial | Paid pilot | System hard protection |
|---|---|---|---|
| Search burst | 20/min/organisation | 60/min/organisation | 100/min global initial |
| API calls | 500/trial | 10,000/month | token-bucket and request-size limits |
| Concurrent Quick | 1 | 2 | bounded by worker/provider |
| Concurrent Deep | 1 | 1 | 1 initial global worker execution |
| Concurrent export | 1 | 1 | 1 initial |
| Webhook endpoints | 2 | 10 | delivery queue isolated from research |
| Widget session creation | 30/min/service account | 120/min/service account | abuse/IP/origin protection |

> Rate-limit responses include `Retry-After`, limit, remaining and reset metadata without disclosing
> other tenants. **Search, answer credits, advanced-task credits, API calls and provider cost are
> separate ledgers; exhausting one does not misreport the others.**

**PRD §34.1** (money row): *"Integer micro-AUD for internal cost; never floating point."*
**PRD §8.2**: *"Search MUST remain usable when the AI budget is exhausted."*
**PRD §36.8** (final row): provider/budget unavailable → *"Job unavailable; Search and saved records
remain available."*
**PRD §34.9**: `429 CREDIT_LIMIT_REACHED`, `429 RATE_LIMITED`, `503 GENERATION_UNAVAILABLE`.

**Requirement OPS-003** (PRD §30.2): *"Founder-funded monthly spend stops at A$50 and search remains
usable | Usage/admin | usage/budget | App | **90% warning and 100% hard-stop tests pass**"*.
**PRD §41.2 `UAT-OPS-03`**: *"Trigger A$50 projected/actual circuit breaker fixture → Paid generation
admissions stop before founder liability increases"* — an end-to-end script owned by `23-assurance`.
**PRD §41.2 `UAT-ANS-07`**: *"Cancel before provider stage → Job cancelled; full reserved credit
released"* — the release arithmetic is here; the cancellation path is `15-answer-product`.

**PRD §16.4 BYOK**: *"BYOK changes who pays and whose provider contract governs retention; it does not
bypass model allowlists, evidence, validation, safety, abuse or rate limits."*
**PRD §45.2** bounds the package: `packages/domain` owns *"evidence/budget rules"* and no framework,
database or network code; PRD §39.1 forbids framework imports.

**Accepted caveats carried forward:**

- The A$12 hosted-model figure is a **planning budget** ("approximately"), and the §38.5 values are
  *"initial … defaults"*. They are encoded as a **versioned profile constant**, not scattered literals,
  so a change is one reviewed edit. Changing them is a product decision (PRD §45.5), not a tuning knob.
- Reservation/settlement execution, the provider circuit breaker and the usage ledger tables are
  `12-evidence-safety`/`EVID-08` (`packages/model-gateway/src/budget/**`) and `01-app-data`/`DATA-07`,
  both `blocked_by` or reading this. Rate-limit enforcement at the boundary is
  `03-app-runtime`/`RUNT-02`, also `blocked_by` this ticket.
- Model-profile selection and pricing sources are breakdown plan §8 **Q1**, a **benchmark-selected**
  parameter: owner `21-evaluation-600`, resolved from measured accuracy, zero-tolerance failures,
  latency, availability and cost through the evaluation pipeline, with `GOLD-15` recording the
  promotion report and the Founder approving production promotion **after** seeing that evidence rather
  than picking a model beforehand. It blocks nothing here — this module takes a price as an input and
  never chooses a model.

## Goal

Produce `packages/domain/src/budget/**`: conservative reservation and settlement arithmetic in integer
micro-AUD, an admission decision requiring **both** operation quota and funding-ledger balance, the
PRD §24.1 budget profile and §38.5 limit defaults as versioned data, the §42.6 reserve order and
fail-closed rule, and the separation guaranteeing that generation exhaustion never disables Search — all
pure and framework-free. Completion is mechanically checkable: a property test proves cumulative
founder-funded debit can never exceed the ceiling, the 90% warning and 100% hard stop both fire, and
missing price or FX data denies founder-funded admission.

## Non-goals

- **No provider calls, model profiles, token counting or BYOK key handling** —
  `12-evidence-safety`/`EVID-07` and `EVID-08` (`packages/model-gateway/**`). PRD §16.4's key storage
  and decryption boundary is theirs.
- **No usage ledger, quota counters or audit persistence** — `01-app-data`/`DATA-07`
  (`packages/database/src/schema/operations.ts`). This module computes decisions over supplied balances.
- **No HTTP rate limiting, `Retry-After` headers or 429 responses** — `03-app-runtime`/`RUNT-02`
  (`apps/api/src/{plugins,middleware}/**`), which maps these decisions to PRD §34.9 codes.
- **No worker concurrency enforcement or queue fairness** — `03-app-runtime`/`RUNT-04` (PRD §39.5's five
  queue classes).
- **No cost dashboards, admin screens or alerts** — `22-internal-admin` and `18-ops-release`
  (PRD §22 alerting at 90/100%).
- **No FX rate source or price feed** — an input to this module; the recorded daily rate and safety
  margin are supplied by `EVID-08`/`DATA-07`. This module only defines what happens when they are absent.
- **No enum definitions** — `FND-03` owns the funding-ledger kinds and the §34.9 error codes.
- **No pricing decisions or model selection** — breakdown plan §8 Q1, a benchmark-selected parameter
  owned by `21-evaluation-600` and recorded through `GOLD-15`. No hosted-model name, price or profile
  may be hardcoded here; the module's inputs stay provider- and model-agnostic so the measured choice
  needs no change in `packages/domain`.

## File-scope (write-owns)

Owned by this ticket:

- `packages/domain/src/budget/**`
- `packages/domain/test/budget/**` (sub-PRD D14)
- `packages/domain/package.json` — **append-only**, own entries only (sub-PRD D16)

Does not touch:

- `packages/domain/src/{access,answers,workflow,legal}/**` — `FND-06`, `FND-07`, `FND-08`, `FND-10`
  (same wave, sibling leaves; sub-PRD D10 forbids imports between them).
- `packages/contracts/**` — `FND-03` (merged), `FND-04`/`FND-05` (same wave, different package).
- `packages/model-gateway/**` — `12-evidence-safety`; `packages/database/**` — `01-app-data`;
  `apps/**` — `03-app-runtime` and the product modules.
- Root manifests, lockfiles, `README.md`, `tools/**` — `FND-01`; `.github/workflows/**` — `FND-02`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. One of seven wave-3
siblings, all `blocked_by FND-03`; the five `packages/domain` tickets own five disjoint leaf directories
and may not import one another (sub-PRD D10). Only `packages/domain/package.json` is shared, append-only
per breakdown plan §1.1. `packages/domain/src/budget/**` is written by no other ticket in the plan
(breakdown plan §4).

## Deliverables

1. **`MicroAud`** — a branded integer money type over `bigint`, with `fromCents`/`toDisplay` helpers.
   Every amount in this module is `MicroAud`; floating-point money is forbidden and asserted against
   (PRD §34.1: *"Integer micro-AUD for internal cost; never floating point"*, sub-PRD **D15**).
2. **`BUDGET_PROFILE_V1`** — the PRD §24.1 table as versioned frozen data: each line item, the
   `hostedModelHardBudget` (≈ A$12), the `founderMonthlyCeiling` (A$50) and a `warningThresholdRatio`
   of `0.9` (OPS-003: *"90% warning and 100% hard-stop tests pass"*). The profile carries a `version`
   field so a change is explicit and auditable.
3. **`LIMIT_DEFAULTS_V1`** — the PRD §38.5 table as versioned frozen data with all three columns
   (trial, paid pilot, system hard protection) for all seven boundaries, plus PRD §24.4's per-organisation
   concurrency defaults (two Quick, one Deep, one export).
4. **`reserve(input): Reservation`** — conservative reservation per PRD §42.6, computed from model
   profile ceiling, maximum input **and** output tokens, current price and the FX rate plus safety
   margin. **All rounding is upward**; a reservation is never smaller than the eventual actual cost for
   the same inputs. Returns `{ amountMicroAud, priceSnapshot, fxSnapshot, reservationId }`.
5. **`settle(reservation, actualUsage): Settlement`** — returns `{ debitMicroAud, releaseMicroAud }`
   where `debit + release === reservation.amountMicroAud` exactly (no drift), and
   `releaseMicroAud === reservation.amountMicroAud` when the call never ran (PRD §42.6 *"Settlement
   records actual provider usage and releases the remainder"*; `UAT-ANS-07` *"full reserved credit
   released"*).
6. **`admit(input): Admission`** — requires **both** operation quota and funding-ledger balance
   (PRD §42.6). Returns `{ allowed: true, reservation }` or
   `{ allowed: false, reason }` with `reason` in `CREDIT_LIMIT_REACHED` | `RATE_LIMITED` |
   `GENERATION_UNAVAILABLE` | `PRICE_DATA_UNAVAILABLE` | `CONCURRENCY_LIMIT` — names chosen to map 1:1
   onto PRD §34.9 codes so `RUNT-02` translates without inventing semantics. It also returns
   `{ limit, remaining, resetAt }` for the caller's `Retry-After` metadata, containing **no** information
   about any other tenant (PRD §38.5).
7. **Fail-closed rule**: if the price snapshot or FX rate is absent, stale beyond a supplied maximum age,
   or malformed, `admit` denies founder-funded work with `PRICE_DATA_UNAVAILABLE` (PRD §42.6: *"If price
   or currency data is unavailable, new founder-funded calls fail closed."*). BYOK-funded work is
   evaluated separately per deliverable 9.
8. **`FOUNDER_RESERVE_ORDER`** — the four §42.6 priorities as an ordered constant, with
   `hasReserveFor(class, ledgerState)` so a discretionary Deep run cannot consume the incident allowance.
9. **Ledger separation, made structural** (PRD §38.5: *"Search, answer credits, advanced-task credits,
   API calls and provider cost are separate ledgers; exhausting one does not misreport the others"*):
   distinct ledger types with **no cross-debit function in the module's public surface**. Plus:
   - `FundingLedgerKind` (`FOUNDER_PLATFORM_BUDGET` / `CUSTOMER_PREPAID_OR_BYOK`, from `FND-03`);
   - `isFounderLiability(kind)` — BYOK records estimated usage but **never** debits founder funds
     (PRD §42.6, §24.4 *"MUST NOT create unsecured founder liability"*);
   - `recordByokEstimate(...)` returning an estimate with a founder debit of exactly zero.
10. **`isSearchAffected(ledgerState): false`** — a total function returning `false` for every possible
    generation-ledger state, encoding PRD §8.2 and §36.8's final row. It exists so the invariant is
    testable and so `RUNT-02` cannot accidentally gate Search on a generation ledger.
11. **`crossesWarningThreshold(before, after, profile): boolean`** — true exactly once, at the crossing
    (OPS-003's 90% warning; PRD §22 alerting at 90/100%).
12. **Purity and determinism**: no imports outside `packages/contracts` and Node built-ins; no clock (the
    current time and all prices/rates are inputs), no randomness, no I/O (PRD §39.1, §45.2).
13. **Fixtures**: `packages/domain/test/budget/prd-24-1-budget.json` and
    `packages/domain/test/budget/prd-38-5-limits.json` — the two PRD tables transcribed verbatim.

## Acceptance checklist (classified)

- [ ] `[fixture]` PRD §24.1 replay: `BUDGET_PROFILE_V1` matches `prd-24-1-budget.json` line for line,
      including the A$42–50 total, the ≈A$12 hosted-model hard budget and the A$50 ceiling (PRD §24.1).
- [ ] `[fixture]` PRD §38.5 replay: `LIMIT_DEFAULTS_V1` matches `prd-38-5-limits.json` for all seven
      boundaries across all three columns, plus PRD §24.4's concurrency defaults (PRD §38.5, §24.4).
- [ ] `[machine]` **Ceiling property** (≥10,000 generated reserve/settle sequences in any order,
      including interleaved and cancelled calls): cumulative founder-funded debit never exceeds
      `founderMonthlyCeiling`, and no admission is granted once the remaining balance is below the
      reservation — **OPS-003 hard stop**, PRD §42.6, §24.1.
- [ ] `[machine]` **90% warning**: `crossesWarningThreshold` fires exactly once as spend crosses 0.9 ×
      ceiling and never again for the same period (**OPS-003**: "90% warning … tests pass").
- [ ] `[machine]` Conservative reservation: for any input, `reserve()` ≥ the cost computed from actual
      usage at the same price, for every rounding case including exact multiples (PRD §42.6
      "conservative reservation").
- [ ] `[machine]` Settlement exactness: `debit + release === reservation.amount` for every case, and a
      never-executed call releases the full reservation (PRD §42.6; `UAT-ANS-07`).
- [ ] `[machine]` Both-gates admission: a request with quota but no balance is denied
      `CREDIT_LIMIT_REACHED`; with balance but no quota is denied `RATE_LIMITED`/`CONCURRENCY_LIMIT`;
      only both present are admitted (PRD §42.6 *"Admission requires both operation quota and
      funding-ledger balance"*).
- [ ] `[machine]` **Fail closed**: absent, stale or malformed price/FX data denies founder-funded
      admission with `PRICE_DATA_UNAVAILABLE` (PRD §42.6 final sentence).
- [ ] `[machine]` **Search unaffected**: `isSearchAffected` returns `false` for every generation-ledger
      state, asserted exhaustively over the state space, and no admission path can deny a Search
      operation for a generation-ledger reason (PRD §8.2, §36.8, OPS-003 "search remains usable").
- [ ] `[machine]` **No founder liability from BYOK**: for every BYOK-funded operation the founder ledger
      debit is exactly `0n` while the estimate is recorded (PRD §42.6, §24.4, §16.4).
- [ ] `[machine]` Reserve order: a discretionary-Deep request is denied when only the incident/safety
      allowance remains, while an incident request is admitted (PRD §42.6 reserve order).
- [ ] `[machine]` Ledger separation: exhausting the answer-credit ledger does not change the reported
      remaining for search, API calls or provider cost; the module exposes no cross-debit function
      (PRD §38.5).
- [ ] `[machine]` **No floating-point money**: a static test asserts no `number`-typed money value is
      exported and that the module uses no `parseFloat`, `Number(`, `toFixed` or `/` on a money value
      (PRD §34.1, sub-PRD D15).
- [ ] `[machine]` **Model-agnostic**: no provider name, model identifier or hosted price literal appears
      in `src/budget/**`; prices and profile ceilings arrive as inputs, so the benchmark-selected Q1
      outcome needs no change here (breakdown plan §8 Q1).
- [ ] `[machine]` Rate-limit metadata discloses nothing about other tenants — the returned
      `{ limit, remaining, resetAt }` derives only from the requesting organisation's inputs (PRD §38.5).
- [ ] `[machine]` No sibling-leaf import: `src/budget/**` does not import
      `src/{access,answers,workflow,legal}/**` (sub-PRD D10).
- [ ] `[machine]` Import-graph purity and determinism: only `packages/contracts` and Node built-ins; no
      `Date.now`, `Math.random` or `process.env` (PRD §39.1, §45.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**OPS-003**, `E03-DOMAIN`;
      `UAT-OPS-03` and `UAT-ANS-07` are exercised downstream by `23-assurance` and `15-answer-product`),
      user-visible change and non-goals, schema/API/event compatibility impact (none — pure functions;
      the reason names map 1:1 to §34.9 codes), tenant/PII/security impact (rate-limit metadata leaks no
      cross-tenant information — §38.5), source/licence impact (none), **cost impact** (this ticket *is*
      the cost control; state the encoded ceiling and thresholds), rollback path (revert; only `RUNT-02`
      and `EVID-08` consume it), known gaps (price and FX sources are supplied inputs; the model behind
      each profile is breakdown plan §8 Q1 — benchmark-selected and recorded by `GOLD-15`, not an
      omission of this ticket).

Absent classes: no `[human]` criteria — the arithmetic is fully machine-checkable. `UAT-OPS-03`'s
circuit-breaker drill and the founder's cost review (PRD §43.4 item 7) happen downstream in
`23-assurance` and `18-ops-release`. No `[fixture]` class beyond the two PRD table replays.

## Test plan

Reviewer steps, all offline and deterministic (injected clock, fixed prices, fixed FX):

1. **Read the fixtures against the PRD.** Compare `prd-24-1-budget.json` with `docs/PRD.md` §24.1 and
   `prd-38-5-limits.json` with §38.5, value by value, including the "system hard protection" column
   that is easy to drop.
2. **Run the suite.** `pnpm --filter @<scope>/domain test`. Confirm the ceiling property runs ≥10,000
   sequences and that the generator produces **interleaved** reserve/settle orders and cancellations —
   a sequential-only generator would miss the double-spend case.
3. **Ceiling negative test.** On a scratch branch make `admit` compare against the ceiling *after*
   debiting instead of before; assert the ceiling property fails; discard.
4. **Rounding.** Verify the conservative-reservation test includes exact-multiple and
   one-micro-under/over cases, and that rounding is upward in every one.
5. **Fail-closed.** Verify three separate cases: absent price, stale price beyond max age, malformed
   price. All must deny.
6. **Search invariant.** Confirm `isSearchAffected` is tested exhaustively over the ledger-state space,
   not with a couple of examples — this is OPS-003's "search remains usable" half.
7. **BYOK.** Confirm the founder debit assertion is `=== 0n` (bigint), not a truthy check.
8. **Model-agnosticism.** Run the model-agnostic test, then grep `src/budget/**` for provider and model
   names and for hosted price literals — none may appear (breakdown plan §8 Q1 is decided by benchmark,
   downstream).
9. **Money purity.** Run the static float test; then grep `src/budget/**` for `toFixed`, `parseFloat`
   and bare `/` on money values.
10. **Purity checks.** Run the import-graph and sibling-leaf tests; grep for `Date.now`, `Math.random`,
    `process.env` — none.
11. **Append-only manifest.** `git diff packages/domain/package.json` shows additions only.

Harness: the framework `FND-01` registered plus the property-testing library declared in
`packages/domain/package.json`. Fixtures: `packages/domain/test/budget/prd-24-1-budget.json` and
`prd-38-5-limits.json`. No mocks beyond injected price/FX/clock inputs; no network; no provider calls.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing code; re-publish
with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **A PRD §38.5 or §24.1 default proves wrong in practice** (measured provider cost exceeds the A$12
   hosted-model line, or a limit is unusable). → These are *initial defaults* per PRD §38.5 and a
   *planning budget* per §24.1, but the **A$50 ceiling is not negotiable** (§24.1, OPS-003). Bump
   `BUDGET_PROFILE_V1` → `_V2` / `LIMIT_DEFAULTS_V1` → `_V2` in this ticket, record the change and its
   evidence in **`docs/prd/00-foundation/README.md`**, and escalate a change to the ceiling itself as a
   **product change** requiring founder approval (PRD §45.5).
2. **`EVID-08` needs a reservation input this module does not accept** (e.g. a per-provider surcharge or
   a cached-token price tier). → Extend the **input type here**, not in `packages/model-gateway`;
   PRD §45.2 forbids duplicated business rules outside `packages/domain`, and a second reservation
   formula is how the ceiling silently stops holding. Record it in
   `docs/prd/00-foundation/README.md`.
3. **`RUNT-02` needs a denial reason that does not map to a §34.9 code.** → Add the mapping in this
   ticket and, if a new error code is genuinely required, raise it against `FND-03`'s `ErrorCode` enum
   **and** `FND-04`'s error catalogue **and** PRD §34.9 (a public API change per §16.1/§45.5). Never let
   `apps/api` invent a code.
4. **Integer micro-AUD cannot represent a required price precision.** → Record the case in
   `docs/prd/00-foundation/README.md` D15 and escalate: PRD §34.1 forbids floating-point money outright,
   so a change of representation is an architecture decision (`docs/adr/NNNN-money-representation.md`,
   PRD §45.5), not a local fix.
5. **The reserve order cannot be evaluated without knowing the caller's purpose** (incident vs trial vs
   internal vs discretionary). → The purpose must be an explicit input, never inferred. If a caller
   cannot supply it, record the gap in `docs/prd/00-foundation/README.md` and raise it with
   `12-evidence-safety` — defaulting to the most permissive class would breach PRD §42.6's ordering.
6. **The benchmark-selected model (breakdown plan §8 Q1) turns out to need a pricing shape this module
   cannot express** (for example tiered or cached-token pricing that `GOLD-15`'s promotion report
   assumes). → Extend the price-input type here and record it in
   `docs/prd/00-foundation/README.md`; do **not** hardcode a model or provider in `packages/domain`, and
   do not pre-empt Q1 by encoding a candidate model's prices — the value is set by measured evidence
   through `GOLD-15`.

**Escalation.** If admission control cannot guarantee the A$50 stop — for example provider billing is
only known days later, so pre-call reservation cannot bound actual spend — that falsifies OPS-003 and
PRD §42.6's core claim. Stop, raise an ADR under `docs/adr/`, write back to
`docs/prd/00-foundation/README.md`, and escalate to the human. Never ship an approximate ceiling: PRD
§24.4 forbids unsecured founder liability.
