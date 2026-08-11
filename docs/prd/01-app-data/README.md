# 01-app-data — application database, tenant repositories and job primitives

Sub-PRD for module `01-app-data` (ticket prefix `DATA`, lane `01-app-data`, 9 tickets).
Parent decomposition: [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §3, §4, §5.2, §6.2, §7, §8.
Master spec: [`docs/PRD.md`](../../PRD.md) — AustraliaEmploymentRAG MVP v1.0, revision 2.0, 3 August 2026.
Epic: `E04-APPDB` (PRD §44.2). Requirement families: SEC-001, REC-001, ANS-003/004, OPS-003,
plus the persistence half of AUTH-002/003/006, MON-001, COR-001/002 and ADM-003.

> The **tickets** under `tickets/` are the executable source of truth. This README states the
> module's problem, scope and decisions; where a ticket and this file disagree, the ticket wins
> (CLAUDE.md, issue #53).

## Problem

Nothing exists yet: at decomposition time the repository contains `docs/`, `templates/`, `tools/`,
`.github/` and `.claude/` only — no `packages/`, no schema, no migrations. Every product module
downstream (identity, answers, records, monitor, exports, developer platform, internal admin)
needs the *same* mutable store, and PRD §45.2 gives exactly one owner for it:

> `packages/database` | app schema/migrations/tenant repositories/outbox/encryption | *must not own* Corpus schema or UI

PRD §44.3 additionally declares **app migration order** a serial-owned artifact:

> Serial owners are required for root lockfiles, canonical enums, OpenAPI root, app migration
> order, corpus schema/manifest, active release/promotion files and production
> Compose/deployment configuration.

So this module must deliver, in one owned tree, four things that are otherwise duplicated or
contested across six product modules:

1. a **single ordered migration sequence** for `app.sqlite` that stays expand-only (PRD §20.4, §39.7);
2. a **TenantContext-scoped repository layer** that makes an unscoped connection unobtainable from
   business code — the literal wording of SEC-001 and PRD §16.5;
3. **field-level envelope encryption** for the `*_ciphertext` columns PRD §35.5/§35.4 require;
4. the **durable job, job-event and transactional-outbox** primitives PRD §18.1/§18.5 make
   mandatory for every asynchronous surface, plus the separate, never-backed-up
   `ephemeral.sqlite` store of PRD §10.4/§35.7.

Getting any of these wrong is not a local defect. An unscoped repository is a cross-tenant
exposure (PRD §12.4 SEV-1); a non-atomic outbox silently loses alerts and webhooks; a mutable
Answer Snapshot falsifies REC-001 and every export that claims to reproduce a past answer.

## Scope

In scope — the whole of `packages/database/**` and `packages/jobs/**`:

- migration runner, ordering policy, expand-only enforcement, §35.1 storage conventions;
- `TenantContext`, tenant-scoped repository factory, composite-tenant-FK helper, break-glass
  cross-tenant path seam, and the SEC-001 architecture test;
- envelope encryption, key registry and rotation path for customer text and sensitive config;
- every app table in PRD §35.4 (tenancy/identity), §35.5 (research/evidence) and §35.6
  (execution, usage and operations), with its repository;
- `packages/jobs` lease/checkpoint/outbox primitives;
- `ephemeral.sqlite` schema, sweeper and backup-exclusion assertions;
- the eight PRD §35.8 invariants as an enforced, enumerable registry with property tests.

## Non-goals

| Not here | Owner | Basis |
|---|---|---|
| Corpus schema, `corpus.sqlite`, release manifests | `04-corpus-contract` (`CRPS-01`, `CRPS-02`) | PRD §45.2 ("must not own Corpus schema"), §18.3 |
| Canonical enums and opaque ID *definitions* | `00-foundation` (`FND-03`) | PRD §35.1 "Enumerations use checked text values generated from `packages/contracts`"; plan §4.1 |
| Permission/role logic, budget arithmetic, workflow transition table, refusal logic | `00-foundation` (`FND-06`…`FND-10`) | PRD §45.2 — `packages/domain` owns "Pure permissions, state transitions, evidence/budget rules" |
| Session/cookie/MFA/SSO/credential *logic* (this module only stores the rows) | `02-auth-core` (`AUTC-01`…`AUTC-05`) | PRD §38.2–38.4 |
| HTTP routes, DTO mapping, SSE endpoints, admission middleware | `03-app-runtime`, `13`…`22` | PRD §45.2 — `apps/api` owns "HTTP auth/admission/DTO mapping/SSE" |
| Worker lease **loops**, fairness scheduling, graceful shutdown | `03-app-runtime` (`RUNT-04`) | PRD §45.2 — `apps/worker` owns "Lease loops and application-service orchestration" |
| Litestream configuration, backup globs, restore drills | `18-ops-release` (`RLSE-05`, `RLSE-09`) | PRD §23.1, §39.3; plan §4 |
| Cross-boundary tenant-isolation / integration / restore suites | `23-assurance` (`ASSR-01`, `ASSR-05`, `ASSR-08`) | PRD §20.1; plan §1.1 "Tests" |

## Decisions

| # | Decision | Basis |
|---|---|---|
| D1 | `packages/database` owns **every app table and repository**; product modules own routes, handlers and screens only. A product module that needs a column raises a ticket **here** and takes a `blocked_by` edge on it. | Plan §2.1 **A3**; PRD §45.2, §35.4–35.6; PRD §34.3 ("Creating a record and admitting the job occur in the same transaction") is why record writes cannot live in `17-records-collab` |
| D2 | Migrations are **timestamp-prefixed and expand-only**. `0001_baseline.sql` is the single numeric-prefixed file (the ledger bootstrap); every later migration is `<UTC YYYYMMDDHHMMSS>_<group>.sql`. Order is plain lexicographic, so the baseline always sorts first. Independent table groups may be authored concurrently; a group with a cross-group FK takes a `blocked_by` edge on the group it references. | Plan §2.1 **A5**; PRD §20.4, §39.7 step 4, §44.3 |
| D3 | PRD §35.6 is split into two disjoint ticket scopes: **execution** = `job`, `job_event`, `outbox_event`, `retrieval_run`, `retrieval_candidate`, `model_execution` (`DATA-05`); **operations** = `usage_ledger`, `watchlist`, `watch_target`, `detected_change`, `alert`, `alert_delivery`, `issue_report`, `correction`, `audit_event`, `incident`, `kill_switch` (`DATA-07`). | Plan §5.2 goals ("Durable jobs, job events and transactional outbox" vs "Ledger, watch, alert, audit and kill-switch persistence"); the cross-group FK direction (`usage_ledger` → `job`) matches the plan's `DATA-07 blocked_by DATA-05` edge under A5 |
| D4 | Table metadata is discovered by **directory glob over `packages/database/src/schema/*.ts`**, each module exporting its own `tableManifest`. There is no shared barrel/index file. | Same principle as plan §2.1 **A1**: a shared registration file would make `DATA-04`…`DATA-07` contend on one path and collapse the module's two lanes into one |
| D5 | §35.8 invariant enforcement uses a **pre-commit hook registry** defined by `DATA-02` and populated by `DATA-09`. `DATA-09`'s file-scope (plan §5.2) contains no migration path, so it cannot add triggers; the hook registry is the only seam that lets it enforce rather than merely observe. | PRD §35.8; plan §5.2 file-scope allocation |
| D6 | `ephemeral.sqlite` **bootstraps its own schema** and is not part of the app migration sequence. | PRD §35.7 (disposable, three tables, cleared on a 24 h ceiling), §39.3 (separate file, explicitly excluded from backup); `DATA-08` owns no migrations path in plan §5.2 |
| D7 | Encryption is **AEAD envelope encryption with the AAD bound to `organization_id` + table + column + row id**, keyed from the PRD §39.6 "database field-encryption key" secret group. No deterministic or searchable encryption. | PRD §35.1, §39.6, §23.1; deterministic encryption would leak equality across tenants and no PRD requirement needs to search ciphertext |
| D8 | Unit/integration tests live under the **owning ticket's own area** — either co-located inside that ticket's `src/<area>/**` or under `packages/database/test/<area>/**` where `<area>` is that ticket's own name. No ticket writes into another ticket's test directory. | Plan §1.1 "Tests"; keeps sibling file-scopes disjoint |
| D9 | `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/jobs/package.json` and `packages/jobs/tsconfig.json` are **module-owned, append-only shared**. Adding a declared dependency regenerates the root lockfile as a build artifact; conflicts resolve by re-running pnpm, never by hand-merge. | Plan §1.1 "Package manifests"; PRD §44.3 |
| D10 | The single-writer discipline SQLite forces is made explicit: WAL, `foreign_keys=ON` and a non-zero `busy_timeout` are defined **once** (`DATA-01`, `src/migrate/pragmas.ts`) and applied by every connection factory in the package. | PRD §23.1 ("`app.sqlite` uses WAL"), §39.1/§39.4 (api, worker and Litestream all touch the same file) |
| D11 | **The SQLite access layer is settled: Kysely-style repositories and query construction, using Kysely's SQLite dialect over `better-sqlite3`. Drizzle is not used in the application database layer.** Raw `.sql` files checked into git remain the **only** migration authoring format (D2); this module's own forward-only expand/contract runner (`DATA-01`) owns migration ordering, checksums, locking, recovery-point enforcement and the expand/contract policy. Kysely owns typed application queries and repositories only — it neither generates nor owns schema migrations. Constraints, composite tenant foreign keys, triggers, CHECK constraints, temporal rules and indexes stay expressed explicitly in SQL. Application code reaches the database only through `DATA-02`'s tenant-scoped repositories; an unscoped Kysely instance or `better-sqlite3` handle must never be spread into feature modules, which is the same boundary `DATA-02`'s SEC-001 architecture test enforces. | Plan §8 **Q13** — confirmed architecture decision, owner `01-app-data`; PRD §18.2 (which lists both options), §45.5. `DATA-01` carries the ADR decision input for [`docs/adr/0002-sqlite-access-layer.md`](../../adr/0002-sqlite-access-layer.md), authored by the `DATA-01` Builder at implementation time. An implementing agent must not re-open this choice — a Builder that believes it is falsified uses the ticket's feedback obligation and writes back to plan §8 Q13 and this file first (plan §8 standing note) |
| D12 | **The tenant layer's connection is passed, never ambient, and `GLOBAL` tables are written through their own transaction entry point.** `DATA-02` ships `withTenantTransaction(db, ctx, fn)`, `withSystemTransaction(db, systemCtx, fn)` and `definition.for(db, ctx)`: the `AppDatabaseHandle` is a first argument because D11 forbids a module-level handle, and it is absent from the `./tenant` public surface, so no consumer outside `packages/database` can supply one. The consumer shape is therefore that `DATA-04`…`DATA-07` export concrete, **pre-bound** repositories and transaction entry points; `RUNT-02` and every product module consume those, never the factory. | `DATA-02` deliverables 1, 3 and 6 (ticket amendment 2026-08-11); PRD §16.5, §35.6; plan §8 Q13's last clause — a two-argument `withTenantTransaction(ctx, fn)` could only find its connection in a module-level singleton, which is the exact thing SEC-001 exists to make unreachable |
| D13 | **Audit-sink failures are asymmetric: refusals are contained, grants fail closed.** A sink that throws while recording a refusal (`*_REFUSED`) is warned and swallowed, so an audit outage cannot convert a refusal into a different failure or unwind before the caller's own throw. A sink that throws while recording a `*_GRANTED` event propagates, so `crossTenantElevatedContext` grants nothing. `DATA-07` inherits this contract when it wires the real `audit_event` writer, and must not "improve" it into a best-effort write — an unrecorded break-glass elevation is the failure PRD §21.2's audited path exists to prevent. Ordering dependency recorded here per `DATA-02`'s Feedback obligation: the seam ships before the table. | PRD §21.2; `DATA-02` deliverable 8 (ticket amendment 2026-08-11); `DATA-07` owns `audit_event` |

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Drizzle for the application database layer** | Plan §8 **Q13** settles PRD §18.2's either/or in favour of Kysely-style repositories, on the grounds that the project has already fixed a raw-SQL migration contract (D2, plan §2.1 **A5**, PRD §44.3's serial-owned migration order, §20.4 expand/contract, §39.7 step 4) and carries a large set of explicit SQLite invariants (PRD §35.8's eight invariants, §35.1's storage conventions, §15.4/§35.1 composite tenant keys) — which suits Kysely-style repositories. Drizzle's schema-first definitions plus generated migrations would put a second schema source of truth beside the checked-in `.sql` files and `packages/contracts`' generated enum CHECKs, and its migration generator would contend with a serial-owned migration order it does not own. |
| Sequentially numbered migrations (`0002_`, `0003_`, …) | A shared counter is a shared write target: `DATA-04`…`DATA-07` would serialise on it and the module would drop to one lane. Rejected by plan A5. |
| Each product module owning its own tables | Recreates the `15-answer-product` ↔ `17-records-collab` cycle that A3 exists to remove (PRD §34.3 puts record creation inside the answer-admission transaction while records display answers), and is forbidden verbatim by PRD §45.2 and §44.3. |
| Whole-database encryption (SQLCipher) instead of field-level | PRD §35.1 says "Customer text columns are encrypted only where stated" and puts backup-level encryption at the S3 layer (§23.1). SQLCipher is not in the PRD §18.2 stack and complicates the Litestream path. |
| Deterministic / searchable encryption for `*_ciphertext` columns | Leaks equality across rows and tenants; nothing in the PRD requires searching ciphertext. |
| Ephemeral content in `app.sqlite` behind a TTL flag | Forbidden verbatim: PRD §10.4 — "Ephemeral content MUST be stored only in a local, non-replicated `ephemeral.sqlite`, not `app.sqlite`." |
| A shared `src/schema/index.ts` barrel to register tables | Four concurrent tickets writing one file (see D4). |
| Repository scoping by convention/review only, without the static test | SEC-001's minimum acceptance evidence *is* the static test: "Static/architecture test forbids unscoped repository import." |
| Putting lease **loops** in `packages/jobs` | PRD §45.2 assigns lease loops to `apps/worker`; `RUNT-04` owns them and is `blocked_by DATA-05`. |

## Open questions

Plan §8's decision register is authoritative for `Q1`–`Q14`. The only register entry owned by this
module, **Q13 (SQLite access layer)**, is a *confirmed architecture decision* and is recorded above
as **D11** — it is not an open question and must not be re-litigated in a ticket or in code. What
remains below are this module's own local questions.

| # | Question | Owner | Resolved by | Blocks |
|---|---|---|---|---|
| M-Q1 | §35.8 invariant 8 ("Active corpus promotion never mutates an existing release bundle") has **no app-database table** in the PRD §35.4–35.6 dictionary. Does promotion need an app-side, append-only corpus-pointer table, or is PRD §39.3's "Pointer recorded in app DB/audit" satisfied by `audit_event` alone? | `18-ops-release` — the `RLSE-07` Builder, with `04-corpus-contract` (`CRPS-06`) | `RLSE-07`. Interim position: `DATA-09` records invariant 8 as `OUT_OF_MODULE` and asserts only that no app repository exposes an update path to a corpus-release reference. | Nothing in this module |
| M-Q2 | Who holds the field-encryption KEK in production, and what is the rotation cadence? PRD §39.6 names the secret group; PRD §23.1 requires a forced recovery point before key rotation but sets no interval. | **Founder**, provisioned by `18-ops-release` (`RLSE-02`, `RLSE-05`) | `RLSE-02` / `RLSE-05` | Nothing — `DATA-03` ships multi-version key support and a rotation entry point regardless |
| M-Q3 | Property-testing library for `DATA-09`. PRD names none. | `01-app-data` — the `DATA-09` Builder | `DATA-09`. Classified "Implementation detail" under PRD §45.5 (documented in code/tests, no ADR), unless the choice adds a runtime dependency — then it is an ADR. | Nothing |
| M-Q4 | **Who owns the workspace dependency-build policy?** `DATA-01` declares the workspace's first native dependency (`better-sqlite3`, ADR `0002` (vi)), and pnpm 11 refuses to install it unless the **root** `pnpm-workspace.yaml` names it under `allowBuilds` — `strictDepBuilds` defaults to true and the package ships a `binding.gyp`, so an install that neither allows nor denies it exits `ERR_PNPM_IGNORED_BUILDS`. pnpm reads that policy from the workspace root only: `dependenciesMeta.built` and a `pnpm` block in `packages/database/package.json` were both measured and neither suppresses it, and both candidate versions trip it (`12.11.1` needs `true`, `13.0.3` needs `false`). So `DATA-01`'s own deliverable cannot be satisfied inside `DATA-01`'s file-scope, whose "Does not touch" list assigns root manifests to `00-foundation`. `DATA-01` shipped the minimal form — one key, one entry, `better-sqlite3: false` — under this entry rather than silently. | **`00-foundation`**, with the Architect: either allocate the `allowBuilds` key to `00-foundation` and move it there, or add it to `DATA-01`'s file-scope by a ticket edit | A `00-foundation` ticket, or a `DATA-01` ticket edit + `publish-tickets.mjs --sync`. Until then the key stays where it is: removing it makes every install in the repository fail, which is strictly worse than a declared exception. | Nothing today. Every later module that declares a native dependency hits the same root file, which is the contention the disjoint-file-scope decomposition exists to prevent — so it should be settled before a second one lands |

## Work breakdown

Lane is `01-app-data` and agent is `builder` for all nine tickets (plan §1.1). File-scope paths are
relative to the repository root; the module's outer bound is plan §4's write-owns row —
`packages/database/**` and `packages/jobs/**`.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`DATA-01`](tickets/DATA-01-migration-framework-expand-contract-policy-ordering.md) — Migration framework, expand/contract policy, ordering | M | `01-app-data` | `packages/database/src/migrate/**`, `packages/database/migrations/0001_*`, `docs/adr/NNNN-sqlite-access-layer.md` (new file, A9 — records the confirmed §8 Q13 decision, D11) | `FND-03` |
| [`DATA-02`](tickets/DATA-02-tenantcontext-repository-layer-unscoped-import-architecture-test.md) — TenantContext repository layer + unscoped-import architecture test | L | `01-app-data` | `packages/database/src/tenant/**`, `packages/database/test/architecture/**` | `DATA-01`, `FND-06` |
| [`DATA-03`](tickets/DATA-03-field-level-envelope-encryption-for-customer-text.md) — Field-level envelope encryption for customer text | M | `01-app-data` | `packages/database/src/crypto/**` | `DATA-01` |
| [`DATA-04`](tickets/DATA-04-tenancy-and-identity-tables-repositories.md) — Tenancy and identity tables/repositories | L | `01-app-data` | `packages/database/src/schema/tenancy.ts`, `packages/database/src/repos/tenancy/**`, `packages/database/migrations/*_tenancy.sql` | `DATA-02`, `DATA-03` |
| [`DATA-05`](tickets/DATA-05-execution-tables-packages-jobs-lease-primitives.md) — Execution tables + `packages/jobs` lease primitives | L | `01-app-data` | `packages/database/src/schema/execution.ts`, `packages/database/src/repos/execution/**`, `packages/database/migrations/*_execution.sql`, `packages/jobs/**` | `DATA-04` |
| [`DATA-06`](tickets/DATA-06-research-and-evidence-tables-immutable.md) — Research and evidence tables (immutable) | L | `01-app-data` | `packages/database/src/schema/research.ts`, `packages/database/src/repos/research/**`, `packages/database/migrations/*_research.sql` | `DATA-05` |
| [`DATA-07`](tickets/DATA-07-usage-monitor-issue-correction-audit-incident-tables.md) — Usage, monitor, issue/correction, audit, incident tables | L | `01-app-data` | `packages/database/src/schema/operations.ts`, `packages/database/src/repos/operations/**`, `packages/database/migrations/*_operations.sql` | `DATA-05` |
| [`DATA-08`](tickets/DATA-08-ephemeral-sqlite-store-expiry-sweeper-backup-exclusion.md) — `ephemeral.sqlite` store, expiry sweeper, backup exclusion | M | `01-app-data` | `packages/database/src/ephemeral/**` | `DATA-03` |
| [`DATA-09`](tickets/DATA-09-the-eight-database-invariants-property-tests.md) — The eight database invariants + property tests | M | `01-app-data` | `packages/database/src/invariants/**`, `packages/database/test/invariants/**` | `DATA-06`, `DATA-07` |

