---
id: INTL-07
title: Global usage and cost console
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, EVID-08]
blocks: [INTL-10]
---

# INTL-07 — Global usage and cost console

Implements **PRD §8.11 (global usage and costs), §24 and §42.6 — requirement `OPS-003`**, with
`ADM-001`'s *"costs are visible internally"* (epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §42.6 (*"The monthly A$50 ceiling is an admission-control
requirement, not a spreadsheet hope"*) and PRD §24.1/§24.4; this is build ticket **7 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`EVID-08` — Budget reservation/settlement and hard circuit breaker
([`12-evidence-safety`](../../12-evidence-safety/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`EVID-08`'s breaker state machine and `DATA-07`'s append-only usage ledger, plus `INTL-01`'s internal
boundary — not a new subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary; its "internal boundary contract" is normative
here. This ticket declares `area = internalArea({ areaId: 'cost', capability: 'COST' })`, wraps its
plugin in `internalRoutes()`, and — because usage data is **tenant** data read across organisations —
performs every cross-organisation read through `crossOrganisationRead(ctx, { reason })`
(`INTL-01` contract item 5; PRD §21.2), which requires a non-empty reason and appends an audit event
before returning a reader.

`EVID-08` has merged. Its deliverable 5 fixes the breaker state machine this console displays:

| State | Trigger | Behaviour |
|---|---|---|
| `NORMAL` | MTD < 90% of the hosted model hard budget | founder-funded admission proceeds |
| `WARNING` | crossing 90% (fires **exactly once**) | admission proceeds; a warning event is emitted once |
| `HARD_STOP` | MTD ≥ 100%, or a projected settlement would exceed the A$50 ceiling | founder-funded admission denied with `CREDIT_LIMIT_REACHED`; **no substitution** |
| `FAIL_CLOSED` | price or FX snapshot absent, stale beyond the configured maximum age, or malformed | new founder-funded calls denied with `PRICE_DATA_UNAVAILABLE` |

and its deliverable 9 makes Search structurally unaffected: *"a test asserts `FND-09`'s
`isSearchAffected(state)` is `false` for every breaker state, including `HARD_STOP` and
`FAIL_CLOSED`."*

`DATA-07` is transitively upstream (`EVID-08 ← DATA-07`) and owns the append-only `usage_ledger`
through a TenantContext repository: entries carry `funding_ledger`
(`FOUNDER_PLATFORM_BUDGET | CUSTOMER_PREPAID_OR_BYOK`), `operation_ledger` (search / answer credits /
advanced-task credits / API calls / provider cost — PRD §38.5's separate ledgers), `entry_type`
(`RESERVATION | SETTLEMENT | RELEASE`), `units`, `cost_micro_aud` **INTEGER** and job/idempotency
linkage, with `balance()` *"computed from entries, never from a stored running total"*. This console
reads through that repository; it performs no ledger write of any kind.

**What the PRD fixes, quoted.**

PRD §24.1 — the budget table (Sydney Lightsail A$14–15, storage A$4–5, R2 A$3–4, S3 A$1–2, Cloudflare
A$0 target, **hosted model hard budget approximately A$12**, variance reserve A$8–12, **total
A$42–50**) and: *"Actual provider billing MUST be monitored; **the system MUST stop before exceeding
the founder-funded ceiling.**"*

PRD §24.4: *"`FOUNDER_PLATFORM_BUDGET`: trial/internal usage. `CUSTOMER_PREPAID_OR_BYOK`:
customer-funded variable model cost. Customer variable cost MUST be prepaid or BYOK; **the system MUST
NOT create unsecured founder liability.**"*

PRD §42.6: *"Daily provider prices and month-to-date spend are normalised into **micro-AUD**. …
Admission requires both operation quota and funding-ledger balance. Settlement records actual provider
usage and releases the remainder."* and the founder reserve order: *"1. production incident/synthetic
safety check allowance; 2. active trial commitments; 3. internal testing; 4. discretionary Deep runs."*
and *"BYOK still records estimated usage/cost for visibility but does not debit founder funds. …
**If price or currency data is unavailable, new founder-funded calls fail closed.**"*

PRD §22: metrics cover *"provider/tenant cost"*; immediate alerts include *"budget 90/100%"*; and logs
*"MUST exclude research/evidence content, PII text, credentials, assertions and provider payloads."*

PRD §42.2: *"Founder spend | 90% forecast/actual | Immediate warning | Reduce synthetic/Deep; ask paid
users for prepaid/BYOK"* and *"Founder spend | 100% hard ceiling | Immediate + hard stop | **Stop
founder-funded model calls; preserve Search.**"*

PRD §38.5: *"Search, answer credits, advanced-task credits, API calls and provider cost are separate
ledgers; exhausting one does not misreport the others."*

PRD §30.2 `OPS-003`: *"Founder-funded monthly spend stops at A$50 and search remains usable"*, primary
surface *"Usage/admin"*, evidence *"90% warning and 100% hard-stop tests pass"*.
PRD §41.2 `UAT-OPS-03`: *"Trigger A$50 projected/actual circuit breaker fixture → Paid generation
admissions stop before founder liability increases."*

**Accepted caveats carried forward, documented not enforced here.**

- **The breaker is not implemented here.** `EVID-08` owns the state machine and `FND-09` the
  arithmetic; this console **displays** the state and the numbers behind it. A second implementation
  could disagree with the one that actually stops spending.
- **Customer-facing usage screens are not here.** `PLTF-08`/`PLTF-09` own `/usage` and
  `/v1/usage/*` per organisation. This console is the **global** view (PRD §8.11).
- **Alert delivery is not here.** PRD §42.2's 90%/100% alerts are `RLSE-08`'s; this console shows the
  state that triggers them.
- **The hosted model behind each profile is benchmark-selected, not an unmade product decision** —
  plan §8 **Q1**: it is resolved by measured accuracy, zero-tolerance failures, latency, provider
  availability and cost through the evaluation pipeline, `GOLD-15` records the promotion report, and
  the Founder approves production promotion **after** seeing that evidence. Nothing here waits on a
  preference. The console displays whatever provider/profile the ledger recorded for calls that
  actually ran, and presents no model, provider or unit price as fixed — the only money figures it may
  state as settled are the configured PRD §24.1 budget and the A$50 founder ceiling.

## Goal

Produce the internal global usage and cost console: `/internal/v1/cost` endpoints serving month-to-date
founder-funded spend in micro-AUD against the PRD §24.1 hosted-model budget and the A$50 ceiling, the
current `EVID-08` breaker state with the 90%/100% thresholds, per-provider/profile and
per-organisation aggregates, the two PRD §24.4 funding ledgers and the five PRD §38.5 operation ledgers
kept separate, the founder reserve order and BYOK estimates shown as non-debiting; plus the
`apps/admin/src/features/cost/**` screens. Completion is mechanically checkable: spend is displayed in
integer micro-AUD from ledger entries with no floating-point arithmetic and no stored running total;
the breaker state is taken from `EVID-08` and never recomputed; every cross-organisation read is
audited with a reason; Search is shown as unaffected in every breaker state; and every endpoint is
invisible to customer identity.

## Non-goals

- **No budget arithmetic, reservation, settlement, release, breaker or reserve-order logic.** `FND-09`
  (`packages/domain/src/budget/**`) and `EVID-08` (`packages/model-gateway/src/budget/**`).
- **No ledger writes of any kind.** `DATA-07` owns `usage_ledger` and it is append-only through the
  gateway; this console has **no** write path (deliverable 7).
- **No BYOK key handling.** `EVID-09`.
- **No customer usage screens or `/v1/usage/*` endpoints.** `PLTF-08`, `PLTF-09`.
- **No alerting, thresholds or status page.** `RLSE-08` (PRD §42.2).
- **No pricing feed, FX rate source or price snapshot management.** `EVID-08` (PRD §42.6's recorded
  daily rate and safety margin).
- **No incident creation or kill switch.** `INTL-09` — a spend incident is raised there; this console
  links.
- **No internal boundary code.** `INTL-01`. **No table, migration or repository.** `01-app-data`.

## File-scope (write-owns)

- `apps/api/src/routes/internal/cost/**`
- `apps/api/test/internal/cost/**` (sub-PRD **D11**), including `apps/api/test/internal/cost/fixtures/**`
- `apps/admin/src/features/cost/**`
- `apps/admin/test/cost/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,quarantine,releases,licensing,evaluation,issues,incidents}/**`
  and `apps/admin/src/features/{sources,quarantine,releases,licensing,evaluation,issues,incidents,overview}/**`
  — `INTL-02`…`INTL-06`, `INTL-08`…`INTL-10`.
- `packages/database/**`, `packages/model-gateway/**`, `packages/domain/**` — `01-app-data`,
  `12-evidence-safety`, `00-foundation`.
- `apps/api/src/routes/{usage,audit-events}/**` and `apps/web/src/features/usage/**` —
  `20-developer-platform`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `pipelines/**`, `schemas/**`, `infra/**`, `tests/**`, `apps/web/**`, `apps/widget/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. Inside `apps/api/src/routes/internal/**` and `apps/admin/**`
only `INTL-01` (this ticket's `blocked_by`) has written, owning `internal/core/**` and `src/app/**`,
and it completes first. The seven siblings that may run concurrently (plan §7 wave 2, all blocked only
by `INTL-01`) own different `internal/<area>/` and `features/<area>/` directories, discovered by
directory convention (plan **A1**, sub-PRD **D9**). `EVID-08` writes only
`packages/model-gateway/src/budget/**`, which this ticket never touches. The single shared file is
`apps/admin/package.json`, restricted to appending distinct dependency entries.

## Deliverables

1. **`apps/api/src/routes/internal/cost/index.ts`** — `export const area = internalArea({ areaId:
   'cost', capability: 'COST' })` and a default export of `internalRoutes(plugin, { areaId: 'cost',
   capability: 'COST' })`.
2. **`GET /internal/v1/cost/summary`** — the operator headline, all money in **integer micro-AUD**
   (PRD §34.1: *"Integer micro-AUD for internal cost; never floating point"*):
   `month_to_date_micro_aud` per funding ledger, `hosted_model_budget_micro_aud` and
   `founder_ceiling_micro_aud` from configured PRD §24.1 values, `percent_of_budget` expressed as an
   integer basis-point value (no float), the **breaker state** obtained from `EVID-08`
   (`NORMAL | WARNING | HARD_STOP | FAIL_CLOSED`) with the reason recorded by the gateway, the
   `search_affected: false` fact asserted from `EVID-08`'s own predicate rather than hard-coded, the
   founder reserve order with each class's remaining allowance, and the price/FX snapshot age driving
   `FAIL_CLOSED`. This is the shape `INTL-10` consumes; it is documented in the internal contract
   document so the overview needs no new endpoint.
3. **`GET /internal/v1/cost/ledgers`** — the ledger matrix: the two PRD §24.4 funding ledgers ×
   the five PRD §38.5 operation ledgers, each with reservations, settlements, releases and derived
   balance for the period. Balances are **derived from entries** through `DATA-07`'s `balance()`; the
   console never stores or caches a running total (PRD §35.6, `DATA-07` deliverable 3). Exhausting one
   ledger must leave every other's reported figure unchanged (PRD §38.5).
4. **`GET /internal/v1/cost/by-organisation`** and **`GET /internal/v1/cost/by-profile`** — aggregates
   across all organisations and across model profiles/providers (PRD §22 *"provider/tenant cost"*).
   `by-profile` reports only the profiles, providers and models the ledger actually recorded: no model
   catalogue, no unit-price list and no "selected"/"default" model label, because the model behind a
   profile is benchmark-selected and only `GOLD-15`'s promotion report fixes it (plan §8 **Q1**).
   Every row carries identifiers, counts and cost only: organisation id and name, job counts, units,
   micro-AUD by ledger — and **never** a question, answer, evidence excerpt, PII text, prompt or
   provider payload (PRD §22, §10.3). Both endpoints call `crossOrganisationRead(ctx, { reason })`
   with the caller-supplied reason, which is mandatory: absent or empty is
   `400 INVALID_REQUEST` and no data is read (PRD §21.2).
5. **BYOK is visibly non-debiting.** Rows funded by `CUSTOMER_PREPAID_OR_BYOK` show the recorded
   estimate with `founder_debit_micro_aud: 0`, and the summary's founder-funded total excludes them —
   asserted, because PRD §24.4's *"MUST NOT create unsecured founder liability"* is exactly the number
   an operator reads here (PRD §42.6).
6. **Nothing is recomputed.** `cost/projection.ts` performs formatting only: no threshold comparison,
   no breaker inference, no percentage derived in floating point, no exchange-rate application. The
   breaker state, its reason and the reserve remaining come from `EVID-08`; a source scan asserts this
   area contains no budget constant and no `Number`/float arithmetic on money
   (PRD §34.1, §42.6; `EVID-08` deliverables 5–6).
7. **No write path.** The area registers only `GET` routes: no adjustment, no top-up, no reset, no
   manual settlement, no breaker override. Asserted by enumerating the route table and by a source scan
   for ledger-mutating repository members (PRD §35.6 append-only; PRD §12.4).
8. **`apps/admin/src/features/cost/feature.tsx`** — an `AdminFeatureModule` with `id: 'cost'`, a nav
   entry and routes `/internal/cost`, `/internal/cost/organisations`, `/internal/cost/profiles`.
   Screens:
   - **summary** — month-to-date against budget with the 90% and 100% marks explicitly labelled, the
     breaker state as text plus badge with its reason, an unmissable statement that **Search remains
     available** in `HARD_STOP` and `FAIL_CLOSED` (PRD §26, §42.2, `UAT-ANS-08`), the reserve order
     with remaining allowance per class, and the price/FX snapshot age;
   - **ledgers** — the two-by-five matrix with reservations/settlements/releases/balance;
   - **by organisation / by profile** — sortable aggregates; the reason prompt appears **before** the
     first cross-organisation read of the session and the audit is stated in the UI so the operator
     knows the access is recorded (PRD §21.2);
   - money rendered in AUD from integer micro-AUD with no float in the client either;
   - `SnapshotStatePanel` where a figure is unavailable, and the PRD §31.3 async states.

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/cost` via `internalArea()`/`internalRoutes()` and
      `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on summary, ledgers, by-organisation and by-profile;
      unauthenticated → `401`; internal principal without `COST` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **PRD §21.2 cross-organisation path:** `by-organisation` and `by-profile` require a
      non-empty reason, reject an absent one with `400 INVALID_REQUEST` **before** any read, and append
      exactly one audit event carrying actor, reason and request id per access
- [ ] `[machine]` **`OPS-003` / `UAT-OPS-03` shape:** with a fixture ledger at 89%, 90%, 99% and 100% of
      the hosted budget, the console reports `NORMAL`, `WARNING`, `WARNING` and `HARD_STOP` **as
      obtained from `EVID-08`**, and a missing price/FX snapshot reports `FAIL_CLOSED` — no state is
      inferred locally (PRD §42.6, §42.2; `EVID-08` deliverable 5)
- [ ] `[machine]` `search_affected` is `false` in every breaker state, read from `EVID-08`'s predicate
      rather than hard-coded (PRD §26 *"Search remains available independently of hosted-generation
      budget"*; `EVID-08` deliverable 9)
- [ ] `[machine]` **PRD §38.5 ledger separation:** exhausting one operation ledger leaves every other
      reported balance unchanged, and the two PRD §24.4 funding ledgers are reported independently
- [ ] `[machine]` **Money is integer micro-AUD end to end:** no float appears in any money computation
      in this area or in the client, `percent_of_budget` is an integer basis-point value, and a source
      scan finds no budget constant (PRD §34.1, §24.1)
- [ ] `[machine]` **Nothing is presented as a fixed model or price:** a source scan finds no model
      identifier, provider name or unit-price constant in this area — profile, provider and model
      labels come only from ledger entries and the `EVID-08` price snapshot, and a profile with no
      recorded entries renders as having no recorded usage rather than as a configured model
      (plan §8 **Q1**, benchmark-selected; PRD §42.6)
- [ ] `[machine]` Balances are derived from ledger entries via `DATA-07`'s `balance()`; no running total
      is stored or cached in this area (PRD §35.6; `DATA-07` deliverable 3)
- [ ] `[machine]` **BYOK:** rows funded by `CUSTOMER_PREPAID_OR_BYOK` report
      `founder_debit_micro_aud: 0` and are excluded from the founder-funded total
      (PRD §24.4, §42.6)
- [ ] `[machine]` **No write path:** the area registers only `GET` routes; a source scan finds no call
      to a ledger-mutating repository member and no breaker override (PRD §12.4, §35.6)
- [ ] `[machine]` **PRD §22 content exclusion:** no response, log line or audit event contains a
      question, answer, evidence excerpt, prompt, provider payload, PII text or credential — asserted
      with canaries seeded in the fixture ledger's linked job records
- [ ] `[machine]` `assertNoInternalSurfaceInCustomerArtifacts()` green (PRD §8.11; sub-PRD **D7**)
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states, mark the breaker state by text as
      well as badge, and state that Search remains available in `HARD_STOP` (PRD §41.1, §26)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-003`, `ADM-001`, `UAT-OPS-03` and the
      cost/latency impact
- [ ] `[fixture]` The committed ledger fixtures under `apps/api/test/internal/cost/fixtures/**` replay
      end-to-end: a ledger at each of 89%/90%/99%/100%, one with a stale price snapshot
      (`FAIL_CLOSED`), one with BYOK-funded entries, one with all five operation ledgers populated and
      one with entries in three organisations — offline, no provider call, no network, no production
      credentials
- [ ] `[human]` **`UAT-OPS-03`** observed from this console on a locally started stack: triggering the
      A$50 projected/actual circuit-breaker fixture stops paid generation admissions and the console
      shows `HARD_STOP` with Search still available (PRD §41.2; `OPS-003`)
- [ ] `[human]` PRD §42.2 spend drill: an operator confirms the 90% warning and 100% hard-stop states
      are legible, with the reserve order and the recommended first action (*"Reduce synthetic/Deep; ask
      paid users for prepaid/BYOK"*) visible (PRD §42.2, §42.6)
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**)
- No `[fixture]` evaluation replay and no `cargo test --workspace` / `uv run pytest` item — this ticket
  touches no Rust, no Python and no evaluation data (PRD §45.3)

## Test plan

Reviewer steps, offline: no provider call, no live pricing feed, no network, no production credentials.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/cost/` and `apps/admin/test/cost/`.
3. **`boundary.test.ts`** — `internalAreaConformance('cost')` plus the four-row denial matrix from
   `INTL-01` contract item 4 against all four endpoints.
4. **`cross-org.test.ts`** — assert an absent or empty reason returns `400` with **no** repository call
   (spy on the reader factory), and that a valid reason produces exactly one audit event with the reason
   recorded. Copy the construction pattern from `apps/api/test/internal/core/dangerous-action.test.ts`
   (`INTL-01`).
5. **`breaker.test.ts`** — `[fixture]` ledgers at 89/90/99/100% and a stale price snapshot; stub
   `EVID-08`'s breaker query and assert the console reports exactly what the stub returned, including a
   contrived state that disagrees with the raw numbers — proving no local inference.
6. **`ledgers.test.ts`** — seed all five operation ledgers in both funding ledgers; exhaust one; assert
   every other balance is unchanged; assert balances match `DATA-07`'s `balance()` output exactly.
7. **`money.test.ts`** — source scan for float arithmetic and budget constants; assert
   `percent_of_budget` is integer basis points and that a value such as 8 999 999 micro-AUD renders
   without floating-point drift.
8. **`byok.test.ts`** — BYOK fixture; assert `founder_debit_micro_aud: 0` and exclusion from the
   founder total.
9. **`no-write.test.ts`** — enumerate the route table (all `GET`); source-scan for `reserve(`,
   `settle(`, `release(` and any breaker setter.
10. **`leak.test.ts`** — canaries in the linked job/model-execution records; assert absence from every
    response, log line and audit event.
11. **`cost.screen.test.tsx`** — render summary, ledgers and aggregates; assert the 90%/100% marks are
    labelled, `HARD_STOP` states that Search remains available, and the cross-organisation reason prompt
    precedes the first aggregate read.
12. `git status --porcelain` clean after the run.
13. **Reviewer focus** (CLAUDE.md): whether any breaker state can be inferred locally; whether a float
    can enter a money path; whether a cross-organisation read can occur before the reason is validated;
    whether an aggregate can carry tenant content; whether concurrent reads can produce inconsistent
    totals mid-settlement; whether a customer principal reaches any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`EVID-08` exposes no query for the breaker state, the reserve remaining or the price-snapshot age**
  → do not infer them here. Amend `EVID-08`'s ticket and
  `docs/prd/12-evidence-safety/README.md` in one docs PR to add the read-only query, record the
  dependency in `docs/prd/22-internal-admin/README.md`, then `--sync` both. A locally inferred state
  could disagree with the one that actually stops spending.
- **Deriving month-to-date balances from entries is too slow at scale** → a stored running total
  creates a second source of truth for money, which `DATA-07`'s feedback obligation already flags.
  Record the measurement and the proposed materialised view in `docs/prd/01-app-data/README.md` and
  `docs/prd/22-internal-admin/README.md` **before** any caching, and cross-check `DATA-09`'s invariant
  2; a durable choice needs `docs/adr/NNNN-usage-ledger-balance.md`.
- **An operator wants to adjust, top up or reset a ledger from the console** → `usage_ledger` is
  append-only (PRD §35.6) and admission is `EVID-08`'s. That is a **product change** (PRD §45.5):
  raise it in `docs/prd/22-internal-admin/README.md` with the Founder as owner; never add a write path.
- **The PRD §24.1 budget figures need to live somewhere configurable** → they are product limits, not
  tuning constants. Load them from configuration with the PRD values as the committed safe defaults
  (PRD §39.6 layer 1) and record the mechanism in `docs/prd/22-internal-admin/README.md`; never
  hard-code a different number.
- **Someone asks the console to show which model a profile uses, or its list price** → the model behind
  each profile is benchmark-selected (plan §8 **Q1**) and is fixed only by `GOLD-15`'s promotion report
  after the Founder has seen the evidence; the daily provider price snapshot is `EVID-08`'s. Display
  what the ledger and that snapshot recorded, and never hard-code a model, a provider or a price here.
- **A per-organisation aggregate would be more useful with a sample of the underlying questions** →
  PRD §22 and §10.3 forbid it absolutely. Do not add it; if it is genuinely required, it is a product
  and privacy change needing founder approval and a PRD update.

**3. Escalation.** `OPS-003` (*"Founder-funded monthly spend stops at A$50 and search remains usable"*)
and PRD §24.1's *"the system MUST stop before exceeding the founder-funded ceiling"* are release
requirements. If the console cannot show the breaker state without recomputing it, or the displayed
month-to-date cannot be reconciled with the ledger that gates admission, that overturns a team decision
spanning this module, `12-evidence-safety` and `01-app-data`: stop, escalate for re-review, and never
ship a second money calculation. **A cost view that would have to bypass the PRD §21.2 audited
cross-organisation path or expose tenant research content overturns PRD §21.2 and §22** — escalate,
never implement the shortcut.
