---
id: FND-02
title: CI gate pipeline
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-01]
blocks: [RLSE-01]
---

# FND-02 — CI gate pipeline

Implements PRD §20.3, §45.3 and §45.4 (epic `E01-REPO`; the gate that makes `DEV-001`'s
*"Generated-client diff is clean in CI"* and every later requirement's test evidence real).
No ADR — the decision is already made in PRD §20.3 (the gate list) and §45.3 (same pinned versions in
CI and locally), and the versions themselves are settled by breakdown plan §8 **Q12** (CONFIRMED;
sub-PRD decision **D17**); this is build ticket 2 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap, pinned toolchains, workspace skeleton](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
**Why `builder`:** a bounded change inside one module's declared file-scope (`.github/workflows/**`)
against a fixed contract — the nine PRD §20.3 gate classes — not a new subsystem decision.

## Background + basis

**PRD §20.3 is the contract**, quoted in full because the job list must match it one-for-one:

> - TypeScript type/unit tests.
> - API/OpenAPI compatibility.
> - Migration and tenant-schema validation.
> - Tenant isolation, auth and permission tests.
> - PII and citation validation suites.
> - Rust and Python builds/tests.
> - Retrieval/evaluation smoke set.
> - Dependency, secret, container and artifact scans.
> - Release candidates additionally run integration, restore, evaluation, compatibility and rollback tests.
>
> CI builds one immutable app artifact containing Web/server/worker/search/migrations/OpenAPI/SBOM/manifests.
> Production MUST verify and run it without floating installs or builds.

**PRD §45.3**: *"CI and local development use the same pinned versions."* Those versions are the
confirmed breakdown plan §8 **Q12** set — Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`,
Python `3.14.6` (sub-PRD decision **D17**) — and `FND-01` committed them to `.node-version`,
`package.json#packageManager`, `package.json#engines.node`, `rust-toolchain.toml` and
`pyproject.toml#requires-python`. CI must **resolve them from those files**, never hardcode a second
copy: a second copy is exactly the drift PRD §44.3 serialises ownership to prevent, and it is how CI
quietly starts testing a different toolchain from the one developers run. The four versions are stated
here for a cold-start reader; they must not be typed into a workflow file (deliverable 2 and the
acceptance items below).

**PRD §45.4, the pull-request contract** — every implementation PR states:

> - requirement and UAT IDs;
> - user-visible change and non-goals;
> - schema/API/event compatibility impact;
> - tenant/PII/security and retention impact;
> - source/licence/provenance impact if applicable;
> - tests run and manual founder test steps;
> - model/token/cost, memory/disk and latency impact where applicable;
> - rollback or feature-flag path;
> - known gaps and follow-up IDs.
>
> Changes to an immutable/public contract include regenerated bindings and compatibility tests.

**PRD §21.1** (supply chain, the basis for the scan job and for pinning actions):
*"Pinned dependencies/images, lockfiles, SBOM, scans, signed manifests and no arbitrary runtime
plugin/model/code download."*

**PRD §20.2**: *"Coding agents MUST NOT receive production SSH, database, backup, signing or provider
credentials by default."* CI on pull requests must therefore reference no production secret.

**PRD §44.2 epic `E01-REPO`** week 1 deliverable includes "CI"; exit evidence *"Clean bootstrap/build/test"*.

**Why the gates exist before their subject code.** Eight of the nine gate classes cover code that does
not exist yet (migrations arrive with `DATA-01`, PII with `EVID-01`, retrieval with `RETR-*`). A gate
added later is a gate that was silently absent while the code it guards was written. Sub-PRD decision
**D4** therefore requires every gate to be a named, always-running job from day one, vacuously green via
the `pnpm -r --if-present` delegation `FND-01` established — never commented out, never `if:` -skipped.

**Accepted caveats carried forward:**

- Branch protection (marking these jobs *required*) is repository configuration, not a file in the
  tree. It cannot be delivered by this ticket; it is a `[human]` item below.
- `.github/PULL_REQUEST_TEMPLATE.md` has no PRD §45.4 requirement-ID section and **no module owns it**
  (breakdown plan §4 allocates only `.github/workflows/**`). The PR-contract job must therefore work
  against the template as it stands. See sub-PRD open question **Q-F6**, which the §8 decision register
  does not settle.
- The immutable release artifact itself (PRD §20.3 final paragraph) is `18-ops-release`/`RLSE-01`, which
  is `blocked_by` this ticket. This ticket provides the CI job that will invoke it, not its contents.

## Goal

Deliver `.github/workflows/**` such that every pull request runs all nine PRD §20.3 gate classes as
separately named jobs — each green on the `FND-01` skeleton, none skipped — running the exact versions
`FND-01` pinned per breakdown plan §8 Q12 and resolved from those pin files, with release-candidate-only
checks in a separate workflow that never triggers on `pull_request`, every third-party action pinned to
a commit SHA, and no production secret referenced. Completion is mechanically checkable: a test replays
the §20.3 gate list against the workflow YAML and asserts a 1:1 job mapping, and the setup step proves
the resolved toolchain equals the pin files.

## Non-goals

- **No changes to root manifests, lockfiles or tool-version files** — `FND-01` owns them; CI reads them.
  In particular, CI never selects, upgrades or overrides a §8 Q12 version; a version problem found in CI
  is written back through `FND-01`'s feedback obligation, not patched in a workflow.
- **No test code, no product code.** A gate whose subject does not exist runs vacuously; making it
  non-vacuous is the job of the ticket that adds the subject (`DATA-01` for migrations, `EVID-01` for
  PII, `RETR-*` for retrieval, `23-assurance` for the cross-boundary suites).
- **No release archive, SBOM contents, signing or deployment** — `18-ops-release`/`RLSE-01` … `RLSE-04`.
  PRD §21.1's SBOM is produced by the release build; this ticket only reserves the job.
- **No edits to `.github/PULL_REQUEST_TEMPLATE.md` or `.github/ISSUE_TEMPLATE/**`** — unallocated;
  Q-F6 must be resolved by the Architect first.
- **No branch-protection or repository-settings changes** — outside the tree; human-owned.
- **No nightly/scheduled agent workflows** — `.claude/**` is frozen (breakdown plan §4) and the
  `/nightly-issues` sweep is OS-scheduled per CLAUDE.md, not a GitHub Action added here.

## File-scope (write-owns)

Owned by this ticket:

- `.github/workflows/**` — all files.

Does not touch:

- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**` — unallocated by breakdown plan §4
  (Q-F6).
- Root manifests, lockfiles, `tools/**`, `README.md` — `FND-01` (same module, wave 1, already merged
  when this runs).
- `packages/contracts/**`, `packages/domain/**`, `schemas/**` — `FND-03` … `FND-10` (same module,
  wave 3, running concurrently with nothing this ticket writes).
- `infra/**` — `18-ops-release` and `03-app-runtime`/`RUNT-09`.
- `.claude/**`, `CLAUDE.md`, `templates/**`, `docs/PRD.md` — frozen (breakdown plan §4).

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. This ticket sits in
wave 2 of the module alongside `FND-03`, whose scope is `packages/contracts/src/{enums,ids}/**` — a
disjoint tree, so the two lanes may run concurrently with no shared file. Its only predecessor is
`FND-01`, which is merged before this starts (`blocked_by`), and its only dependent is `RLSE-01` in
`18-ops-release`. `.github/workflows/**` is unwritten today and is written by no other module in the
entire plan (breakdown plan §4).

## Deliverables

1. **`.github/workflows/ci.yml`** — triggers `pull_request` (all branches) and `push` to the default
   branch. Top-level `permissions: contents: read`; `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
2. **A `setup` composite or reusable step** that installs Node from `.node-version`, enables `corepack`
   with the `packageManager` pin, installs Rust from `rust-toolchain.toml`, and installs uv with
   `pyproject.toml#requires-python`. No version literal may appear in a workflow file — the pins are
   read from the files `FND-01` committed (PRD §45.3). The step then **verifies** the resolved
   toolchain: it prints `node -v`, `pnpm -v`, `rustc --version` and `python --version` and fails if any
   differs from the value in its pin file, so "CI and local development use the same pinned versions"
   (PRD §45.3, breakdown plan §8 Q12) is enforced rather than assumed.
3. **Exactly one job per PRD §20.3 gate class**, named so the mapping is checkable without reading the
   steps:

   | PRD §20.3 gate | Job id | Runs |
   |---|---|---|
   | TypeScript type/unit tests | `ts-type-unit` | `pnpm typecheck` + `pnpm test` |
   | API/OpenAPI compatibility | `openapi-compat` | `pnpm generate && pnpm generated:check` + the compatibility check `FND-04` will supply |
   | Migration and tenant-schema validation | `migration-schema` | `pnpm -r --if-present run test:migrations` |
   | Tenant isolation, auth and permission tests | `tenant-auth` | `pnpm -r --if-present run test:tenant` |
   | PII and citation validation suites | `pii-citation` | `pnpm -r --if-present run test:pii-citation` |
   | Rust and Python builds/tests | `rust-build-test`, `python-build-test` | `cargo build --workspace && cargo test --workspace`; `uv sync --frozen && uv run pytest` |
   | Retrieval/evaluation smoke set | `retrieval-eval-smoke` | `pnpm eval:smoke` |
   | Dependency, secret, container and artifact scans | `supply-chain-scan` | dependency audit, secret scan, artifact/licence scan |

   Each job runs unconditionally on every PR. No `if:` guard, no `continue-on-error`, no commented-out
   step. Where the subject code is absent the delegator exits 0 (`FND-01` deliverable 2), which is a
   passing gate, not a skipped one.
4. **`.github/workflows/release-candidate.yml`** — triggers on tag push and `workflow_dispatch` **only**;
   must not list `pull_request`. Jobs reserved for PRD §20.3's release-candidate extras: `integration`,
   `restore`, `evaluation`, `compatibility`, `rollback`, plus `release-artifact` (the immutable
   Web/server/worker/search/migrations/OpenAPI/SBOM/manifest build that `RLSE-01` will implement).
   Each delegates to a workspace script and exits 0 while unimplemented. It uses the same `setup` step,
   so release candidates build on the same pinned toolchain.
5. **`.github/workflows/pr-contract.yml`** — a `pr-contract` job asserting the PRD §45.4 items are stated
   on the PR body. Because the repository's PR template is unallocated (Q-F6), the check is tolerant by
   design: it passes when the body contains at least one requirement ID matching
   `\b(AUTH|SRCH|ANS|COV|CMP|REC|MON|EXP|DEV|ADM|COR|PII|SEC|OPS|EVAL)-\d{3}\b` **or** an explicit
   `Requirement IDs: none` line, and contains the template's `## Constraint check` heading. It must not
   edit the template and must fail with a message quoting PRD §45.4.
6. **Action pinning**: every `uses:` references a 40-character commit SHA with the human-readable version
   in a trailing comment (PRD §21.1 "Pinned dependencies/images … and no arbitrary runtime
   plugin/model/code download").
7. **Caching** keyed on the lockfiles `FND-01` committed — pnpm store on `pnpm-lock.yaml`, cargo
   registry/target on `Cargo.lock`, uv cache on `uv.lock`. A cache miss must never change the result,
   only the duration.
8. **Secret hygiene**: no workflow triggered by `pull_request` may reference `secrets.*` other than
   `GITHUB_TOKEN`, and `GITHUB_TOKEN` permissions are declared per job at the minimum required scope
   (PRD §20.2, §21.1).
9. **Fixture** `.github/workflows/fixtures/prd-20-3-gates.json` — the PRD §20.3 gate list transcribed
   verbatim with its job-id mapping, used by the acceptance replay below.

Ordering constraint: deliverable 3's job ids and deliverable 9's fixture must be written together — the
fixture is the assertion target, so a job renamed without the fixture is a failing build by construction.

## Acceptance checklist (classified)

- [ ] `[fixture]` Gate-list replay: a test parses `ci.yml` and asserts a 1:1 mapping against
      `.github/workflows/fixtures/prd-20-3-gates.json` — every PRD §20.3 gate class has exactly one job,
      and every job maps to exactly one gate class (PRD §20.3).
- [ ] `[machine]` No job in `ci.yml` carries `if:`, `continue-on-error: true`, or a commented-out step —
      asserted by YAML inspection (sub-PRD D4: a gate is never silently absent).
- [ ] `[machine]` The full `ci.yml` run is green on the `FND-01` skeleton, including
      `cargo build --workspace && cargo test --workspace` and `uv sync --frozen && uv run pytest`
      (PRD §20.3 "Rust and Python builds/tests"; `E01-REPO` exit evidence).
- [ ] `[machine]` `release-candidate.yml` does not list `pull_request` among its triggers (PRD §20.3
      "Release candidates *additionally* run …").
- [ ] `[machine]` Every `uses:` in `.github/workflows/**` is pinned to a 40-hex-character SHA
      (PRD §21.1).
- [ ] `[machine]` No version literal for Node, pnpm, Rust or Python appears in any workflow file —
      including the breakdown plan §8 Q12 values `24.18.0`, `11.4.0`, `1.97.1` and `3.14.6`, which belong
      in `FND-01`'s pin files and nowhere else; the setup step reads `.node-version`,
      `package.json#packageManager`, `rust-toolchain.toml` and `pyproject.toml` (PRD §45.3 "CI and local
      development use the same pinned versions").
- [ ] `[machine]` The versions a CI run actually resolves equal the pin files: the setup step's
      verification (deliverable 2) fails the job when `node`, `pnpm`, `rustc` or `python` reports a
      version other than the pinned one — proven by a scratch-branch negative test that forces a
      different Node version and observes the failure (PRD §45.3; §8 Q12).
- [ ] `[machine]` No `pull_request`-triggered workflow references a secret other than `GITHUB_TOKEN`,
      and every workflow declares `permissions:` explicitly (PRD §20.2, §21.1).
- [ ] `[machine]` Negative test: a scratch branch that deletes one §20.3 job from `ci.yml` fails the
      fixture replay, naming the missing gate — the gate check is not vacuous.
- [ ] `[machine]` `pr-contract` job passes on a PR body carrying a requirement ID and fails on one that
      carries none and no `Requirement IDs: none` line (PRD §45.4).
- [ ] `[machine]` `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `cargo test --workspace` and `uv run pytest` green — this ticket invokes both and its
      workflow is the thing that proves they run in CI (PRD §45.3, §20.3).
- [ ] `[machine]` `.github/PULL_REQUEST_TEMPLATE.md` and `.github/ISSUE_TEMPLATE/**` are unchanged in
      the diff (breakdown plan §4 — unallocated paths).
- [ ] `[human]` After merge, all nine `ci.yml` jobs plus `pr-contract` appear as **required** checks in
      branch protection on the default branch. Repository configuration, not a tree file. **Not required
      to merge**; carry it to Gate 2 (PRD §20.3, §26 Operations).
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-001`, `E01-REPO`), user-visible
      change and non-goals, schema/API/event compatibility impact (none), tenant/PII/security impact
      (CI must not carry production credentials — PRD §20.2), source/licence impact (none),
      cost/memory/latency impact (CI minutes), rollback path (revert the workflow files), known gaps
      (the eight gates that are vacuous until their subject code lands, each named with its owning
      ticket).

Absent classes: no `[fixture]` beyond the §20.3 gate-list replay — there is no recorded adapter or
evaluation data yet (PRD §40.8 fixtures arrive with `05-ingestion-framework`; PRD §43 replays with
`21-evaluation-600`). `[human]` is limited to the branch-protection item; this ticket produces no
customer-visible surface, so no PRD §41.2 `UAT-*` script applies.

## Test plan

Reviewer steps. Steps 1–5 run offline against the checked-out tree; steps 6–8 need one CI run.

1. **Gate-list replay.** Run the workflow test (`pnpm -w test` or the script the Builder registers).
   It parses `.github/workflows/ci.yml` and diffs job ids against
   `.github/workflows/fixtures/prd-20-3-gates.json`. Confirm the fixture text matches PRD §20.3
   verbatim — read both side by side; a paraphrased fixture is a defective test.
2. **Negative test.** On a scratch branch delete the `pii-citation` job; re-run step 1; assert it fails
   naming that gate; discard the branch.
3. **Skip/guard scan.** Assert `ci.yml` contains no `if:`, `continue-on-error` or `#`-commented step
   inside a job body.
4. **Pin scan.** Assert every `uses:` matches `[a-z0-9._-]+/[a-z0-9._-]+@[0-9a-f]{40}`.
5. **Version-literal scan.** Assert no workflow file contains a Node/pnpm/Rust/Python version literal —
   grep specifically for `24.18.0`, `11.4.0`, `1.97.1` and `3.14.6` as well as generic patterns; confirm
   the setup step reads `.node-version` and `rust-toolchain.toml`.
6. **Live PR run.** Open the ticket's own PR and confirm all nine gate jobs plus `pr-contract` ran and
   are green, with no job reported as skipped. Read the setup step's log and confirm the printed
   `node -v`, `pnpm -v`, `rustc --version` and `python --version` are `24.18.0`, `11.4.0`, `1.97.1` and
   `3.14.6` — the same versions the local bootstrap uses (PRD §45.3).
7. **Toolchain-drift negative test.** On a scratch branch pin the setup action to a different Node
   version; confirm the verification step fails the job rather than silently testing another toolchain;
   discard.
8. **Release-candidate isolation.** Confirm `release-candidate.yml` did **not** run on that PR, and that
   `workflow_dispatch` starts it manually.

Harness and fixtures: the test framework registered by `FND-01` (deliverable 9 of that ticket names it
in the README); the only fixture is `.github/workflows/fixtures/prd-20-3-gates.json`. No mocks, no
network beyond the CI run itself.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing the workflows.
Re-publish with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **A PRD §20.3 gate cannot be expressed as a single job** (for example "Dependency, secret, container
   and artifact scans" needs four tools with different triggers). → Update the mapping table in this
   ticket's deliverable 3 **and** `.github/workflows/fixtures/prd-20-3-gates.json` **and**
   `docs/prd/00-foundation/README.md` D4, in that order, before splitting the job. A gate that quietly
   becomes two half-gates is how a gate disappears.
2. **The PR-contract check cannot pass against the existing `.github/PULL_REQUEST_TEMPLATE.md`.** →
   Do **not** edit the template. Raise it on **`docs/prd/breakdown-plan.md` §4** (which module owns
   `.github/PULL_REQUEST_TEMPLATE.md`) and record the interim tolerant behaviour in
   `docs/prd/00-foundation/README.md` **Q-F6**.
3. **CI needs a credential** (for a scanner, a registry or an artifact store). → That touches PRD §20.2's
   rule for coding agents. Record the requirement in `docs/prd/00-foundation/README.md` and escalate to
   the human for the secret; if it needs a durable trust decision, create
   **`docs/adr/NNNN-ci-credentials.md`** (PRD §45.5 "Architecture decision", breakdown plan §2.1 A9).
   Never add a `pull_request`-triggered workflow that consumes a production secret.
4. **A runner image cannot provide a §8 Q12 version** (for example the pinned Rust or Python build is
   unavailable for the runner). → Do **not** relax the version in the workflow: that would break
   PRD §45.3's "same pinned versions" guarantee and silently fork CI from local development. Record the
   evidence in `docs/prd/00-foundation/README.md` **D17**, raise it against `FND-01` (which owns the pin
   files) and `docs/prd/breakdown-plan.md` §8 Q12, and use a runner or installer action that can supply
   the pinned version in the meantime.
5. **The delegator pattern makes a gate permanently vacuous** because no later ticket registers the
   expected script name (`test:migrations`, `test:tenant`, `test:pii-citation`). → Record the expected
   script names in `docs/prd/00-foundation/README.md` so `DATA-01`, `DATA-02` and `EVID-01` can adopt
   them, and raise the naming convention on **`docs/prd/breakdown-plan.md` §1.1 "Tests"**.
6. **Runner minutes or matrix cost become a real constraint** (PRD §24.1 keeps total monthly spend at
   A$42–50). → Record the measured cost in `docs/prd/00-foundation/README.md` and raise it against
   `docs/prd/breakdown-plan.md` §9; do not silently reduce gate coverage to save minutes.

**Escalation.** If PRD §20.3's "every gate on every PR" is genuinely unworkable — for example the
retrieval/evaluation smoke set cannot run in CI at all — that overturns a PRD-level decision, not a
ticket detail. Stop, raise it with an ADR under `docs/adr/` plus a PRD-change request per PRD §45.5
("Product change" if it weakens a release gate), and escalate to the human. Never move a gate to a
manual checklist inside this ticket.
