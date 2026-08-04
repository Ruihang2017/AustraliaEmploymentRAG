---
id: RUNT-09
title: "Local Compose stack and pnpm stack:up/down"
module: 03-app-runtime
lane: 03-app-runtime
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RUNT-01, RUNT-04]
blocks: []
---

# RUNT-09 — Local Compose stack and `pnpm stack:up/down`

Implements PRD §20.2 (environments), §39.2 (production host baseline — the sentence that separates
Compose from production) and §45.3 (target local commands). **No ADR — the decision is already made in
PRD §39.2; this is build ticket 9 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RUNT-01`](RUNT-01-fastify-skeleton-autoloaded-routes-uniform-errors-request-id.md) and
[`RUNT-04`](RUNT-04-worker-runtime-queue-classes-leases-fairness-checkpoints.md).
**Why `builder`:** a bounded change inside one module's declared file-scope composing two
already-built process entry points into the local environment PRD §20.2 requires — not a new
subsystem decision.

## Background + basis

**A complete local environment is a requirement.** PRD §20.2:

> - **Local complete development environment.**
> - CI build/test environment.
> - Static frontend previews.
> - One strictly isolated sandbox organisation in production.
> - No permanently running paid staging server.
>
> **Coding agents MUST NOT receive production SSH, database, backup, signing or provider credentials
> by default.**

**Compose is explicitly not production.** PRD §39.2, in the middle of the production host baseline:

> Production uses systemd units/cgroups for the app, worker, search, Litestream and cloudflared
> processes. CI publishes an immutable versioned release archive with checksums/signature; no source
> build or floating package install occurs during promotion. **Docker Compose remains a local/CI
> convenience, not a production dependency.** Cloudflare Tunnel is the only public route to the app.
> SSH is IP/key restricted and disabled for coding agents.

`docs/prd/breakdown-plan.md` §2.1 row **A7** records why this matters to the decomposition:

> Local Compose is **development/CI only** (`03-app-runtime`); the *production* deployment
> configuration PRD §44.3 calls serial-owned is systemd/release material (`18-ops-release`). Two
> different artifacts share one phrase in §44.3; PRD §39.2 settles it. Recorded by `RUNT-09` /
> `RLSE-02`.

PRD §44.3's phrase is: "Serial owners are required for root lockfiles, canonical enums, OpenAPI root,
app migration order, corpus schema/manifest, active release/promotion files and **production
Compose/deployment configuration**." breakdown-plan §4.1 resolves it into two rows: "Local/CI Compose |
`infra/compose/**` | `03-app-runtime` | `RUNT-09`" and "Production deployment configuration |
`infra/deploy/host/**`, `infra/cloudflare/**`, `infra/aws/**` | `18-ops-release` | `RLSE-02`, `RLSE-03`,
`RLSE-04`".

**The two commands are named.** PRD §45.3 lists, among the "stable entry commands" week 1 must make
real, `pnpm stack:up` and `pnpm stack:down`, and adds:

> Exact Node/pnpm/Python/Rust versions belong in committed tool-version files and lockfiles selected in
> E01, not in human memory. CI and local development use the same pinned versions.

**The process set is given.** PRD §39.1's diagram and §39.2's table name five runtime roles — `app`,
`worker`, `search`, `litestream`, `cloudflared` — with their memory intents and network access. PRD
§39.4's internal network matrix fixes the ports: the tunnel reaches `127.0.0.1:3000`; `app` and
`worker` reach search at `127.0.0.1:7700`; "**Search exposes no public port.**" PRD §39.3 fixes the
filesystem layout, including that `/srv/aer/data/ephemeral.sqlite*` is "Explicitly excluded" from
backup and that the app database, ephemeral database and corpus "cannot share a wildcard backup rule".

**Why `RUNT-01` and `RUNT-04` are the blockers.** breakdown-plan §5.4 and §6.2: `RUNT-01 --> RUNT-09`
and `RUNT-04 --> RUNT-09`. The stack composes the `apps/api` and `apps/worker` process entry points
those two tickets produce. `services/search-rs` (`11-retrieval-engine`, `RETR-01`) is **not** upstream,
so the search service is declared but opt-in (Deliverable 4).

**Fixed inputs and accepted caveats, documented not enforced here:**

- **The root `package.json` scripts belong to `00-foundation`.** PRD §45.3 makes `pnpm stack:up` /
  `pnpm stack:down` `FND-01`'s deliverable, and breakdown-plan §4 gives root manifests to
  `00-foundation`. This ticket owns `infra/compose/**` only and supplies the entry point those scripts
  delegate to. Whether they already delegate correctly is open question **QR5** in
  [`../README.md` §6](../README.md#6-open-questions).
- **The toolchain versions are fixed, and this stack must match them.** breakdown-plan §8 **Q12** is
  a confirmed decision: Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6` — Node 24
  LTS, not Node 26. So the `app` and `worker` services run Node.js `24.18.0` with pnpm `11.4.0`, and
  the opt-in `search` service builds `services/search-rs` with Rust `1.97.1`. `FND-01` holds the pins
  and stays their single source: this stack derives its versions from the committed pin files wherever
  a build can read them, and where an image tag or build argument must name a version literally it
  names exactly these and Deliverable 8 asserts it equals the pin. That is what makes PRD §45.3's "CI
  and local development use the same pinned versions" true of a local run. A version this stack runs
  that the repository does not pin is a defect here, never a local override.
- **Litestream and cloudflared are production concerns** (PRD §39.2). They appear in the compose file
  only as declared, non-default services so the local topology is recognisable, and they are never
  started by `pnpm stack:up`.

## Goal

Produce `infra/compose/**` such that a clean machine with the repository checked out and the
`FND-01`-pinned toolchain installed reaches a working local environment with one command
(`pnpm stack:up`) and tears it down completely with one more (`pnpm stack:down`) — and such that the
stack **refuses to start** against production configuration. Completion is mechanically checkable: a
smoke script brings the stack up, asserts `apps/api` answers `/health/live` and `apps/worker` reports a
started lease loop per PRD §39.5 class, brings it down, and asserts no container, volume or network
survives; and a guard test asserts that a production profile marker or a production-shaped credential
in the environment causes startup to fail with a named error.

## Non-goals

- **No production deployment configuration.** `infra/deploy/**` (host baseline, release archive,
  promotion), `infra/cloudflare/**`, `infra/aws/**`, `infra/backup/**`, `infra/recovery/**` and
  `docs/runbooks/**` are `18-ops-release` (`RLSE-01`…`RLSE-11`) — breakdown-plan **A7** and §4.1.
  Nothing in this ticket is referenced by a production promotion path.
- **No systemd units, no release archive, no signing.** `RLSE-01`, `RLSE-02` (`18-ops-release`).
- **No root `package.json` script.** `FND-01` (`00-foundation`) owns root manifests and PRD §45.3 makes
  those two commands its deliverable. This ticket provides the target they call.
- **No CI workflow.** `.github/workflows/**` is `FND-02` (`00-foundation`). The compose file is
  CI-usable (PRD §39.2 "local/CI convenience"), but wiring it into a workflow is `FND-02`'s.
- **No application code.** `apps/api/**` is `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08`; `apps/worker/**`
  is `RUNT-04`; `apps/web/**` is `RUNT-05`. If a process cannot start, the fix is in the owning ticket.
- **No `services/search-rs` implementation.** `11-retrieval-engine` (`RETR-01`). The service is
  declared under an opt-in profile.
- **No database schema or migrations.** `packages/database` is `01-app-data` (`DATA-01`). The stack
  invokes the migration entry point that package exposes; it authors none.
- **No production credentials, ever.** PRD §20.2: "Coding agents MUST NOT receive production SSH,
  database, backup, signing or provider credentials by default." The stack ships only synthetic local
  values.

## File-scope (write-owns)

- `infra/compose/**` — the compose file(s), the `.env` example, the entry script, the smoke script and
  this ticket's own tests under `infra/compose/test/**`.

Does not touch:

- `infra/deploy/**`, `infra/cloudflare/**`, `infra/aws/**`, `infra/backup/**`, `infra/recovery/**` —
  `18-ops-release` (breakdown-plan §4, §4.1, **A7**).
- Root `package.json`, `pnpm-workspace.yaml`, lockfiles, `.node-version`, `rust-toolchain.toml`,
  `pyproject.toml`, `README.md` — `00-foundation` (`FND-01`). `.github/workflows/**` — `FND-02`.
- `apps/**`, `packages/**`, `services/**`, `pipelines/**` — the modules that own them.
- `docs/runbooks/**` — `18-ops-release`. `tests/**` — `23-assurance`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `infra/compose/**` and nothing contends for it.
breakdown-plan §4 gives `infra/compose/**` to `03-app-runtime` and §5.4 gives it wholly to this ticket
— no sibling shares it, and §4.1 names it a single-owner artifact distinct from the production
deployment files `18-ops-release` owns. Sibling tickets in this module are in different trees:
`RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` are `apps/api`, `RUNT-04` is `apps/worker`, `RUNT-05` is
`apps/web`, `RUNT-06`/`RUNT-07` are `packages/`. This ticket runs in wave 2 alongside `RUNT-02`,
`RUNT-03` and `RUNT-08` as concurrent lanes (breakdown-plan §7). It has no dependents
(breakdown-plan §6.2 lists no `RUNT-09 -->` edge), so nothing downstream is blocked by its shape.

## Deliverables

1. **`infra/compose/README.md`** — the first line states, in the PRD's own words, that this stack is
   **development/CI only**: "Docker Compose remains a local/CI convenience, not a production
   dependency" (PRD §39.2), with a pointer to `18-ops-release` for production (breakdown-plan **A7**).
   Documents the platform prerequisites PRD §45.3 requires the root `README.md` to carry, so `FND-01`
   can reference rather than duplicate them.
2. **`infra/compose/docker-compose.yml`** — declares all five PRD §39.2 process roles so the local
   topology is recognisable, split by Compose **profile** so adding a service later needs no edit to
   the default start set:
   - default profile: `app` (`apps/api`, port `3000` per PRD §39.4), `worker` (`apps/worker`);
   - `search` profile: `search` (`services/search-rs`, `127.0.0.1:7700`, **no published port** per PRD
     §39.4 "Search exposes no public port") — opt-in until `RETR-01` exists;
   - `full` profile: `litestream` and `cloudflared` placeholders, documented as production-shaped and
     never started by `pnpm stack:up` (PRD §39.2).
     `app` and `worker` build from the repository on the **Q12** toolchain — Node.js `24.18.0` with
     pnpm `11.4.0` — and the opt-in `search` build uses Rust `1.97.1`. Every version is taken from the
     `FND-01` pin files; any tag or build argument naming one literally must equal the pinned value.
3. **Volumes and the PRD §39.3 separation** — three named volumes mirroring the production layout:
   `app-data` (`app.sqlite*`), `ephemeral-data` (`ephemeral.sqlite*`) and `corpus` (read-only mount for
   the search service). They are **separate** volumes with no shared wildcard, mirroring PRD §39.3's
   "The app database, ephemeral database and corpus cannot share a wildcard backup rule" and its
   "Explicitly excluded" backup row for `ephemeral.sqlite`.
4. **`infra/compose/.env.example`** — every configuration key the `app` and `worker` processes read
   (PRD §39.6 layer 2), with **synthetic local values only** and a comment on each secret group naming
   it as local-only. No real provider key, S3/R2 credential, signing key or session secret may appear
   (PRD §20.2; PRD §39.6 "Offline signing and destructive backup credentials are never present on the
   host").
5. **`infra/compose/stack.mjs`** — the single entry point the root `pnpm stack:up` / `pnpm stack:down`
   scripts delegate to (`FND-01`, PRD §45.3). `up`: verifies prerequisites, refuses to run under a
   production marker (Deliverable 6), copies `.env.example` to `.env` if absent, starts the default
   profile, waits for `app` readiness with a bounded timeout, runs the `packages/database` migration
   entry point (`DATA-01`) against `app-data`, and prints the reachable URLs. `down`: stops
   containers and removes containers, networks and — with an explicit flag — volumes, leaving nothing
   behind by default except the named volumes.
6. **`infra/compose/guards.mjs`** — the A7 guard. Startup **fails with a named error** if any of:
   `NODE_ENV=production`; a `PROFILE`/`AER_PROFILE` value of `production`; an environment variable
   matching a production credential shape (an AWS/R2 access key id pattern, a private-key header, a
   Cloudflare tunnel token); or a `.env` file containing a value from a committed deny-list of
   obviously-production hostnames. The message names the offending key and points at
   `18-ops-release`. It never prints the offending **value** (PRD §22; PRD §37.2).
7. **`infra/compose/smoke.mjs`** — the reproducible check the acceptance items and PRD §45.3 rely on:
   bring the default profile up; assert `GET http://localhost:3000/health/live` returns `200`
   (`RUNT-08` if merged, otherwise the `RUNT-01` skeleton's boot success); assert the worker log
   reports one started lease loop per PRD §39.5 queue class (`interactive_quick`,
   `interactive_research`, `exports`, `notifications`, `maintenance`); bring it down; assert no
   container, network or non-named volume from this stack survives. Exits non-zero with a single-line
   reason on any failure.
8. **`infra/compose/test/**`** — unit tests over `guards.mjs` (each rejection case) and a lint-style
   test asserting the compose file publishes no port other than `3000`, mounts the corpus volume
   read-only, declares no service outside the five PRD §39.2 roles, and names no language version that
   differs from the committed `FND-01` pin — Node.js `24.18.0` and pnpm `11.4.0` for `app` and
   `worker`, Rust `1.97.1` for the opt-in `search` build (breakdown-plan §8 **Q12**; PRD §45.3).
9. **Resource intents** — each service carries a memory limit matching PRD §39.2's table
   (`app` 320 MiB, `worker` 384 MiB, `search` 768 MiB, `litestream` 96 MiB, `cloudflared` 96 MiB) as a
   comment plus a Compose `deploy.resources` entry, so a local run surfaces the same budget pressure
   the 2 GB host will (PRD §39.2 "These limits total the 2 GiB host and are release-benchmark inputs").
   The authoritative benchmark is `RLSE-11`, not this file.

## Acceptance checklist (classified)

- [ ] `[machine]` `node infra/compose/stack.mjs up` on a clean checkout brings the default profile up,
      migrates `app-data`, and reports reachable URLs; `… down` removes every container and network it
      created (PRD §20.2 "Local complete development environment"; PRD §45.3)
- [ ] `[machine]` `node infra/compose/smoke.mjs` passes end to end: `/health/live` returns `200` and the
      worker reports one started lease loop for each of the five PRD §39.5 queue classes (PRD §39.5,
      §42.1)
- [ ] `[machine]` After `down`, no container, network or anonymous volume created by this stack
      survives — asserted by listing before and after (PRD §20.2 "No permanently running paid staging
      server" — the local analogue is that nothing is left running)
- [ ] `[machine]` The stack refuses to start under `NODE_ENV=production`, under an `AER_PROFILE` of
      `production`, with a production-shaped credential in the environment, or with a deny-listed
      hostname in `.env` — each with a named error that does **not** print the offending value
      (breakdown-plan **A7**; PRD §39.2, §20.2, §22)
- [ ] `[machine]` The compose file declares only the five PRD §39.2 roles, publishes only port `3000`,
      and gives the `search` service **no** published port (PRD §39.4 "Search exposes no public port")
- [ ] `[machine]` Every language version this stack names — image tag, Dockerfile or build argument —
      equals the committed `FND-01` pin: Node.js `24.18.0` and pnpm `11.4.0` for `app` and `worker`,
      Rust `1.97.1` for the opt-in `search` build. No service runs a version the repository does not
      pin (breakdown-plan §8 **Q12**; PRD §45.3 "CI and local development use the same pinned
      versions")
- [ ] `[machine]` `app-data`, `ephemeral-data` and `corpus` are three separate volumes with no shared
      wildcard, and `corpus` is mounted read-only (PRD §39.3; PRD §18.3 "corpus.sqlite is …
      production read-only")
- [ ] `[machine]` `.env.example` contains no real credential — asserted by a secret-shape scan over the
      committed file (PRD §20.2 "Coding agents MUST NOT receive production SSH, database, backup,
      signing or provider credentials by default")
- [ ] `[machine]` `infra/compose/README.md`'s first line states the stack is development/CI only and
      points at `18-ops-release` for production (breakdown-plan A7; PRD §39.2)
- [ ] `[machine]` The `search`, `litestream` and `cloudflared` services are **not** started by the
      default profile, so `pnpm stack:up` succeeds before `RETR-01` exists (PRD §39.2)
- [ ] `[machine]` No file outside `infra/compose/**` is modified by this ticket — asserted by the diff
      (breakdown-plan §4; the root `stack:up`/`stack:down` scripts are `FND-01`'s, open question QR5)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[human]` A founder/operator runs `pnpm stack:up` on a clean machine following only
      `infra/compose/README.md` and the root `README.md`, reaches a working environment, then runs
      `pnpm stack:down` — the PRD §45.3 "stable entry commands" claim is irreducibly a
      clean-machine human check (PRD §45.3, §20.2; CLAUDE.md Gate 2 smoke)
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data
      (breakdown-plan §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and §14/§43 evaluation replays)
- No `cargo test --workspace` / `uv run pytest` item — this ticket authors no Rust or Python; it
      only declares an opt-in service that will build `services/search-rs` once `RETR-01` exists
      (PRD §45.3)

## Test plan

Reviewer steps. The `[machine]` rows require a local container runtime but no network beyond image
pulls already cached by `FND-01`'s prerequisites; no external service is contacted:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/compose` (or the workspace filter `FND-01` established for
   `infra/compose`). Suites live under `infra/compose/test/`.
3. **`guards.test.mjs`** — table-driven over every rejection case in Deliverable 6: `NODE_ENV=production`;
   `AER_PROFILE=production`; an AWS-shaped access key id; a private-key header; a Cloudflare tunnel
   token; a deny-listed hostname in a fixture `.env`. For each, assert a non-zero exit, that the error
   names the offending **key**, and that the offending **value** appears in no output byte (seed each
   with a `secret-canary-<uuid>`).
4. **`compose-shape.test.mjs`** — parse `docker-compose.yml`; assert exactly the five PRD §39.2 service
   names; assert only `3000` is published; assert `search` publishes nothing; assert the three volumes
   are distinct and `corpus` is read-only; assert `search`, `litestream` and `cloudflared` are outside
   the default profile; and assert every language version named in the file or its Dockerfiles equals
   the committed pin — Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1` (breakdown-plan §8 **Q12**).
5. **`env-example.test.mjs`** — secret-shape scan over `.env.example`; assert no match.
6. **`smoke`** — run `node infra/compose/smoke.mjs`. It brings the stack up, asserts `/health/live`
   is `200` and that the worker log contains one started-loop line per PRD §39.5 class, then brings it
   down and asserts nothing survives. Record the wall-clock time in the PR's latency line (PRD §45.4).
7. **Diff check** — `git diff --name-only` against the base branch must list only paths under
   `infra/compose/`.
8. The `[human]` row is a clean-machine run by the founder/operator, recorded in the PR with the exact
   commands executed and any prerequisite that was missing from the documentation.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The root `pnpm stack:up` / `pnpm stack:down` scripts do not exist or do not delegate to
  `infra/compose/stack.mjs`** → this is open question **QR5**. The root `package.json` is
  `00-foundation`'s (`FND-01`, breakdown-plan §4; PRD §45.3 makes those commands its deliverable).
  Raise a `00-foundation` ticket, record it in `docs/prd/03-app-runtime/README.md` §6, and state the
  gap in the PR's known-gaps line (PRD §45.4). **Do not** edit the root manifest from here — it is a
  serial-owned artifact and a cross-module write would break the disjointness parallel lanes depend on.
- **A production artifact turns out to be needed in the local stack** (for example a real Litestream
  container to reproduce a bug) → that crosses into `18-ops-release`'s scope and touches
  breakdown-plan **A7**. Write `docs/prd/breakdown-plan.md` §4.1's "Local/CI Compose" row and
  `docs/prd/03-app-runtime/README.md` §4 D4 **first**, coordinate with `RLSE-02`, then implement.
  Never copy a production deployment file into `infra/compose/**` — two owners of one artifact is the
  exact failure §4.1 exists to prevent.
- **The stack cannot start before `RETR-01`** because `apps/api` or `apps/worker` hard-requires the
  search service → that is a `RUNT-01`/`RUNT-04` configuration issue, not a compose issue: the search
  dependency must be optional under a non-production profile (which is also decision **D6**'s
  readiness policy in `RUNT-08`). Raise it against the owning ticket (docs change, then `--sync`); do
  not stub a fake search service in `infra/compose/**`.
- **A PRD §39.2 memory limit makes the local stack unusable** → the limits are "release-benchmark
  inputs" (PRD §39.2) and the authoritative measurement is `RLSE-11` (`18-ops-release`). Record the
  observed number in the PR's cost/memory line (PRD §45.4) and in
  `docs/prd/03-app-runtime/README.md` §6; keep the PRD value as the committed default and make the
  local override explicit.
- **No usable image or build exists for a Q12-pinned version** (for example no base image publishes
  Node.js `24.18.0`, or the Rust `1.97.1` build of `services/search-rs` fails) → breakdown-plan §8
  **Q12** is confirmed and forbids a silent upgrade, so do **not** substitute a nearer version here.
  Record the evidence, raise it against `FND-01` and the §8 register — the pins and the decision are
  theirs, not this ticket's — and state the gap in the PR's known-gaps line (PRD §45.4). Until it is
  resolved there, the affected service stays out of the default profile rather than running an
  unpinned version.
- **The A7 guard blocks a legitimate CI use** (CI sets a variable the deny-list matches) → PRD §39.2
  admits Compose as a "local/CI convenience", so CI is in scope. Narrow the guard's rule set with a
  named exception in Deliverable 6, `--sync` this ticket, and notify `FND-02`
  (`.github/workflows/**`). Do not disable the guard.

**3. Escalation.** A7 is a decomposition-critical decision recorded in `docs/prd/breakdown-plan.md`
§2.1 and §4.1 that keeps one PRD §44.3 phrase from producing two owners of one artifact. If the local
stack starts drifting into production deployment material, that overturns a team decision
`18-ops-release` depends on: escalate for re-review before any code lands. Never blur the boundary
silently inside this ticket.
