# 23-assurance — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.24 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `23-assurance` |
| Lane | `23-assurance` |
| Ticket prefix | `ASSR` |
| Tickets | 8 (`ASSR-01` … `ASSR-08`) |
| PRD epics | `E28` (threat/security surface) and `E34` (closure) |
| Requirement families | `SEC-001`, `SEC-002`, `SEC-003`, `PII-001`, `PII-002`, `OPS-001`; contributes evidence to `AUTH-002`, `ANS-003`, `ANS-005`, `EXP-002`, `MON-001`, and the whole PRD §41.2 `UAT-*` set |
| Depends on modules | `01-app-data`, `05-ingestion-framework`, `12-evidence-safety`, `13-identity-surface`, `14-search-product`, `15-answer-product`, `16-monitor-alerts`, `17-records-collab`, `18-ops-release`, `19-exports`, `20-developer-platform` |
| Modules that depend on this one | `24-launch` (`LNCH-05` — Definition-of-Done closure) |
| Languages | TypeScript only (`tests/**`) |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.1 (2026-08-03) |

## Problem

PRD §20.1 puts four directories outside every product package:

```text
tests/{integration,tenant-isolation,security,e2e}
```

and PRD §45.2 gives them one job and one prohibition:

> | `tests` | Cross-boundary e2e/security/isolation/restore | Blind gold exposed to normal fixtures |

Three of the product's hardest promises **cannot be proved inside any one module**, because each one
is an assertion about what happens *between* modules:

1. **Tenant isolation is a whole-request property.** PRD §21.2 does not ask for a scoped-repository
   unit test; it demands *"Automated tests MUST cover read/write/delete/export/download and queued-job
   tenant attacks."* `packages/database` can prove its repository refuses an unscoped query
   (`SEC-001`, owned by `DATA-02`); only a suite that authenticates as organisation A and issues real
   HTTP and real queued-job requests for organisation B's identifiers can prove the property the
   customer actually buys — PRD §16.5's *"Other-tenant and absent opaque IDs return the same not-found
   response."*
2. **PII no-leak is an assertion about artifacts, not about a function's return value.** PRD §10.1
   makes the server *"the authoritative PII boundary **before logging, persistence or provider
   calls**"*. `packages/pii` can prove the detector fires. Only a suite that submits a canary through
   the real API, then reads the log sink bytes, both SQLite files and the recorded provider payload,
   can prove `PII-001`'s evidence — *"Canary PII is absent from DB/log/provider fixture"* (PRD §30.2
   `ANS-002`).
3. **A safe answer is the product of five modules in sequence.** PRD §18.5's answer runtime crosses
   `apps/api` → `packages/database` → `apps/worker` → `services/search-rs` →
   `packages/{citations,model-gateway}` and back. *"At-least-once execution plus idempotency and
   immutable unique results MUST provide one observable answer and no duplicate charge"* is true or
   false only end to end.

PRD §20.3 then makes these suites **release gates**, not optional extras: *"Tenant isolation, auth and
permission tests"* and *"PII and citation validation suites"* run on every pull request, and
*"Release candidates additionally run integration, restore, evaluation, compatibility and rollback
tests."* PRD §26 repeats them as Definition-of-Done items, and `LNCH-05` is `blocked_by` four of this
module's eight tickets.

## Scope

In scope — this module's breakdown plan §4 write-owns row is the whole of `tests/**`:

- `tests/tenant-isolation/**` — the PRD §21.2 cross-organisation attack matrix (`ASSR-01`).
- `tests/security/{ssrf,injection,xss,supply-chain}/**` — the PRD §21 untrusted-input surfaces
  (`ASSR-02`); `tests/security/pii/**` — the PRD §10.1 no-leak canary suite (`ASSR-03`).
- `tests/integration/{citations,jobs,sse,idempotency,recovery}/**` — the PRD §36.6/§36.8 answer-safety
  behaviour end to end (`ASSR-04`), the PRD §18.5/§33.2/§35.8 execution invariants (`ASSR-05`) and the
  PRD §23.2/§42.3 restore drill (`ASSR-08`).
- `tests/e2e/{uat,accessibility}/**` — automation of the PRD §41.2 acceptance scripts (`ASSR-06`) and
  the PRD §13.1 / §41.1 accessibility and responsive suite (`ASSR-07`).

### What this module is **not**

