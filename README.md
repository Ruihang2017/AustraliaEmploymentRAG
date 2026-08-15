# AustraliaEmploymentRAG

Monorepo for the AustraliaEmploymentRAG MVP. The authoritative specification is
[`docs/PRD.md`](docs/PRD.md); the decomposition into modules and tickets lives under
[`docs/prd/`](docs/prd/). This file documents how to bootstrap and verify the repository — PRD §45.3
requires the entry commands below to be real and the prerequisites to be documented here.

Delivered by ticket `FND-01` (`docs/prd/00-foundation/tickets/`). Everything here is toolchain and
skeleton: there is **no product code yet**.

---

## 1. Pinned toolchain versions

Fixed by breakdown plan §8 **Q12 (CONFIRMED)** and recorded as sub-PRD decision **D17**. These are
exact pins, not ranges. CI and local development use the same versions (PRD §45.3), and `FND-02` reads
them from these files rather than restating them.

| Tool | Exact version | Recorded in |
|---|---|---|
| Node.js | `24.18.0` | `.node-version`, and `package.json` key `engines.node` |
| pnpm | `11.4.0` | `package.json` key `packageManager` (`pnpm@11.4.0`) |
| Rust | `1.97.1` | `rust-toolchain.toml` key `[toolchain] channel` |
| Python | `3.14.6` | `pyproject.toml` key `project.requires-python` (`==3.14.6`) |

Lockfiles committed alongside them: `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`.

> **Do not "upgrade" a pin.** Newer releases exist for all four; Q12 is a confirmed decision and a newer
> patch is not evidence against it. `tools/fixtures/toolchain-pins.json` makes a drifted pin a failing
> test rather than a review comment — a *valid but different* version fails too. To change one, follow
> the `FND-01` ticket's Feedback obligation 3 first: record the failing evidence in the ticket and in
> `docs/prd/00-foundation/README.md` D17, raise it against breakdown plan §8 Q12, and only then edit a
> pin file.

## 2. Platform prerequisites

The founder's workstation is **Windows 11** (PRD §19.3, "Local workstation"). Linux and macOS work the
same way; only the shell for the PowerShell entry command differs.

1. **Node.js `24.18.0`** — install the exact version (nvm-windows, `fnm`, or the official
   `node-v24.18.0-win-x64` archive). Do not install "latest LTS": that resolves to a newer patch.
   Verify with `node -v`, which must print `v24.18.0`.
2. **Corepack** — ships with Node 24. Enable the pnpm shim once, so the `pnpm ...` commands below work
   on PATH:

   ```text
   corepack enable pnpm
   ```

   Corepack then installs pnpm `11.4.0` from `package.json` key `packageManager`. Verify with
   `pnpm -v`, which must print `11.4.0`. In a non-interactive shell (CI), set
   `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
3. **Rust `1.97.1`** — install `rustup`. Nothing else to do: `rust-toolchain.toml` makes the first
   in-repo `cargo` command fetch toolchain `1.97.1` with `rustfmt` and `clippy`. Verify with
   `rustc --version`, which must print `rustc 1.97.1`.
4. **uv** (Astral) — the Python workspace manager. Install user-scope:

   ```text
   powershell -NoProfile -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

   Then install the pinned interpreter: `uv python install 3.14.6`. Verify with
   `uv run python --version`, which must print `Python 3.14.6`. No separate system Python is required.
5. **PowerShell 5.1+** — for the PRD validation entry command. Preinstalled on Windows 11; elsewhere
   install PowerShell 7.

No administrator rights and **no credentials** are required at any step. PRD §20.2 forbids giving
coding agents production SSH, database, backup, signing or provider credentials by default, so **no
entry command in §4 reads a secret** — a test asserts this (see §6).

## 3. Bootstrap

```text
corepack pnpm install --frozen-lockfile
uv sync --frozen
cargo test --workspace
```

The three lockfiles are serial-owned by `00-foundation` (PRD §44.3, breakdown plan §4.1). A ticket that
adds a dependency **regenerates** the lockfile with the pinned package manager and never hand-merges a
conflict.

## 4. Entry commands (PRD §45.3)

All fourteen exist. Four of them — `pnpm dev`, `pnpm eval:smoke`, `pnpm stack:up`, `pnpm stack:down` —
plus `pnpm test:integration`, `pnpm generate` and `pnpm generated:check` have no implementation yet.
They are **not** stubs pretending to work: each prints exactly one line naming the ticket that owns it
and exits 0, and PRD §45.3 is normative, so none may be deleted from this list.

