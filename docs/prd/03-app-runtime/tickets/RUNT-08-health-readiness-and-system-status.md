---
id: RUNT-08
title: "Health, readiness and /v1/system-status"
module: 03-app-runtime
lane: 03-app-runtime
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-01, RUNT-07]
blocks: [RLSE-08]
---

# RUNT-08 — Health, readiness and `/v1/system-status`

Implements PRD §42.1 (health and readiness) and §22 (observability), carrying requirement `OPS-002`
("Search, answer, source, budget and backup degradation are observable without content logs"). **No
ADR — the decision is already made in PRD §42.1; this is build ticket 8 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RUNT-01`](RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md) and
[`RUNT-07`](RUNT-07-packages-observability-bounded-logs-and-metrics.md).
**Why `builder`:** a bounded change inside one module's declared file-scope implementing three
endpoints PRD §42.1 already tabulates row by row — not a new subsystem decision.

## Background + basis

**PRD §42.1 gives the three endpoints and their exact success meanings:**

| Endpoint/check | Public? | Success means |
|---|---:|---|
| `/health/live` | Tunnel-restricted probe | App event loop/process alive only |
| `/health/ready` | Tunnel-restricted probe | App DB writable, active corpus compatible, search responds, critical migrations complete |
| `/v1/system-status` | Yes, low detail | General product/search/generation/freshness/monitor status without topology |
| Authenticated synthetic Search | No | Login/tenant/API/search/current release work end-to-end |
| Budgeted synthetic Answer | No | PII/job/search/model/validator/commit work; strict daily spend cap |

and the degradation rules:

> **Readiness fails during incompatible app/corpus/schema state.** Provider outage does not make Search
> unready; it marks generation degraded. A source-specific outage does not take the app down; it
> changes source freshness/status and affected answer behaviour.

**`/v1/system-status` is a public API endpoint.** PRD §16.2 lists `GET /v1/system-status` under
"Export, usage, audit and issues". PRD §16.1 applies in full: base path `/v1`, "Every response includes
`request_id`", uniform error shape. The shell consumes it: PRD §31.1 requires the web shell to "always
display the active organisation, environment (`PRODUCTION` or `SANDBOX`), current CorpusRelease
date/status, and a degraded service badge when freshness, generation or monitoring is limited".

**"Without topology" is a security constraint, not a style note.** PRD §21.1 treats trust boundaries
explicitly and PRD §39.4 states "Search exposes no public port". A public status endpoint must not leak
host names, ports, process names, file paths, versions of internal components or the health of
individual dependencies.

**Degradation must remain observable without content.** PRD §22: "Metrics cover server/disk/memory,
backup lag, app/auth/PII, job queues, search latency/zero-results/release, source freshness/quarantine/
citation/evaluation and provider/tenant cost", and "External checks cover liveness, readiness,
authenticated synthetic Search and strictly budgeted synthetic Answer." PRD §42.2's first row —
"Origin/app/search unavailable | 2 consecutive 1-minute failures | Immediate" — is what `RLSE-08`
(`18-ops-release`) builds on top of these endpoints; `RUNT-08 --> RLSE-08` is this ticket's only
outgoing edge (breakdown-plan §6.2).

**Kill switches change the reported status.** PRD §42.5: a model-profile/provider switch means "New
affected generation returns unavailable" while Search continues; a global generation switch means
"Search/records/source reading continue". `ADM-003` ("Scoped kill switches stop only the named
capability/tenant/source") is owned by `22-internal-admin` (`INTL-09`); this endpoint **reports** the
resulting capability state through a provider interface, and decides nothing.

**Why the readiness checks are a registry, not direct imports.** breakdown-plan §5.4 gives this ticket
`blocked_by: [RUNT-01, RUNT-07]` — **not** `DATA-*` or `RETR-*`. Inventing those edges would change the
DAG (`dag-scan.mjs` reads `blocked_by` verbatim). The four PRD §42.1 readiness conditions are therefore
declared as **named checks with provider interfaces**, resolved from the app container at boot;
whichever module owns a dependency binds its provider. Recorded as decision **D6** in
[`../README.md` §4](../README.md#4-decisions):

> Readiness is a **registry of named checks**. Checks whose provider package is not yet wired report
> `FAILED` under the `production` config profile and `SKIPPED` under `development`.

The `production` default is fail-closed, matching PRD §42.1 ("Readiness fails during incompatible
app/corpus/schema state") and PRD §39.6 ("Production startup validates the complete schema and refuses
unknown critical keys").

**Accepted caveats carried forward, documented not enforced here:**

- **The synthetic Search and synthetic Answer checks are external**, not endpoints. PRD §42.1 marks
  both "Public? No" and PRD §22 lists them under "External checks". They are `RLSE-08`
  (`18-ops-release`), which is `blocked_by` this ticket. This ticket exposes nothing that would let an
  unauthenticated caller trigger a budgeted model call.
- **Tunnel restriction is enforced at the edge.** PRD §39.2: "Cloudflare Tunnel is the only public
  route to the app"; PRD §39.4 maps the tunnel to `127.0.0.1:3000`. The `infra/cloudflare/**` rule is
  `RLSE-03` (`18-ops-release`). This ticket marks the two `/health/*` areas with the `probe` admission
  profile `RUNT-02` defines and does not implement network policy.

## Goal

Produce two route areas — `apps/api/src/routes/health/**` and `apps/api/src/routes/system-status/**` —
registered purely by the `RUNT-01` directory-autoload contract, exposing `/health/live`,
`/health/ready` and `GET /v1/system-status` with exactly the PRD §42.1 semantics. Completion is
mechanically checkable: `/health/live` answers `200` while every dependency is failing;
`/health/ready` returns `503` when any of the four PRD §42.1 conditions fails or is unresolved under
the `production` profile; a simulated provider outage leaves readiness `200` and flips
`/v1/system-status`'s generation field to degraded; and a response-shape test proves
`/v1/system-status` carries no host, port, path, process name, internal version or per-dependency
health.

## Non-goals

- **No alert thresholds, status page, external checks or synthetic probes.**
  `infra/deploy/monitoring/**` is `18-ops-release` (`RLSE-08`), which is `blocked_by` this ticket.
- **No logger or metric implementation.** `packages/observability` is `RUNT-07`; this ticket consumes it.
- **No kill-switch decisions or internal incident routes.** `apps/api/src/routes/internal/**` and
  `ADM-003` are `22-internal-admin` (`INTL-09`). This endpoint reads a capability state through a
  provider interface.
- **No database, corpus or search implementation.** `packages/database` is `01-app-data`;
  `services/search-rs` and `packages/retrieval-client` are `11-retrieval-engine`; corpus compatibility
  is `04-corpus-contract` (`CRPS-02`). This ticket ships **check declarations plus provider
  interfaces**, not the probes' internals.
- **No admission chain.** `RUNT-02` owns `apps/api/src/{plugins,middleware}/**`; this ticket only
  declares each area's `admission` profile (`probe` for `health`, `public` for `system-status`).
- **No web shell rendering.** `RUNT-05` consumes this endpoint via the generated
  `packages/contracts` type; the two tickets share no file and no edge (decision **D10**).
- **No product route areas.** Everything else under `apps/api/src/routes/**` belongs to `13`, `14`,
  `15`, `16`, `17`, `19`, `20` or `22` (breakdown-plan §4).

## File-scope (write-owns)

- `apps/api/src/routes/health/**`
- `apps/api/src/routes/system-status/**`
- `apps/api/test/routes/health/**`, `apps/api/test/routes/system-status/**` — this ticket's own
  unit/integration tests (breakdown-plan §1.1).

Does not touch:

- `apps/api/src/{server.ts,app.ts,bootstrap,errors}/**` — `RUNT-01`. These two areas register through
  the A1 autoload contract, so **no** `RUNT-01` file changes; that is the property acceptance item 1
  asserts.
- `apps/api/src/{plugins,middleware}/**` — `RUNT-02`. `apps/api/src/sse/**` — `RUNT-03`.
- Every other `apps/api/src/routes/**` area — the product modules.
- `packages/observability/**` — `RUNT-07`. `packages/database/**` — `01-app-data`.
  `packages/retrieval-client/**` — `11-retrieval-engine`. `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`, serial-owned.
- `apps/worker/**`, `apps/web/**`, `packages/ui/**` — `RUNT-04`, `RUNT-05`, `RUNT-06` and the product
  modules.
- `infra/**` — `RUNT-09` (compose) and `18-ops-release` (deploy, monitoring, cloudflare).
- `tests/**` — `23-assurance`. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written these two directories and nothing contends for
them. breakdown-plan §4 gives `apps/api/src/routes/{health,system-status}/**` to `03-app-runtime`
explicitly and §5.4 gives both wholly to this ticket; every other route area under
`apps/api/src/routes/` is named to a different module, so the sibling directories are disjoint by
construction. Within this module, `RUNT-01` (`bootstrap`, `errors`), `RUNT-02` (`plugins`,
`middleware`) and `RUNT-03` (`sse`) are sibling directories this ticket never writes; `RUNT-04`–
`RUNT-07` and `RUNT-09` are different trees. This ticket runs in wave 2 alongside `RUNT-02`, `RUNT-03`
and `RUNT-09` as concurrent lanes (breakdown-plan §7).

## Deliverables

1. **`apps/api/src/routes/health/index.ts`** — a conforming route area per the `RUNT-01` A1 contract,
   exporting `export const area = { prefix: '/health', admission: 'probe' } satisfies RouteAreaConfig`
   and a default Fastify plugin registering `GET /live` and `GET /ready`. The explicit prefix is what
   keeps these two outside `/v1`, per PRD §42.1.
2. **`GET /health/live`** — returns `200` iff the process event loop is running. It performs **no**
   dependency call, holds no lock and allocates no significant memory, so it stays `200` while every
   dependency is down (PRD §42.1 "App event loop/process alive only"). Body is a fixed minimal shape.
3. **`apps/api/src/routes/health/checks.ts`** — the readiness registry.
   `export interface ReadinessCheck { id: ReadinessCheckId; run(): Promise<ReadinessResult> }` and
   `export type ReadinessCheckId = 'app_db_writable' | 'active_corpus_compatible' | 'search_responds'
   | 'critical_migrations_complete'` — exactly the four PRD §42.1 conditions and no others.
   `export function registerReadinessCheck(check: ReadinessCheck): void`. Resolution policy per
   decision **D6**: an id with no registered provider yields `FAILED` under
   `config.profile === 'production'` and `SKIPPED` under `development`/`test`. The policy is a single
   exported function so it is directly testable.
4. **`GET /health/ready`** — runs all four checks with a per-check timeout from config, returns `200`
   only when every check is `PASSED` (or `SKIPPED` under a non-production profile), and `503` otherwise.
   The body lists check ids and their outcome codes — **ids and codes only**, never a host, port, path,
   driver message or exception text (PRD §22; PRD §42.1 "Tunnel-restricted probe"). A provider outage
   is **not** one of the four checks, so it cannot make readiness fail (PRD §42.1 "Provider outage does
   not make Search unready").
5. **`apps/api/src/routes/system-status/index.ts`** — a conforming route area exporting
   `export const area = { admission: 'public' } satisfies RouteAreaConfig`, so it mounts at
   `/v1/system-status` by the A1 default derivation (PRD §16.2).
6. **`GET /v1/system-status` response** — shaped by the generated `packages/contracts` type
   (`FND-04`); this ticket writes no schema. The five PRD §42.1 dimensions, each as a bounded enum
   plus a plain-language label: `product`, `search`, `generation`, `freshness`, `monitor`. Plus the
   fields PRD §31.1 requires the shell to display: `environment` (`PRODUCTION` | `SANDBOX`) and the
   active `corpus_release` `{ id, date, status }`. Plus `request_id` and `schema_version` per PRD
   §16.1/§34.1. **Nothing else.**
7. **`apps/api/src/routes/system-status/providers.ts`** — the status sources as interfaces, mirroring
   the readiness registry: `SearchStatusProvider`, `GenerationStatusProvider`,
   `FreshnessStatusProvider`, `MonitorStatusProvider`, `CorpusReleaseProvider`, `KillSwitchProvider`.
   An unresolved provider reports `UNKNOWN` and degrades `product` — it never reports healthy
   (fail-visible). `11-retrieval-engine`, `12-evidence-safety`, `05-ingestion-framework`,
   `16-monitor-alerts`, `04-corpus-contract` and `22-internal-admin` bind the real providers.
8. **Degradation mapping** — a single pure function
   `deriveProductStatus(inputs): 'OPERATIONAL' | 'DEGRADED' | 'MAINTENANCE'` implementing PRD §42.1
   and §42.5: a provider outage degrades `generation` only; a source-specific outage degrades
   `freshness` only; a global generation kill switch degrades `generation` while `search` stays
   operational; an incompatible corpus state sets `product` to `MAINTENANCE`. Pure and directly
   table-testable.
9. **Topology suppression** — a response-shaping guard that rejects, at serialisation, any field
   outside the declared response type, and a test asserting the serialised body contains no host name,
   IP, port, filesystem path, process name, dependency version or per-dependency health (PRD §42.1
   "without topology"; PRD §39.4 "Search exposes no public port").
10. **Observability wiring** — every readiness failure and status transition is recorded through
    `packages/observability` (`RUNT-07`) using its allowlisted fields only, and the readiness/status
    outcomes are published as metrics in the PRD §22 families `RUNT-07` declares so `RLSE-08` can alert
    on them (PRD §42.2 row 1: "Origin/app/search unavailable | 2 consecutive 1-minute failures").
11. **Caching and cost** — `/v1/system-status` is public and unauthenticated, so its computation is
    cached for a configurable short interval and never triggers a model call, a search query against
    the corpus or an unbounded database scan (PRD §24.1 founder-funded budget; PRD §42.1 marks the
    budgeted synthetic Answer as a **separate**, non-public check).

## Acceptance checklist (classified)

- [ ] `[machine]` Both areas register through the `RUNT-01` autoload contract with **zero** diff to any
      file outside `apps/api/src/routes/{health,system-status}/**` — asserted by running
      `apps/api/test/route-area-conformance.ts` against the real tree and by `git status --porcelain`
      (A1; breakdown-plan §2.1)
- [ ] `[machine]` `/health/live` returns `200` while the app database, search and corpus providers all
      fail, and performs no dependency call (asserted with providers that throw if invoked)
      (PRD §42.1 "App event loop/process alive only")
- [ ] `[machine]` `/health/ready` returns `200` only when all four PRD §42.1 checks pass, and `503`
      when any one fails — a table-driven test over all sixteen pass/fail combinations
      (PRD §42.1; `OPS-002`)
- [ ] `[machine]` An unregistered readiness check yields `FAILED` under `profile: 'production'` (so
      `/health/ready` is `503`) and `SKIPPED` under `development` (so it is `200`) — decision D6
      (PRD §42.1, §39.6)
- [ ] `[machine]` An incompatible app/corpus/schema state makes `/health/ready` fail and sets
      `/v1/system-status.product` to `MAINTENANCE` (PRD §42.1 "Readiness fails during incompatible
      app/corpus/schema state"; `CORPUS_INCOMPATIBLE`, PRD §34.9)
- [ ] `[machine]` A simulated provider outage leaves `/health/ready` at `200` and sets
      `system-status.generation` to degraded while `search` stays operational (PRD §42.1 "Provider
      outage does not make Search unready; it marks generation degraded")
- [ ] `[machine]` A source-specific outage changes `freshness` only and does not affect `product`
      availability or `/health/ready` (PRD §42.1 "A source-specific outage does not take the app down")
- [ ] `[machine]` A global-generation kill switch degrades `generation` while `search` stays
      operational (PRD §42.5 "Global generation | Search/records/source reading continue")
- [ ] `[machine]` `/v1/system-status` contains no host name, IP, port, filesystem path, process name,
      internal component version or per-dependency health — asserted by seeding each provider with a
      `topology-canary-<uuid>` value in every diagnostic field and requiring its absence from the
      serialised body (PRD §42.1 "without topology"; PRD §39.4)
- [ ] `[machine]` `/v1/system-status` includes `request_id`, `schema_version`, `environment`
      (`PRODUCTION`/`SANDBOX`) and the active `corpus_release` `{ id, date, status }` the PRD §31.1
      shell requires (PRD §16.1, §34.1, §31.1)
- [ ] `[machine]` `/v1/system-status` triggers no model call, no corpus search and no unbounded scan,
      and is served from a bounded cache — asserted with providers that fail the test if called more
      often than the cache interval allows (PRD §24.1, §42.1)
- [ ] `[machine]` An unresolved status provider reports `UNKNOWN` and degrades `product`; it never
      reports healthy (fail-visible)
- [ ] `[machine]` Readiness failures and status transitions are recorded through
      `packages/observability` with allowlisted fields only; a canary placed in a provider's error
      message never reaches a log line — reuse `packages/observability/test/canary.ts` (`RUNT-07`;
      PRD §22)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — the response is shaped by the
      generated `packages/contracts` type and no binding is hand-edited (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002` and the API-compatibility impact of
      the `/v1/system-status` response
- [ ] `[human]` Operator review of `/v1/system-status` in a browser confirming it is comprehensible to
      a customer, discloses no topology, and matches what the PRD §31.1 shell badges show (PRD §42.1,
      §43.4)
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data
      (breakdown-plan §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and §14/§43 evaluation replays)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python touched (PRD §45.3)

## Test plan

Reviewer steps, offline, no network and no provider:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/api`. Suites live under `apps/api/test/routes/{health,system-status}/`.
3. Harness for every suite: `buildApp()` from `RUNT-01` with Fastify `inject()`; all readiness checks
   and status providers are stubs registered through the exported registries, so nothing external is
   contacted. Reuse `apps/api/test/route-area-conformance.ts` (`RUNT-01`) for the registration test and
   `packages/observability/test/canary.ts` (`RUNT-07`) for the log-leak test.
4. **`autoload.test.ts`** — boot the real tree; assert `/health/live`, `/health/ready` and
   `/v1/system-status` all answer; then `git status --porcelain` must be clean.
5. **`live.test.ts`** — register readiness checks and status providers that throw on invocation; assert
   `/health/live` is `200` and none of them was called.
6. **`ready.test.ts`** — table-driven over all sixteen pass/fail combinations of the four PRD §42.1
   checks. Then unregister a check and assert `503` under `profile: 'production'` and `200` under
   `development`. Then assert the `503` body contains only check ids and outcome codes by seeding each
   stub's failure message with a `topology-canary-<uuid>` and requiring its absence.
7. **`degradation.test.ts`** — table-driven over `deriveProductStatus`: provider outage; source-specific
   outage; global generation kill switch; incompatible corpus. Assert the exact five-dimension output
   for each, and that `search` stays operational in the first and third.
8. **`shape.test.ts`** — seed every provider with a `topology-canary-<uuid>` in every diagnostic field;
   serialise `/v1/system-status`; assert the canary is absent and that the body's key set exactly
   equals the declared response type's key set (no extra key).
9. **`cost.test.ts`** — call `/v1/system-status` 20 times within the cache interval with counting
   providers; assert the provider call count respects the interval and that no model or corpus-search
   stub was invoked at all.
10. **`observability.test.ts`** — force a readiness failure whose stub error message contains a canary;
    capture the emitted log bytes with the in-memory sink from `RUNT-07` and assert the canary is absent
    while the check id and outcome code are present.
11. The `[human]` row is run against a locally started stack (`pnpm stack:up`, `RUNT-09`) and recorded
    in the PR.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A readiness check cannot be implemented without importing a package this ticket has no
  `blocked_by` edge to** (`packages/database`, `packages/retrieval-client`, the corpus manifest
  verifier) → do **not** add the import and do not invent the edge. The provider interface in
  Deliverable 3 exists precisely for this. If a real provider must ship with this ticket, the edge is a
  **plan** change: write `docs/prd/breakdown-plan.md` §5.4 and §6.2 first, then `--sync` this ticket.
  A `blocked_by` added to an already-started ticket cannot be honoured mid-run (CLAUDE.md).
- **The `SKIPPED`-under-development default (D6) proves unsafe** (a developer ships with an unresolved
  check and does not notice) → amend `docs/prd/03-app-runtime/README.md` §4 D6 and this ticket's
  Deliverable 3 together in one docs PR, `--sync`, then change code. The `production` default is
  fail-closed and must not be relaxed in either direction silently.
- **`/v1/system-status` needs a field PRD §42.1's five dimensions do not cover** (for example a
  per-jurisdiction freshness breakdown the PRD §31.1 shell wants) → the response is part of the
  **OpenAPI root**, serial-owned by `FND-04` (breakdown-plan §4.1). Raise a `00-foundation` ticket, add
  the dependency in `docs/prd/breakdown-plan.md` §5.4/§6.2, and notify `RUNT-05`, which renders the
  badges. Do not write `schemas/openapi/**`, and do not add an undeclared field — the shaping guard
  will reject it.
- **A status dimension can only be derived from data that would disclose topology** → PRD §42.1's
  "without topology" is a security constraint. Reduce the dimension to a bounded enum rather than
  widening the response; if that is impossible, record it in `docs/prd/03-app-runtime/README.md` §6
  with the Founder as owner and state it in the PR's security-impact line (PRD §45.4).
- **`RLSE-08` needs a machine-readable endpoint this ticket does not provide** (a metrics scrape target)
  → that is open question **QR3**, owned by `RUNT-07`. Raise it against `RUNT-07` and
  `docs/prd/03-app-runtime/README.md` §6; do not add a metrics endpoint to these two route areas.
- **The tunnel restriction on `/health/*` cannot be enforced by the `probe` admission profile** →
  that is `RUNT-02`'s contract and `RLSE-03`'s edge rule. Raise it against `RUNT-02` (a docs change,
  then `--sync`) and note the `18-ops-release` dependency in
  `docs/prd/03-app-runtime/README.md` §6. Do not implement network policy here.

**3. Escalation.** "Readiness fails during incompatible app/corpus/schema state" and "Provider outage
does not make Search unready" (PRD §42.1) are release requirements behind `OPS-002`, and `RLSE-08`'s
controlled failure drills are built directly on them. If the decided health/readiness protocol is
outright falsified, escalate for re-review before any code lands. Never weaken a readiness condition
inside this ticket.
