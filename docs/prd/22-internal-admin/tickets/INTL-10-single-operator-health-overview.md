---
id: INTL-10
title: Single operator health overview
module: 22-internal-admin
lane: 22-internal-admin
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-02, INTL-04, INTL-07, INTL-09]
blocks: []
---

# INTL-10 — Single operator health overview

Implements **PRD §32.8 (the single internal health overview) and §42.1 — requirement `OPS-002`**, with
`ADM-001`'s internal-visibility clause (epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §32.8 (*"Internal pages MUST optimise for a solo operator:
a single health overview shows critical source freshness, quarantine count, active/candidate corpus,
backup lag, queue depth, citation failures, spend and incidents"*); this is build ticket **10 of 10**
against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-02`](INTL-02-source-and-ingestion-health-console.md),
[`INTL-04`](INTL-04-corpus-release-candidate-and-promotion-console.md),
[`INTL-07`](INTL-07-global-usage-and-cost-console.md),
[`INTL-09`](INTL-09-incidents-and-scoped-kill-switches.md).
**Why `builder`:** a bounded change inside one module's declared file-scope, composing four sibling
consoles' already-fixed endpoint shapes into one screen — not a new subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` (transitively upstream through all four blockers) owns the admin shell: the
`AdminFeatureModule` contract and the glob-based feature registry (`apps/admin/src/app/feature-registry.ts`),
the async-state components implementing PRD §31.3, `SnapshotStatePanel` for
`AVAILABLE`/`STALE`/`UNAVAILABLE`, and the `/internal/v1` fetch client. This ticket adds **one feature
directory** and imports those; it writes no shell code and no API route.

The four blockers publish the shapes this screen composes; each is documented in the module's internal
contract document:

| Source | Endpoint | Supplies |
|---|---|---|
| `INTL-02` | `GET /internal/v1/sources/health` | counts by coverage status, `FRESHNESS_LIMITED` count, **critical-freshness breach count**, **total open quarantine items**, missing mandatory groups, snapshot `generatedAt` |
| `INTL-04` | `GET /internal/v1/releases` | the **active** release and the **candidate** list with their promotable verdicts |
| `INTL-07` | `GET /internal/v1/cost/summary` | month-to-date micro-AUD, budget and ceiling, breaker state, `search_affected: false` |
| `INTL-09` | `GET /internal/v1/incidents`, `GET /internal/v1/kill-switches/active` | open incidents by severity, active kill switches with scope and expiry |

