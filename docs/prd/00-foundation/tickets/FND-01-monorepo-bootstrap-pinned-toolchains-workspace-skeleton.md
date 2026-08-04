---
id: FND-01
title: Monorepo bootstrap, pinned toolchains, workspace skeleton
module: 00-foundation
lane: 00-foundation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: []
blocks: [FND-02, FND-03, LNCH-01]
---

# FND-01 — Monorepo bootstrap, pinned toolchains, workspace skeleton

Implements PRD §20.1, §18.2 and §45.3 (epic `E01-REPO`; underpins `DEV-001` and every other
requirement — nothing else in the PRD can be built until this exists).
No ADR — the decision is already made in PRD §20.1 (monorepo layout), §18.2 (technology stack) and
§45.3 (pinned tool-version files), and the exact versions are settled by breakdown plan §8 **Q12**
(CONFIRMED; sub-PRD decision **D17**); this is build ticket 1 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: nothing — this is wave 1 of the whole PRD DAG.
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the PRD §20.1 layout, the §45.3 command list and the §8 Q12 version set) — not a new subsystem
decision.

## Background + basis

The repository today contains `docs/`, `templates/`, `tools/` (two PowerShell scripts), `CLAUDE.md`,
`.claude/`, `.github/{ISSUE_TEMPLATE,PULL_REQUEST_TEMPLATE.md}`, a UTF-16-encoded stub `README.md`,
`.gitignore` and `.gitattributes`. There is no `package.json`, no workspace, no toolchain pin and no
product code. 235 of the plan's 236 tickets are transitively blocked on this one.

**PRD §20.1 fixes the layout** (quoted verbatim — this tree is the acceptance target):

```text
apps/{web,api,worker,admin,widget}
services/search-rs
packages/{contracts,domain,database,auth,retrieval-client,model-gateway,pii,citations,jobs,observability,ui,sdk-typescript}
pipelines/{ingestion,adapters,corpus-builder,embeddings,evaluation}
sdk/python
schemas/{openapi,events,corpus-manifest,evaluation}
evals/{cases,gold,splits,reports}
infra/{compose,cloudflare,aws,backup,deploy,recovery}
docs/{discovery,archive,adr,runbooks,api}
tests/{integration,tenant-isolation,security,e2e}
```

and adds: *"Contracts and framework-independent domain rules are centralised. Generated
OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited. Lockfiles, canonical enums, OpenAPI roots,
migration sequence, corpus manifest schema and production deployment files require serialised ownership
during multi-agent work."*

**PRD §45.3 fixes the entry commands** — *"Week 1 must make these stable entry commands real and
document platform prerequisites in the root `README.md`"*:

```text
corepack pnpm install --frozen-lockfile
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm generate && pnpm generated:check
cargo test --workspace
uv sync --frozen
uv run pytest
pnpm eval:smoke
pnpm stack:up
pnpm stack:down
```

and closes with: *"Exact Node/pnpm/Python/Rust versions belong in committed tool-version files and
lockfiles selected in E01, not in human memory. CI and local development use the same pinned versions."*

**The versions are already decided — this ticket commits them, it does not choose them.** Breakdown
plan §8 **Q12** is a **CONFIRMED** decision (owner `00-foundation`, resolving ticket `FND-01`; recorded
as sub-PRD decision **D17**):

| Tool | Exact version |
|---|---|
| Node.js | `24.18.0` |
| pnpm | `11.4.0` |
| Rust | `1.97.1` |
| Python | `3.14.6` |