Per D8, each ticket may additionally write `packages/database/test/<its own area>/**`
(`migrate`, `architecture`, `crypto`, `tenancy`, `execution`, `research`, `operations`,
`ephemeral`, `invariants`) and, per D9, append to its package's own manifest/tsconfig.

### Lane shape (plan §7)

Six waves, peak two lanes — the narrowest module in the plan, and deliberately so:

```text
wave 1: DATA-01
wave 2: DATA-02 | DATA-03
wave 3: DATA-04 | DATA-08
wave 4: DATA-05
wave 5: DATA-06 | DATA-07
wave 6: DATA-09
```

Plan §7: *"`01-app-data` — an ordered migration sequence (PRD §44.3 names 'app migration order' as
serial-owned; §35.8 invariant 4 forces the tenancy → execution → research/operations FK order). The
two-lane width comes from splitting encryption and the ephemeral database out of that chain
(decision A5). Serialisation here is genuinely intrinsic and is the only place in the plan where it
is accepted."*

### Cross-module consumers (plan §6.2)

Every edge below is drawn in plan §6.2 and mirrored in the tickets' `blocks` frontmatter.

| This ticket | Unblocks |
|---|---|
| `DATA-01` | `DATA-02`, `DATA-03`, `RLSE-05` (Litestream replication and recovery-point validation) |
| `DATA-02` | `DATA-04`, `RUNT-02` (admission middleware), `EVID-07` (model gateway), `ASSR-01` (tenant-isolation attack suite) |
| `DATA-03` | `DATA-04`, `DATA-08`, `EVID-09` (BYOK encrypted credentials) |
| `DATA-04` | `DATA-05`, `AUTC-01` (Better Auth adapter), `IDNT-02` (invitation lifecycle routes) |
| `DATA-05` | `DATA-06`, `DATA-07`, `RUNT-03` (SSE replay), `RUNT-04` (worker runtime) |
| `DATA-06` | `DATA-09`, `ASK-01` (answer job admission), `RCRD-01` (record CRUD/ETag), `XPRT-01` (export job admission) |
| `DATA-07` | `DATA-09`, `EVID-08` (budget circuit breaker), `WTCH-01`, `WTCH-02`, `PLTF-09` (usage/audit endpoints), `INTL-09` (incidents and kill switches) |
| `DATA-08` | `ASSR-08` (restore/DR and backup-exclusion assertions) |
| `DATA-09` | `ASSR-05` (integration suite: idempotency, SSE resume, cancel, charge invariants) |