**This ticket has no plan edge to `RUNT-08` (`/v1/system-status`), `RLSE-05`/`RLSE-08` (backup lag,
alerting) or `RUNT-04` (queue depth)** — sub-PRD **M5**. Under `/start-all` a ticket may only assume its
transitive `blocked_by` ancestors exist, so those three PRD §32.8 tiles are sourced through **optional
runtime probes**: present → rendered; absent or failing → an explicit `UNAVAILABLE` tile naming the
owning ticket. That is the honest form of PRD §44.4 (*"a source category that cannot meet the gate …
cannot be silently omitted"*) applied to an operator screen.

Likewise the quarantine **count** comes from `INTL-02`'s `/sources/health` (and, for the candidate
release, `INTL-04`'s manifest `quarantine` object from `CRPS-02`) rather than from `INTL-03`, because
plan §5.23 gives this ticket no `INTL-03` edge — sub-PRD **M6**. The screen still links to
`INTL-03`'s console for the queue itself.

**What the PRD fixes, quoted.**

PRD §32.8: *"Internal pages MUST optimise for a solo operator: **a single health overview shows
critical source freshness, quarantine count, active/candidate corpus, backup lag, queue depth,
citation failures, spend and incidents.** Dangerous actions use recent MFA, typed confirmation, scope,
reason and expiry/review."* — eight tiles, one screen.

PRD §42.1 — the health and readiness table (`/health/live`, `/health/ready`, `/v1/system-status`,
authenticated synthetic Search, budgeted synthetic Answer) and: *"Readiness fails during incompatible
app/corpus/schema state. Provider outage does not make Search unready; it marks generation degraded. A
source-specific outage does not take the app down; it changes source freshness/status and affected
answer behaviour."*

PRD §42.2 — the thresholds an operator reads these tiles against: disk warn 75% / critical 85%; backup
lag warn 10 min / critical 15 min; last valid recovery point older than 24 h; job oldest age Quick
>2 min, Deep >10 min; citation validation failure >5% rolling 20 jobs or any integrity mismatch;
critical source freshness missing its SLA by 2×; founder spend 90% and 100%.

PRD §22: *"Metrics cover server/disk/memory, backup lag, app/auth/PII, job queues, search
latency/zero-results/release, source freshness/quarantine/citation/evaluation and provider/tenant
cost."* and logs *"MUST exclude research/evidence content, PII text, credentials, assertions and
provider payloads."*

PRD §30.2 `OPS-002`: *"Search, answer, source, budget and backup degradation are observable without
content logs"*, primary surface *"Status/admin"*, minimum acceptance evidence **"Alerts fire in
controlled failure drills"**.

PRD §31.3 — every job-driven screen implements the ten async states with *"a visible title,
plain-language explanation, allowed next action and request/job ID. A spinner without state or recovery
guidance is not acceptable."*

**Accepted caveats carried forward, documented not enforced here.**

- **Three of the eight PRD §32.8 tiles have no guaranteed source** (backup lag, queue depth, citation
  failures) — sub-PRD **M5**. They are optional runtime probes with an explicit unavailable state and a
  named owner, not fabricated values.
- **No alerting.** PRD §42.2's alerts are `RLSE-08`'s; this screen is the human-readable state those
  alerts also describe.
- **No new API.** Plan §5.23 gives this ticket only `apps/admin/src/features/overview/**`; every datum
  comes from an existing endpoint.

## Goal

Produce the single PRD §32.8 operator overview at `apps/admin/src/features/overview/**`: one screen
with all eight tiles — critical source freshness, quarantine count, active/candidate corpus, backup
lag, queue depth, citation failures, spend and incidents (with active kill switches) — each either
showing a real value from a declared source or an explicit `UNAVAILABLE` state naming the owning
ticket, each linking to the console that owns it, and each conveying breach against its PRD §42.2
threshold in text as well as badge. Completion is mechanically checkable: all eight tiles are present
and asserted against a literal list; with every source stubbed the tiles render real values; with every
source absent the screen renders eight explicit unavailable tiles and no zeroes; and no tile fabricates,
derives or caches a value its source did not provide.

## Non-goals

- **No API route of any kind.** Plan §5.23 gives this ticket no `apps/api/**` scope; every endpoint it
  reads belongs to `INTL-02`, `INTL-04`, `INTL-07` or `INTL-09`, and the optional probes belong to
  `RUNT-08`/`RLSE-08`/`RUNT-04`.
- **No new aggregate computed here.** If a number needs deriving, it is derived in the owning console's
  endpoint (see Feedback obligation), never in the overview — two derivations of one figure would
  disagree.
- **No dangerous actions.** The overview is read-only and links to the console that owns each action
  (`INTL-04` promotion, `INTL-09` kill switches, `INTL-03` quarantine, `INTL-08` corrections).
- **No alerting, thresholds engine, status page or external checks.** `RLSE-08` (PRD §42.2, §42.1).
- **No shell, navigation, async-state or client code.** `INTL-01` (`apps/admin/src/app/**`).
- **No customer-facing status surface.** `RUNT-08`'s `/v1/system-status` and `LNCH-03`'s public status
  page.
- **No quarantine queue, licence review, evaluation or issue view.** `INTL-03`, `INTL-05`, `INTL-06`,
  `INTL-08` — the overview links, it does not embed.

## File-scope (write-owns)

- `apps/admin/src/features/overview/**`
- `apps/admin/test/overview/**` (sub-PRD **D11**), including `apps/admin/test/overview/fixtures/**`
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}` — `INTL-01`.
- `apps/admin/src/features/{sources,quarantine,releases,licensing,evaluation,cost,issues,incidents}/**`
  — `INTL-02`…`INTL-09`.
- `apps/api/**` — `03-app-runtime`, the product modules, and `INTL-01`…`INTL-09` for
  `routes/internal/**`. **This ticket writes no API code at all.**
- `packages/**`, `schemas/**`, `pipelines/**`, `evals/**`, `infra/**`, `tests/**`, `apps/web/**`,
  `apps/widget/**`, `docs/runbooks/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written this path. This ticket is the sole member of the module's wave 3 (plan
§7: 10 tickets, 3 minimum waves) — every sibling is upstream of it, either directly (`INTL-02`,
`INTL-04`, `INTL-07`, `INTL-09`) or through `INTL-01`, so **no sibling runs concurrently with it**.
Under sub-PRD **D9** the admin feature registry discovers `apps/admin/src/features/overview/` by glob,
so adding this feature changes no tracked file outside its own directory (`INTL-01` deliverable 9). The
single shared file is `apps/admin/package.json`, restricted to appending distinct dependency entries;
`/start-all` serialises delivery, so lockfile regenerations land one at a time.

## Deliverables

1. **`apps/admin/src/features/overview/feature.tsx`** — an `AdminFeatureModule` with `id: 'overview'`,
   the primary nav entry (first slot, so the solo operator lands here) and route `/internal` (plus
   `/internal/overview` as an alias). It implements `onInternalSessionEnd` by dropping every cached
   tile value, so a session end cannot leave stale operational numbers on screen.
2. **`overview/tiles.ts` — the eight PRD §32.8 tiles as data**, exported as a literal array so a
   missing tile fails a test rather than a review:
   `['CRITICAL_SOURCE_FRESHNESS','QUARANTINE_COUNT','ACTIVE_AND_CANDIDATE_CORPUS','BACKUP_LAG','QUEUE_DEPTH','CITATION_FAILURES','SPEND','INCIDENTS']`.
   Each entry declares: `title`, `source` (endpoint + the field path it reads), `owner` (the ticket id
   that owns the source), `link` (the console route), `threshold` (the PRD §42.2 row it is read
   against, or `null`) and `required: true`.
3. **Guaranteed sources (four tiles).**
   - `CRITICAL_SOURCE_FRESHNESS` ← `INTL-02` `GET /internal/v1/sources/health`: the critical-SLA breach
     count and the `FRESHNESS_LIMITED` count, with the missing-mandatory-group list surfaced as an
     error sub-state (PRD §12.1, §7, §42.2).
   - `QUARANTINE_COUNT` ← `INTL-02` `GET /internal/v1/sources/health` total open items, cross-checked
     against `INTL-04`'s active/candidate manifest `quarantine.open_count` where present; the tile
     links to `INTL-03`'s queue (sub-PRD **M6**). If the two figures disagree, the tile shows **both**
     with their sources named — it never silently picks one.
   - `ACTIVE_AND_CANDIDATE_CORPUS` ← `INTL-04` `GET /internal/v1/releases`: the active release id and
     build time, and the newest candidate with its promotable verdict (PRD §18.4, `ADM-002`).
   - `SPEND` ← `INTL-07` `GET /internal/v1/cost/summary`: month-to-date micro-AUD rendered as AUD, the
     90%/100% marks, the breaker state and the explicit *"Search remains available"* statement in
     `HARD_STOP`/`FAIL_CLOSED` (PRD §24.1, §42.2, §42.6, `OPS-003`).
   - `INCIDENTS` ← `INTL-09` `GET /internal/v1/incidents` and `GET /internal/v1/kill-switches/active`:
     open incidents by severity (SEV-1/2 first) and every active kill switch with scope and time to
     review/expiry (PRD §42.4, §42.5, `ADM-003`).
4. **Optional-probe sources (three tiles) — sub-PRD M5.** `BACKUP_LAG`, `QUEUE_DEPTH` and
   `CITATION_FAILURES` are read through `overview/optional-source.ts`:
   `probe(endpoint): Promise<'PRESENT' | 'ABSENT' | 'ERROR'>` plus a typed reader. Each tile declares
   its intended source and owner — backup lag → `RLSE-05`/`RLSE-08` (PRD §42.2 warn 10 min / critical
   15 min); queue depth → `RUNT-04`/`RUNT-08` (PRD §42.2 Quick >2 min, Deep >10 min oldest age);
   citation failures → `EVID-05` counters surfaced by `RUNT-08` (PRD §42.2 >5% rolling 20 jobs or any
   integrity mismatch). When a probe is `ABSENT` or `ERROR` the tile renders
   **`UNAVAILABLE — no source yet (owner: <ticket id>)`** with the PRD §32.8 requirement quoted, so the
   gap is visible to the operator and to Gate 2 rather than looking like a healthy zero. The build never
   depends on those endpoints existing.
5. **No fabrication, no local derivation, no stale silence.** Every tile value is a field the source
   returned. There is no default, no zero-fill, no client-side threshold arithmetic beyond comparing a
   returned value with the returned threshold, and no cache that outlives the value's own timestamp:
   each tile shows the source's `generatedAt`/`as_of` and switches to `STALE` past the configured age,
   using `INTL-01`'s `SnapshotStatePanel`. Asserted by deliverable 8's tests and by a source scan for
   numeric literals in the tile modules.
6. **Threshold breach is textual.** Where PRD §42.2 gives a threshold, the tile states the value, the
   threshold and whether it is breached in words (for example *"Backup lag 12 min — above the 10 min
   warning threshold"*), never colour alone (PRD §41.1 *"colour is never the only status signal"*).
7. **Every tile links to its owning console**, so the overview is a router for the operator's next
   action rather than a dead end: freshness → `INTL-02`, quarantine → `INTL-03`, corpus → `INTL-04`,
   spend → `INTL-07`, incidents and kill switches → `INTL-09`, and the three optional tiles link to
   their owners' consoles when those exist (otherwise the link is absent, not broken).
8. **`apps/admin/test/overview/**`** — the suite plus committed fixture responses for each source in
   three shapes (healthy, breaching, absent), so the whole screen is exercisable offline.

## Acceptance checklist (classified)

- [ ] `[machine]` **All eight PRD §32.8 tiles are present**, asserted against the literal list in
      deliverable 2 — a missing tile fails the test (PRD §32.8)
- [ ] `[machine]` With every source stubbed **healthy**, each tile renders its value together with the
      source's own timestamp; with every source **absent**, the screen renders eight explicit
      unavailable tiles and **no zeroes, dashes or blanks** (PRD §44.4 discipline; sub-PRD **D5**,
      **M5**)
- [ ] `[machine]` With every source stubbed **breaching**, each tile with a PRD §42.2 threshold states
      the value, the threshold and the breach **in text** (PRD §42.2, §41.1)
- [ ] `[machine]` **No fabrication:** a source scan finds no threshold literal, no default value and no
      derived aggregate in the tile modules; a tile whose source omits a field renders that field
      unavailable rather than substituting one (deliverable 5)
- [ ] `[machine]` The quarantine tile shows **both** figures with their sources named when
      `INTL-02`'s total and `INTL-04`'s manifest `quarantine.open_count` disagree (sub-PRD **M6**)
- [ ] `[machine]` The spend tile states that **Search remains available** in `HARD_STOP` and
      `FAIL_CLOSED`, taken from `INTL-07`'s `search_affected` field, not hard-coded
      (PRD §26, §42.2; `OPS-003`)
- [ ] `[machine]` The incidents tile lists SEV-1/SEV-2 first and shows every active kill switch with its
      scope and time to review/expiry (PRD §42.4, §42.5; `ADM-003`)
- [ ] `[machine]` Each tile links to its owning console; the three optional tiles render no broken link
      when their source is absent (deliverable 7)
- [ ] `[machine]` Stale handling: a source value older than its configured age renders `STALE` with the
      source's own timestamp, and `onInternalSessionEnd` clears every cached value (PRD §31.3;
      `INTL-01` deliverable 9)
- [ ] `[machine]` The feature registers by directory alone — adding `features/overview/` changes no
      tracked file outside it (plan **A1**; sub-PRD **D9**; `INTL-01` deliverable 9)
- [ ] `[machine]` **This ticket writes no API code:** the diff contains no file under `apps/api/**`
      (asserted in review and by the file-scope check in the PR)
- [ ] `[machine]` PRD §22 canary: no research content, PII text or credential reaches the screen or the
      browser console — asserted with canaries seeded in every stubbed source response
- [ ] `[machine]` `assertNoInternalSurfaceInCustomerArtifacts()` green after this ticket
      (PRD §8.11; sub-PRD **D7**)
- [ ] `[machine]` The screen implements the PRD §31.3 async states through `INTL-01`'s components — no
      bare spinner (PRD §31.3 *"A spinner without state or recovery guidance is not acceptable"*)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002` and `ADM-001`, and listing the three
      unavailable tiles as **known gaps** with their owners (sub-PRD **M5**)
- [ ] `[fixture]` The committed source-response fixtures under `apps/admin/test/overview/fixtures/**`
      replay end-to-end in all three shapes (healthy, breaching, absent) for each of the four guaranteed
      sources and the three optional probes — offline, no network, no production credentials
- [ ] `[human]` **`OPS-002` drill** on a locally started stack: with a degraded fixture set loaded, an
      operator confirms that source, budget and incident degradation are all visible from this one
      screen, and that no research content appears anywhere on it (PRD §30.2 `OPS-002` *"Search,
      answer, source, budget and backup degradation are observable without content logs"*; PRD §22)
- [ ] `[human]` **Gate 2 smoke:** the founder opens `/internal` after sign-in and can state, from this
      screen alone, whether the system is healthy — the PRD §32.8 solo-operator test (CLAUDE.md Gate 2)
- [ ] `[human]` Sub-PRD **M5** and **M6** are written back to `docs/prd/22-internal-admin/README.md`
      with their status before merge — either resolved, or restated with the three unavailable tiles
      named
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**); the
  `UAT-OPS-*` scripts belong to `INTL-04` and `INTL-07`
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3)

## Test plan

Reviewer steps, offline: no network, no running API, no production credentials — every source is a
stub reading a committed fixture.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/admin`. Suites under `apps/admin/test/overview/`.
3. **`tiles.test.ts`** — assert the eight-tile literal list and that every entry declares `source`,
   `owner`, `link` and `threshold`.
4. **`healthy.test.tsx`** — all seven sources stubbed healthy; assert each tile's value and its
   source-supplied timestamp; assert no numeric literal from the tile module appears in the output.
5. **`breaching.test.tsx`** — all sources stubbed breaching; assert each threshold tile states value,
   threshold and breach in text; assert SEV-1/2 incidents are listed first and active kill switches show
   scope and expiry.
6. **`absent.test.tsx`** — all sources absent (probe `ABSENT`) and, separately, erroring
   (probe `ERROR`); assert eight explicit unavailable tiles naming their owners, no zeroes, and no
   broken links.
7. **`disagreement.test.tsx`** — quarantine figures differing between `INTL-02` and `INTL-04`; assert
   both are shown with their sources named.
8. **`stale.test.tsx`** — fake clock past the configured age; assert `STALE` with the source's own
   timestamp; call `onInternalSessionEnd` and assert every cached value is cleared.
9. **`registry.test.ts`** — mount the feature through `INTL-01`'s glob registry and assert the route
   resolves with zero diff to tracked files; copy the construction pattern from
   `apps/admin/test/app/admin-shell.test.tsx` (`INTL-01`).
10. **`leak.test.tsx`** — canaries seeded in every stubbed response; assert absence from the rendered
    output and the browser console.
11. `git status --porcelain` clean after the run; confirm the diff contains no `apps/api/**` file.
12. **Reviewer focus** (CLAUDE.md): whether any tile can display a value its source did not return;
    whether an absent source can look healthy; whether a threshold is compared against a local constant;
    whether cached values survive a session end; whether the screen can render research content through
    an unexpected field; whether the three optional probes can fail the build when their endpoints do
    not exist.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A PRD §32.8 tile cannot be sourced at all** (sub-PRD **M5**: backup lag, queue depth, citation
  failures have no plan edge) → render the explicit unavailable state and record it in
  `docs/prd/22-internal-admin/README.md` **M5**. If the tile must be real for Gate 2, the writeback is a
  **plan** change: add `RUNT-08`/`RLSE-08` (or a new endpoint ticket) to this ticket's `blocked_by` in
  `docs/prd/breakdown-plan.md` §5.23 and the inverse edge in §6.2, then `--sync`. Never fabricate the
  number and never import from a module this ticket has no edge to.
- **A guaranteed source's endpoint does not expose the field this screen needs** → the fix belongs in
  the owning console (`INTL-02`, `INTL-04`, `INTL-07` or `INTL-09`), not here: two derivations of one
  operational figure will disagree. Amend that ticket in a docs PR, record it in
  `docs/prd/22-internal-admin/README.md`, `--sync`, and only then consume it.
- **The quarantine figures from `INTL-02` and `INTL-04` disagree in practice** (sub-PRD **M6**) →
  show both (deliverable 3) and record the cause in `docs/prd/22-internal-admin/README.md` **M6**. If
  the queue itself must be the source, the writeback is a plan edge `INTL-10 ← INTL-03` in
  `docs/prd/breakdown-plan.md` §5.23/§6.2.
- **The overview needs an action (promote, activate a switch, resolve an item)** → dangerous actions
  belong to the owning console, where `withDangerousAction` and its typed confirmation live
  (sub-PRD **D6**). Link, do not act. Adding an action here would create a second authorisation path for
  the same effect.
- **A tile needs polling more frequent than the source's own generation** → that is a source-side
  question (`INTL-02`'s snapshot cadence, `RLSE-08`'s checks). Record it in
  `docs/prd/22-internal-admin/README.md`; never cache a value beyond its own timestamp to make the
  screen feel live.

**3. Escalation.** `OPS-002` (*"Search, answer, source, budget and backup degradation are observable
without content logs"*) and PRD §32.8's single-overview requirement are release commitments. If the
eight tiles cannot be shown on one screen, or a tile can only be filled by computing it here, that
overturns a decision spanning this module, `03-app-runtime` and `18-ops-release`: stop, escalate for
re-review, and never ship a tile whose number the console invented. **A screen that would have to
present an unavailable datum as a healthy value to look complete overturns PRD §44.4's prohibition on
silent omission** — escalate, never implement the shortcut.
