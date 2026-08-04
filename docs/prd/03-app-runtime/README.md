# 03-app-runtime — sub-PRD

> Module sub-PRD, authored from `docs/prd/breakdown-plan.md` §5.4. The **ticket files under
> `tickets/` are the executable source of truth**; this README is the module-level frame around
> them. On any disagreement between a ticket and this README, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `03-app-runtime` |
| Ticket prefix | `RUNT` |
| Lane | `03-app-runtime` |
| Tickets | 9 (`RUNT-01` … `RUNT-09`) |
| Agent | `builder` (all 9 — breakdown-plan §1.1) |
| Depends on modules | `00-foundation`, `01-app-data`, `02-auth-core` |
| PRD epics | E06 (runtime/deploy), E30 (observability) |
| Owned requirement IDs | `SEC-001`, `OPS-002`, `ANS-003` |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Decomposition plan | [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §2.1, §4, §5.4, §6.2, §7 |
| Version | v0.2 — 2026-08-03 |

---

## 1. Problem

PRD §39.1 fixes three separately supervised runtime processes — `app` (Fastify API + auth + SSE),
`worker` (job runner) and the Cloudflare-served web bundle — plus a Rust `search` process owned
elsewhere. PRD §18.1 requires "a modular monolith in one repository and one versioned application
release with separately supervised runtime processes". Fourteen product surfaces (PRD §5) and the
whole `/v1` API (PRD §16.2) have to live inside those processes.

Nothing in the repository currently boots. There is no HTTP server, no worker lease loop, no web
shell, no shared component library, no logging package and no local environment. Every product
module in the plan (`13` … `22`) is `blocked_by` a `RUNT-*` ticket precisely because it has nowhere
to attach a route, a job handler or a screen.

The second, sharper problem is **contention**. If the three shells register their surfaces through a
central manifest, then all fourteen product modules write one file and the plan's vertical cut
collapses into a single serial lane (breakdown-plan §2 principle 2, §9 risk R1). This module
therefore does not just "build the shells" — it builds the *registration contracts* that let every
downstream module add a route, a handler or a screen **without editing any file this module owns**.

## 2. Scope

The three process **shells**, the two shared runtime packages, and the local environment:

1. **`apps/api` shell** — bootstrap, configuration validation, directory-autoloaded route areas,
   uniform errors, `request_id`, the admission middleware chain, the SSE transport, and the two
   operational route areas (`health`, `system-status`) that no product module owns.
2. **`apps/worker` shell** — process entry, the five PRD §39.5 queue classes, lease loops,
   fairness/yielding, stage checkpoints, directory-autoloaded job handlers, and the runtime's own
   housekeeping handlers.
3. **`apps/web` shell** — Vite app, global authenticated shell (PRD §31.1), organisation switcher,
   environment/release/degraded badges, client routing and the Home surface.
4. **`packages/ui`** — accessible primitives, the ten PRD §31.3 async states, and the shared
   evidence/source panel (breakdown-plan A6).
5. **`packages/observability`** — bounded correlated JSON logs and the PRD §22 metric families.
6. **`infra/compose/**`** — the local/CI environment (breakdown-plan A7).

## 3. Non-goals

Each exclusion names the owning module, per breakdown-plan §4.

| Excluded | Owner |
|---|---|
| Every product **route area** — `routes/{auth,invitations,members,mfa,sso,service-accounts,widget-sessions}` | `13-identity-surface` |
| `routes/{search,documents,document-versions,nodes,node-versions}` | `14-search-product` |
| `routes/{answers,answer-jobs,answer-snapshots,coverage-assessments,comparisons}` | `15-answer-product` |
| `routes/{watchlists,alerts,webhook-subscriptions}` | `16-monitor-alerts` |
| `routes/{research-records,research-turns,record-answers,review-actions,comments,issues,corrections}` | `17-records-collab` |
| `routes/exports` | `19-exports` |
| `routes/{sandbox,usage,audit-events}` | `20-developer-platform` |
| `routes/internal/**` and `apps/admin/**` | `22-internal-admin` |
| Every product **worker handler** — `handlers/{answer,deep,coverage,comparison}` | `15-answer-product` |
| `handlers/{change-matching,alerts,notifications}` | `16-monitor-alerts` |
| `handlers/{rerun,correction}` | `17-records-collab` |
| `handlers/export` | `19-exports` |
| Every product **web feature** — `features/{auth,settings}` | `13-identity-surface` |
| `features/{search,sources}` | `14-search-product` |
| `features/{ask,answers,coverage,compare}` | `15-answer-product` |
| `features/monitor` | `16-monitor-alerts` |
| `features/records` | `17-records-collab` |
| `features/exports` | `19-exports` |
| `features/{developer,usage}` | `20-developer-platform` |
| `features/legal`, `apps/web/public-site/**` | `24-launch` |
| App tables, migrations, tenant repositories, encryption, job/outbox tables, `packages/jobs` | `01-app-data` (breakdown-plan A3; PRD §45.2 forbids other modules to own them) |
| Better Auth, sessions, MFA, SSO, machine credentials, widget tokens | `02-auth-core` |
| Canonical enums, opaque IDs, OpenAPI root, generated bindings, event schemas, `packages/domain` | `00-foundation` |
| PII detection, evidence packs, deterministic citation validation, model gateway | `12-evidence-safety` |
| Retrieval, `services/search-rs`, `packages/retrieval-client` | `11-retrieval-engine` |
| **Production** deployment: systemd units, release archive, Cloudflare, AWS, backup, recovery, runbooks | `18-ops-release` (breakdown-plan A7) |
| Cross-boundary suites `tests/{integration,tenant-isolation,security,e2e}` | `23-assurance` |
| Root manifests, lockfiles, root `package.json` scripts, `.github/workflows/**` | `00-foundation` (`FND-01`, `FND-02`) |

Standing reasons (not owner-based):

- **No business rules in the shells.** PRD §45.2: `apps/api` owns "HTTP auth/admission/DTO
  mapping/SSE" and must **not** own "Duplicated business rules"; `apps/worker` owns "Lease loops and
  application-service orchestration" and must not own "Direct unscoped tenant SQL". Any rule that
  looks like a legal, answer, records or monitor decision belongs in `packages/domain`
  (`00-foundation`) or the owning product module. This is breakdown-plan risk **R5**.
- **No production hardening in Compose.** PRD §39.2: "Docker Compose remains a local/CI convenience,
  not a production dependency."

## 4. Decisions

| # | Decision | Basis |
|---|---|---|
| D1 | `apps/api` route areas, `apps/worker` job handlers and `apps/web` features register by **directory convention**. No file in this module is edited when a product module adds a surface. | breakdown-plan **A1** (ADR candidate, recorded by `RUNT-01`/`RUNT-04`/`RUNT-05`); PRD §20.1, §39.1 |
| D2 | Each of the three boundaries gets its **own** registration contract and its own ADR file, rather than one shared ADR. `RUNT-01`, `RUNT-04` and `RUNT-05` are all wave-1 and would otherwise contend for one `docs/adr/` file. | breakdown-plan **A9** (ADR ownership is per file, claimed by the creating ticket) |
| D3 | The shared **evidence/source panel and the ten async-state components live in `packages/ui`**, not in any product feature. | breakdown-plan **A6**; PRD §13.1, §31.3, §32.1, §32.3, §32.4, §41.1 |
| D4 | Local Compose is **development/CI only** and is a different artifact from the production deployment configuration PRD §44.3 calls serial-owned. | breakdown-plan **A7**; PRD §39.2 |
| D5 | The admission chain is a fixed, named, ordered slot list — authenticate → resolve organisation → membership/service account → permission → rate/quota → PII → schema → legal scope → budget → idempotency — with slots whose implementation lives in another module (PII, budget arithmetic) declared as **fail-closed extension points**. | PRD §16.5 (order), §18.5 step 1 (full list), §37.2 ("only then create logs, persistence, jobs or provider calls") |
| D6 | Readiness is a **registry of named checks**. Checks whose provider package is not yet wired report `FAILED` under the `production` config profile and `SKIPPED` under `development`. | PRD §42.1 ("Readiness fails during incompatible app/corpus/schema state"), §39.6 ("Production startup validates the complete schema and refuses unknown critical keys") |
| D7 | SSE is a **transport plugin plus a replay reader**, mounted by the route area that owns the endpoint (`ASK-01`, `15-answer-product`). This module never owns `/v1/answer-jobs/*`. | breakdown-plan §4 (route allocation); PRD §16.2, §34.4 |
| D8 | The `maintenance` queue class is a **routing label** defined by `RUNT-04`; the product maintenance handlers named in PRD §39.5 (impact matching, usage reconciliation) live in their owning modules. `apps/worker/src/handlers/maintenance/**` holds only the runtime's own housekeeping jobs. | PRD §39.5; breakdown-plan §4, risk R5 |
| D9 | The app manifests (`apps/{api,worker,web}/package.json`, `tsconfig.json`) already exist as empty workspace-member skeletons created by `FND-01`; this module **extends** them append-only. | breakdown-plan §1.1 "Package manifests" |
| D10 | `RUNT-05` codes the shell's status badges against the **generated `GET /v1/system-status` type** from `packages/contracts` (`FND-04`) plus a committed fixture, not against `RUNT-08`'s implementation — which is why the plan gives `RUNT-05` no edge to `RUNT-08`. | breakdown-plan §5.4/§6.2 (`RUNT-05` `blocked_by` `FND-04` only); PRD §16.2, §34.1 |
| D11 | **Toolchain versions are fixed:** Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6` — Node 24 LTS, not Node 26. `FND-01` holds the pins and stays their single source; no ticket in this module declares a version of its own, and a local run executes the same versions CI does. `RUNT-09`'s Compose images and tooling must match them, and no ticket may substitute a nearer version if one proves awkward — the evidence goes back to `FND-01` and the register first. | breakdown-plan §8 **Q12** (confirmed; owner `00-foundation`, resolving ticket `FND-01`); PRD §45.3, §18.2 |
| D12 | **The SQLite access layer is Kysely-style repositories and query construction over `better-sqlite3`; Drizzle is not used.** Raw `.sql` files stay the only migration authoring format, and the project's own forward-only expand/contract runner owns migration ordering, checksums, locking and recovery points — Kysely owns typed application queries and repositories only, never migrations. This module **consumes** the decision and does not restate `01-app-data`'s internals: `RUNT-02`, `RUNT-03` and `RUNT-04` reach data only through `packages/database`'s exported tenant-scoped repositories, and no file under `apps/**` holds a Kysely instance, builds a query or opens a SQLite connection. | breakdown-plan §8 **Q13** (confirmed architecture decision; owner `01-app-data`, resolving ticket `DATA-01`, which carries the ADR decision input; `DATA-02` forbids `kysely` imports outside `packages/database`); PRD §18.2, §45.5 |

## 5. Rejected alternatives

| Rejected | Why |
|---|---|
| **One module per app** (a horizontal cut: all of `apps/api` in one module) | breakdown-plan §2 principle 2: it "would funnel all fourteen PRD §5 surfaces through one write-set and produce one huge serial lane". |
| **A central route/handler/feature manifest** (`routes/index.ts`) | Every product module would write one file. breakdown-plan §9 R1 treats this as a decomposition failure with a defined escalation, not a design option. |
| **Duplicating the evidence/source panel** into `14-search-product`, `15-answer-product` and `17-records-collab` | breakdown-plan §4.2: three copies of PRD §32.1/§32.3/§32.4, and modules `14` and `15` would import each other. |
| **One combined "app shells" ticket** | breakdown-plan §7 requires no module to be fully serial. The 9-ticket cut yields 2 waves × 5 peak lanes; a single ticket yields 1 lane and hides the A1 contract inside an unreviewable diff. |
| **Owning production deployment configuration here**, since PRD §44.3 names "production Compose/deployment configuration" | breakdown-plan **A7**: PRD §39.2 settles it — production is systemd + immutable release archive (`18-ops-release`), Compose is local/CI. |
| **Putting PII/budget/permission arithmetic inside the middleware** | PRD §45.2 forbids duplicated business rules in `apps/api`; the rules live in `packages/domain` (`FND-06`, `FND-09`) and `packages/pii` (`12-evidence-safety`). The middleware calls them. |
| **Letting the readiness endpoint import `packages/database` directly** | `RUNT-08` has no `blocked_by` edge to `01-app-data` (breakdown-plan §5.4). Inventing that edge to make the code simpler would change the DAG; D6's check registry keeps the declared edges intact. |

## 6. Open questions

Five module-local questions. None blocks wave B or Gate 1, and each has a named owner.

The two breakdown-plan §8 register entries this section used to track — **Q12** (exact toolchain
versions) and **Q13** (SQLite access layer) — are **confirmed decisions** and are recorded in §4 as
**D11** and **D12**. They are fixed inputs to this module, not questions in it, and no ticket here
re-opens them.

| # | Question | Owner | Resolved by | Affects | Basis |
|---|---|---|---|---|---|
| QR1 | Autoload mechanism for `apps/api` — Fastify autoload plugin vs a hand-rolled loader — and whether it survives the single immutable bundled release archive (`RLSE-01`) | `03-app-runtime` (`RUNT-01`); **ADR candidate** | `RUNT-01` (creates the A1 ADR) | If no directory-convention mechanism survives bundling, this is breakdown-plan risk **R1** and escalates to the plan, not to a local fix | breakdown-plan A1/R1; PRD §20.3 ("CI builds one immutable app artifact"), §45.5 |
| QR2 | Client routing and data-fetching libraries for `apps/web` — PRD §18.2 names only "React + Vite, TypeScript" | `03-app-runtime` (`RUNT-05`); **ADR candidate** | `RUNT-05` (records it in the A1-web ADR) | All `apps/web/src/features/**` in modules 13–20, 24 | PRD §18.2, §45.5 |
| QR3 | Metrics exposition protocol/endpoint — PRD §22 names the metric families, PRD §42.1 names no metrics endpoint | `03-app-runtime` (`RUNT-07`) with `18-ops-release` (`RLSE-08`) as consumer | `RUNT-07`; confirmed by `RLSE-08` | Alerting wiring only | PRD §22, §42.2, §45.5 |
| QR4 | Where a `maintenance`-class handler lives for a product module with **no** allocated `apps/worker/src/handlers/*` directory (PRD §39.5 names "usage reconciliation"; breakdown-plan §4 allocates no worker directory to `20-developer-platform`) | this decomposition — `docs/prd/breakdown-plan.md` §4 | first ticket that needs it (`PLTF-09` or a new `01-app-data` ticket) | Writeback target is the **plan**, not `RUNT-04`'s tree | PRD §39.5; breakdown-plan §4 |
| QR5 | Whether the root `pnpm stack:up` / `pnpm stack:down` scripts created by `FND-01` (PRD §45.3) delegate into `infra/compose/**` with the entry point `RUNT-09` provides | `00-foundation` (`FND-01`) | `FND-01`; verified by `RUNT-09` | `RUNT-09` may not write the root `package.json` — it raises a `00-foundation` ticket instead | PRD §45.3; breakdown-plan §1.1, §4 |

## 7. Work breakdown

`lane` = `03-app-runtime` and `agent` = `builder` for all nine (breakdown-plan §1.1).

| Ticket | Size | Lane | File-scope (write-owns) | Depends on (`blocked_by`) |
|---|---|---|---|---|
| [`RUNT-01`](tickets/RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md) — Fastify skeleton: autoloaded routes, uniform errors, `request_id` | M | `03-app-runtime` | `apps/api/src/{server.ts,app.ts,bootstrap,errors}/**`, `apps/api/{package.json,tsconfig.json}` | `FND-04` |
| [`RUNT-02`](tickets/RUNT-02-admission-middleware-chain.md) — Admission middleware chain | L | `03-app-runtime` | `apps/api/src/{plugins,middleware}/**` | `RUNT-01`, `AUTC-01`, `AUTC-04`, `FND-06`, `FND-09`, `DATA-02` |
| [`RUNT-03`](tickets/RUNT-03-sse-transport-with-persisted-replay.md) — SSE transport with persisted replay | M | `03-app-runtime` | `apps/api/src/sse/**` | `RUNT-01`, `DATA-05` |
| [`RUNT-04`](tickets/RUNT-04-worker-runtime-queue-classes-leases-fairness-checkpoints.md) — Worker runtime: queue classes, leases, fairness, checkpoints | L | `03-app-runtime` | `apps/worker/src/{main.ts,runtime,queues}/**`, `apps/worker/src/handlers/maintenance/**`, `apps/worker/{package.json,tsconfig.json}` | `DATA-05` |
| [`RUNT-05`](tickets/RUNT-05-web-app-shell-navigation-org-switcher-status-badges.md) — Web app shell: navigation, org switcher, status badges | L | `03-app-runtime` | `apps/web/{index.html,vite.config.ts,package.json,tsconfig.json}`, `apps/web/src/{app,shell,lib}/**`, `apps/web/src/features/home/**` | `FND-04` |
| [`RUNT-06`](tickets/RUNT-06-packages-ui-accessible-primitives-async-states-evidence-panel.md) — `packages/ui`: accessible primitives, async states, evidence panel | L | `03-app-runtime` | `packages/ui/**` | `FND-03` |
| [`RUNT-07`](tickets/RUNT-07-packages-observability-bounded-logs-and-metrics.md) — `packages/observability`: bounded logs and metrics | M | `03-app-runtime` | `packages/observability/**` | `FND-03` |
| [`RUNT-08`](tickets/RUNT-08-health-readiness-and-system-status.md) — Health, readiness and `/v1/system-status` | M | `03-app-runtime` | `apps/api/src/routes/{health,system-status}/**` | `RUNT-01`, `RUNT-07` |
| [`RUNT-09`](tickets/RUNT-09-local-compose-stack-and-pnpm-stack-up-down.md) — Local Compose stack and `pnpm stack:up/down` | M | `03-app-runtime` | `infra/compose/**` | `RUNT-01`, `RUNT-04` |

**Lane profile** (breakdown-plan §7: 9 tickets, min 2 waves, 5 peak lanes, not fully serial):

- Wave 1 — `RUNT-01`, `RUNT-04`, `RUNT-05`, `RUNT-06`, `RUNT-07` (no intra-module blockers).
- Wave 2 — `RUNT-02`, `RUNT-03`, `RUNT-08`, `RUNT-09`.

All nine file-scopes are pairwise disjoint, so any subset in one wave may run as concurrent lanes.

## 8. Acceptance — what makes the module done

The module is done when all nine tickets are `done` and:

1. **`SEC-001`** — every tenant-scoped request passes the PRD §16.5 order authenticate → resolve
   organisation → verify membership/service account → evaluate permission → tenant-scoped lookup,
   exactly once per request, and no route can reach a repository without a `TenantContext`
   (`RUNT-02`). Other-tenant and absent IDs are indistinguishable (`RESOURCE_NOT_FOUND`).
2. **`OPS-002`** — search, answer, source, budget and backup degradation are observable **without
   content logs**: `packages/observability` emits correlated bounded JSON, `/health/live`,
   `/health/ready` and `GET /v1/system-status` behave per PRD §42.1, and no research/evidence/PII
   text can be written to a log (`RUNT-07`, `RUNT-08`).
3. **`ANS-003`** (transport half) — accepted asynchronous work is resumable by SSE: events are
   persisted before emission and `Last-Event-ID` resumes without duplication or loss (`RUNT-03`);
   the worker executes them at-least-once with stage checkpoints and per-class limits (`RUNT-04`).
   The admission/idempotency half is `RUNT-02`; the answer semantics are `15-answer-product`.
4. **`AUTH-002` (client half)** — switching organisation clears unsaved forms and all
   organisation-scoped client caches (`RUNT-05`, PRD §31.1). The server-side session context half is
   `IDNT-01`.
5. **A1 holds in practice** — a new route area, worker handler and web feature can be added by
   creating one directory, with **zero** diff to any file owned by `03-app-runtime`. Each of the
   three contracts has a conformance test that adds a throw-away area at test time
   (`RUNT-01`, `RUNT-04`, `RUNT-05`) and an ADR under `docs/adr/`.
6. **A6 holds in practice** — the ten PRD §31.3 async states and the evidence/source panel exist once,
   in `packages/ui`, and pass the PRD §41.1 universal UI checks and WCAG 2.2 AA (PRD §13.1)
   (`RUNT-06`).
7. **A7 holds in practice** — `pnpm stack:up` yields a working local environment on a clean machine
   (PRD §20.2, §45.3), and the stack refuses to start against production configuration (`RUNT-09`).
8. **PRD §20.3 CI gates** pass for every ticket: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm generate && pnpm generated:check`.
9. **PRD §45.4** PR contract items are stated on every PR in the module.

Contributed-to but **not owned** here: `DEV-001` (the `/v1` contract surface is `FND-04`),
`ANS-006`/`SRCH-003` (rendered by product screens built on `packages/ui`), `OPS-001`/`OPS-003`.

## 9. Changelog

- **v0.2 — 2026-08-03** — aligned with the `docs/prd/breakdown-plan.md` §8 decision register.
  **Q12** (exact toolchain versions) and **Q13** (SQLite access layer) are confirmed decisions: both
  leave §6 and are recorded in §4 as **D11** and **D12**, so §6 now holds only the five module-local
  questions QR1–QR5. `RUNT-01`, `RUNT-04`, `RUNT-05`, `RUNT-06`, `RUNT-07` and `RUNT-09` restate the
  two as fixed inputs; `RUNT-04` drops the "SQLite access layer is undecided" caveat and states that
  the worker holds no Kysely instance; `RUNT-09` names the Node/pnpm/Rust versions its images and
  tooling must match and gains one `[machine]` acceptance row asserting that match (PRD §45.3, "CI and
  local development use the same pinned versions"). No ticket id, dependency edge, file-scope, PRD
  traceability or existing quality gate changed.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.4. Nine tickets,
  two waves, five peak lanes. Records decisions D1–D10 and open questions QR1–QR5.