## Acceptance — what makes the whole module done

The module is done when all nine tickets are `done` and the following hold on the default branch.
Every item is machine-checkable unless tagged otherwise.

1. `pnpm test` is green, including `packages/database` and `packages/jobs`. No Rust or Python is
   touched by this module, so `cargo test --workspace` and `uv run pytest` are unaffected
   (PRD §45.3).
2. **PRD §44.2 `E04-APPDB` exit evidence — "Migration/invariant/isolation tests"** — all three
   classes exist and run offline: migration (`DATA-01`), invariant (`DATA-09`), isolation
   (`DATA-02`).
3. **PRD §20.3 CI gate "Migration and tenant-schema validation"** has a runnable target: a clean
   database migrates from empty to head, the schema-convention linter passes for every table
   (PRD §35.1), and re-running the migration is a no-op.
4. **SEC-001** — "Every tenant repository requires `TenantContext`"; minimum acceptance evidence
   "Static/architecture test forbids unscoped repository import" — the architecture test exists and
   fails on a deliberately violating fixture. Per D11 the test also covers the Kysely instance: no
   file outside `packages/database` may import `kysely` or `better-sqlite3`.
5. Every table named in **PRD §35.4, §35.5, §35.6 and §35.7** exists with the required columns and
   the listed critical constraints/indexes, asserted by a literal expectation table in tests.