| Command | What it does | Owner, if not implemented yet |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | Install the pnpm workspace from the committed lockfile without rewriting it. | — |
| `powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1` | Validate `docs/PRD.md` structure and invariants. Run it with the `-Path` argument below; on Linux, with `pwsh`. | — |
| `pnpm dev` | Run the local development processes. | `RUNT-01/RUNT-05`, module `03-app-runtime` |
| `pnpm lint` | Lint the repository — the PRD §20.3 gate. | — |
| `pnpm typecheck` | TypeScript type-check every workspace member. | — |
| `pnpm test` | Run the TypeScript unit/workspace test suite. | — |
| `pnpm test:integration` | Run the cross-boundary integration suite. | `ASSR-*`, module `23-assurance` |
| `pnpm generate && pnpm generated:check` | Regenerate contract bindings and assert the generated tree is clean. | `FND-04/FND-05`, module `00-foundation` |
| `cargo test --workspace` | Build and test the Rust workspace. | — |
| `uv sync --frozen` | Sync the Python workspace from the committed `uv.lock`. | — |
| `uv run pytest` | Run the Python test suite. | — |
| `pnpm eval:smoke` | Run the evaluation smoke subset. | `GOLD-03`, module `21-evaluation-600` |
| `pnpm stack:up` | Start the local stack. | `RUNT-09`, module `03-app-runtime` |
| `pnpm stack:down` | Stop the local stack. | `RUNT-09`, module `03-app-runtime` |

The command strings live once, in `tools/fixtures/entry-commands.json`, which both the verification
sweep and the README test read — so this table cannot drift from what actually runs.

