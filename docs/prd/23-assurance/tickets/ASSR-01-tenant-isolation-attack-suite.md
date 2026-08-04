---
id: ASSR-01
title: "Tenant-isolation attack suite"
module: 23-assurance
lane: 23-assurance
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-08, XPRT-05, PLTF-09, DATA-02]
blocks: [LNCH-05]
---

# ASSR-01 — Tenant-isolation attack suite

Implements PRD §21.2 and §16.5 — requirements **SEC-001** and **AUTH-002**; epic `E28`; acceptance
script `UAT-AUTH-03`.
No ADR — the decision is already made in PRD §21.2 (*"Automated tests MUST cover read/write/delete/
export/download and queued-job tenant attacks"*); this is build ticket 1 of 8 against it.
Parent sub-PRD: [23-assurance README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-08 — Records list and record detail screens (six tabs)](../../17-records-collab/tickets/RCRD-08-records-list-and-record-detail-screens-six-tabs.md), [XPRT-05 — Export UI: request, status, download, expiry](../../19-exports/tickets/XPRT-05-export-ui-request-status-download-expiry.md), [PLTF-09 — Usage, limits and audit endpoints](../../20-developer-platform/tickets/PLTF-09-usage-limits-and-audit-endpoints.md), [DATA-02 — TenantContext repository layer + unscoped-import architecture test](../../01-app-data/tickets/DATA-02-tenantcontext-repository-layer-unscoped-import-architecture-test.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §21.2 already names the six attack classes and PRD §16.5 already fixes the response; this makes
them executable, and decides no new subsystem.

## Background + basis

**PRD §21.2, quoted in full — this ticket's entire mandate:**

> All tenant access is TenantContext-scoped. Use organisation-scoped keys and composite foreign keys
> where feasible. **Authorise before lookup.** Cross-organisation internal access uses a separate
> recent-MFA, reason-required, audited path. **Automated tests MUST cover read/write/delete/export/
> download and queued-job tenant attacks.**

**PRD §16.5, quoted verbatim — the response this suite asserts:**

> Request flow MUST be authenticate → resolve organisation → verify membership/service account →
> evaluate permission → perform tenant-scoped lookup. **Other-tenant and absent opaque IDs return the
> same not-found response.** Business modules MUST use TenantContext-scoped repositories rather than
> raw/unscoped database connections.

**Requirements.** `SEC-001` (PRD §30.2): *"Every tenant repository requires `TenantContext` … Static/
architecture test forbids unscoped repository import."* `AUTH-002`: *"A user can switch among
organisations without leaking state … **Cross-tenant ID matrix returns indistinguishable 404**."*
PRD §34.9 fixes the response: `404 RESOURCE_NOT_FOUND`, *"Check ID; same response for forbidden/other
tenant"*. PRD §41.2 `UAT-AUTH-03`: *"Researcher guesses another tenant's record ID → **Same 404 shape/
timing class as unknown ID; audit records denied lookup safely**."* PRD §26 Security/privacy: *"Tenant
isolation, auth/MFA/SSO/service-account, PII, SSRF, injection, XSS and secret/supply-chain tests
pass."*

**Why this cannot live in `packages/database`.** `SEC-001`'s named evidence — the static
unscoped-import test — is `DATA-02`'s deliverable and stays there (`packages/database/test/
architecture/**`). It proves that no module *can obtain* an unscoped connection. It cannot prove what
a real authenticated request for another organisation's export artifact returns, because that answer
is produced by `apps/api`'s admission chain, a route handler, a repository, an S3 signed URL and a
worker lease acting together. PRD §45.2 assigns exactly that to `tests`: *"Cross-boundary
e2e/security/isolation/restore."* Sub-PRD **D8**: this suite performs real attacks; asserting that a
helper returns a scoped connection is explicitly not sufficient here.

**What the `blocked_by` closure guarantees (sub-PRD D3 — everything asserted here is inside it).**
Via `DATA-02` → `DATA-01`, `FND-06`, `FND-03`. Via `RCRD-08` → `RCRD-01`, `RCRD-02`, `RCRD-04`,
`RCRD-05`, `WTCH-01`, `RUNT-05`, and transitively `RUNT-02` → `RUNT-01`, `AUTC-01`, `AUTC-04`,
`FND-09`, plus `DATA-04` … `DATA-07`. Via `XPRT-05` → `XPRT-01` … `XPRT-04`, `RUNT-04`, `RLSE-04`
(the S3 prefix/credential split), `EVID-04` … `EVID-06`, `RETR-09`. Via `PLTF-09` → the `/v1/usage/*`
and `/v1/audit-events` endpoints. That set is enough for every PRD §21.2 attack class: read, write,
delete (records, turns, review actions, comments, watchlists), export (create), download (signed
artifact URL) and queued job (the export job).

**Accepted caveats carried forward:**

- **Identities are seeded, not logged in.** `13-identity-surface`'s routes (`IDNT-01` …) are **not**
  in this closure. The suite creates organisations, members, sessions and service-account credentials
  directly through `packages/auth` (`AUTC-01`, `AUTC-04`) and `packages/database`'s tenancy
  repositories (`DATA-04`), then attaches the resulting cookie/credential to requests. This is the
  same admission chain a browser would hit — `RUNT-02` — with the login screen removed from scope.
- **No `/internal/v1` assertions.** Sub-PRD **D18**/**M-Q4**: plan §6.1 gives this module no edge to
  `22-internal-admin`; `ADM-001`'s *"Customer identity cannot call internal routes"* is `INTL-01`'s.
- **Answer-job attacks are not in this closure.** `ASK-01`/`ASK-04` are not blockers here; the queued
  job used for the PRD §21.2 queued-job class is the **export** job (`XPRT-01`), which is. Answer-job
  execution invariants belong to `ASSR-05`.
- **Timing is asserted as a class, not a constant** (sub-PRD **D11**, open question **M-Q5**).

## Goal

Produce `tests/tenant-isolation/**`: a two-organisation fixture, a data-driven cross-organisation
attack matrix covering all six PRD §21.2 classes, and a byte-level response-identity comparator, so
that for every (actor in `ORG_ALPHA`) × (identifier owned by `ORG_BETA`) × (operation) cell the
system's response is indistinguishable from the response to an identifier that has never existed, a
denied lookup is recorded in the audit log without leaking the target, and no cross-tenant row is
ever written. Completion is mechanically checkable: the matrix enumerates a declared resource ×
operation product with no manual exclusions, the comparator asserts equality of status, body bytes
and header set, and a deliberately-broken fixture handler proves the suite fails when isolation
fails.

## Non-goals

- **No static unscoped-import test** — `DATA-02` (`packages/database/test/architecture/**`), which is
  `SEC-001`'s named acceptance evidence. Cited, never duplicated.
- **No repository-level or migration-level tenancy tests** — `01-app-data` (`DATA-02`, `DATA-04`,
  `DATA-09` invariant 4: *"Tenant child rows cannot point to another tenant's parent rows"*).
- **No route-level permission-matrix test** — `13-identity-surface` (`IDNT-03`) owns PRD §38.1; this
  suite asserts *tenancy*, not role granularity, and uses one role (Researcher) per organisation
  except where an attack needs another.
- **No MFA, SSO, recent-auth or break-glass path** — `02-auth-core` (`AUTC-02`, `AUTC-03`) and
  `13-identity-surface` (`IDNT-04`, `IDNT-05`). PRD §21.2's cross-organisation *internal* path is
  `22-internal-admin` (`INTL-01`), excluded by sub-PRD **D18**.
- **No `/internal/v1` or `apps/admin` assertions** — `22-internal-admin` (`INTL-01`); sub-PRD
  **M-Q4**.
- **No answer-job, SSE, idempotency or charge invariants** — `ASSR-05` (`tests/integration/
  {jobs,sse,idempotency}/**`).
- **No PII, citation, SSRF, XSS or supply-chain assertions** — `ASSR-03`, `ASSR-04`, `ASSR-02`.
- **No browser, screen or accessibility assertions** — `ASSR-06`, `ASSR-07`. This suite is
  HTTP-level and queue-level only.
- **No CI workflow or root-script edits** — `00-foundation` (`FND-02`, `FND-01`); sub-PRD **D15**.

## File-scope (write-owns)

Owned by this ticket:

- `tests/tenant-isolation/**` — including `harness/**`, `fixtures/**`, `matrix/**`, `suites/**` and
  `coverage-gaps.md` (internal organisation inside the tree is the Builder's choice).
- `tests/tenant-isolation/package.json`, `tests/tenant-isolation/tsconfig.json` — **append-only**, own
  scripts and dependencies only (created by `FND-01`; sub-PRD **D16**).

Does not touch:

- `tests/security/**` — `ASSR-02`, `ASSR-03`; `tests/integration/**` — `ASSR-04`, `ASSR-05`,
  `ASSR-08`; `tests/e2e/**` — `ASSR-06`, `ASSR-07`.
- **Any other module's package or app tree** — `packages/**`, `apps/**`, `services/**`,
  `pipelines/**`, `infra/**`, `schemas/**`, `evals/**`. Not even to make an assertion pass (sub-PRD
  **D1**). A failure here is the owning module's defect.
- `.github/workflows/**`, root `package.json`, root lockfiles — `00-foundation` (`FND-01`, `FND-02`).
- `docs/PRD.md` — frozen (plan §4). `docs/prd/breakdown-plan.md` — planning artifact; changed only by
  a docs PR (feedback obligation below).

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (plan §1
header). `tests/tenant-isolation/**` is written by no other ticket in the plan (plan §5.24) and is a
distinct workspace member, so its manifest is not shared with any sibling — unlike
`tests/security/package.json` (`ASSR-02`+`ASSR-03`) and `tests/integration/package.json`
(`ASSR-04`+`ASSR-05`+`ASSR-08`). This is a wave-1 ticket; its six concurrent siblings write
`tests/security/{ssrf,injection,xss,supply-chain}`, `tests/security/pii`,
`tests/integration/{citations}`, `tests/integration/{jobs,sse,idempotency}`,
`tests/integration/recovery` and `tests/e2e/uat` — disjoint subtrees, no shared file. All four
declared blockers land first by construction (`/start-all` gates on `blocked_by`). Only shared file:
the root `pnpm-lock.yaml`, regenerated as a build artifact, never hand-merged (plan §1.1).

## Deliverables

1. **`harness/stack.ts` — in-process system boot** (sub-PRD **D4**). `startIsolationStack(): Promise<Stack>`:
   - `mkdtemp` directory holding `app.sqlite` and `ephemeral.sqlite`; migrate to head with
     `DATA-01`'s runner; apply `APP_SQLITE_PRAGMAS`;
   - build the API with `RUNT-01`'s `buildApp(config)` from `apps/api/src/app.ts` and drive it with
     Fastify `inject()` — **no listening socket**, so the suite needs no port and no network;
   - start `RUNT-04`'s lease loops for the `exports` queue class only, with an injected clock;
   - stub every outbound boundary: S3 → a filesystem-backed object store rooted in the temp dir
     (`RLSE-04`'s two prefixes and two credentials modelled as two distinct capability handles),
     model provider → `EVID-07`'s stub profile, email/webhook → local sinks;
   - return `{ inject, enqueue, db, objectStore, auditRows, stop }`. `stop()` removes the temp tree.
2. **`fixtures/tenancy.ts` — the two-organisation fixture** (sub-PRD **D6**). Creates `ORG_ALPHA` and
   `ORG_BETA` through `DATA-04`'s repositories with **fixed opaque IDs**, each with: one Owner, one
   Researcher, one Viewer, one active service-account credential (`AUTC-04`) scoped to that
   organisation only, and one session per member (`AUTC-01`). Also creates one **unrelated third**
   organisation `ORG_GAMMA` used only to prove that a two-organisation result is not an accident of
   ordering.
3. **`fixtures/resources.ts` — one seeded instance of every attackable resource, in each
   organisation.** Each entry declares `{ kind, createIn(org), idOf(x), routes: {...}, queue?: ... }`:
   - `research_record` (`RCRD-01`), `research_turn` (`RCRD-02`), `review_action` (`RCRD-04`),
     `comment` (`RCRD-05`), `watchlist` + `watch_target` (`WTCH-01`), `export_job` and its produced
     `export_artifact` (`XPRT-01` … `XPRT-04`), `usage_record` and `audit_event` (`PLTF-09`).
   - Each resource also yields a **never-existed identifier** of the same opaque-ID shape (`FND-03`'s
     ID conventions), which is the control arm of every comparison.
4. **`matrix/operations.ts` — the PRD §21.2 operation classes as data.** A frozen table mapping each
   of the six PRD-named classes to concrete request builders:

   | PRD §21.2 class | Concrete attacks (each × every applicable resource) |
   |---|---|
   | read | `GET /v1/<collection>/:id`; `GET` of a sub-resource; list endpoints filtered by an `ORG_BETA` id; `ETag`/`If-None-Match` probe |
   | write | `POST` creating a child that references an `ORG_BETA` parent id; `PATCH`/`PUT` with `If-Match` carrying `ORG_BETA`'s current ETag |
   | delete | `DELETE /v1/<collection>/:id` for an `ORG_BETA` id |
   | export | `POST /v1/exports` naming an `ORG_BETA` record/answer id |
   | download | `GET` of `ORG_BETA`'s signed export URL, verbatim and with a re-signed/altered key; and the same URL after expiry |
   | queued job | enqueue an export job whose payload names an `ORG_BETA` resource, then run the worker lease and assert re-authorisation (PRD §18.5 step 3) rejects it |

   The matrix is the **cartesian product** of resources × applicable operations, generated in code —
   there is no hand-maintained list of cells and no per-cell opt-out. An operation a resource does not
   support is declared `NOT_APPLICABLE` **with a reason string** in the resource entry, and the count
   of such declarations is asserted against a literal expected number so a silent drop fails.
5. **`matrix/comparator.ts` — response identity, byte level.** `assertIndistinguishable(actual,
   control)` compares: HTTP status; the exact response **body bytes**; the set of header names; the
   values of every header except `request_id`, `date` and any explicitly-listed variable header (the
   allowlist is a literal in this file, so widening it is a visible diff). It also asserts the body is
   exactly PRD §34.9's `RESOURCE_NOT_FOUND` shape and that the body contains **no** occurrence of the
   attacked identifier, the owning organisation's id, or any `ORG_BETA` string (sub-PRD D9's
   technique, applied to identifiers).
6. **`matrix/timing.ts` — timing class, not timing constant** (sub-PRD **D11**, **M-Q5**). Runs the
   attack and the control arm interleaved, N ≥ 200 samples each, on the injected clock's real
   process; asserts the medians fall in the same coarse band (documented multiplier, default 4×) and
   records the measured distribution to `tests/tenant-isolation/timing-report.json`. The assertion is
   deliberately generous and the method is documented in the file header; a tighter bound is a
   flake, not a stronger test.
7. **`suites/read-write-delete.test.ts`, `suites/export-download.test.ts`,
   `suites/queued-job.test.ts`** — the matrix executed per class. Every cell asserts, in this order:
   (a) `assertIndistinguishable` against the never-existed control; (b) **no state change** — a
   before/after snapshot of both organisations' row counts and of every seeded resource's `updated_at`
   is byte-identical; (c) an audit row exists for the denied lookup that names actor, organisation and
   operation but **not** the attacked identifier's owner (PRD §41.2 `UAT-AUTH-03` *"audit records
   denied lookup safely"*, PRD §22 *"Logs MUST exclude research/evidence content"*).
8. **`suites/organisation-switch.test.ts` — `AUTH-002`.** One user is a member of both `ORG_ALPHA`
   and `ORG_BETA`. Assert: with the context resolved to `ORG_ALPHA`, every `ORG_BETA` identifier is
   indistinguishable-404; after switching context to `ORG_BETA`, the *same* identifiers resolve and
   the `ORG_ALPHA` ones do not; no list endpoint ever returns a row from the other organisation; no
   response carries a cached or leaked value from the previous context (assert on `Vary`/cache
   headers and on body content). A user who is a member of neither sees the same 404 for both.
9. **`suites/credential-scope.test.ts`.** `ORG_ALPHA`'s service-account credential (`AUTC-04`)
   against every `ORG_BETA` route: indistinguishable-404 for resource routes, and the credential's own
   organisation is never inferable from the response. Repeat with a *revoked* credential and with a
   credential whose scope excludes the operation, asserting the responses are the PRD §34.9 rows for
   those cases (`401`/`403`) and are still identifier-blind.
10. **`suites/download-boundary.test.ts` — PRD §19.2 prefix separation.** Assert that `ORG_BETA`'s
    signed export URL is inaccessible with `ORG_ALPHA`'s capability handle, that the backup prefix
    handle cannot read or write the export prefix and vice versa (PRD §19.2 *"The prefixes MUST use
    separate least-privilege permissions"*), and that an expired URL is denied identically to an
    other-tenant URL (`EXP-002`, `UAT-EXP-02`).
11. **`suites/negative-control.test.ts` — proof that the suite can fail.** A fixture route registered
    only inside this suite's temp app, which deliberately performs an **unscoped** read, must be
    detected by the matrix. This route lives in the suite's own fixture tree and is never registered
    in `apps/api`'s source (sub-PRD **D1**). Without this, a green suite is unfalsifiable.
12. **`coverage-gaps.md`** (sub-PRD **D3**) — the register, each row `{ PRD requirement, why not
    asserted here, owning ticket, exact plan §5.24/§6.2 edge that would close it }`. Seed entries:
    `/internal/v1` cross-tenant access (**M-Q4**, `INTL-01`); the organisation-switch **endpoint**
    (`IDNT-01`); answer-job cross-tenant attacks (`ASK-01`/`ASK-04`, covered structurally by
    `ASSR-05`); widget-session origin binding (`IDNT-07`/`PLTF-05`).
13. **`package.json` script wiring** (sub-PRD **D10**): this member's `test` script runs the whole
    suite, because PRD §20.3 lists *"Tenant isolation, auth and permission tests"* as a **per-PR**
    gate. Target runtime under two minutes on a laptop; if it cannot be, split the matrix by class and
    say so in the README section, do not move it out of the per-PR gate.
14. **`README.md` inside `tests/tenant-isolation/`** — how to run it, what each suite proves, the
    PRD §21.2 class → file map, the timing-class method and its measured band (**M-Q5**), and the rule
    that a failure is the owning module's defect (sub-PRD **D1**).

## Acceptance checklist (classified)

- [ ] `[machine]` **All six PRD §21.2 attack classes are executed** — read, write, delete, export,
      download and queued job — over every seeded resource, with the cell count asserted against a
      literal expected number and every `NOT_APPLICABLE` carrying a reason. (PRD §21.2; **SEC-001**)
- [ ] `[machine]` **Cross-tenant responses are indistinguishable from never-existed** — status, body
      bytes and header set identical, body is exactly PRD §34.9's `RESOURCE_NOT_FOUND` shape, and the
      body contains no attacked identifier and no owning-organisation string. (PRD §16.5; §34.9;
      **AUTH-002** *"Cross-tenant ID matrix returns indistinguishable 404"*)
- [ ] `[machine]` **No cross-tenant write ever lands** — before/after row-count and `updated_at`
      snapshots of both organisations are byte-identical after the full matrix run. (PRD §21.2;
      §35.8 invariant 4)
- [ ] `[machine]` **Queued-job attack is rejected at worker re-authorisation** — an export job whose
      payload names another organisation's resource is refused when the lease is taken, no artifact is
      produced, and the job's failure carries no target identifier. (PRD §21.2 *"queued-job tenant
      attacks"*; §18.5 step 3)
- [ ] `[machine]` **Download boundary holds** — another organisation's signed export URL, a re-signed
      key and an expired URL are all denied identically; the backup-prefix capability cannot touch the
      export prefix or vice versa. (PRD §19.2; **EXP-002**; `UAT-EXP-02`)
- [ ] `[machine]` **Organisation switching leaks no state** — the same identifiers resolve only under
      their own context, list endpoints never mix organisations, and nothing from the previous context
      appears in a response or cache header. (**AUTH-002**; PRD §16.5)
- [ ] `[machine]` **Scoped and revoked credentials behave identically to non-members** — no response
      reveals which organisation a credential belongs to. (**AUTH-006** contribution; PRD §38.4)
- [ ] `[machine]` **A denied lookup is audited safely** — an audit row names actor, organisation and
      operation, and contains neither the attacked identifier's owner nor any research content.
      (`UAT-AUTH-03`; PRD §22)
- [ ] `[fixture]` **Timing class** — over ≥ 200 interleaved samples the attack and control medians sit
      in the same documented band; `timing-report.json` is written with the measured distribution.
      (`UAT-AUTH-03` *"same … timing class"*; sub-PRD **D11**/**M-Q5**)
- [ ] `[machine]` **Negative control fails** — the deliberately-unscoped fixture route is detected by
      the matrix; disabling it restores green. A suite that cannot fail proves nothing. (Sub-PRD
      **D3**)
- [ ] `[machine]` **Nothing outside `tests/tenant-isolation/**` is modified** — `git diff --name-only`
      shows only this ticket's file-scope plus the regenerated root lockfile. (Sub-PRD **D1**; plan §4)
- [ ] `[machine]` **Offline and credential-free** — the whole suite runs with network access denied,
      no AWS/Cloudflare/provider credential in the environment, and no read of `evals/**`. (PRD §20.2;
      §45.1 item 6; plan §4.2)
- [ ] `[machine]` **No skipped or conditional assertion** — a scan of the suite finds no `skip`,
      `todo` or `if (present)` guard; every excluded item is a row in `coverage-gaps.md` with an owning
      ticket and a concrete plan edge. (Sub-PRD **D3**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3), with
      this member's `test` script included in the per-PR set. (PRD §20.3; sub-PRD **D10**)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: `docs/prd/23-assurance/README.md` **M-Q5** is updated with the
      chosen timing-class method and the measured band. (Plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**SEC-001**, **AUTH-002**,
      contributing to **EXP-002**; `UAT-AUTH-03`, `UAT-EXP-02`), user-visible change (none — tests
      only) and non-goals, schema/API/event compatibility impact (none), **tenant/PII/security and
      retention impact** (the suite writes only to a temp directory and asserts no content leaves it),
      source/licence impact (none), cost/memory/latency impact (per-PR CI runtime — report it),
      rollback path (revert the suite), known gaps (`coverage-gaps.md`).

Absent classes: **no `[human]` criteria.** Tenant isolation is asserted mechanically; PRD §21.2
requires *automated* tests, and PRD §43.4 item 1 puts cross-tenant failures first in the founder
review queue precisely because they are machine-detected before a human sees them. The human-facing
row `UAT-AUTH-03` is executed here unattended; its Gate 2 smoke re-run is `24-launch`/`LNCH-05`. The
single `[fixture]` item is the recorded timing distribution — a replay of measured samples, not a
logic check.

## Test plan

Every step runs offline: network denied, no cloud or provider credential, no `evals/**` access.

1. **Boot.** `pnpm --filter <tests-tenant-isolation> test`. Confirm the run creates and removes a temp
   directory and never opens a listening socket (run with the loopback interface blocked to prove it).
2. **Read the matrix as data.** Open `matrix/operations.ts` beside PRD §21.2 and confirm all six named
   classes are present and that no class is empty. Open `fixtures/resources.ts` and confirm every
   `NOT_APPLICABLE` has a reason.
3. **Per-class run.** Execute each of the three class suites individually and confirm the cell count
   printed matches the literal expected number.
4. **Comparator sharpness.** Temporarily change one route's not-found body to include the requested
   id (in the suite's own fixture app only) and confirm the comparator fails. Discard.
5. **Negative control.** Run `suites/negative-control.test.ts`; confirm it fails while the unscoped
   fixture route is registered and passes when it is removed.
6. **State immutability.** After a full matrix run, diff the before/after snapshots; confirm equality
   including `updated_at` values.
7. **Queued job.** Run `suites/queued-job.test.ts` with the worker lease loop stepped manually;
   confirm re-authorisation rejects before any handler work and that the object store contains no new
   artifact.
8. **Download boundary.** Confirm the export-prefix and backup-prefix handles are distinct objects and
   that swapping them fails; confirm the expired-URL and other-tenant-URL responses are identical.
9. **Timing.** Run `matrix/timing.ts` twice; confirm both runs pass and that `timing-report.json`
   records the sample count and medians. Confirm the band multiplier is a named constant with a
   comment citing **M-Q5**.
10. **Isolation of the suite itself.** `git diff --name-only` after the run shows only
    `tests/tenant-isolation/**` (plus the lockfile). Confirm no file under `packages/**` or `apps/**`
    was added or changed (sub-PRD **D1**).
11. **Construction pattern to copy.** `DATA-02`'s `packages/database/test/architecture/**` for the
    "assert a violation is impossible" shape, `RUNT-02`'s `authn.test.ts` for the `buildApp()` +
    `inject()` harness, and `RUNT-04`'s `apps/worker/test/handler-area-conformance.ts` for driving a
    lease loop deterministically.
12. **Reviewer focus.** Confirm each attack is a **real request**, not an assertion about a helper
    (sub-PRD **D8**); confirm the control arm is a genuinely never-existed id of the same shape;
    confirm no assertion is satisfied by a 403 where the PRD requires an indistinguishable 404;
    confirm the audit assertion checks *absence* of the owner as well as presence of the actor;
    confirm nothing outside `tests/tenant-isolation/**` changed.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR → merge
   → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/23-assurance/README.md` (version +0.1 with a changelog line) **before** changing code.
   Silent divergence is an incomplete ticket. PRD §45.4 additionally requires cross-tenant tests with
   any change to tenant tables — those live with the changing module, not here.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A cell fails because another module returns 403, leaks the id, or writes a cross-tenant row* →
     **that module has the defect.** File it against the owning ticket (`RCRD-*`, `XPRT-*`, `PLTF-*`,
     `DATA-*`, `RUNT-02`) as a docs PR amending that ticket, and leave this assertion at full
     strength. Do **not** relax the comparator, add an exception list, or edit the other module's tree
     — sub-PRD **D1** and plan §1.1 forbid it.
   - *A resource this suite must attack has no route in the closure* (answer jobs, `/internal/v1`, the
     organisation-switch endpoint, widget sessions) → add a row to
     `tests/tenant-isolation/coverage-gaps.md` **and** raise the exact edge in
     `docs/prd/breakdown-plan.md` §5.24/§6.2 by docs PR. Never add the `blocked_by` edge locally —
     `dag-scan.mjs` compares against the plan, and an invented edge fails the run (plan §6.2).
   - *The timing-class assertion is flaky in CI* → widen the documented band and record the new value
     and its measurement in `docs/prd/23-assurance/README.md` **M-Q5**; never delete the assertion
     silently, and never tighten it to "prove" a property PRD §41.2 states only as a class.
   - *The per-PR runtime is unacceptable* → report the measured time in this ticket and propose a
     split (by attack class) in a docs PR here **and** in `FND-02`'s CI job definition. Moving a PRD
     §20.3 per-PR gate to the release-candidate set is a **PRD-level** change, not a local one.
   - *Seeding identities through `packages/auth` diverges from what `IDNT-01` will do* → record it in
     `docs/prd/23-assurance/README.md` and add the `IDNT-01` edge as a plan docs PR; do not
     re-implement a login route inside `tests/**`.
3. **Falsified protocol.** **If PRD §16.5's indistinguishable-not-found cannot be achieved** — for
   example because a route genuinely needs to return 403 for a resource that exists in another
   organisation — that overturns a stated product security decision, not a test detail. Stop. Do not
   soften the comparator, do not add a per-route exception, and do not mark the cell
   `NOT_APPLICABLE`. Escalate for re-review, raise an ADR under `docs/adr/`, and write back to
   `docs/prd/23-assurance/README.md` **and** `docs/prd/breakdown-plan.md` before any code changes.
   PRD §21.2, §16.5, §30.2 `AUTH-002` and §42.4's SEV-1 definition (*"Cross-tenant disclosure"*) all
   rest on this one response shape.
