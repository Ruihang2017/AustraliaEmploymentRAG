# 22-internal-admin — sub-PRD

> Module sub-PRD authored from `docs/prd/breakdown-plan.md` §5.23. The **ticket files** under
> `tickets/` are the executable source of truth; this README is the module-level context they share.
> Master spec: [PRD](../../PRD.md). Decomposition plan: [breakdown-plan](../breakdown-plan.md).

| Field | Value |
|---|---|
| Module | `22-internal-admin` |
| Lane | `22-internal-admin` |
| Ticket prefix | `INTL` |
| Tickets | 10 (`INTL-01` … `INTL-10`) |
| Agent | `builder` (all 10, plan §1.1) |
| Epic | `E29-INTERNAL-ADMIN` (PRD §44.2) |
| Write-owns | `apps/api/src/routes/internal/**` · `apps/admin/**` (plan §4) |
| Depends on modules | `01-app-data`, `02-auth-core`, `03-app-runtime`, `05-ingestion-framework`, `12-evidence-safety`, `17-records-collab`, `18-ops-release`, `21-evaluation-600` |
| Requirement families | `ADM-001`, `ADM-002`, `ADM-003`, `COR-002`, `OPS-002` |
| Language/toolchain | TypeScript (`pnpm`) — PRD §18.2, §20.1, §45.3 |
| Version | v0.2 |

## Problem

PRD §5 item 12 puts "Internal admin console, incident workflow and scoped kill switches" in the MVP,
and PRD §8.11 states the whole surface in one paragraph:

> The internal console/API MUST support: source and ingestion health; quarantine; candidate/active
> corpus releases; licensing review; evaluation runs; global usage and costs; issue triage and
> corrections; incidents; scoped kill switches.
>
> Internal administration MUST be separated under `/internal/v1`, require internal identity, MFA and
> short sessions, and **MUST NOT be shipped in customer SDKs**.

Everything else in the product produces operational state that only this module makes actionable:
ingestion runs and freshness (module `05`), quarantine (`05`), candidate/active releases (`04`, `18`),
licence assessments (`05`), evaluation gate results (`21`), the funding ledger and circuit breaker
(`12`, `01`), issue reports and corrections (`17`), and the incident/kill-switch tables (`01`). Without
this module those exist but nobody can see or act on them, and three release requirements are
unevidenced:

- `ADM-001` — *"Source health, quarantine, release, licensing, evaluation and costs are visible
  internally"*, acceptance evidence *"Customer identity cannot call internal routes"* (PRD §30.2).
- `ADM-002` — *"Corpus promotion/rollback requires recent MFA, reason and immutable audit"*, evidence
  *"Promotion failure leaves active pointer unchanged"*.
- `ADM-003` — *"Scoped kill switches stop only the named capability/tenant/source"*, evidence *"Scope
  matrix and automatic expiry pass"*.

The module has three jobs, in this order of importance:

1. **Make the separation mechanical, not conventional.** PRD §8.11's three MUSTs (separate
   `/internal/v1`, internal identity + MFA + short sessions, never in customer SDKs) are boundary
   properties. They are enforced once, at the boundary, in `INTL-01` — not restated in nine consoles.
2. **Make dangerous actions structurally safe.** PRD §32.8: *"Dangerous actions use recent MFA, typed
   confirmation, scope, reason and expiry/review."* PRD §12.4: *"Every activation requires actor,
   reason, scope, incident and review/expiry time and **cannot bypass audit or delete data**."* One
   envelope implements that; every console reuses it.
3. **Optimise for one operator.** PRD §32.8: *"Internal pages MUST optimise for a solo operator: a
   single health overview shows critical source freshness, quarantine count, active/candidate corpus,
   backup lag, queue depth, citation failures, spend and incidents."*

## Scope