**It does not replace the per-module tests every other module's tickets already own.** Breakdown plan
§1.1 is explicit: *"Unit/integration tests live inside the owning package or app and belong to that
module's tickets. Only the PRD §20.1 cross-boundary suites (`tests/{integration,tenant-isolation,
security,e2e}`) belong to `23-assurance`. A ticket never writes into another module's tree to satisfy
its own acceptance."*

Concretely, this module does **not** own and does **not** duplicate:

- `DATA-02`'s unscoped-import architecture test (`packages/database/test/architecture/**`) — that *is*
  `SEC-001`'s named acceptance evidence and stays there;
- `DATA-09`'s eight §35.8 invariant property tests;
- `INGF-02`'s own fetcher unit matrix, `INGF-06`'s parser-isolation tests;
- `EVID-05`'s twelve §36.6 check fixtures, `EVID-10`'s sanitiser fixtures, `EVID-03`'s availability
  split unit tests;
- `RUNT-03`'s SSE replay unit tests, `RUNT-04`'s lease/fairness tests;
- any product module's screen tests, route tests or contract snapshots.

This module is the **cross-boundary layer only** — the suites no single module can write, because
they assert across module boundaries. Breakdown plan **R8** states the intended relationship in one
line: *"every product ticket carries its own co-located tenant/PII/citation assertions (PRD §45.4), so
`23-assurance` **confirms rather than discovers**."*

It also does not own: CI workflow files (`.github/workflows/**` — `00-foundation`/`FND-02`), root
scripts or manifests (`FND-01`), the evaluation dataset, metrics or gates (`21-evaluation-600`), the
release evidence pack itself (`GOLD-03`/`LNCH-05`), any production code, any adapter, any screen, and
anything under `evals/**`.

## Decisions

Each decision names its basis: a PRD section, a breakdown plan rule, or an upstream module's sub-PRD.
Where the PRD does not answer, the item is an open question below, not a decision.

| # | Decision | Basis |
|---|---|---|
| D1 | **No suite writes into another module's tree, ever — not even to make an assertion pass.** A suite that fails because another module's code is wrong has found that module's defect: file it against the owning ticket and leave the assertion at full strength. Weakening an assertion, adding a local shim, or "fixing" the other module from `tests/**` is the one thing this module must never do. | Breakdown plan §1.1 (Tests) and §4; PRD §45.2; CLAUDE.md issue #53. |
| D2 | **Confirm, do not discover.** Each suite asserts a *cross-boundary* property; the per-module half of the same property stays with its owner and is cited, not re-implemented. | Breakdown plan **R8**; PRD §45.4 (*"Changes to tenant tables include cross-tenant tests"* — co-located, per module). |
| D3 | **A suite never skips.** Every assertion is anchored in its ticket's `blocked_by` transitive closure, so it can always run. A PRD-required assertion whose surface is outside that closure goes into the suite's own `coverage-gaps.md` with the owning ticket and the exact plan §5.24 + §6.2 edge that would close it — never a conditional skip, never an invented DAG edge. | Breakdown plan §6.2 (`dag-scan.mjs` fails on dangling/cyclic edges); CLAUDE.md ("a filter that removes work silently is indistinguishable from work that ran"). |
| D4 | **Suites boot the system in process, not through Compose.** `RUNT-09` (`infra/compose/**`, `pnpm stack:up`) is in no `ASSR-*` blocker closure, so no suite may require it. The API comes from `RUNT-01`'s `buildApp(config)` in `apps/api/src/app.ts` driven by Fastify `inject()`; the worker comes from `RUNT-04`'s lease loops started directly; the databases are `mkdtemp` SQLite files migrated with `DATA-01`'s runner. | Breakdown plan §5.24 (no `RUNT-09` edge); PRD §39.1; `RUNT-01` deliverable 8; `RUNT-04` deliverables 5 and 9. |
| D5 | **Offline, no network, no production credentials, no blind gold.** Every outbound boundary is a local stub inside the suite's own tree: model provider → `EVID-07`'s stub/cassette profile; S3 and R2 → a filesystem-backed object-store fake; email and webhook → a local sink; DNS/HTTP for the ingestion fetcher → a local resolver plus a connection recorder. No `ASSR-*` test reads `evals/**`. | PRD §20.2 *"Coding agents MUST NOT receive production SSH, database, backup, signing or provider credentials by default"*; §45.1 item 6; breakdown plan §4.2 (`evals/gold/**` row) and **R9**. |
| D6 | **Every fixture is synthetic and authored inside `tests/**`.** Canary tokens are invented, documented, unique per suite and never real personal data. Two synthetic organisations (`ORG_ALPHA`, `ORG_BETA`) with fixed opaque IDs are the standing tenancy fixture shape. | PRD §45.1 item 6; §10.2; breakdown plan §4.2. |
| D7 | **Each ticket owns its own `harness/` inside its own subtree; there is no shared `tests/_harness/**`.** Disjoint write-sets are what make the eight tickets safe to run as parallel lanes (plan §2). Where a boot helper already exists in an owning module's published test surface — `RUNT-04`'s `apps/worker/test/handler-area-conformance.ts`, `EVID-05`'s `./testing` export, `DATA-08`'s `assertNotBackedUp` — the suite imports it rather than re-deriving the semantics. | Breakdown plan §2 and §5.24 (file-scopes are disjoint); the `./testing`-export pattern established by `EVID-05` deliverable 11. |
| D8 | **The tenant-isolation suite performs real attacks.** It authenticates as a member of organisation A and issues real requests — HTTP, signed download URL, SSE subscription and enqueued job — naming organisation B's identifiers, then asserts the response is byte-identical to the response for an identifier that does not exist. Asserting that a helper returns a scoped connection is explicitly **not** sufficient here; that assertion is `DATA-02`'s. | PRD §21.2; §16.5; §30.2 `AUTH-002` (*"Cross-tenant ID matrix returns indistinguishable 404"*); §41.2 `UAT-AUTH-03`. |
| D9 | **The PII suite proves absence on artifacts.** For each of PRD §10.1's three named paths — logging, persistence, provider calls — the assertion is a byte search for the canary in the produced artifact (log sink output, the raw bytes of `app.sqlite` and `ephemeral.sqlite` including WAL, the recorded outbound provider payload, the HTTP response body, the audit rows and the metric labels). A detector that returned "blocked" proves nothing about what was written before it ran. | PRD §10.1; §37.2 (*"Blocked request bodies are held only in request memory"*, *"Metrics record category/count/result, not content or reversible hash"*); §37.3 row "Blocked raw PII — Never/Never/Never/Never". |
| D10 | **Which §20.3 gate each suite belongs to is fixed here.** Per-PR gates: `ASSR-01` (*"Tenant isolation, auth and permission tests"*), `ASSR-03` and `ASSR-04` (*"PII and citation validation suites"*), `ASSR-02` (*"Dependency, secret, container and artifact scans"* plus `SEC-002`/`SEC-003`). Release-candidate gates: `ASSR-05`, `ASSR-06`, `ASSR-07`, `ASSR-08` (*"Release candidates additionally run integration, restore, evaluation, compatibility and rollback tests"*). Per-PR suites are exposed as the member's `test` script; RC suites as its `test:integration` script, which `FND-01`'s root `test:integration` already delegates to and already names this module as the owner of. | PRD §20.3; `FND-01` deliverable 2. |
| D11 | **Timing-class assertions are coarse and statistical.** `UAT-AUTH-03` requires the *"Same 404 shape/timing class as unknown ID"*. Shape is asserted byte-identically; timing is asserted as a *class* over N samples with a documented, generous band, and the method is recorded in the suite. A tight timing constant would be a flaky test, which is worse than none. | PRD §41.2 `UAT-AUTH-03` (the PRD says "class", not a number); open question **M-Q5**. |
| D12 | **The PRD §41.2 table is transcribed data, not prose.** `tests/e2e/uat/uat-matrix.json` carries all **32** `UAT-*` rows verbatim (id, setup/action, expected result) plus, per row, the suite that automates it and its status. A renamed, merged or missing row fails the suite. | PRD §41.2; the same device `EVID-05` uses for the §36.6 table and `FND-01` for the §20.1 layout. |
| D13 | **Accessibility is automated *and* human.** Automated WCAG 2.2 AA rule scanning at 360/768/1280 px is necessary and not sufficient; `ASSR-07` therefore carries explicit `[human]` criteria for keyboard order, focus visibility and screen-reader announcement quality, which no scanner decides. | PRD §13.1 *"WCAG 2.2 AA is the release target"*; §41.1; breakdown plan §1.1 acceptance-tag mapping. |
| D14 | **Restore/DR assertions reuse the owners' primitives.** The backup-exclusion assertion calls `DATA-08`'s `assertNotBackedUp(globs)` / `EPHEMERAL_FILE_GLOBS` instead of re-deriving glob rules, and the drill runs inside `RLSE-09`'s isolated recovery environment with email, webhook, provider and SSO egress denied. | PRD §39.3 (*"A CI/restore test asserts that `ephemeral.sqlite` and corpus files are absent from the Litestream destination"*); §23.2; §42.3; `DATA-08` deliverable 8. |
| D15 | **CI wiring is `00-foundation`'s.** A suite that needs a new CI job, a new root script or a workflow change raises a docs PR against `FND-02` / `FND-01`; it never edits `.github/workflows/**` or the root `package.json`. Each suite must be runnable from its own workspace member with one command. | Breakdown plan §4 (write-owns rows); `FND-01` deliverable 2. |
| D16 | **Manifest layout.** `tests/{integration,tenant-isolation,security,e2e}/package.json` and `tsconfig.json` are created by `FND-01` (its deliverable 7, and `pnpm-workspace.yaml` already globs `tests/*`). Inside this module they are **append-only, module-shared** — a ticket adds only its own scripts and dependencies. The root `pnpm-lock.yaml` is regenerated as a build artifact and never hand-merged. | Breakdown plan §1.1 (Package manifests); PRD §44.3; `FND-01` deliverables 1, 2, 7. |
| D17 | **Determinism is a requirement of this module, not a nice-to-have.** Fixed seeds, injected clocks, no wall-clock sleep as a synchronisation device, no dependence on test-file ordering, no shared mutable temp path. A flaky cross-boundary suite trains people to ignore a release gate; a flake here is this module's defect. | PRD §20.3 (these are gates); PRD §43.4 item 1 (cross-tenant/PII/security failures are reviewed first — they must be trustworthy). |
| D18 | **No suite asserts against `/internal/v1` or `apps/admin`.** Breakdown plan §6.1 gives `23-assurance` no edge to `22-internal-admin`; `ADM-001`'s evidence (*"Customer identity cannot call internal routes"*) is `INTL-01`'s own. Recorded as **M-Q4**. | Breakdown plan §6.1, §5.24; PRD §30.2 `ADM-001`. |

## Rejected alternatives

| Rejected | Why |
|---|---|
| A shared `tests/_harness/**` imported by all eight suites. | It is a single contested write-set across six concurrent lanes — exactly what breakdown plan §2 draws module boundaries to avoid. Making it a ticket everything is `blocked_by` adds a wave and a bottleneck to a module the plan schedules in 2 waves (§7). If duplication becomes a real cost, the correct move is a plan §5.24 docs PR adding that ticket — not a silently shared directory (D7). |
| Re-implementing per-module unit tests here so "all the tests are in one place". | Breakdown plan §1.1 forbids it, and it inverts **R8**: the suites would discover rather than confirm, and every product module would lose the co-located assertions PRD §45.4 requires of its own PRs. |
| Weakening an assertion (or marking it `skip`/`todo`) when another module's code fails it. | D1. The failure *is* the finding. PRD §43.4 ranks cross-tenant/PII/security failures first in the founder review queue; a suite that goes green by lowering its own bar removes the only signal. |
| Proving `SEC-001` only by re-running `DATA-02`'s static import test from `tests/**`. | PRD §21.2 asks for read/write/delete/export/download and queued-job **attacks**. A static test cannot show that a real request for another tenant's export artifact is denied (D8). The static test stays where its requirement names it. |
| Running the suites against real Cloudflare R2 / AWS S3 / a real model provider in CI. | PRD §20.2 forbids giving agents production credentials by default, and PRD §24.1 caps the model budget at approximately A$12/month. D5 replaces every one of them with a local stub. |
| Using `evals/gold/**` cases as fixtures, since they already encode expected behaviour. | Breakdown plan §4.2 and **R9**; PRD §14.3 and §45.1 item 6 keep blind gold outside ordinary coding-agent context. This module authors its own synthetic fixtures. |
| Driving E2E through `pnpm stack:up` (Docker Compose). | `RUNT-09` is in no `ASSR-*` blocker closure (plan §5.24), and PRD §39.2 marks Compose development/CI-only while production is systemd — an E2E suite bound to Compose would test a topology production does not use. D4. |
| One combined `tests/assurance/**` suite instead of eight subtrees. | It would be one write-set for eight tickets; breakdown plan §7 requires ≥2 useful lanes per module and computes 6 for this one. |
| Putting the `UAT-*` matrix in `docs/` next to the acceptance manual. | `docs/PRD.md` is frozen (plan §4) and the other `docs/` subtrees belong to `18-ops-release` and `24-launch`. The matrix is test data and lives with the suite that executes it (D12). |
| Asserting the PRD §14.2 numeric gates (recall@10, citation precision, correct-refusal rate) in `ASSR-04`. | Those are measured over the 600-case dataset by `21-evaluation-600` (`GOLD-02`, `GOLD-03`). `ASSR-04` asserts **behaviour** — that the validator rejects, the counters increment, and the §36.8 table's outcome is produced — on synthetic fixtures. Two owners for one number is how a gate silently drifts. |
| A "smoke" E2E that walks the happy path only. | PRD §41.3 is explicit that a demonstration showing *"only fluent positive answers misrepresents the product's safety value"*; the automated set carries the refusal, expiry, denial and unavailable rows too. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **M-Q1** | **No ticket in breakdown plan §5 owns `security.txt` or the vulnerability-reporting address**, which PRD §21.1 requires as a control. It is not an `apps/api` route in any §5 file-scope, not in `infra/cloudflare/**`, and not in `apps/web/public-site/**`. | `18-ops-release` (`RLSE-03`, edge/origin) or `24-launch` (`LNCH-03`, public site) — the Founder picks the surface | A breakdown plan §5 docs PR creating the owning ticket; `ASSR-02` records it in `tests/security/supply-chain/coverage-gaps.md` until then | PRD §26 "Security/privacy" closure via `LNCH-05` | PRD §21.1; plan §5.19, §5.25 |
| **M-Q2** | **Which browser-automation and accessibility-rule runtime the E2E suites use.** The PRD requires the outcome (§13.1 WCAG 2.2 AA, §41.1 three widths, keyboard, screen-reader labels) and names no tool. This is a durable dependency that must be pinned and installable offline. **ADR candidate** (PRD §45.5 "Architecture decision"). | `23-assurance` (`ASSR-06`) | `ASSR-06`, which records the choice in a new `docs/adr/NNNN-e2e-browser-and-accessibility-runtime.md` (plan **A9**: the creating ticket claims the file). `ASSR-07` consumes it and adds none of its own | Nothing — `ASSR-06`'s matrix-completeness assertions run without a browser | PRD §13.1, §41.1, §21.1 (*"no arbitrary runtime plugin/model/code download"*), §45.5 |
| **M-Q3** | **The `UAT-*` rows `ASSR-06`'s blocker closure cannot reach** — `UAT-AUTH-04` (needs `IDNT-05`), `UAT-ANS-02` (needs `ASK-03`), `UAT-MON-02` (needs `WTCH-05`), `UAT-OPS-01` (needs `RLSE-07`/`CRPS-06`), `UAT-REC-01` (needs `RCRD-03`), and `UAT-EXP-01`'s correction banner (needs `RCRD-07`). | `23-assurance` proposes; the edge is a breakdown plan §5.24 + §6.2 change | A docs PR adding the `blocked_by` edges to `ASSR-06`, then `publish-tickets.mjs --sync`. Until then they are listed in `tests/e2e/uat/coverage-gaps.md` and remain `[human]` §41.2 rows at Gate 2 | PRD §26 "English UI, accessibility and responsive requirements pass release review" completeness | Plan §5.24, §6.2; PRD §41.2 |
| **M-Q4** | **Whether cross-tenant coverage of `/internal/v1` belongs in `ASSR-01`.** `ADM-001`'s evidence is *"Customer identity cannot call internal routes"*, but plan §6.1 gives `23-assurance` no dependency on `22-internal-admin` and `ASSR-01` has no `INTL-*` blocker. | `22-internal-admin` (`INTL-01`) owns the assertion today | `INTL-01`'s own tests. Promoting it to a cross-boundary suite needs a plan §5.24 edge (`ASSR-01 blocked_by += INTL-01`) and would add a module edge `22 → 23` to §6.1 | Nothing today | Plan §6.1, §5.23, §5.24; PRD §30.2 `ADM-001`, §8.11 |
| **M-Q5** | **The timing-class method and tolerance for `UAT-AUTH-03`.** The PRD says *"same 404 shape/timing class"* and gives no number; the tolerance is a risk statement, not an engineering constant. | `23-assurance` (`ASSR-01`) proposes the method and the measured band; **Founder** accepts the residual risk | `ASSR-01` (records the method and the measured distribution in this README) | Nothing — response-shape identity is absolute and is asserted byte-for-byte regardless | PRD §41.2 `UAT-AUTH-03`; §21.2 |
| **M-Q6** | **The configured PII recall target** (`PII-001`: *"Synthetic PII suite meets **configured** recall and zero raw logging"*). Carried forward from `12-evidence-safety` **Q-EVID-2**. | **Founder** (product/risk, PRD §45.5), staged through `12-evidence-safety` | `EVID-02` measures per category; `ASSR-03` re-measures end to end on its own canary corpus and reports | Nothing — zero-raw-leak is absolute today and is what `ASSR-03` gates on | PRD §30.2 `PII-001`, §10.1, §37.1 |
| **M-Q7** | **Where the release-candidate suites run and under what time budget.** PRD §20.3 says RCs *additionally* run integration/restore/evaluation/compatibility/rollback, but the job definition lives in `.github/workflows/**`. | `00-foundation` (`FND-02`) | `FND-02`; these tickets supply runnable per-member targets only (D10, D15) | Nothing here | PRD §20.3; plan §4 |
| **M-Q8** | **Whether a root `pnpm test:e2e` script should exist.** PRD §45.3's command list has `pnpm test` and `pnpm test:integration` but no E2E entry, and `FND-01`'s root `package.json` defines exactly ten script names. | `00-foundation` (`FND-01`) | Interim position (no change needed): `tests/e2e` exposes `test` (matrix and gap-register assertions, no browser) and `test:integration` (the browser run), so the existing root delegation reaches both. A dedicated alias is a docs PR against `FND-01` | Nothing | PRD §45.3; `FND-01` deliverable 2 |
| **M-Q9** | **No ticket in breakdown plan §5.14 owns `apps/web/src/features/auth/**`.** Plan §4 assigns the tree to `13-identity-surface`, but that module's ticket rows cover only `features/settings/{members,security}` (`IDNT-08`) and `features/settings/{sso,data}` (`IDNT-09`). The login and accept-invite screens PRD §31.2 requires therefore have no owner, which is why `UAT-AUTH-01`'s browser half and the login route's accessibility scan cannot be asserted. | `13-identity-surface` — a new ticket in plan §5.14 | A breakdown plan §5.14 + §6.2 docs PR creating the ticket and, if the suites should assert it, an `ASSR-06 blocked_by` edge. `ASSR-06` and `ASSR-07` record it in their `coverage-gaps.md` until then | `UAT-AUTH-01`'s browser half; the login/accept-invite accessibility scan; PRD §26 Product closure via `LNCH-05` | Plan §4, §5.14; PRD §31.2, §41.2 `UAT-AUTH-01`, §13.1 |

## Work breakdown

Lane is `23-assurance` and agent is `builder` for all eight tickets (breakdown plan §1.1). File-scopes
are exactly breakdown plan §5.24, are relative to the repository root, and are disjoint between
tickets. `depends-on` is exactly breakdown plan §5.24.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`ASSR-01`](tickets/ASSR-01-tenant-isolation-attack-suite.md) — Tenant-isolation attack suite | L | `23-assurance` | `tests/tenant-isolation/**` | `RCRD-08`, `XPRT-05`, `PLTF-09`, `DATA-02` |
| [`ASSR-02`](tickets/ASSR-02-security-suite-ssrf-decompression-injection-xss-supply-chain.md) — Security suite: SSRF, decompression, injection, XSS, supply chain | L | `23-assurance` | `tests/security/{ssrf,injection,xss,supply-chain}/**` | `INGF-02`, `EVID-10`, `RLSE-01` |
| [`ASSR-03`](tickets/ASSR-03-pii-no-leak-suite-with-canaries.md) — PII no-leak suite with canaries | M | `23-assurance` | `tests/security/pii/**` | `EVID-02`, `ASK-01` |
| [`ASSR-04`](tickets/ASSR-04-citation-validation-and-refusal-behaviour-suite.md) — Citation-validation and refusal-behaviour suite | M | `23-assurance` | `tests/integration/citations/**` | `EVID-05`, `ASK-02` |
| [`ASSR-05`](tickets/ASSR-05-integration-suite-idempotency-sse-resume-cancel-charge-invariants.md) — Integration suite: idempotency, SSE resume, cancel, charge invariants | L | `23-assurance` | `tests/integration/{jobs,sse,idempotency}/**` | `ASK-03`, `ASK-05`, `XPRT-01`, `DATA-09` |
| [`ASSR-06`](tickets/ASSR-06-e2e-automation-of-the-41-2-manual-acceptance-scripts.md) — E2E automation of the §41.2 manual acceptance scripts | L | `23-assurance` | `tests/e2e/uat/**`, `docs/adr/NNNN-e2e-browser-and-accessibility-runtime.md` (new file, **A9**) | `FIND-04`, `ASK-09`, `ASK-12`, `RCRD-09`, `WTCH-08`, `XPRT-05`, `IDNT-08` |
| [`ASSR-07`](tickets/ASSR-07-accessibility-and-responsive-suite.md) — Accessibility and responsive suite | M | `23-assurance` | `tests/e2e/accessibility/**` | `ASSR-06` |
| [`ASSR-08`](tickets/ASSR-08-restore-dr-and-backup-exclusion-assertions.md) — Restore/DR and backup-exclusion assertions | M | `23-assurance` | `tests/integration/recovery/**` | `RLSE-09`, `DATA-08` |

Standing module-shared exceptions (breakdown plan §1.1 "Package manifests", D16):

- `tests/tenant-isolation/package.json` + `tsconfig.json` — `ASSR-01` only.
- `tests/security/package.json` + `tsconfig.json` — shared **append-only** by `ASSR-02` and `ASSR-03`
  (concurrent in wave 1; own scripts and dependencies only).
- `tests/integration/package.json` + `tsconfig.json` — shared **append-only** by `ASSR-04`, `ASSR-05`
  and `ASSR-08` (concurrent in wave 1).
- `tests/e2e/package.json` + `tsconfig.json` — shared **append-only** by `ASSR-06` and `ASSR-07`
  (serialised by the `ASSR-06 → ASSR-07` edge).

All four are created by `FND-01`. Conflicts resolve by re-running the package manager, never by hand
merge; `/start-all` serialises delivery (plan §1.1).

### Lane shape (breakdown plan §7: **2 minimum waves, 6 useful lanes, not fully serial**)

External blockers in brackets:

```text
wave 1  ASSR-01 [RCRD-08, XPRT-05, PLTF-09, DATA-02]
        ASSR-02 [INGF-02, EVID-10, RLSE-01]
        ASSR-03 [EVID-02, ASK-01]
        ASSR-04 [EVID-05, ASK-02]
        ASSR-05 [ASK-03, ASK-05, XPRT-01, DATA-09]
        ASSR-06 [FIND-04, ASK-09, ASK-12, RCRD-09, WTCH-08, XPRT-05, IDNT-08]
        ASSR-08 [RLSE-09, DATA-08]
wave 2  ASSR-07 [ASSR-06]
```

Seven of the eight tickets have no intra-module blocker; the single intra-module edge is
`ASSR-06 → ASSR-07`, because `ASSR-07` reuses `ASSR-06`'s browser runtime and page-object set rather
than choosing a second one (M-Q2). At concurrency 6 the module still finishes in the minimum 2 waves,
which is exactly plan §7's "max useful lanes = 6".

### Cross-module consumers (breakdown plan §6.2)

Every edge below is drawn in plan §6.2 and mirrored in the tickets' `blocks` frontmatter.

| This ticket | Unblocks |
|---|---|
| `ASSR-01` | `LNCH-05` (Definition-of-Done closure and release evidence assembly) |
| `ASSR-02` | — (no dependent in plan §6.2) |
| `ASSR-03` | — (no dependent in plan §6.2) |
| `ASSR-04` | — (no dependent in plan §6.2) |
| `ASSR-05` | `LNCH-05` |
| `ASSR-06` | `ASSR-07` |
| `ASSR-07` | `LNCH-05` |
| `ASSR-08` | `LNCH-05` |

`ASSR-02`, `ASSR-03` and `ASSR-04` have no dependent ticket because they are per-PR CI gates (D10):
their output is a gate that must be green on every branch, not an artifact another ticket consumes.

## Acceptance — what makes the whole module done

The module is done when all eight tickets are delivered (`/verify-delivery` green each) **and**:

1. **`SEC-001` — every tenant repository requires `TenantContext`, proved at runtime.** The
   cross-organisation matrix in `ASSR-01` covers read, write, delete, export, download and queued-job
   attacks (PRD §21.2 verbatim), and every cell returns the **byte-identical** `404
   RESOURCE_NOT_FOUND` body the same identifier-does-not-exist request returns, in the same timing
   class. Organisation switching leaks no state, and a scoped service credential from one
   organisation cannot reach another. (PRD §30.2 `SEC-001`, `AUTH-002`; §16.5; §21.2; §41.2
   `UAT-AUTH-03`.)
2. **`SEC-002` — source fetches enforce allowlist, DNS/IP/redirect/type/size/time limits.** `ASSR-02`'s
   SSRF suite drives `INGF-02`'s fetcher through the full PRD §37.4 matrix — non-allowlisted domain,
   plain HTTP, loopback/private/link-local/multicast/cloud-metadata addresses in IPv4 and IPv6 and in
   alternate encodings, DNS rebinding across the redirect boundary, >5 redirects, the 30-second
   timeout, the 50 MiB document limit, the 250 MiB decompressed limit and declared-vs-observed type
   disagreement — and asserts, with a local connection recorder, that **no socket to a forbidden
   address is ever opened**. (PRD §30.2 `SEC-002`; §37.4; §21.1.)
3. **`SEC-003` — model output is schema/citation/licence/sanitisation validated before display.**
   `ASSR-02`'s injection and XSS suites prove that an instruction embedded in official-source text
   changes no legal date, tool, URL, provider or scope (`UAT-ANS-04`), and that no script, event
   handler, `javascript:`/`data:` URL, model-authored URL or raw HTML survives to a rendered answer or
   an export. `ASSR-04` proves the same properties on the persisted Answer Snapshot. (PRD §30.2
   `SEC-003`; §21.1; §36.6; §37.5; §41.2 `UAT-ANS-04`.)
4. **`PII-001` — deterministic patterns, local NER and contextual rules form the server boundary.**
   `ASSR-03` submits canary payloads through the real admission path and proves the canary is absent
   from **all three** PRD §10.1 paths — logs, persistence (both SQLite files including WAL) and the
   recorded provider payload — plus metrics, audit rows and the HTTP response body, which names
   categories and offsets only. (PRD §30.2 `PII-001`, `ANS-002`; §10.1; §37.2; §37.3; §41.2
   `UAT-PII-01`/`UAT-PII-02`.)
5. **`PII-002` — Search continues when PII detection is unavailable; free-text research fails closed.**
   With the detector forced unavailable, the research admission path returns `503
   GENERATION_UNAVAILABLE` and no partially-detected payload is ever accepted, while the public search
   admission path is unaffected. (PRD §30.2 `PII-002`; §10.1; §34.9.)
6. **`ANS-005` and the §36.8 table hold end to end.** `ASSR-04` shows zero unsupported definitive
   claims on the delivered snapshot, the validator counters increment on wrong offset/date/jurisdiction
   (`UAT-ANS-05`), a citation outside the pinned release fails the **whole execution** as an integrity
   incident, and every row of PRD §36.8's decision table produces its tabled result through the real
   API and worker. (PRD §30.2 `ANS-005`; §36.6; §36.8; §35.8 invariant 3; §41.2 `UAT-ANS-03`/`-05`.)
7. **`ANS-003` and the §35.8 execution invariants hold under retry and reconnect.** `ASSR-05` proves
   one job, one snapshot and one charge for a repeated idempotency key and for a redelivered worker
   lease; SSE resume after `Last-Event-ID` 5 produces no duplicate section or completion; cancellation
   before the provider stage releases the full reservation and after it records actual cost without
   publishing a partial supported answer. (PRD §30.2 `ANS-003`; §18.5; §33.2; §35.8 invariants 1, 2, 6;
   §41.2 `UAT-ANS-01`/`-06`/`-07`.)
8. **`OPS-001` — replication meets the ≤15-minute target and restore is tested.** `ASSR-08` runs the
   PRD §42.3 drill offline with email, webhook, provider and SSO egress denied, validates SQLite
   integrity/schema/foreign keys, resolves sampled organisation/record/answer/claim/citation references
   against exact corpus release IDs, produces the timestamped report, and asserts that
   `ephemeral.sqlite` and corpus files are **absent** from the replication destination and that a
   wildcard rule such as `*.sqlite*` is rejected. (PRD §30.2 `OPS-001`; §23.1; §23.2; §39.3; §42.3;
   §41.2 `UAT-OPS-02`.)
9. **The full PRD §41 acceptance set is accounted for.** `tests/e2e/uat/uat-matrix.json` contains all
   **32** §41.2 rows verbatim; every row is either automated in `ASSR-06`, cross-referenced to the
   sibling suite that automates it (`UAT-AUTH-03`→`ASSR-01`, `UAT-PII-01/02`→`ASSR-03`,
   `UAT-ANS-04`→`ASSR-02`, `UAT-ANS-05`→`ASSR-04`, `UAT-ANS-01/06/07`→`ASSR-05`,
   `UAT-OPS-02`→`ASSR-08`), or listed in `tests/e2e/uat/coverage-gaps.md` with its owning ticket and
   the exact plan edge that would close it (M-Q3, M-Q9). Every PRD §41.1 universal-UI rule has at
   least one automated assertion — the four behavioural rules in `ASSR-06`, the accessibility and
   responsive rules in `ASSR-07`. (PRD §41.1, §41.2; §26 Product.)
10. **Accessibility passes release review.** `ASSR-07` reports zero WCAG 2.2 AA rule violations at
    360 px, 768 px and 1280 px across every route in PRD §31.2's table that its closure can reach, and
    the `[human]` keyboard and screen-reader criteria are signed off. The result is emitted in the
    machine-readable form PRD §43.5's release evidence pack consumes. (PRD §13.1; §41.1; §43.5; §26
    Product.)
11. **Everything reproduces offline.** Every `[machine]` and `[fixture]` item runs with no network
    access, no production credentials, no provider key and no blind gold data; `pnpm lint`,
    `pnpm typecheck`, `pnpm test` and `pnpm test:integration` are green on the merged default branch.
    This module writes no Rust and no Python, so `cargo test --workspace` and `uv run pytest` are
    unaffected. (PRD §20.2; §45.1 item 6; §45.3; plan §1.1, §4.2.)
12. **Every gap is written down, and none is a silent skip.** Each suite's `coverage-gaps.md` lists
    only entries with an owning ticket and a concrete plan edge; no suite contains a skipped,
    conditional or `todo` assertion. (D3; plan §6.2.)

## Changelog

- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.24 (8 tickets,
  `ASSR-01` … `ASSR-08`). Records decisions D1–D18, rejects 11 alternatives, and opens M-Q1 … M-Q9 —
  one ADR candidate (the E2E browser and accessibility runtime, M-Q2/`ASSR-06`), three plan gaps
  (M-Q1: no owner for `security.txt`; M-Q3: six `UAT-*` items outside `ASSR-06`'s blocker closure;
  M-Q9: no owner for `apps/web/src/features/auth/**`), one scope boundary escalating to
  `22-internal-admin` (M-Q4), and one carried forward from `12-evidence-safety` (M-Q6, the configured
  PII recall target).