6. All eight **PRD §35.8** invariants appear in the `DATA-09` registry, each with an enforcement
   mechanism and at least one property test — except invariant 8, recorded `OUT_OF_MODULE` with
   `RLSE-07` named (M-Q1).
7. Persistence halves of the downstream requirement IDs are in place and tested at the repository
   boundary: **AUTH-002/003/006** (`DATA-04`), **ANS-003** idempotency/job-event replay and
   **ANS-004** pinned release + profile (`DATA-05`, `DATA-06`), **REC-001** immutable turns and
   snapshots (`DATA-06`), **MON-001**, **COR-001/002**, **ADM-003**, **OPS-003** ledger
   (`DATA-07`), **PII/retention** ephemeral expiry and backup exclusion (`DATA-08`, PRD §10.4).
8. [`docs/adr/0002-sqlite-access-layer.md`](../../adr/0002-sqlite-access-layer.md) exists and
   **records** the confirmed plan §8 **Q13** decision — Kysely-style repositories over
   `better-sqlite3` accepted, Drizzle recorded as the rejected alternative on the grounds stated in
   "Rejected alternatives" — with Status, Context, Decision, Consequences and Alternatives sections,
   and D11 above carries that assigned path. The ADR was written by the `DATA-01` Builder at
   implementation time, and it records a decision that is already made rather than making one. `[machine]` — no Drizzle dependency appears in
   `packages/database/package.json`, `packages/jobs/package.json` or the root lockfile entries for
   those packages. `[human]` — the ADR is accepted at the PRD §45.5 compatibility/security review
   for an Architecture decision.