**One command carries an argument PRD §45.3 does not spell.** `tools/validate-prd.ps1` resolves its
default `-Path` to `(Split-Path $PSScriptRoot -Parent)/PRD.md` — a repo-root `PRD.md` — but this
repository's PRD lives at `docs/PRD.md`, so the bare command throws `PRD not found` and exits 1. The
script is frozen (breakdown plan §4) and so is `docs/PRD.md`, so the invocation carries the path
explicitly:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1 -Path docs/PRD.md
```

That is what the sweep runs and what you should run; it exits 0 (`Result : PASS`). The difference is
recorded as a `deviation` on that one fixture entry — **not** a failure waiver, which the fixture
forbids and `tools/tests/entry-commands.test.mjs` asserts is absent. Made spec by `FND-01` v1.1 /
sub-PRD `00-foundation` decision **D18**; the durable fix (the script's default path, or the PRD §45.3
text) is escalated to the Architect and is outside this ticket's file-scope.

**And one carries a different interpreter on Linux.** `powershell` is the Windows PowerShell 5.1
executable and does not exist on a Linux runner — the bare token gives `powershell: not found` and
exit 127 on `ubuntu-latest`. PowerShell 7 ships there as `pwsh` and runs the same frozen script
unmodified, so on Linux the same command is:

```text
pwsh -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1 -Path docs/PRD.md
```

Only the leading interpreter token changes; the script path and the `-Path` argument are identical.
This is recorded as a `platforms` substitution on that one fixture entry — again **not** a failure
waiver, which is forbidden on every platform — authorised by `FND-22` / PRD-02 requirement
**DEV-006**, with the same durable fix escalated as `Q-CI-D` (amend the PRD §45.3 text, or unfreeze
`tools/validate-prd.ps1`). Both the sweep and the test select the invocation for the platform they
run on through one shared resolver.

Root `package.json` scripts are thin: each is `node tools/workspace-script.mjs <name>`, which runs the
root implementation (if any), then `pnpm -r --if-present run <name>`, and falls back to the owner line
above when neither the root nor any workspace package provides the script. `pnpm-workspace.yaml` uses
**globs**, so a later module never edits a root file to register a new package.

## 5. Repository layout (PRD §20.1)

Every path is write-owned by exactly one module (breakdown plan §4). Read access is unrestricted.

| Directory | Owning module |
|---|---|
| `apps/web`, `apps/admin`, `apps/widget`, `apps/api`, `apps/worker` | `03-app-runtime` owns the shell; product routes and features split across `13-identity-surface`, `14-search-product`, `15-answer-product`, `16-monitor-alerts`, `17-records-collab`, `19-exports`, `20-developer-platform`, `22-internal-admin` |
| `services/search-rs` | `11-retrieval-engine` |
| `packages/contracts`, `packages/domain` | `00-foundation` |
| `packages/database`, `packages/jobs` | `01-app-data` |
| `packages/auth` | `02-auth-core` |
| `packages/ui`, `packages/observability` | `03-app-runtime` |
| `packages/retrieval-client` | `11-retrieval-engine` |
| `packages/pii`, `packages/citations`, `packages/model-gateway` | `12-evidence-safety` |
| `packages/sdk-typescript` | `20-developer-platform` |
| `pipelines/corpus-builder`, `pipelines/embeddings` | `04-corpus-contract` |
| `pipelines/ingestion` | `05-ingestion-framework` |
| `pipelines/adapters` | `06-sources-legislation`, `07-sources-instruments`, `08-sources-cases`, `09-sources-adjacent`, `10-sources-future` |
| `pipelines/evaluation` | `21-evaluation-600` |
| `sdk/python` | `20-developer-platform` |
| `schemas/openapi`, `schemas/events` | `00-foundation` |
| `schemas/corpus-manifest` | `04-corpus-contract` |
| `schemas/evaluation` | `21-evaluation-600` |
| `evals/cases`, `evals/gold`, `evals/splits`, `evals/reports` | `21-evaluation-600` |
| `infra/compose` | `03-app-runtime` |
| `infra/cloudflare`, `infra/aws`, `infra/backup`, `infra/deploy`, `infra/recovery` | `18-ops-release` |
| `docs/runbooks` | `18-ops-release` |
| `docs/api` | `20-developer-platform` |
| `docs/discovery`, `docs/archive` | frozen — no module writes |
| `docs/adr` | shared-additive, one file per creating ticket |
| `tests/integration`, `tests/tenant-isolation`, `tests/security`, `tests/e2e` | `23-assurance` |

> **The `evals/gold` tree is blind gold** (PRD §45.1 item 6, breakdown plan §9 R9). `FND-01` created the
> directory and never read its contents. Do not open, list or add to it outside `21-evaluation-600`.

Every member currently holds only a manifest, a `tsconfig.json` where applicable, and one **empty**
entry file (`src/index.ts` containing `export {};`, an empty `src/lib.rs`, an empty `__init__.py`).
A test asserts those files stay empty until their owning module fills them.

## 6. Conventions this repository registered

Fixed here because 235 later tickets inherit them; changing one later touches every module.

| Convention | Choice | Notes |
|---|---|---|
| Test framework | **Vitest** (`4.1.10`, exact) | Config at `tools/vitest.config.mjs`; run with `pnpm test`. `expectTypeOf` covers the type-test need for `FND-03`, and `--typecheck` covers `FND-04`'s generated-binding assertions. |
| Linter | **ESLint** flat config (`10.8.0`, exact) with `typescript-eslint` | Config at `tools/eslint.config.mjs`, invoked as `eslint --config tools/eslint.config.mjs .`. Kept under `tools/` so no unallocated root config file exists. |
| TypeScript | `6.0.3`, exact | Held at the 6.x line because `typescript-eslint` does not support TypeScript 7 yet (upstream issue 10940); moving to 7.x means re-checking the §20.3 lint gate first. |
| TypeScript package names | `@taxrag/<directory-name>`, with `tests/*` flattened | `packages/contracts` becomes `@taxrag/contracts`; `tests/tenant-isolation` becomes `@taxrag/tests-tenant-isolation`. Use these with `pnpm --filter`. |
| Python project names | `taxrag-pipeline-<directory>`, and `taxrag-sdk-python` | Import packages mirror them with underscores (`pipelines/corpus-builder` becomes `taxrag_pipeline_corpus_builder`). |
| Shared tsconfig | `tsconfig.base.json` | `strict` and `noUncheckedIndexedAccess` are on. A member `tsconfig.json` adds only `include`/`references` — a test enforces that. |
| Python empty-suite exit code | `tools/pytest_exit_zero_when_empty.py` | pytest exits 5 on "no tests collected"; PRD §45.3 requires `uv run pytest` to exit 0. The plugin rewrites **only** that code — failures and collection errors keep their status. There is no root `conftest.py`. |

### Verification

```text
node tools/check-workspace.mjs             # layout + pins + the fourteen entry commands
node tools/check-workspace.mjs --no-sweep  # layout + pins only (seconds)
pnpm test                                  # the assertions above as a test suite
```

`check-workspace.mjs` never modifies the tree and needs **no network access** once the pnpm store, the
uv cache and the Rust `1.97.1` toolchain are warm. It asserts the layout against
`tools/fixtures/prd-20-1-layout.json` and the pins against `tools/fixtures/toolchain-pins.json`, then
runs all fourteen §45.3 commands and reports every non-zero exit — it masks nothing.

## 7. Known gaps

- **The PRD validation command needs `-Path docs/PRD.md`** — see §4. All fourteen entry commands exit 0
  as documented; what is still open is the *durable* fix, which is outside `FND-01`'s file-scope:
  either breakdown plan §4 unfreezes `tools/validate-prd.ps1` for a one-line default-path change, or
  PRD §45.3's command string is amended. Escalated to the Architect/founder; recorded as sub-PRD
  `00-foundation` decision **D18**.
- Seven root scripts print an owner line instead of doing work; see §4.
- No CI workflow yet — `FND-02`, blocked on this ticket.
- **Line endings are enforced on the committed blob, not the working tree.** Everything here is stored
  as UTF-8 with LF, and `tools/tests/line-endings.test.mjs` asserts that with `git show`. Git for
  Windows ships `core.autocrlf=true`, so a Windows checkout still materialises CRLF on disk. The
  repository-wide fix is `* text=auto eol=lf` in `.gitattributes`, but breakdown plan §4 leaves
  `.gitattributes` unallocated and `FND-01` may not touch it — an Architect allocation decision,
  raised alongside `Q-F6`.