| In scope | Ticket |
|---|---|
| `/internal/v1` route-area boundary, internal identity + MFA + short sessions, the dangerous-action envelope, the customer-SDK exclusion assertion, the `apps/admin` shell and feature-area contract | `INTL-01` |
| Source and ingestion health: the nine PRD §6.1 registry attributes, the five PRD §12.1 dates as separate fields, `FRESHNESS_LIMITED` and the PRD §7 limited-status vocabulary, and — for every group in a limited state — the `INGF-07` `limitation` record behind it (evidence, affected dates/collections, customer-visible warning, reason) | `INTL-02` |
| Quarantine queue by reason code, per-reason operator recovery action, resolution recording, open-quarantine effect on promotion | `INTL-03` |
| Candidate vs active corpus release views, manifest/gate/coverage/quarantine summary, the authorised promotion and rollback request path (recent MFA, typed confirmation, reason, immutable audit) | `INTL-04` |
| Licensing review: the six PRD §11.1 assessment states, the nine use decisions, revision with history, unclear-rights default | `INTL-05` |
| Evaluation runs: the seven PRD §14.2 gates with observed values, per-category breakdown, one immutable linked release report, blind-material exclusion | `INTL-06` |
| Global usage and cost: month-to-date micro-AUD spend, the 90%/100% breaker states, per-provider/profile and per-organisation aggregates, founder reserve order | `INTL-07` |
| Issue triage across organisations, PRD §43.4 classification, confirmed error → Correction → impact analysis → notification, all through `17-records-collab`'s correction API | `INTL-08` |
| Incidents (six PRD §12.4 states, four PRD §42.4 severities) and scoped kill switches (every PRD §42.5 scope, expiry/review, no deletion, no audit bypass) | `INTL-09` |
| The single PRD §32.8 operator overview composed from the consoles above | `INTL-10` |

## Non-goals

| Not in this module | Owner |
|---|---|
| Any customer-facing route or screen (`/v1/**`, `apps/web/**`) | modules `13`–`17`, `19`, `20`, `24` |
| Any table, migration or repository (`incident`, `kill_switch`, `issue_report`, `correction`, `usage_ledger`, `audit_event`) | `01-app-data` / `DATA-07` (plan **A3**, PRD §45.2) |
| Session, cookie, MFA, recovery-code and credential implementation | `02-auth-core` / `AUTC-01`…`AUTC-05` |
| The admission chain, route autoload, SSE, worker runtime, `packages/ui`, `packages/observability` | `03-app-runtime` / `RUNT-01`…`RUNT-09` |
| Registry composition, quarantine sink, licence assessment schema, discovery scheduling | `05-ingestion-framework` / `INGF-04`, `INGF-05`, `INGF-07`, `INGF-08` |
| Corpus release build, manifest schema, signing, staging upload | `04-corpus-contract` / `CRPS-02`, `CRPS-06`, `CRPS-07` |
| The corpus promotion/rollback **tool** (verify → shadow → atomic pointer) and the app deploy/rollback tool | `18-ops-release` / `RLSE-06`, `RLSE-07` |
| Alerting thresholds, external checks, status page, backup replication and restore drills | `18-ops-release` / `RLSE-05`, `RLSE-08`, `RLSE-09` |
| Evaluation runner, metrics, gate thresholds, judge harness, release evidence pack contents | `21-evaluation-600` / `GOLD-02`, `GOLD-03`, `GOLD-04` |
| Budget arithmetic, reservation/settlement, circuit-breaker state machine, BYOK | `00-foundation` / `FND-09`, `12-evidence-safety` / `EVID-08`, `EVID-09` |
| Correction creation, impact analysis, replacement linkage, issue-report creation | `17-records-collab` / `RCRD-06`, `RCRD-07` |
| Kill-switch **enforcement** at admission | `03-app-runtime` / `RUNT-02` (consumes `DATA-07.activeSwitchesAt`) |
| Customer SDKs, developer portal, usage/audit customer endpoints | `20-developer-platform` / `PLTF-02`, `PLTF-03`, `PLTF-09` |
| Cross-boundary tenant-isolation, security and E2E suites under `tests/**` | `23-assurance` |
| Runbooks (`docs/runbooks/**`) | `18-ops-release` / `RLSE-10` |

## Decisions