Committed pin files, at minimum: `.node-version`, `package.json#packageManager`,
`package.json#engines.node`, `rust-toolchain.toml`, `pyproject.toml#requires-python`, and the
corresponding lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`).

The rules that come with the decision, binding on this ticket:

- Node **24 LTS** — not Node 26, which is still Current.
- **No silent upgrade** to a newer patch or major during implementation.
- **CI and local development use the same exact versions.** `FND-02` reads these pin files and states no
  version literal of its own.
- If this ticket's clean bootstrap proves an accepted version **incompatible with a mandatory
  dependency**, the evidence is recorded through the Feedback obligation below **before** any version is
  changed.
- Developer preference is never a reason to reopen Q12.

**PRD §18.2 fixes the stack** (rows this ticket must honour): *"Web/admin/widget — React + Vite,
TypeScript"*; *"API/SSE/business logic — Fastify, TypeScript, **Active LTS Node.js pinned to an exact
version**"* — Node `24.18.0` is that Active LTS pin; *"Lexical/field/citation search — Rust + Tantivy"*;
*"Dense vector index — Rust + USearch"*; *"Ingestion/build/evaluation — Local Python pipeline"*.
PRD §18.1 adds: *"Use a modular monolith in one repository and one versioned application release with
separately supervised runtime processes: TypeScript app/API/auth; TypeScript worker; Rust search
process."*

**PRD §44.2 epic `E01-REPO`** (week 1): deliverable *"pnpm/TypeScript, Cargo and Python/uv monorepo;
pinned tools; CI"*, depends on "PRD", exit evidence *"Clean bootstrap/build/test"*.

**PRD §44.3**: *"Serial owners are required for root lockfiles, canonical enums, OpenAPI root, app
migration order, corpus schema/manifest, active release/promotion files and production
Compose/deployment configuration."* Breakdown plan §4.1 assigns the root-lockfile row to this ticket:
it owns **the pins**; any later ticket that adds a declared dependency regenerates the lockfile as a
build artifact and resolves conflicts by re-running the package manager, never by hand-merging.

**PRD §20.2**: *"Coding agents MUST NOT receive production SSH, database, backup, signing or provider
credentials by default."* No entry command this ticket creates may require a secret.

**PRD §21.1** (supply chain): *"Pinned dependencies/images, lockfiles, SBOM, scans, signed manifests and
no arbitrary runtime plugin/model/code download."*

**Breakdown plan §1.1, "Package manifests"** — binding on this ticket: *"`FND-01` creates the empty
workspace-member skeleton (manifest + tsconfig/`Cargo.toml`/`pyproject.toml` for every member in PRD
§20.1). Thereafter each **module** owns its members' manifests; within a module a manifest is
append-only shared, and conflicts resolve by re-running the package manager."*

**Accepted caveats carried forward, not re-litigated:**

- `pnpm dev`, `pnpm stack:up`, `pnpm stack:down` and `pnpm eval:smoke` have no implementation yet —
  they are owned by `RUNT-01`/`RUNT-09` (`03-app-runtime`) and `GOLD-03` (`21-evaluation-600`). PRD
  §45.3 still requires them to be real entry commands in week 1. They exist here as recursive
  delegators that exit 0 and name their future owner; that is documented behaviour, not a stub that
  pretends to work.
- `tools/validate-prd.ps1` and `tools/export-visible-transcript.ps1` already exist and are **frozen**
  by breakdown plan §4 ("the two pre-existing `tools/*.ps1`"). This ticket documents the first as an
  entry command and must not modify either.
- The existing root `README.md` is a UTF-16 stub; it is replaced (UTF-8, LF).

## Goal

Produce a repository that a fresh clone can bootstrap and verify offline: a pnpm workspace, a Cargo
workspace and a uv workspace running the breakdown plan §8 Q12 versions — Node `24.18.0`, pnpm
`11.4.0`, Rust `1.97.1`, Python `3.14.6` — committed in tool-version files and three lockfiles; every
PRD §20.1 directory present with its manifest, `tsconfig` where applicable and one empty entry file;
every one of the fourteen PRD §45.3 entry commands present and exiting 0; and a root `README.md`
documenting platform prerequisites, the layout and which ticket owns each not-yet-implemented command.
Completion is mechanically checkable: assert the five pin fields against their literal Q12 values, run
the fourteen commands from a clean clone and assert exit status 0, then assert the §20.1 tree against a
committed fixture.

## Non-goals

- **No application, worker, web, search, pipeline or SDK source code.** Only empty entry files (see
  File-scope). `apps/api` is `03-app-runtime`/`RUNT-01`; `apps/web` is `RUNT-05`; `apps/worker` is
  `RUNT-04`; `services/search-rs` is `11-retrieval-engine`/`RETR-01`; `pipelines/*` are modules 04, 05
  and 21; `sdk/python` is `20-developer-platform`/`PLTF-03`.
- **No CI workflow files** — `.github/workflows/**` is `FND-02`, which is `blocked_by` this ticket.
- **No enums, OpenAPI, event schemas or domain rules** — `FND-03` … `FND-10` in this same module.
- **No Compose or infrastructure** — `infra/compose/**` is `03-app-runtime`/`RUNT-09`; the rest of
  `infra/**` is `18-ops-release`. This ticket creates the directories only where PRD §20.1 requires
  them and a manifest is applicable; it does not populate them.
- **No edits to the two pre-existing `tools/*.ps1` scripts, `templates/**`, `CLAUDE.md`, `.claude/**`,
  `docs/PRD.md`, `docs/discovery/**` or `docs/archive/**`** — frozen by breakdown plan §4.
- **No edits to `.github/PULL_REQUEST_TEMPLATE.md` or `.github/ISSUE_TEMPLATE/**`** — unallocated by
  breakdown plan §4; see sub-PRD open question Q-F6.
- **No re-selection of the toolchain versions.** Breakdown plan §8 Q12 fixed them (Background above);
  this ticket commits those exact values and proves a clean bootstrap against them. Substituting a
  "newer patch", a different LTS line or a locally convenient version is out of scope — see Feedback
  obligation 3.
- **No dependency selection beyond what the fourteen entry commands need.** Choosing Fastify, React,
  Kysely/`better-sqlite3`, Tantivy or USearch versions belongs to the tickets that introduce them. The
  SQLite access layer in particular is already settled — breakdown plan §8 **Q13** (CONFIRMED):
  Kysely-style repositories over `better-sqlite3`, Drizzle not used, and raw `.sql` files remaining the
  only migration authoring format — and it is owned and implemented by `01-app-data`/`DATA-01`, not
  here. This ticket pins the *toolchain*, not the product's libraries, and declares neither dependency.
- **No SBOM, signing or release archive** — PRD §21.1's SBOM lands with the immutable release archive,
  `18-ops-release`/`RLSE-01`.

## File-scope (write-owns)

Owned by this ticket:

- Root manifests, lockfiles and tool-version files: `package.json`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, `.npmrc`, `.node-version`, `tsconfig.base.json`, `Cargo.toml`, `Cargo.lock`,
  `rust-toolchain.toml`, `pyproject.toml`, `uv.lock`, `.editorconfig`, `README.md`.
- `tools/**` — **except** the two pre-existing PowerShell scripts (see below).
- The **empty PRD §20.1 member skeleton**, bounded to exactly these file kinds per member and nothing
  else (breakdown plan §1.1; sub-PRD decision D2, open question Q-F1):
  - `<member>/package.json` and `<member>/tsconfig.json` for every pnpm member;
  - `<member>/Cargo.toml` for every Cargo member;
  - `<member>/pyproject.toml` for every uv member;
  - **one** empty entry file per member — `src/index.ts` (TypeScript, containing `export {}` and nothing
    else), `src/lib.rs` (Rust, empty module), `<pkg>/__init__.py` (Python, empty) — required because
    `pnpm typecheck`, `cargo test --workspace` and `uv run pytest` cannot run on a manifest alone.
  - `.gitkeep` in a PRD §20.1 directory that has no manifest of its own.

Does not touch:

- `.github/workflows/**` — `FND-02` (same module, next wave).
- `packages/contracts/src/**`, `packages/domain/src/**`, `schemas/openapi/**`, `schemas/events/**` —
  `FND-03` … `FND-10` (same module, wave 3). This ticket creates only their manifests and empty entry
  files.
- Everything under any other module's write-owns row in breakdown plan §4 beyond the skeleton files
  listed above: `packages/database/**` (`01-app-data`), `packages/auth/**` (`02-auth-core`),
  `apps/**` and `packages/{ui,observability}/**` (`03-app-runtime`), `pipelines/**` (modules 04, 05,
  06–10, 21), `services/search-rs/**` and `packages/retrieval-client/**` (`11-retrieval-engine`),
  `packages/{pii,citations,model-gateway}/**` (`12-evidence-safety`), `infra/**` (`18-ops-release`,
  `03-app-runtime`), `packages/sdk-typescript/**` and `sdk/python/**` (`20-developer-platform`),
  `evals/**` and `schemas/evaluation/**` (`21-evaluation-600`), `tests/**` (`23-assurance`).
- `tools/validate-prd.ps1`, `tools/export-visible-transcript.ps1`, `templates/**`, `CLAUDE.md`,
  `.claude/**`, `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**` — frozen (breakdown plan §4).
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitignore`, `.gitattributes` —
  unallocated by breakdown plan §4. If a build artifact must be ignored, see the Feedback obligation
  before touching `.gitignore`.

**Serial-safety analysis.** This is the first decomposition; nothing has been merged and no ticket has
run. Breakdown plan §7 puts the whole-PRD wave widths at `1, 3, 12, …` — **wave 1 has width 1, and this
ticket is it**. No sibling and no cross-module ticket can be in flight while it runs, which is precisely
why the member-skeleton exception (writing one manifest and one empty entry file inside directories
other modules will later own) is safe here and nowhere else. Its two direct dependents, `FND-02`
(`.github/workflows/**`) and `FND-03` (`packages/contracts/src/{enums,ids}/**`), are `blocked_by` this
ticket and have disjoint scopes from each other, so wave 2 is contention-free.

## Deliverables

1. **`pnpm-workspace.yaml`** using globs, never an enumerated member list (sub-PRD D3):
   `packages: ['apps/*', 'packages/*', 'tests/*']`. A later module that adds a directory must never
   have to edit this file.
2. **Root `package.json`**: `"private": true`; `"packageManager": "pnpm@11.4.0"`;
   `"engines": { "node": "24.18.0" }` (both exactly as breakdown plan §8 Q12 fixes them — no range, no
   caret, no `>=`); and a `scripts` entry for each of these ten names —
   `dev`, `lint`, `typecheck`, `test`, `test:integration`, `generate`, `generated:check`, `eval:smoke`,
   `stack:up`, `stack:down`. Each delegates recursively (`pnpm -r --if-present run <name>`) and, when no
   workspace package provides it, exits **0** after printing exactly one line naming the owner, e.g.
   `stack:up: not implemented yet (owner: RUNT-09, module 03-app-runtime)`. Owners to name:
   `dev` → `RUNT-01`/`RUNT-05`, `stack:up`/`stack:down` → `RUNT-09`, `eval:smoke` → `GOLD-03`,
   `test:integration` → `23-assurance`/`ASSR-*`, `generate`/`generated:check` → `FND-04`/`FND-05`.
3. **`.node-version`** containing exactly `24.18.0` — the Active LTS line Q12 fixed (PRD §18.2
   "pinned to an exact version"; Node 26 is Current and must not be used) —
   **`.npmrc`** with at least `engine-strict=true` and `prefer-frozen-lockfile=true`, and
   **`.editorconfig`** (UTF-8, LF, final newline).
4. **`tsconfig.base.json`** with `"strict": true`, `"noUncheckedIndexedAccess": true`,
   `"moduleResolution"` and `"target"` consistent with Node `24.18.0`, and workspace path mappings.
   Every member `tsconfig.json` extends it and adds nothing but its own `include`/`references`.
5. **Cargo workspace**: root `Cargo.toml` with `[workspace]`, `resolver = "2"` and
   `members = ["services/search-rs"]`; `rust-toolchain.toml` pinning `channel = "1.97.1"` exactly
   (§8 Q12 — not `stable`, not a range) plus the `rustfmt` and `clippy` components; `Cargo.lock`
   committed. `services/search-rs/Cargo.toml` + an empty `src/lib.rs` so `cargo test --workspace`
   exits 0 with zero tests.
6. **uv workspace**: root `pyproject.toml` whose `requires-python` pins Python `3.14.6` exactly
   (§8 Q12 — an exact specifier such as `requires-python = "==3.14.6"`, never `>=`), plus
   `[tool.uv.workspace]` members covering `pipelines/*` and `sdk/python`, and a
   `[tool.pytest.ini_options]` section; `uv.lock` committed. `uv run pytest` must exit **0** on a tree
   with no tests — pytest's "no tests collected" exit code 5 must be handled deliberately (either a root
   collection hook or one trivial import smoke test per Python member; the choice is the Builder's, the
   exit code is not).
7. **The PRD §20.1 member skeleton** exactly as bounded in File-scope: every directory in the §20.1 tree
   exists; every pnpm/Cargo/uv member has its manifest, its `tsconfig.json` where applicable, and one
   empty entry file. No member contains logic, dependencies beyond the toolchain, or exports beyond an
   empty one.
8. **Root `README.md`** (UTF-8, LF) containing, at minimum: platform prerequisites (Windows 11 is the
   founder's workstation — PRD §19.3 "Local workstation"), the four exact pinned versions
   (Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`) and the file each is recorded in,
   the PRD §20.1 layout with each directory's owning module from breakdown plan §4, the
   fourteen PRD §45.3 entry commands each with a one-line description and — where not yet implemented —
   its owning ticket, `tools/validate-prd.ps1` invoked exactly as PRD §45.3 spells it, and PRD §20.2's
   rule that no entry command requires a production credential.
9. **`tools/**`**: a verification script (name at the Builder's discretion, e.g.
   `tools/check-workspace.mjs`) that (a) asserts the §20.1 tree against the committed fixture, (b) asserts
   the five pin fields against `tools/fixtures/toolchain-pins.json`, and (c) runs each of the fourteen
   entry commands and reports non-zero exits. It must be invocable without network access and must not
   modify the tree.
10. **Fixtures**:
    - `tools/fixtures/prd-20-1-layout.json` — the PRD §20.1 tree transcribed verbatim, used by
      deliverable 9 and by the acceptance checklist;
    - `tools/fixtures/toolchain-pins.json` — the breakdown plan §8 Q12 values transcribed verbatim
      (`node: "24.18.0"`, `pnpm: "11.4.0"`, `rust: "1.97.1"`, `python: "3.14.6"`) with the file and field
      each must appear in, so a version drift is a failing test rather than a review comment.

Ordering constraint: deliverables 1–6 must land before 7, and 7 before 8–10, because the README and the
verification script assert the state produced by the earlier steps.

## Acceptance checklist (classified)

- [ ] `[machine]` `corepack pnpm install --frozen-lockfile` succeeds from a clean clone and leaves
      `pnpm-lock.yaml` byte-identical (PRD §45.3; PRD §44.3 root-lockfile serial ownership).
- [ ] `[machine]` All fourteen PRD §45.3 entry commands exist and exit 0; the four not-yet-implemented
      ones each print exactly one owner-naming line (PRD §45.3; `E01-REPO` exit evidence).
- [ ] `[fixture]` The five pin fields carry the breakdown plan §8 **Q12** values, asserted against the
      literal strings in `tools/fixtures/toolchain-pins.json`: `.node-version` = `24.18.0`,
      `package.json#packageManager` = `pnpm@11.4.0`, `package.json#engines.node` = `24.18.0`,
      `rust-toolchain.toml` channel = `1.97.1`, `pyproject.toml#requires-python` pinned to `3.14.6`.
      A different-but-valid version fails this test (§8 Q12; PRD §45.3, §18.2).
- [ ] `[machine]` Every version is exact, not a range: those same five fields fail a regex test if they
      contain `^`, `~`, `*`, `>=` or `latest` (PRD §18.2 "pinned to an exact version").
- [ ] `[machine]` The toolchain actually running the bootstrap matches the pins: `node -v`, `pnpm -v`,
      `rustc --version` and `python --version` (or `uv run python --version`) report `24.18.0`,
      `11.4.0`, `1.97.1` and `3.14.6` (PRD §45.3 "CI and local development use the same pinned
      versions"; §8 Q12).
- [ ] `[fixture]` The PRD §20.1 directory tree replays green against `tools/fixtures/prd-20-1-layout.json`:
      every listed directory exists, and no extra top-level directory has been introduced (PRD §20.1).
- [ ] `[machine]` Every pnpm member has `package.json` + `tsconfig.json` extending `tsconfig.base.json`;
      every Cargo member has `Cargo.toml`; every uv member has `pyproject.toml` (breakdown plan §1.1).
- [ ] `[machine]` No skeleton entry file contains anything but an empty export/module — asserted by
      file-content comparison, so a Builder cannot smuggle another module's code in (breakdown plan §4).
- [ ] `[machine]` `pnpm typecheck` passes with `strict: true` in `tsconfig.base.json` (PRD §20.3
      "TypeScript type/unit tests").
- [ ] `[machine]` `pnpm lint` passes (PRD §20.3).
- [ ] `[machine]` `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `cargo test --workspace` green — this ticket creates the Cargo workspace (PRD §45.3,
      §20.3 "Rust and Python builds/tests").
- [ ] `[machine]` `uv sync --frozen` then `uv run pytest` green and exit 0 on an empty test tree
      (PRD §45.3, §20.3).
- [ ] `[machine]` No entry command reads a secret: a grep-style assertion that root scripts and
      `tools/**` reference no `*_TOKEN`, `*_SECRET`, `*_KEY`, `AWS_*` or provider credential env var
      (PRD §20.2).
- [ ] `[machine]` The two pre-existing `tools/*.ps1` files, `templates/**`, `CLAUDE.md`, `.claude/**`,
      `docs/PRD.md` and `.github/{ISSUE_TEMPLATE,PULL_REQUEST_TEMPLATE.md}` are unchanged in the diff
      (breakdown plan §4 frozen/unallocated rows).
- [ ] `[machine]` `README.md` is valid UTF-8 with LF endings, contains all fourteen §45.3 commands
      verbatim and states the four pinned versions with the file each lives in (PRD §45.3 "document
      platform prerequisites in the root `README.md`"; §8 Q12).
- [ ] `[human]` A fresh clone bootstraps on the founder's Windows 11 workstation following only the
      README prerequisites — `E01-REPO` exit evidence "Clean bootstrap" (PRD §44.2, §19.3). **Gate 2
      smoke; not required to merge.**
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-001`, `E01-REPO`), user-visible
      change and non-goals, schema/API/event compatibility impact (none — no contract yet),
      tenant/PII/security impact (none — no data path), source/licence impact (none),
      cost/memory/latency impact (none), rollback path (revert the bootstrap commit), known gaps
      (the four owner-named unimplemented commands).

Absent classes: `[fixture]` covers the §20.1 layout replay and the §8 Q12 pin transcription only — there
is no recorded adapter or evaluation data at this point in the build (PRD §40.8 fixtures arrive with
`05-ingestion-framework`, §43 replays with `21-evaluation-600`). `[human]` is limited to the single
Gate 2 bootstrap item; there is no UI, API or answer behaviour to judge (PRD §41.2 `UAT-*` scripts all
target later modules).

## Test plan

Reviewer steps, all reproducible offline once the package caches are warm:

1. **Clean-clone bootstrap.** `git clone` into a scratch directory; run
   `corepack pnpm install --frozen-lockfile`; assert exit 0 and `git status --porcelain pnpm-lock.yaml`
   is empty.
2. **Entry-command sweep.** Run `node tools/check-workspace.mjs` (deliverable 9). It executes each of
   the fourteen PRD §45.3 commands and prints a table of command → exit code → stdout first line.
   Assert every exit code is 0 and the four unimplemented commands print their owner line. Then run the
   four toolchain commands directly to confirm the harness is not masking anything:
   `pnpm typecheck`, `pnpm test`, `cargo test --workspace`, `uv run pytest`.
3. **Layout fixture replay.** The layout test compares the on-disk tree to
   `tools/fixtures/prd-20-1-layout.json`. To confirm the test is real rather than vacuous, temporarily
   rename one §20.1 directory and re-run — it must fail naming that directory — then restore.
4. **Pin assertions.** Read `tools/fixtures/toolchain-pins.json` against breakdown plan §8 Q12 value by
   value — a paraphrased fixture makes the check vacuous. Run the pin test; then temporarily edit
   `.node-version` to a range (`>=22`) and re-run — it must fail; then set it to another *valid but
   different* exact version (`24.17.0`) and re-run — it must still fail, naming Q12; then restore.
   Finally run `node -v`, `pnpm -v`, `rustc --version` and `python --version` and confirm they match the
   pins (PRD §45.3: the same versions locally and in CI).
5. **Skeleton purity.** Run the entry-file content test; temporarily add a `console.log` to one
   `src/index.ts` and re-run — it must fail — then restore.
6. **Frozen-path check.** `git diff --name-only <base>..HEAD` must contain none of the frozen or
   unallocated paths listed in File-scope.
7. **Secret scan.** Run the no-secret assertion; confirm it inspects `package.json` scripts *and*
   `tools/**`.

Harness: plain Node test runner or Vitest inside the root workspace — the Builder's choice, since no
test framework exists yet to copy from; whatever is chosen becomes the pattern `FND-03` … `FND-10`
copy, so it must be declared in the README. No mocks or fixtures beyond
`tools/fixtures/prd-20-1-layout.json` and `tools/fixtures/toolchain-pins.json`. No network access is
required by any step.

## Feedback obligation

**General rule.** If implementation falsifies anything in this ticket, update this ticket (and
`docs/prd/00-foundation/README.md` where the decision is recorded) **first** — version +0.1 with a
changelog line — then change code. Silent divergence is an incomplete ticket, not a shortcut. Re-publish
the issue from the ticket (`publish-tickets.mjs --sync`) before continuing.

**Foreseeable frictions, each with its writeback target:**

1. **A workspace member needs more than a manifest + one empty entry file** to make its toolchain command
   pass (for example a Cargo member requiring a `[lib]` target file layout, or a uv member requiring a
   `src/` package). → Update **`docs/prd/breakdown-plan.md` §1.1 "Package manifests"** and
   **`docs/prd/00-foundation/README.md` D2 / Q-F1** *before* writing the extra file. The rule that
   `FND-01` may write inside other modules' trees is bounded deliberately; widening it silently would
   make the file-ownership cut unenforceable.
2. **A root file outside breakdown plan §4's `00-foundation` row is required** (for example a root
   `conftest.py` so `uv run pytest` exits 0, or a `.gitignore` entry for `node_modules`/`target`/`.venv`).
   → Add the path to **`docs/prd/breakdown-plan.md` §4** (`00-foundation` write-owns row) and to this
   sub-PRD's Scope section in the same PR. See README Q-F7.
3. **A breakdown plan §8 Q12 version proves incompatible with a mandatory dependency** PRD §18.2 names
   (Fastify, React + Vite, `better-sqlite3`, Tantivy, USearch) or with a required platform. → Q12 is a
   **confirmed decision**, so the order is fixed and not negotiable: record the failing evidence — the
   exact command, the dependency, the error output — in this ticket and in
   **`docs/prd/00-foundation/README.md` D17**, and raise it against **`docs/prd/breakdown-plan.md` §8
   Q12**, **before** any value in a pin file changes; then re-publish the issue
   (`publish-tickets.mjs --sync`). A newer patch release, a nicer toolchain or developer preference is
   never sufficient reason. If the conflict forces leaving PRD §18.2's named stack altogether, that is
   an architecture decision: create **`docs/adr/NNNN-<slug>.md`** (per PRD §45.5 and breakdown plan §2.1
   A9) and escalate — do not substitute a technology inside this ticket.
4. **`pnpm-workspace.yaml` globs cannot express a member** (a member outside `apps/*`, `packages/*`,
   `tests/*`). → Record the enumerated exception in **`docs/prd/00-foundation/README.md` D3**; it means
   a future module will have to edit a root file, which is a known contention risk (breakdown plan §9
   R7) and must be visible, not buried.
5. **An entry command cannot exist without a real implementation** (i.e. a delegator that exits 0 would
   be actively misleading). → Update this ticket's deliverable 2 and **README D3**, and name the owning
   ticket explicitly in the failure message; never delete a command from the §45.3 list — PRD §45.3 is
   normative.

**Escalation.** If `corepack`/pnpm, the Cargo workspace or uv cannot be used at all on the target
platforms, that falsifies PRD §18.2 and §45.3 — a team-level decision, not a local fix. Stop, raise an
ADR under `docs/adr/`, and escalate to the human. Never swap the package manager, the workspace model or
the language toolchain silently inside this ticket.