9. Every merged PR states the PRD §45.4 items (requirement IDs, schema/API/event compatibility,
   tenant/PII/security and retention impact, rollback path, known gaps).

## Changelog

- **v0.4 — 2026-08-11** — `DATA-02` implementation + review round 1, under the ticket's Feedback
  obligation. Adds decisions **D12** (the tenant layer's connection is passed, never ambient:
  `withTenantTransaction(db, ctx, fn)` and `definition.for(db, ctx)` — the ticket previously wrote
  `withTenantTransaction(ctx, fn)`, which is only implementable via the module-level handle D11 and
  SEC-001 forbid; the intended consumer shape is `DATA-04`…`DATA-07` exporting pre-bound
  repositories, which is what `RUNT-02` consumes) and **D13** (audit-sink failures are asymmetric:
  refusals contained, `*_GRANTED` fails closed — the ordering dependency `DATA-07` inherits when it
  wires `audit_event`). `DATA-02`'s ticket carries the matching amendment: deliverable 6 gains
  `withSystemTransaction` so a `GLOBAL` repository's `insert` is reachable at all (`DATA-06` needs it
  for `detected_change`, PRD §35.6), deliverable 8 states the asymmetry, and the File-scope names the
  two consequential paths the authorised `kysely` declaration forces — `pnpm-lock.yaml` and a
  one-line expected-dependency-set update in `DATA-01`'s `q13-conformance.test.ts` (whose own comment
  anticipates this ticket). No change to module scope, ticket set, dependency edges, PRD
  traceability, the §35.8 invariants or D1–D11.
