# AustraliaEmploymentRAG — PRD-02: CI gate repair

Phase 2. Decomposed into the same `docs/prd/` tree (append mode, `nextPrefix` 25).
Master spec: [PRD](PRD.md). Anchors: §20.3 (the scan gate list), §45.3 (entry commands),
§45.4 (the pull-request contract).

Authored 2026-08-15 by the Founder, from evidence measured the same day. This document is the
Gate 1 input for phase 2; it is decomposed by `/breakdown-prd`, never executed directly.

## 1. Problem

CI has never been green. Not "regressed" — the first run on the first ticket branch
(`ticket/FND-02`, 2026-08-07) was already red, and every run since has been red.

Measured 2026-08-15 on `main` @ `0b19067` (run 31865967367): 6 of 9 jobs green, 3 red, plus two
further failure classes visible only on `pull_request` runs.

32 pull requests merged between 2026-08-07 and 2026-08-15 with red CI. They merged because
`main` carried **no branch protection** and **no step of the delivery pipeline reads CI status** —
`gh pr merge` therefore landed every one of them immediately. Protection was enabled 2026-08-15
over the 6 currently-green contexts; the remaining 4 cannot be made required until this phase
lands, because doing so would deadlock the tickets that repair them.

Measured failure classes:

| # | Symptom | Location |
|---|---|---|
| 1 | `/bin/sh: 1: powershell: not found` (exit 127) on ubuntu | `tools/fixtures/entry-commands.json:19,21` — ubuntu runners carry `pwsh`, not `powershell` |
| 2 | `neither main nor origin/main exists`; `ambiguous argument 'null...HEAD'` — 5 asserts, `pull_request` runs only | `.github/workflows/ci.yml` — `actions/checkout` defaults to `fetch-depth: 1`, so no base ref exists to diff against |
| 3 | 65 credential-shaped identifiers trip the repository's own secret scan (33 `key`, 23 `credential`, 9 `token`) | `pipelines/corpus-builder/tests/chunking/conftest.py:41` (`STABLE_SOURCE_KEY`), `packages/sdk-typescript/test/**` (`CANARY_CREDENTIAL`) |
| 4 | `nanoid <3.3.18` (GHSA-2v37-7h3g-55p8, high) fails `pnpm audit --audit-level=high` | root lockfile, transitively via `vitest → vite → postcss` |
| 5 | Every PR fails the §45.4 contract with `no requirement ID found` | `.claude/scripts/deliver-ticket.mjs:247` — when the deliver agent writes no `--body-file`, the script falls back to the **unfilled** `.github/PULL_REQUEST_TEMPLATE.md`, which by construction cannot satisfy the contract |
| 6 | Merge never consults CI; a failed `gh pr merge` is recorded as a `note()` and execution continues; DoD `testsPassed` is never evaluated when `--test-cmd` is unset | `.claude/scripts/deliver-ticket.mjs:143`, `:504`, `:508` |

Classes 3 and 4 sit in the same job, and class 4 masks class 3: `pnpm audit` is the first step, so
the secret scan never ran. Fixing only the advisory would appear to make no progress.

**Root cause of the class, not of any one item.** The pipeline's operative definition of "tests
green" is `pnpm test` on Windows. That is a strict subset of what CI runs:

| CI runs | reached by `pnpm test` |
|---|---|
| `uv run pytest` (`pipelines/*`) | no — `pipelines/*` is not in `pnpm-workspace.yaml` |
| `cargo build && cargo test` | no |
| `pnpm audit`, `secret-scan.mjs`, `scan:container`, `scan:licence` | no |
| `pnpm generate && pnpm generated:check` | no |
| ubuntu-latest | no — Windows, the one platform on which class 1 cannot fail |

So a Builder and a Reviewer can both honestly report green while CI is red, indefinitely. Local
green and CI green have no causal relationship, and until that link exists every other repair here
is a point fix that will be re-broken by the next platform-shaped assumption.

## 2. Requirements

- **DEV-004** — the delivery script MUST NOT merge a pull request whose required checks are not
  green, and a merge that does not land MUST be a hard failure that reports the ticket as NOT
  delivered — never a note that execution continues past.
- **DEV-005** — the Definition-of-Done test command MUST reproduce the CI job set, and MUST be
  runnable from a developer machine as a single command.
- **DEV-006** — every §45.3 entry command MUST execute on both ubuntu and Windows, or carry a
  recorded per-platform deviation; a command that cannot exit 0 on a supported platform is a red
  acceptance item, not a fixture annotation.
- **DEV-007** — the repository MUST contain no identifier that its own secret scan reports.
- **OPS-004** — all 10 CI contexts MUST be required on `main` at phase close.

## 3. Scope

**In scope.** The six failure classes above; a `pnpm ci:local` entry point satisfying DEV-005; the
`CLAUDE.md` test-command declaration that makes `--test-cmd` unconditional; re-enabling the four
remaining required contexts (`TypeScript type/unit tests`, `Python builds/tests`,
`Dependency, secret, container and artifact scans`, `PRD 45.4 pull-request contract`).

