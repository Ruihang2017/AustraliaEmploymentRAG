---
id: PLTF-08
title: Usage and limits screens
module: 20-developer-platform
lane: 20-developer-platform
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [PLTF-09, RUNT-05]
blocks: []
---

# PLTF-08 — Usage and limits screens

Implements PRD §31.2 (route `/usage`) and §38.5 (initial rate and concurrency defaults), carrying
requirement **`OPS-003`** ("Founder-funded monthly spend stops at A$50 and search remains usable" —
this module owns its **visibility** half, epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §38.5 (*"Search, answer credits, advanced-task
credits, API calls and provider cost are separate ledgers; exhausting one does not misreport the
others"*) and §24.4 (the two funding ledgers); this is build ticket 8 of 9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`PLTF-09` — Usage, limits and audit endpoints](PLTF-09-usage-limits-and-audit-endpoints.md);
`RUNT-05` — Web app shell: navigation, org switcher, status badges
([`03-app-runtime`](../../03-app-runtime/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— `PLTF-09` has already frozen the usage endpoints and PRD §38.5 the ledger model; this renders
them, it does not decide a charging rule.

## Background + basis

**The route and its empty state are fixed.** PRD §31.2:

> | `/usage` | Usage and limits | Owner/Admin/Developer read subset | Inspect credits/calls/reset | **Explain Search vs generation charging** |

That last column is the screen's hardest requirement: the difference between a search and a generated
answer is a **charging** difference, and a customer who does not understand it will misread every
number on the page.

**The ledgers are separate, and separateness is normative.** PRD §38.5, quoted in full for the parts
this screen renders:

> | Boundary | Trial | Paid pilot | System hard protection |
> |---|---:|---:|---:|
> | Search burst | 20/min/organisation | 60/min/organisation | 100/min global initial |
> | API calls | 500/trial | 10,000/month | token-bucket and request-size limits |
> | Concurrent Quick | 1 | 2 | bounded by worker/provider |
> | Concurrent Deep | 1 | 1 | 1 initial global worker execution |
> | Concurrent export | 1 | 1 | 1 initial |
> | Webhook endpoints | 2 | 10 | delivery queue isolated from research |
> | Widget session creation | 30/min/service account | 120/min/service account | abuse/IP/origin protection |
>
> Rate-limit responses include `Retry-After`, limit, remaining and reset metadata **without
> disclosing other tenants**. **Search, answer credits, advanced-task credits, API calls and provider
> cost are separate ledgers; exhausting one does not misreport the others.**

and PRD §24.4:

> - `FOUNDER_PLATFORM_BUDGET`: trial/internal usage.
> - `CUSTOMER_PREPAID_OR_BYOK`: customer-funded variable model cost.
>
> Customer variable cost MUST be prepaid or BYOK; the system MUST NOT create unsecured founder
> liability. Default per-organisation concurrency: two Quick, one Deep and one export, with separate
> API/search burst limits and webhook queues.

Sub-PRD **D19** turns those two paragraphs into a rendering rule: **five operation ledgers and two
funding ledgers, displayed separately, never summed into one total.**

**Search must not look like it costs generation credit.** PRD §16.2: *"Search is read-only despite
POST and MUST not consume generation credits."* PRD §26 makes it a Definition-of-Done item —
*"Search remains available independently of hosted-generation budget"* — and PRD §42.2's action at
the 100% ceiling is *"Stop founder-funded model calls; preserve Search"*. A usage screen that shows a
single "credits" number would contradict all three.

**`OPS-003` and its acceptance evidence.** PRD §30.2:

> | OPS-003 | Founder-funded monthly spend stops at A$50 and search remains usable | Usage/admin | usage/budget | App | **90% warning and 100% hard-stop tests pass** |

The **enforcement** of those stops is `12-evidence-safety`/`EVID-08` (the gateway's reservation and
breaker, PRD §42.6) and the global operator console is `22-internal-admin`/`INTL-07`. Neither is on
this ticket's dependency path (breakdown plan §6.2). **This ticket owns visibility only**: what the
calling organisation can see about its own consumption. It states that boundary on the screen rather
than implying it controls anything.

**Who may see what.** PRD §38.1's row *"View organisation usage"*: Owner ✓, Admin ✓, Researcher
*"own usage"*, Viewer —, Developer *"API/service usage subset"*, service account *"own usage"*. The
decision comes from `FND-06.evaluate()` and is already applied by `PLTF-09` server-side; this screen
renders what it is given and writes **no role literal** (PRD §45.2; breakdown plan §9 **R5**).

**What `PLTF-09` publishes and this screen consumes** (its deliverables 2–4):

- `GET /v1/usage/current` — per `(funding_ledger, operation_ledger)` balances for the current period,
  each with `used`, `limit`, `remaining`, `period_start`, `period_end` and `reset_at`; computed from
  ledger entries, never a stored running total.
- `GET /v1/usage/events` — cursor-paginated ledger entries carrying **technical fields only**
  (`entry_type`, `operation_ledger`, `funding_ledger`, `units`, `cost_micro_aud`, `job_id`,
  `created_at`), never research content.
- `GET /v1/usage/limits` — the effective PRD §38.5 limits for the caller's own organisation with
  remaining and reset, *"without disclosing other tenants"*.

**The A1 web registration contract** — `RUNT-05`, normative here:

> **2. Required entry file.** A feature area MUST contain `feature.tsx` with a **default export** of
> type `FeatureModule`.
> **3. Navigation slots are PRD-fixed.** … the frozen ordered tuple `['ORG_SWITCHER','HOME','SEARCH',
> 'ASK','COVERAGE','COMPARE','RECORDS','MONITOR','DEVELOPER','SETTINGS','HELP']` … **`nav` is
> optional: a feature may register routes without a nav entry.**
> **5. Organisation scoping is mandatory for cached state.** Every cache key a feature creates MUST
> be produced by the shell's `orgScopedKey(...)` helper.
> **6. Stability guarantee.** Adding, renaming or removing a feature area produces **zero** diff
> outside that area's own directory.

Sub-PRD **D14**: PRD §31.1's eleven navigation items do not include Usage, so this area registers
`/usage` and claims **no** slot. Claiming a twelfth would fail `RUNT-05`'s build check.

**Money and dates.** PRD §34.1: *"Money | Integer micro-AUD for internal cost; never floating
point"*, and timestamps are ISO 8601 UTC in payloads. PRD §41.1: *"dates display unambiguously as
`3 Aug 2026` in UI while APIs use ISO format"*.

**Accepted caveats carried forward, documented not enforced here:**

- **This screen enforces nothing.** The 90%/100% stops are `EVID-08`'s; the global spend console is
  `INTL-07`'s.
- **Degraded/breaker status comes from the shell**, which consumes `/v1/system-status` (`RUNT-08`).
  Neither `RUNT-08` nor `EVID-08` is on this ticket's dependency path, so the screen surfaces the
  shell's existing degraded badge and does not invent a second source of truth.
- **BYOK still records estimated cost for visibility but does not debit founder funds** (PRD §42.6);
  the screen must therefore keep the two funding ledgers visually distinct, not merged.

## Goal

Produce the `usage` web feature area serving `/usage`, such that a customer can see, for their own
organisation, exactly what they have consumed and what remains — with the five PRD §38.5 operation
ledgers and the two PRD §24.4 funding ledgers displayed **separately**, reset times shown, and the
difference between Search and generation charging explained in plain language. Completion is
mechanically checkable: the area registers `/usage` and claims no nav slot; no combined "total
credits" figure exists anywhere; search never appears under a generation ledger; every number comes
from `PLTF-09`'s response rather than a client-side computation; money is rendered from integer
micro-AUD without floating-point arithmetic; and no other tenant's figure is reachable.

## Non-goals

- **No usage, limit or audit endpoints** — `PLTF-09` (`apps/api/src/routes/{usage,audit-events}/**`),
  this ticket's `blocked_by`. The screen computes no balance; it renders one.
- **No ledger tables, repositories or arithmetic** — `01-app-data`/`DATA-07` (breakdown plan **A3**;
  PRD §45.2). Nothing here reads a database.
- **No budget enforcement, reservation, settlement or circuit breaker** — `12-evidence-safety`/`EVID-08`
  and `packages/domain/src/budget` (`FND-09`), PRD §42.6. The screen displays state; it stops
  nothing.
- **No global/operator cost console** — `22-internal-admin`/`INTL-07` (`/internal/v1`,
  `apps/admin/**`). PRD §8.11 keeps internal administration separate.
- **No audit-event screen.** `PLTF-09` exposes `GET /v1/audit-events`; PRD §31.2 defines no customer
  audit route, so this ticket adds none — see the sub-PRD open questions and friction 4.
- **No developer section screens** — `PLTF-01` (`/developer/api`) and `PLTF-07` (the other three).
  `/usage` is its own feature area (sub-PRD **D14**).
- **No web shell, navigation slots, organisation switcher, status/degraded badges or
  `apps/web/src/lib/**`** — `RUNT-05`; **no `packages/ui` primitives** — `RUNT-06` (breakdown plan
  **A6**). This screen composes them.
- **No permission matrix** — `FND-06`. No role literal appears here.
- **No pricing, plan or invoicing surface.** PRD §24.3: *"Public self-service pricing is deferred."*
  The screen shows consumption and limits, not prices to buy.
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own co-located
  assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `apps/web/src/features/usage/**` — the whole feature area, including:
  - `feature.tsx` — the A1 entry file (sub-PRD **D14**; this is the only ticket in the area);
  - the screen, its components, its co-located tests and its fixtures.

Does not touch:

- `apps/web/src/features/developer/**` — `PLTF-01` (area entry files and `api/**`) and `PLTF-07`
  (the three other sections).
- Every other `apps/web/src/features/*` area — `13`, `14`, `15`, `16`, `17`, `19`, `24`.
- `apps/web/src/{app,shell,lib}/**`, `apps/web/test/**`, `apps/web/{index.html,vite.config.ts,
  tsconfig.json,package.json}` — `RUNT-05`. (Sub-PRD **Q-PLTF-4** is the path if a dependency were
  genuinely unavoidable; prefer adding none.)
- `apps/api/src/routes/**` — `PLTF-09`, `PLTF-04`, `IDNT-*`, `WTCH-*` and the other route owners;
  `packages/database/**` — `01-app-data`; `packages/{contracts,domain,ui,observability}/**` and
  `schemas/**` — `00-foundation`, `RUNT-06`, `RUNT-07`; `packages/model-gateway/**` —
  `12-evidence-safety`.
- `apps/widget/**` — `PLTF-05`/`PLTF-06`; `packages/sdk-typescript/**` — `PLTF-02`; `sdk/python/**` —
  `PLTF-03`; `docs/api/**` — `PLTF-01`; `apps/admin/**` — `22-internal-admin`.
- `apps/worker/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`, root
  manifests, lockfiles, `.github/workflows/**`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. Under `RUNT-05`'s A1
web contract, `apps/web/src/features/usage/` is discovered by a glob, so creating it produces
**zero** diff outside its own directory; it is therefore disjoint from `developer/**` and from every
other module's feature area. This ticket is the **only** ticket in the `usage` area, so its
`feature.tsx` has no co-owner (sub-PRD **D14**). It runs in wave 2 alongside `PLTF-06`
(`apps/widget/react/**`) and `PLTF-07` (`apps/web/src/features/developer/{service-accounts,webhooks,
widget}/**`) — three disjoint trees, three concurrent lanes (breakdown plan §7). The module-wide
picture is PRD §44.3's *"Web screens against frozen contracts"* and *"independent SDK languages"*:
the two SDK subtrees, the widget subtree, the three API route areas and the two web feature areas
share no file.

## Deliverables

1. **`apps/web/src/features/usage/feature.tsx`** — default-exported `FeatureModule` with
   `id: 'usage'` (equal to the directory name), `routes: [{ path: '/usage', element: <UsageScreen /> }]`
   and **no `nav` entry** (sub-PRD **D14**: PRD §31.1's eleven slots do not include Usage, and
   `RUNT-05` contract item 3 makes `nav` optional). `visibleWhen`-style gating is not needed for a
   non-nav route; access is the shell's `FND-06` decision and `PLTF-09`'s server-side enforcement.
   `onOrganizationChange` drops every cached usage response.
2. **Ledger panels, one per operation ledger (sub-PRD D19).** Five panels — **Search**, **Answer
   credits**, **Advanced-task credits (Compare/Coverage)**, **API calls**, **Provider cost** — each
   showing `used`, `limit`, `remaining`, the period and the `reset_at`, rendered from
   `GET /v1/usage/current`. Rules, all load-bearing:
   - **there is no combined total anywhere on the screen** — no "total credits", no summed progress
     bar, no aggregate percentage across ledgers (PRD §38.5: *"exhausting one does not misreport the
     others"*);
   - a ledger at zero remaining is shown as exhausted **without** implying any other ledger is
     affected, with an explicit line naming what still works — in particular that Search continues
     (PRD §16.2, §26, §42.2);
   - `limit` absent (unlimited or not applicable) renders as "not limited", never as `0` or `∞` doing
     arithmetic.
3. **Funding ledgers kept apart (PRD §24.4).** `FOUNDER_PLATFORM_BUDGET` and
   `CUSTOMER_PREPAID_OR_BYOK` are separate, labelled sections; a figure is never moved between them
   and never added across them. BYOK usage is shown as recorded-for-visibility, with the explicit
   note that it *"does not debit founder funds"* (PRD §42.6).
4. **"Search versus generation charging", explained (PRD §31.2's empty state).** A permanent,
   plain-language explanation — not a tooltip — stating that: search is read-only and consumes **no**
   generation credit (PRD §16.2); search continues to work when the generation budget is exhausted
   (PRD §26, §42.2); Quick and Deep answers, Compare and Coverage consume credits; and API calls are
   counted separately from all of those. The copy is committed as a fixture so a reviewer can read it
   against the PRD sentences it paraphrases.
5. **Limits view.** `GET /v1/usage/limits` rendered as the caller's **own** effective limits with
   remaining and reset — the PRD §38.5 boundaries that apply to them (search burst, API calls,
   concurrent Quick/Deep/export, webhook endpoints, widget session creation). No other tenant's
   figure and no global system-protection number attributable to another tenant is shown
   (PRD §38.5 *"without disclosing other tenants"*). Where the response marks a value as a system
   hard protection, it is labelled as such rather than as the customer's quota.
6. **Recent usage events.** A cursor-paginated table from `GET /v1/usage/events` showing
   `created_at`, `operation_ledger`, `funding_ledger`, `entry_type`, `units`, `cost_micro_aud` and
   `job_id`. **No question, answer, citation or other research content appears** — the response
   carries none (`PLTF-09` deliverable 3) and the table renders no free-text column. `page_size`
   respects PRD §34.1's 1–100 bound; the cursor is opaque and never parsed.
7. **Money rendering.** All costs arrive as **integer micro-AUD** (PRD §34.1: *"Integer micro-AUD for
   internal cost; never floating point"*). Formatting to A$ happens once, in a single helper that
   takes an integer and produces a display string; a source scan asserts no floating-point arithmetic
   is performed on a cost value anywhere in this area, and no cost is summed client-side.
8. **The applicable PRD §31.3 states** for each data load — `IDLE`, `VALIDATING`, `COMPLETED`,
   `FAILED` — each with a visible title, plain-language explanation, allowed next action and request
   id, using `packages/ui`'s async-state components (`RUNT-06`). A spinner alone is a defect. A
   failed load of one panel does not blank the others.
9. **Degraded status is surfaced, not invented.** The shell already shows the environment, release
   and degraded badges (`RUNT-05`, PRD §31.1). This screen adds a link to `/developer/api` and to the
   status surface, and states plainly that enforcement of the founder-funded ceiling happens in the
   platform, not on this page. It does **not** compute a breaker state (accepted caveat above).
10. **Organisation scoping and accessibility.** Every cache key is produced by `RUNT-05`'s
    `orgScopedKey(...)` and purged on switch; one programmatic heading; labelled regions; a live
    region for load status; colour never the only signal for an exhausted ledger (text plus icon);
    dates rendered as `3 Aug 2026` while payloads stay ISO; usable at 360 px, 768 px and 1280 px
    without hiding a limit, a reset time or an error recovery action (PRD §31.1, §41.1, §13.1).
11. **Co-located tests** under `apps/web/src/features/usage/__tests__/**` with recorded responses for
    `PLTF-09`'s three endpoints, including an exhausted-ledger fixture, a BYOK fixture, an
    unlimited-limit fixture and a partial-failure fixture.

Ordering constraint: deliverable 1 before 2–6 (the area must register before its panels are
mounted), and deliverable 7's helper before any panel renders a cost.

## Acceptance checklist (classified)

- [ ] `[machine]` The `usage` feature area registers `/usage` and claims **no** navigation slot, with
      **zero** diff to any tracked file outside `apps/web/src/features/usage/` — asserted with
      `RUNT-05`'s exported feature-area conformance helper (sub-PRD **D14**; `RUNT-05` contract items
      3 and 6; breakdown plan **A1**)
- [ ] `[machine]` **`OPS-003` ledger separation (PRD §38.5)**: the five operation ledgers render as
      five independent panels; **no combined total, summed progress bar or cross-ledger percentage
      exists anywhere** — asserted by a rendered-output scan plus a source scan for aggregate
      arithmetic over ledger values (PRD §38.5 *"exhausting one does not misreport the others"*;
      sub-PRD **D19**)
- [ ] `[machine]` **Funding ledgers stay apart (PRD §24.4)**: `FOUNDER_PLATFORM_BUDGET` and
      `CUSTOMER_PREPAID_OR_BYOK` render in separate labelled sections and are never added together;
      BYOK usage is labelled as recorded-for-visibility and not a founder debit (PRD §24.4, §42.6)
- [ ] `[machine]` **Search is never charged as generation**: with an exhausted answer-credit fixture,
      the search panel shows its own independent state and the screen states explicitly that Search
      continues to work; no rendering path attributes a search to a generation ledger (PRD §16.2,
      §26, §42.2; `SRCH-001`)
- [ ] `[fixture]` **The charging explanation is present and accurate**: the committed copy fixture is
      rendered verbatim and a reviewer can read it against PRD §16.2, §26 and §42.2 — it says search
      consumes no generation credit, search survives budget exhaustion, answers/Compare/Coverage
      consume credits, and API calls count separately (PRD §31.2 *"Explain Search vs generation
      charging"*)
- [ ] `[machine]` **Every number comes from the response**: a source scan asserts no client-side
      computation of `used`, `remaining` or a balance, and no floating-point arithmetic on any
      `cost_micro_aud` value; formatting happens once, from an integer (PRD §34.1 *"Integer micro-AUD
      … never floating point"*; `DATA-07` deliverable 3 computes balances from entries)
- [ ] `[machine]` **Limits view discloses only the caller's own figures**: no other tenant's limit,
      remaining or reset is rendered; a system hard-protection value is labelled as such and not as
      the customer's quota (PRD §38.5 *"without disclosing other tenants"*)
- [ ] `[machine]` **No research content on the screen**: the events table renders no free-text column
      and a fixture whose entries carry only technical fields produces no question, answer or citation
      text; a canary research string injected into an unexpected response field is not rendered
      (PRD §22; §41.1; `PLTF-09` deliverable 3)
- [ ] `[machine]` **Pagination**: `page_size` respects PRD §34.1's 1–100 bound with default 25 and the
      cursor is never parsed (PRD §34.1)
- [ ] `[machine]` **Partial failure**: a failed load of one panel leaves the others rendered, and the
      failed panel shows the PRD §31.3 `FAILED` state with a title, explanation, next action and
      request id (PRD §31.3)
- [ ] `[machine]` **The applicable PRD §31.3 states** (`IDLE`, `VALIDATING`, `COMPLETED`, `FAILED`)
      each render title, explanation, next action and request id; a spinner alone fails (PRD §31.3)
- [ ] `[machine]` **No role literal and no permission logic** in this area; what a caller sees is
      `PLTF-09`'s server-side `FND-06` decision (PRD §38.1's *"View organisation usage"* row;
      §45.2; breakdown plan §9 **R5**)
- [ ] `[machine]` **Organisation scoping**: every cache key is produced by `orgScopedKey(...)` and
      purged on switch — asserted with `RUNT-05`'s `apps/web/test/org-scope-conformance.ts`
      (PRD §31.1; `AUTH-002`)
- [ ] `[machine]` **PRD §41.1 universal UI acceptance**: no research content in any URL query string,
      page title or error telemetry; request ids copyable from errors; dates as `3 Aug 2026` while
      payloads stay ISO; colour never the only signal for an exhausted ledger (PRD §41.1)
- [ ] `[machine]` **PRD §13.1 accessibility**: zero WCAG 2.2 AA violations at 360 px, 768 px and
      1280 px; complete keyboard operation with visible focus; one programmatic heading; labelled
      regions; a live region for load status; no limit, reset time or recovery action hidden at
      360 px (PRD §13.1, §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this area declares no `/v1` type of
      its own and hand-edits no generated file (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`OPS-003`** visibility half,
      `E27-DEVELOPER`, proposed `UAT-DEV-01` per sub-PRD **Q-PLTF-1**), user-visible change and
      non-goals, schema/API/event compatibility impact (consumer only), tenant/PII/security impact (no
      other tenant's figures, no research content, no secret), source/licence impact (none),
      cost/memory/latency impact (three cached reads per visit), rollback path (revert; the feature
      area disappears with zero diff elsewhere), known gaps (enforcement is `EVID-08`; the global
      console is `INTL-07`; no customer audit screen — friction 4)
- [ ] `[human]` **Founder review that the page is honest** (PRD §43.4; §41.3 step 7 *"show … usage
      limit …"*): a reader who has just run a search and a Quick Answer can tell from the page alone
      which ledger each consumed, what remains, when it resets, and that search will keep working if
      the generation budget runs out. Runs at Gate 2 — **not required to merge**
- No `[fixture]` criteria beyond the charging-copy row — this screen replays only `PLTF-09`'s
      recorded responses, and the assertions on those are `[machine]` behaviour checks
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)
- No origin-validation criteria — this screen ships no cross-origin surface (`PLTF-05`/`PLTF-06` own
      that, PRD §8.10)
- No SDK-telemetry criteria — this screen emits no SDK telemetry (sub-PRD **D7**)

## Test plan

Reviewer steps, **all offline**: no network, no live API, no running server. Every HTTP interaction
is a recorded response for `PLTF-09`'s three endpoints; the DOM environment is `apps/web`'s test
runner; the clock is fixed so `reset_at` renders deterministically.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/web`. Suites live under
   `apps/web/src/features/usage/__tests__/`. Copy the construction pattern from
   `14-search-product`'s co-located screen tests and `PLTF-01`'s section tests.
3. **Read the recorded responses against `PLTF-09`.** Compare each fixture with `PLTF-09`
   deliverables 2–4. **A drifted fixture makes every assertion vacuous** — check this first.
4. **`registration.test.ts`** — mount the feature registry over a `mkdtemp` copy of
   `apps/web/src/features` containing only `usage/`; assert `/usage` registers and that **no** nav
   slot is claimed; assert `git status --porcelain` is clean.
5. **`ledger-separation.test.ts`** — render the standard fixture; assert exactly five operation
   panels; then scan the rendered output for any element combining two ledgers (a summed number, a
   shared progress bar, a cross-ledger percentage) and assert none. Then a source scan for `reduce`,
   `+=` or `sum` applied to a ledger array. Confirm the scan fails when a deliberate total is added
   on a scratch branch.
6. **`funding-ledgers.test.ts`** — the BYOK fixture; assert two labelled sections, no cross-addition,
   and the "does not debit founder funds" note.
7. **`search-not-charged.test.ts`** — the exhausted-answer-credit fixture; assert the search panel is
   unaffected and the "search continues to work" statement renders; assert no rendering path maps a
   search entry to a generation ledger.
8. **`charging-copy.test.ts`** — assert the committed copy fixture renders verbatim; then **read it
   beside PRD §16.2, §26 and §42.2** and confirm it does not overstate or understate the rule. A
   paraphrase that contradicts the PRD is a ticket failure, not a wording preference.
9. **`money.test.ts`** — feed integer micro-AUD values including 0, 1 and a large value; assert
   correct A$ rendering; then a source scan for floating-point arithmetic on a cost value and for any
   client-side sum.
10. **`limits.test.ts`** — assert only the caller's own figures render, and that a system
    hard-protection value is labelled as such.
11. **`events-table.test.ts`** — assert the technical columns only; inject a canary research string
    into an unexpected response field and assert it is not rendered; assert `page_size` bounds and an
    opaque cursor.
12. **`states.test.ts`** — drive `IDLE`, `VALIDATING`, `COMPLETED`, `FAILED`; assert title,
    explanation, next action and request id for each; then the partial-failure fixture, asserting the
    other panels stay rendered.
13. **`org-scope.test.ts`** — import `apps/web/test/org-scope-conformance.ts` (`RUNT-05`) read-only;
    assert compliance and purge on switch.
14. **`a11y.test.ts`** — accessibility at the three widths; one heading; live region; assert no limit
    or reset time is hidden at 360 px.
15. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether any
    number on the page is computed client-side rather than read from the response; whether a missing
    or `null` `limit` produces a misleading `0%` or `100%`; whether an organisation switch mid-load
    can render one organisation's figures under another's heading; whether the events cursor can be
    replayed across organisations; whether a `cost_micro_aud` near the integer bound renders
    correctly; whether an error message can carry a request path with a query string containing
    research content.
16. The `[human]` row runs against a locally started stack (`pnpm stack:up`, `RUNT-09`) at Gate 2 and
    is recorded in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`PLTF-09` does not return a field this screen must display** (for example a per-ledger `reset_at`
  or a `limit` marked as a system protection). → Amend **`PLTF-09`'s deliverables 2–4** and this
  ticket together in **one** docs PR and `--sync` both. **Never write
  `apps/api/src/routes/usage/**`** from here, and never compute the missing value client-side — a
  client-side balance would contradict `DATA-07` deliverable 3's rule that balances are computed from
  entries.
- **A reviewer or a customer asks for a single "credits remaining" number.** → PRD §38.5 is explicit
  that the ledgers are separate *"so exhausting one does not misreport the others"*, and PRD §26/§42.2
  depend on search surviving generation exhaustion. Record the request in
  `docs/prd/20-developer-platform/README.md` **D19** and escalate as a **product change**
  (PRD §45.5). Never add a total.
- **The screen would be more useful if it showed the 90%/100% breaker state.** → That state is
  `EVID-08`'s and is surfaced through `/v1/system-status` and the shell's degraded badge
  (`RUNT-08`, `RUNT-05`) — neither is on this ticket's dependency path (breakdown plan §6.2). Adding
  an edge is a **plan change**: raise it in `docs/prd/breakdown-plan.md` §5.21/§6.2 and
  `docs/prd/20-developer-platform/README.md` first. Never compute a breaker state on the client.
- **PRD §31.2 defines no customer-facing audit screen, but `PLTF-09` exposes `GET /v1/audit-events`.**
  → Do not invent a route. Raise it in `docs/prd/20-developer-platform/README.md` §Open questions
  with the **Founder** as owner (PRD §45.5 *"Product change"*); PRD §31.2's route table is the
  authority on what routes exist.
- **A dependency is genuinely needed in `apps/web/package.json`.** → That manifest is
  `03-app-runtime`'s. Follow whatever `14-search-product`'s **Q-FIND-1** settles, record it under
  **Q-PLTF-4** in `docs/prd/20-developer-platform/README.md`, keep the change append-only, and
  regenerate `pnpm-lock.yaml` rather than hand-merging it (breakdown plan §4.1).
- **Usage figures disagree with what a customer observed** (for example a retried job appears twice).
  → That is a ledger question, not a rendering one: `DATA-07` deliverable 3's uniqueness constraint
  and `EVID-08`'s settlement own it. Report it against `01-app-data`/`12-evidence-safety` with the
  fixture; never "fix" it by de-duplicating on the client.

**3. Escalation.** *"Search, answer credits, advanced-task credits, API calls and provider cost are
separate ledgers; exhausting one does not misreport the others"* (PRD §38.5) and *"Search remains
available independently of hosted-generation budget"* (PRD §26) are release requirements with MUST
force, and `OPS-003`'s evidence is that the 90% warning and 100% hard stop behave correctly. If the
separation cannot be rendered honestly — for example because `PLTF-09` can only report a merged
figure — that overturns sub-PRD **D19** and touches PRD §38.5's ledger model. Stop, raise it against
`PLTF-09` and in `docs/prd/20-developer-platform/README.md`, raise an ADR under `docs/adr/`
(breakdown plan **A9**) if the model itself must change, and escalate to the human. Never present a
combined total to make the page simpler.