- **v0.3 — 2026-08-08** — `DATA-01` delivered the access-layer ADR; **D11** and acceptance item 8
  now name the assigned path `docs/adr/0002-sqlite-access-layer.md` (`0001` was taken by
  `EVID-02`'s `0001-local-pii-entity-runtime.md` before this ticket ran). Path assignment only — no
  decision, scope, ticket, dependency-edge or traceability change. Adds **M-Q4** to Open questions:
  `DATA-01`'s declared `better-sqlite3` dependency cannot be installed without a root
  `pnpm-workspace.yaml` build-policy key, which its file-scope assigns to `00-foundation` — raised
  under the ticket's Feedback obligation rather than resolved locally.
- **v0.2 — 2026-08-03** — plan §8 rewritten as a decision register; **Q13 (SQLite access layer) is
  now a confirmed architecture decision** — Kysely-style repositories over `better-sqlite3`, Drizzle
  rejected. Q13 removed from "Open questions" and recorded as decision **D11**; Drizzle added to
  "Rejected alternatives"; acceptance item 8 rewritten so the ADR *records* the confirmed decision
  (authored by the `DATA-01` Builder; `docs/adr/` is still empty) and acceptance item 4 extended to
  the Kysely instance. No change to scope, tickets, dependency order, `blocked_by`/`blocks` edges,
  PRD traceability, the §35.8 invariants, §44.3 serial ownership of the migration order, or plan
  decisions A3/A5.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.2 (phase 1,
  first decomposition; `docs/adr/` empty, so every ticket cites the PRD directly).