| # | Decision | Basis | Recorded by |
|---|---|---|---|
| D1 | **`/internal/v1` exists purely by plan A1's nested route-area convention.** `apps/api/src/routes/internal/<area>/` derives prefix `/internal/v1/<area>`. There is no shared internal router file, so the nine internal areas are write-disjoint. | `RUNT-01` contract items 1 and 4 (*"`apps/api/src/routes/internal/core/` is area id `internal/core`"*, *"`internal/<rest>` defaults to `/internal/v1/<rest>`"*); plan **A1**; PRD §16.1 (*"Base path `/v1`; internal administration `/internal/v1`"*). | `INTL-01` |
| D2 | **One boundary, one place.** Every internal area declares its `RouteAreaConfig` through `internalArea()` and wraps its plugin in `internalRoutes()`, both exported by `internal/core`. The guard asserts internal identity, `assertMfaSatisfied` and the short-session policy; a boot-time assertion fails the process if any registered internal area's derived prefix does not start with `/internal/v1/`. | PRD §8.11; `RUNT-02` deliverable 3 (profile `internal` = full chain **plus** internal-identity and recent-MFA assertions, *"`22-internal-admin` (`INTL-01`) builds on it"*); PRD §21.1. | `INTL-01` |
| D3 | **A customer identity receives the byte-identical `404 RESOURCE_NOT_FOUND` used for an unknown path**; an unauthenticated caller receives the platform-wide `401 AUTHENTICATION_REQUIRED`. The internal surface is not discoverable by an authenticated customer. | PRD §16.5 (*"Other-tenant and absent opaque IDs return the same not-found response"*); PRD §34.9; `ADM-001` evidence *"Customer identity cannot call internal routes"*; `RUNT-02` (*"a denied permission on an addressable resource yields the same `404 RESOURCE_NOT_FOUND` body as an absent id"*). | `INTL-01` |
| D4 | **The internal admin roster is configuration, not tenant data.** Internal identity is a separate principal kind resolved from PRD §39.6 configuration/sealed secrets, never a membership role in an organisation. **ADR candidate.** | PRD §38.1 role matrix, row *"Internal source/release/incident admin"* → *"separate internal identity only"* for every customer role; PRD §21.2 (*"Cross-organisation internal access uses a separate recent-MFA, reason-required, audited path"*); PRD §39.6 config layers. Writeback if a table is genuinely required: `01-app-data` ticket + plan §5.2/§6.2 edge (plan **R4**) — never a `packages/database` write from here. | `INTL-01` (`docs/adr/NNNN-internal-identity-boundary.md`) |
| D5 | **The console never opens `corpus.sqlite`, `ingestion.sqlite`, R2 or a pipeline module.** Operational state arrives as **schema-validated snapshot documents** through an injected `OperationalSnapshotStore` port, or through `packages/database` repositories for app-side state. Every console renders an explicit `UNAVAILABLE` / `STALE` state carrying the snapshot's own timestamps rather than a blank or an invented value. Where a snapshot records *why* a state holds — the `limitation` block `INGF-07` requires of every limited source group — the console displays that record rather than compressing it into a status word (plan §8 **Q10**, confirmed policy; `INTL-02`). **ADR candidate.** | PRD §18.3 (*"`corpus.sqlite` is release-specific, immutable and production read-only"*); PRD §39.1 dependency rule and process graph; PRD §39.2/§39.4 give the `app` process no corpus, ingestion or R2 path; PRD §45.2. Precedent: `RUNT-02`'s fail-closed PII extension point. | `INTL-01`; consumed by `INTL-02`…`INTL-06` |
| D6 | **One dangerous-action envelope.** `withDangerousAction()` in `internal/core` enforces, in fixed order: internal identity → `assertMfaSatisfied` → `assertRecentAuth` (`AUTC-02`, PRD §38.2's 10 minutes) → typed-confirmation equality against a server-computed challenge → required `scope`, `reason` and, where applicable, `incident` and `review/expiry` → **audit append before the effect** → effect → outcome audit append. With no audit sink bound it **rejects**; an action can never run unaudited. | PRD §32.8 (*"Dangerous actions use recent MFA, typed confirmation, scope, reason and expiry/review"*); PRD §12.4 (*"cannot bypass audit or delete data"*); PRD §20.4; `ADM-002`. | `INTL-01`; used by `INTL-04`, `INTL-05`, `INTL-08`, `INTL-09` |
| D7 | **No internal path, schema or type reaches the customer SDKs.** Internal route schemas are emitted only into this module's own internal contract document under `apps/api/src/routes/internal/core/contract/**`. `INTL-01` ships a non-vacuous exclusion assertion: it always asserts that no `/internal/` path or internal schema name appears in `schemas/openapi/**` or `packages/contracts/src/generated/**`, and additionally scans `packages/sdk-typescript/**`, `sdk/python/**` and `apps/widget/**` when those trees exist. Every sibling ticket re-runs it. | PRD §8.11 (*"MUST NOT be shipped in customer SDKs"*); PRD §20.1 (generated bindings not hand-edited); plan §4.1 (OpenAPI root serial-owned by `FND-04`). | `INTL-01`, re-run by `INTL-02`…`INTL-09` |
| D8 | **`apps/admin` imports neither `packages/ui` nor `packages/observability`.** No plan edge exists from any `INTL-*` ticket to `RUNT-06`/`RUNT-07`, so under `/start-all` neither package can be assumed present. Admin primitives (async states, typed-confirmation dialog, unavailable/stale panel) live in `apps/admin/src/app/**`. | Plan §6.2 (no edge); plan **A6** scopes the shared evidence panel to the *customer* surfaces `14`, `15`, `17`; CLAUDE.md scheduling. Writeback if sharing is genuinely required: a plan edge in §5.23/§6.2 — never a silent import. | `INTL-01` |
| D9 | **Admin feature areas autoload by directory**, mirroring `RUNT-05`'s web contract: `apps/admin/src/features/<area>/feature.tsx` discovered by a glob in `apps/admin/src/app/feature-registry.ts`. Adding a feature directory changes no tracked file. | Plan **A1** (*"register routes/handlers/features by directory convention … never a shared central manifest"*); without it the nine console tickets contend on one registry file. | `INTL-01` |
| D10 | **Ownership inside `apps/admin/**`:** `INTL-01` owns `index.html`, `vite.config.ts`, `tsconfig.json` and `src/app/**`; `apps/admin/package.json` is **append-only shared** across the ten tickets; each console owns `src/features/<area>/**` and `test/<area>/**`. | Plan §5.23 file-scope column; plan §1.1 (*"each module owns its members' manifests; within a module a manifest is append-only shared"*); `FND-01` creates the empty member skeleton (PRD §20.1 lists `apps/admin`). | this sub-PRD |
| D11 | **Test areas are per ticket:** `apps/api/test/internal/<area>/**` and `apps/admin/test/<area>/**`. | Plan §1.1 (*"unit/integration tests live inside the owning package or app"*); keeps sibling scopes disjoint. Precedent: `DATA-07`, `RCRD-07`. | this sub-PRD |
| D12 | **Cross-organisation reads are aggregate-only and audited.** `INTL-07` and `INTL-08` read across organisations through the PRD §21.2 separate path (recent MFA, reason required, audited) and expose identifiers, counts and cost only — never question, answer, evidence or PII text. | PRD §21.2; PRD §22 (*"Logs MUST exclude research/evidence content, PII text, credentials"*); PRD §10.3. | `INTL-07`, `INTL-08` |
| D13 | **Kill switches never delete and never enforce here.** `INTL-09` exposes no delete, purge, truncate or content-mutating path; deactivation is an append. Enforcement stays in `RUNT-02`'s chain reading `DATA-07.activeSwitchesAt`. | PRD §12.4; PRD §42.5 (*"No switch deletes content or bypasses retention/audit"*); `DATA-07` deliverable 9. | `INTL-09` |
| D14 | **Internal session length is pinned as an initial default, not a new product rule**: idle 30 minutes, absolute 8 hours, recent auth 10 minutes (PRD §38.2's sensitive-action value, used unchanged). Recorded in code as a named constant with the PRD citation and the open question reference. | PRD §8.11 requires *"short sessions"* and gives no number; PRD §38.2 gives customer defaults (8 h idle / 7 d absolute) which are **not** short; PRD §45.1 item 5 (*"do not silently turn an initial default into a new product rule"*). See **M2**. | `INTL-01` |

## Rejected alternatives

| Rejected | Why |
|---|---|
| One `apps/api/src/routes/internal/index.ts` that mounts the nine consoles | Collapses the module into a single serial lane (plan §7 records 8 useful lanes) and re-creates exactly the shared-manifest failure plan **A1** exists to prevent. |
| Serving the internal console from `apps/web` under `/internal/*` routes | PRD §8.11 requires separation; PRD §39.1 already shows `Web/admin/widget assets` as distinct bundles. It would also put internal code and types inside the customer bundle, directly risking the §8.11 SDK/shipping prohibition. |
| Reading `corpus.sqlite` / `ingestion.sqlite` directly from `apps/api` | PRD §18.3 (corpus is production read-only and release-specific), §39.1 (*"Python pipeline code never imports tenant/customer packages"*, `search-rs` has no `app.sqlite` path), §39.2/§39.4 give `app` no such access. |
| Making the internal admin an organisation role (e.g. a super-Owner) | PRD §38.1 states *"separate internal identity only"* for the internal admin row of every customer role. A role-based path would make internal access reachable by tenant permission escalation. |
| Implementing verify → shadow → atomic pointer switch in `INTL-04` | `RLSE-07` owns `infra/deploy/corpus/**`; PRD §39.1 runs promotion as a separate process with the only R2 credential; PRD §44.3 makes promotion files serial-owned. |
| Re-implementing correction creation inside `INTL-08` | `RCRD-07` already ships `POST /v1/corrections` with a per-route `admission: 'internal'` override and the impact-analysis job. A second implementation would fork COR-002's "preserve the original" guarantee. |
| Enforcing kill switches inside the internal routes | Two enforcement points cannot both be authoritative; PRD §42.5's admission behaviour belongs to `RUNT-02`'s chain. `INTL-09` would also be unable to affect worker-side admission. |
| Skipping the customer-SDK exclusion assertion until module `20` lands | A test that skips when its target is absent is vacuous. D7 asserts the structural condition (OpenAPI root + generated bindings), which always exists, and scans SDK trees additionally. |
| Rendering a zero or a dash when operational state is missing | PRD §44.4 forbids calling an unimplemented thing covered; an operator cannot distinguish "no quarantine" from "no data". D5 requires an explicit unavailable/stale state. |
| Deleting or archiving customer data from a kill switch to "stop the bleeding" | PRD §12.4 and §42.5 forbid it outright; the escalation path is in every ticket's feedback obligation. |

## Open questions

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| M1 | **Production binding for the operational snapshots (D5).** Who writes the composed registry, quarantine, licence and release/evaluation snapshots to a path the `app` process can read, and where? PRD §19.3 says *"The production server continues lightweight source discovery so source health does not depend on the workstation being online"*, but PRD §39.3's filesystem table has no row for ingestion state. | `18-ops-release` (**`RLSE-02`** owns `infra/deploy/host/**`; **`RLSE-07`** owns corpus promotion), with `05-ingestion-framework` **M1** | `RLSE-02` / `RLSE-07` | Nothing before first provisioning: every console ships the port plus a committed fixture binding and an explicit `UNAVAILABLE`/`STALE` state. |
| M2 | **How short is a "short session" for internal identity?** PRD §8.11 requires short sessions and names no number. | **Founder** (PRD §45.5 product change; §38.2 is a product limit table) | `INTL-01` pins an initial default (D14) and records it as an initial default, not a product rule | Nothing — the default is conservative by construction. |
| M3 | **Internal identity storage (D4)** — configuration roster versus a `packages/database` table. | `01-app-data` (**`DATA-04`** owns PRD §35.4 identity tables) + **Founder** | `INTL-01` records `docs/adr/NNNN-internal-identity-boundary.md`; a table requires a `01-app-data` ticket and a plan §5.2/§6.2 edge | Nothing today — configuration satisfies PRD §38.1 and §39.6. |
| M4 | **PRD §41.2 contains no `UAT-ADM-*` and no `UAT-COR-*` row.** The manual acceptance script table has `UAT-OPS-01/02/03` and no internal-administration or correction script, yet `ADM-001/002/003` and `COR-002` are release requirements. | **Founder** (a new UAT row is a PRD change, §45.5) | Until then, the human evidence for this module is PRD §30.2's *"Minimum acceptance evidence"* column, the PRD §42 operational drills, PRD §43.4 founder review and the Gate 2 smoke test — each written into the owning ticket's `[human]` items | Nothing — the evidence exists; only its `UAT-*` identifier is missing. |
| M5 | **`INTL-10` must show backup lag and queue depth (PRD §32.8) but has no edge to `RLSE-05`, `RUNT-04` or `RUNT-08`.** | this sub-PRD (Architect) → `docs/prd/breakdown-plan.md` §5.23/§6.2 | `INTL-10` renders those tiles from a declared source when one is reachable and `UNAVAILABLE` otherwise; adding `RUNT-08`/`RLSE-08` as `blocked_by` is a **plan** change, never a silent import | The completeness of the §32.8 overview, not its delivery. |
| M6 | **`INTL-10` must show a quarantine count but is not `blocked_by INTL-03`** (plan §5.23 gives it `INTL-02`, `INTL-04`, `INTL-07`, `INTL-09`). | this sub-PRD (Architect) | `INTL-10` reads the count from `INTL-02`'s per-source open-quarantine summary and `INTL-04`'s release-manifest `quarantine` object (`CRPS-02`), both already reachable | Nothing; if that proves impossible the writeback is a plan edge `INTL-10 ← INTL-03`. |
| M7 | **How does an authorised promotion/rollback request reach the `RLSE-07` tool?** PRD §39.1 runs promotion as a separate process with the R2 credential; the `app` process has no corpus write path. | `18-ops-release` (**`RLSE-06`**, **`RLSE-07`**) | `INTL-04` records the authorisation (actor, recent MFA, typed confirmation, reason, target release) and displays the tool's recorded outcome; it never switches the active pointer | Nothing — `ADM-002`'s *"Promotion failure leaves active pointer unchanged"* is proven by `RLSE-07`; `INTL-04` proves it cannot bypass the gates. |
| M8 | **Where does the `/internal/v1` contract document live**, given `schemas/openapi/**` is serial-owned by `FND-04` and must stay customer-only (D7)? | `00-foundation` (**`FND-04`**) if `pnpm generate` auto-discovers route schemas | `INTL-01` emits the internal contract only under `apps/api/src/routes/internal/core/contract/**` | Nothing — but a generate step that pulls internal routes into the customer root would violate PRD §8.11 and is an immediate writeback. |
| M9 | **`RUNT-02`'s `internal` profile still runs `resolve-organisation` and `verify-membership`**, which have no meaning for an operator principal with no organisation. | `03-app-runtime` (**`RUNT-02`**) | `INTL-01` states the operator-scope semantics it requires; if the chain cannot express them, the writeback is `RUNT-02`'s ticket + `docs/prd/03-app-runtime/README.md` | `INTL-01` only; every other console inherits the resolution. |
| M10 | **Does `RUNT-02`'s admission consult `DATA-07.activeSwitchesAt`?** `DATA-07` says the query exists *"for `RUNT-02` and `INTL-09`"*, but `RUNT-02`'s stage list has no kill-switch stage. | `03-app-runtime` (**`RUNT-02`**) | `INTL-09` proves the stored switch set and the scope matrix; the end-to-end *effect* needs the admission stage | `ADM-003`'s end-to-end evidence. Writeback: `docs/prd/03-app-runtime/README.md` + `RUNT-02` ticket + plan §5.4/§6.2. |

## Work breakdown

`lane` = `22-internal-admin` and `agent` = `builder` for all ten tickets (plan §1.1). Paths are
relative to the repository root. `.../internal/<area>/**` abbreviates
`apps/api/src/routes/internal/<area>/**`.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`INTL-01`](tickets/INTL-01-internal-v1-separation-internal-identity-admin-shell.md) — `/internal/v1` separation, internal identity, admin shell | L | `22-internal-admin` | `apps/api/src/routes/internal/core/**`, `apps/api/test/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`, `apps/admin/test/app/**`, `docs/adr/NNNN-internal-identity-boundary.md` | `RUNT-02`, `AUTC-02` |
| [`INTL-02`](tickets/INTL-02-source-and-ingestion-health-console.md) — Source and ingestion health console | M | `22-internal-admin` | `.../internal/sources/**`, `apps/api/test/internal/sources/**`, `apps/admin/src/features/sources/**`, `apps/admin/test/sources/**` | `INTL-01`, `INGF-07` |
| [`INTL-03`](tickets/INTL-03-quarantine-console-and-operator-recovery-actions.md) — Quarantine console and operator recovery actions | M | `22-internal-admin` | `.../internal/quarantine/**`, `apps/api/test/internal/quarantine/**`, `apps/admin/src/features/quarantine/**`, `apps/admin/test/quarantine/**` | `INTL-01`, `INGF-05` |
| [`INTL-04`](tickets/INTL-04-corpus-release-candidate-and-promotion-console.md) — Corpus release candidate and promotion console | L | `22-internal-admin` | `.../internal/releases/**`, `apps/api/test/internal/releases/**`, `apps/admin/src/features/releases/**`, `apps/admin/test/releases/**` | `INTL-01`, `RLSE-07` |
| [`INTL-05`](tickets/INTL-05-licensing-review-console.md) — Licensing review console | M | `22-internal-admin` | `.../internal/licensing/**`, `apps/api/test/internal/licensing/**`, `apps/admin/src/features/licensing/**`, `apps/admin/test/licensing/**` | `INTL-01`, `INGF-04` |
| [`INTL-06`](tickets/INTL-06-evaluation-run-console.md) — Evaluation-run console | M | `22-internal-admin` | `.../internal/evaluation/**`, `apps/api/test/internal/evaluation/**`, `apps/admin/src/features/evaluation/**`, `apps/admin/test/evaluation/**` | `INTL-01`, `GOLD-03` |
| [`INTL-07`](tickets/INTL-07-global-usage-and-cost-console.md) — Global usage and cost console | M | `22-internal-admin` | `.../internal/cost/**`, `apps/api/test/internal/cost/**`, `apps/admin/src/features/cost/**`, `apps/admin/test/cost/**` | `INTL-01`, `EVID-08` |
| [`INTL-08`](tickets/INTL-08-issue-triage-and-correction-console.md) — Issue triage and correction console | M | `22-internal-admin` | `.../internal/issues/**`, `apps/api/test/internal/issues/**`, `apps/admin/src/features/issues/**`, `apps/admin/test/issues/**` | `INTL-01`, `RCRD-07` |
| [`INTL-09`](tickets/INTL-09-incidents-and-scoped-kill-switches.md) — Incidents and scoped kill switches | L | `22-internal-admin` | `.../internal/incidents/**`, `apps/api/test/internal/incidents/**`, `apps/admin/src/features/incidents/**`, `apps/admin/test/incidents/**` | `INTL-01`, `DATA-07` |
| [`INTL-10`](tickets/INTL-10-single-operator-health-overview.md) — Single operator health overview | M | `22-internal-admin` | `apps/admin/src/features/overview/**`, `apps/admin/test/overview/**` | `INTL-02`, `INTL-04`, `INTL-07`, `INTL-09` |

`apps/admin/package.json` is **shared-additive** across the ten tickets: each ticket appends only the
dependencies it declares, and a conflict is resolved by re-running the package manager, never by hand
(plan §1.1, PRD §44.3). `/start-all` serialises delivery, so lockfile regenerations land one at a time.

### Lane profile (plan §7)

Three waves, peak eight concurrent lanes, **not fully serial** (plan §7: 10 tickets, min 3 waves, 8
max useful lanes):

```text
wave 1  INTL-01
wave 2  INTL-02 | INTL-03 | INTL-04 | INTL-05 | INTL-06 | INTL-07 | INTL-08 | INTL-09
wave 3  INTL-10
```

The shape is intentional: `INTL-01` fixes the boundary once (D1, D2, D6, D7), the eight consoles are
independent subtrees under it, and `INTL-10` composes four of them.

### Upstream and downstream

Upstream, one contract per console: `INGF-07` (composed registry), `INGF-05` (quarantine reasons and
run accounting), `INGF-04` (licence assessments), `RLSE-07` (corpus promotion tool), `GOLD-03` (gate
enforcement and release evidence pack), `EVID-08` (budget and breaker), `RCRD-07` (corrections),
`DATA-07` (incident/kill-switch/audit/usage tables), `RUNT-02` (admission chain and the `internal`
profile), `AUTC-02` (MFA and the recent-auth assertion).

Downstream: **none.** Plan §6.2 has no edge out of any `INTL-*` ticket to another module, so every
`blocks` value in this module is intra-module. `23-assurance` and `24-launch` do not depend on this
module's tickets; the module's evidence flows into PRD §26 through the Definition-of-Done closure
(`LNCH-05`) as delivered artifacts, not as a DAG edge.

## Acceptance — what makes the module done

The module is done when all ten tickets are delivered and:

1. **`ADM-001`** — *"Source health, quarantine, release, licensing, evaluation and costs are visible
   internally"*, evidence *"Customer identity cannot call internal routes"* (PRD §30.2). Satisfied by
   `INTL-02`…`INTL-07` for visibility and by `INTL-01`'s boundary for the negative: every internal
   endpoint returns the byte-identical `404 RESOURCE_NOT_FOUND` to a customer session, a customer
   service-account credential and a widget token (D3), asserted in **every** console ticket, not only
   in `INTL-01`. Source health carries the confirmed plan §8 **Q10** obligation with it: a group in one
   of the four PRD §7 limited states is shown with the evidence, affected dates/collections,
   customer-visible warning and reason `INGF-07` records for it — never a bare status word.
2. **`ADM-002`** — *"Corpus promotion/rollback requires recent MFA, reason and immutable audit"*,
   evidence *"Promotion failure leaves active pointer unchanged"* (PRD §30.2, §18.4, §20.4).
   `INTL-04` proves the console cannot request promotion without recent MFA, typed confirmation and a
   reason, that the authorisation is audited before any effect, and that a failed or refused
   promotion changes nothing; the pointer mechanics themselves are `RLSE-07`'s.
3. **`ADM-003`** — *"Scoped kill switches stop only the named capability/tenant/source"*, evidence
   *"Scope matrix and automatic expiry pass"* (PRD §30.2, §12.4, §42.5). `INTL-09` proves every
   PRD §42.5 scope is representable and activatable with actor, reason, scope, incident and
   review/expiry; that expiry removes a switch from the effective set without any delete; and that no
   code path in this module deletes or mutates customer data or skips the audit append.
4. **`COR-002`** — *"Confirmed correction preserves original, links replacement and performs impact
   analysis"*, evidence *"Affected records become reviewable/notifyable"* (PRD §30.2, §12.3).
   `INTL-08` drives the flow through `RCRD-07`'s API and shows the impact-analysis outcome; the
   preservation guarantee remains `RCRD-07`/`DATA-06`'s and is asserted end-to-end from the console.
5. **`OPS-002`** — *"Search, answer, source, budget and backup degradation are observable without
   content logs"*, evidence *"Alerts fire in controlled failure drills"* (PRD §30.2, §22).
   `INTL-10`'s single overview plus `INTL-02`/`INTL-07`/`INTL-09` make each degradation visible; a
   canary assertion in every console proves no research content, PII text or credential reaches a
   response body or a log line.
6. **PRD §8.11 separation** — a boot-time assertion that every internal route area's derived prefix
   starts with `/internal/v1/`, internal identity + MFA + short sessions enforced at the boundary, and
   the D7 exclusion assertion green: no internal path, schema or type in `schemas/openapi/**`,
   `packages/contracts/src/generated/**`, `packages/sdk-typescript/**`, `sdk/python/**` or
   `apps/widget/**`.
7. **PRD §32.8** — the single operator overview shows critical source freshness, quarantine count,
   active/candidate corpus, backup lag, queue depth, citation failures, spend and incidents, each
   either with a value or an explicit unavailable state (`INTL-10`, M5/M6).
8. **PRD §41.2 manual scripts** — `UAT-OPS-01` (corrupt candidate corpus fixture → promotion blocked,
   active release and search unchanged) rehearsed from `INTL-04`; `UAT-OPS-03` (A$50 projected/actual
   circuit breaker → paid generation admissions stop) observed from `INTL-07`. §41.2 has **no**
   `UAT-ADM-*` or `UAT-COR-*` row (**M4**); those requirements use their PRD §30.2 evidence instead.
9. **PRD §42 operational drills** — the PRD §42.5 kill-switch scope matrix drill (`INTL-09`), the
   PRD §42.4 incident first-action walkthrough (`INTL-09`), the PRD §42.2 critical-source-freshness
   degradation drill (`INTL-02`) and the PRD §42.6 breaker drill (`INTL-07`) are each run once against
   a locally started stack and recorded in the ticket's PR.
10. **PRD §43.4 founder review** — the internal console is the surface the founder test queue is
    triaged from; `INTL-08` implements the PRD §43.4 classification vocabulary and `INTL-06` shows the
    evaluation failures that feed it.
11. **PRD §45.4 PR contract** on every ticket, and `pnpm lint`, `pnpm typecheck`, `pnpm test` and
    `pnpm generate && pnpm generated:check` green on the merged default branch after each
    (PRD §20.3, §45.3, plan §1.1). No `cargo test --workspace` / `uv run pytest` item anywhere in this
    module — it touches no Rust and no Python.

## Changelog

- **v0.2 — 2026-08-03** — alignment with the `docs/prd/breakdown-plan.md` §8 decision register. **Q10**
  (which source groups may launch in a limited state) is a **confirmed policy**: `INTL-02` now states
  it, and D5 plus `INTL-02` deliverable 10 require the `INGF-07` `limitation` record — evidence,
  affected dates/collections, customer-visible warning and reason — to be displayed with every limited
  group instead of a status word alone; Gate 2 is described throughout as the Founder's verification
  and sign-off, never a scope-cutting step. **Q9** (per-source anomaly thresholds) re-framed in
  `INTL-03` as **baseline-selected** initial defaults that each adapter may tighten, with critical
  identity/time/mandatory-source/citation failures as unconditional blockers and `GOLD-16`
  consolidating — no longer "placeholders"; `ACCEPT_AS_LIMITED` is stated to be a triage decision, not
  a registry state. **Q1** (hosted model per profile) re-framed in `INTL-06` and `INTL-07` as
  **benchmark-selected** — resolved by measured evidence, recorded in `GOLD-15`'s promotion report and
  approved by the Founder **after** that evidence — no longer an open product decision; `INTL-07` must
  present no model, provider or unit price as fixed. **Q7** (IPv6-only vs IPv4-inclusive profile, owned
  by `RLSE-02`/`RLSE-03`) and **Q14** (transactional email provider **Resend**, owned by
  `WTCH-04`/`WTCH-09`, with `RESEND_API_KEY` confined to the production sealed-secret layer) were
  checked across all ten tickets: no console in this module references the IP profile or the email
  provider, and none displays, accepts or logs a provider credential, so no change was required.
  Module-local open questions **M1**–**M10** are unaffected and stay open. No ticket id, dependency
  edge, `blocked_by`/`blocks` value, file-scope, quality gate, `/internal/v1` boundary rule or PRD
  traceability changed.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.23 (10 tickets,
  `INTL-01`…`INTL-10`). Records the `/internal/v1` boundary decisions D1–D3, the internal-identity
  ADR candidate D4, the snapshot-port ADR candidate D5, the dangerous-action envelope D6 and the
  customer-SDK exclusion assertion D7; raises M1–M10, including **M4** (PRD §41.2 has no `UAT-ADM-*`
  or `UAT-COR-*` script) and **M5**/**M6** (the PRD §32.8 overview needs data `INTL-10` has no plan
  edge to).