**Non-goals.**

- *Product code changes* (owner: Founder). No merged pull request has been shown to ship a defect.
  `Rust builds/tests` is green on `main`; `Python builds/tests` is green but for its own naming
  self-test; all 10 JS packages pass locally at exit 0. Every one of the six classes is
  environment or tooling. A repair ticket that changes product behaviour is out of contract.
- *Retroactively greening the 32 historical runs* (owner: Founder). A check run's conclusion is
  immutable, `gh run rerun` replays the same SHA, and GitHub stops refreshing `refs/pull/N/merge`
  once a PR closes. The red record is the audit trail showing the gate was broken; erasing it
  removes the only durable evidence of that. The meaningful target is a green tip of `main`.
- *Redesigning the §20.3 scan gate list* (owner: Architect). The gate list is decided by PRD §20.3;
  this phase repairs its implementation, not its membership. Q-CI1 below is the one bounded
  exception.

## 4. Constraints the decomposition must respect

These are measured properties of the code as it stands, not preferences. Each one closes off the
cheap fix that would otherwise be reached for first.

- **The secret-scan allowlist is not available.** `.github/workflows/checks/secret-scan.mjs:35`
  declares `ALLOWLIST` with exactly one literal entry, and the harness asserts its length is 1 —
  deliberately, so a wildcard cannot blind the scan. DEV-007 must therefore be met by renaming
  identifiers, or by designing a scoped-exclusion mechanism as its own deliverable with its own
  harness assertions. Appending entries is not an option.
- **The entry-command deviation is schema-bound.** `tools/tests/entry-commands.test.mjs` asserts
  exactly one authorised deviation (FND-01 v1.1 / D18) and that
  `run === command + ' ' + deviation.argument`. Per-platform execution is a schema change with a
  recorded basis, not a fixture edit. `command` must remain the verbatim §45.3 string.
- **Root `package.json` is a shared file scope.** The nanoid override and the `ci:local` script
  both touch it; they belong to one ticket, or the lanes will collide.
- **`.claude/**` is pipeline infrastructure**, outside `docs/PRD.md` product scope, and the ticket
  that repairs `deliver-ticket.mjs` must be able to merge under the protection that is *already*
  live — i.e. it must not itself depend on any of the four not-yet-required contexts.
- **Ordering.** DEV-004's ticket is P0 and must land first. Until it does, every ticket in this
  phase will hit `gh pr merge` while checks are still pending, be recorded as a bare note, and be
  reported as NOT delivered.

## 5. Acceptance

1. `gh run list --workflow=ci.yml --branch main --limit 1` reports `success`.
2. All 10 contexts are required on `main` (`gh api .../branches/main/protection`).
3. A deliberately red pull request cannot be merged by `deliver-ticket.mjs`, and is reported as
   NOT delivered rather than noted and passed over.
4. `pnpm ci:local` exits 0 on Windows under the pinned Node 24.18.0 and reproduces the CI job set.
5. `CLAUDE.md` declares the test command, and `--test-cmd` is passed on every `/start-all` run.
6. `node .github/workflows/checks/secret-scan.mjs` exits 0.

## 6. Decisions

Both questions raised during authoring are settled here, by the Founder, 2026-08-15. They are
recorded as decisions rather than open questions so the decomposition does not re-litigate them.

- **D-CI1 — the blocking dependency gate is scoped to `--prod`.** `pnpm audit --audit-level=high`
  becomes `pnpm audit --prod --audit-level=high`. *Basis:* an unscoped audit is time-bombed — a
  newly published advisory turns CI red with no code change, which is precisely the mechanism that
  reproduces "red carries no information", the failure this whole phase exists to end. The current
  finding is a devDependency-only path (`vitest → vite → postcss → nanoid`) that ships in nothing.
  *Accepted cost:* devDependency advisories stop being surfaced by CI. A scheduled non-blocking
  full-tree audit is the durable answer and is deliberately **deferred** — it is new workflow
  machinery, and this phase's job is to make the existing gate trustworthy, not to grow it. Record
  it as a follow-up, not as a deliverable here. The nanoid override is still applied, so the
  advisory is closed either way; the scoping is about what the gate does *next* time.
- **D-CI2 — this phase appends tickets to `00-foundation`; no module 25 is created.** *Basis:* the
  repository's own precedent — FND-11, FND-12, FND-14 and FND-19 are all repair tickets that went
  straight into `00-foundation` — and that module already owns the repository, toolchain and CI
  gate surface (FND-01 monorepo bootstrap, FND-02 ci-gate-pipeline). The DEV-004 work under
  `.claude/` has no owning module, and inventing one for a single ticket buys a directory and costs
  a module boundary. Ticket ids continue from FND-19; `nextPrefix` 25 goes unused.
