---
id: FND-24
title: A scoped, digest-keyed exclusion mechanism for the repository secret scan
module: 00-foundation
lane: 00-foundation
size: L
agent: builder
status: draft
date: 2026-08-15
blocked_by: [FND-01, FND-02, FND-20]
blocks: []
---

# FND-24 — A scoped, digest-keyed exclusion mechanism for the repository secret scan

Implements PRD-02 requirement **DEV-007** (*"the repository MUST contain no identifier that its own
secret scan reports"*, failure class 3), against PRD §20.2 (coding agents must not receive production
credentials) and PRD §20.3 (the *"Dependency, secret, container and artifact scans"* gate). No ADR —
the gate is decided by PRD §20.3 and the route by PRD-02 §4, which authorises *"designing a scoped-
exclusion mechanism as its own deliverable with its own harness assertions"*; phase-2 decisions
**D-CI5** (why renaming is closed off) and **D-CI6** (why exclusions are digest-keyed) record the
choice. An ADR candidate is raised in Feedback obligation 6, not authored here.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3),
decision register (§4) and the full measurement (§4.1). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-02 — CI gate pipeline](FND-02-ci-gate-pipeline.md) (created
`.github/workflows/checks/secret-scan.mjs` and its harness; delivered and merged),
[FND-01 — Monorepo bootstrap](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
(created `tools/fixtures/secret-patterns.json` and `tools/tests/secret-scan.test.mjs`; delivered and
merged), and [FND-20 — Gate delivery on required checks](FND-20-gate-delivery-on-required-checks.md)
(phase-2 **D-CI7**).
**Why `builder`:** the mechanism and its bounds are fully specified below and by D-CI5/D-CI6; what
remains is a bounded change to one scanner, one fixture, one new data file and two harnesses, plus the
data to populate it — implementation, not a subsystem decision.

## Background + basis

### The measurement — settled, do not re-derive

`node .github/workflows/checks/secret-scan.mjs` on `main` @ `0b19067`, 2026-08-15, Node 24.18.0:
**1550 files inspected, 65 findings** — 33 `key`, 23 `credential`, 9 `token` — across **12 distinct
identifiers in 26 files in 8 trees**. The full table is `docs/prd/breakdown-plan-02-ci-repair.md` §4.1
and is the authority; the shape of it is what matters here:

| Identifier | Count | Where | Why it cannot be renamed |
|---|---|---|---|
| `CANARY_CREDENTIAL` | 23 | `packages/sdk-typescript/test/**` | `20-developer-platform`'s, delivered; a deliberate leak canary |
| `ASANA_TOKEN` | 9 | `.claude/commands/**`, `.claude/scripts/**`, `CLAUDE.md`, `.gitignore` | `.claude/**` and `CLAUDE.md` are **frozen**; and it is the real environment-variable name the integration reads |
| `IDEMPOTENCY_KEY_MIN_LENGTH` / `_MAX_LENGTH` | 10 | `packages/sdk-typescript/{src,parity}` | **published SDK surface** (`parity/surface.json`) — renaming is a public-contract change under PRD §16.1/§45.5 |
| `FIELD_KEY_UNKNOWN` / `FIELD_KEY_RETIRED` / `FIELD_ENCRYPTION_KEY_INVALID` | 13 | `packages/database/src/crypto/**` and its tests | **§34.9 error codes** — same |
| `CHILD_FOREIGN_KEY` | 3 | `packages/database/test/tenant/**` | `01-app-data`'s |
| `CRITICAL_KEY_PREFIX` | 3 | `apps/api/src/bootstrap/**` | **product code** — PRD-02 §3 makes product changes a Non-goal with the Founder as owner |
| `AER_API_KEY` | 1 | `packages/sdk-typescript/README.md` | documented SDK environment variable |
| `API_KEY_HEADER` | 1 | `packages/model-gateway/test/**` | `12-evidence-safety`'s |
| `STABLE_SOURCE_KEY` | 2 | `pipelines/corpus-builder/tests/**` | `04-corpus-contract`'s |

**Note for anyone reproducing this**: `docs/PRD-02-ci-repair.md` §1 says the findings are in
`pipelines/corpus-builder/tests/**` and `packages/sdk-typescript/test/**`. Those two trees hold 22 of
the 65. The count and the per-pattern split in the PRD are right; the location claim is not, and the
correction is recorded as finding **F-CI1** (phase-2 plan §7). It changes no decision — D-CI5 follows
from the *other* 43.

**Not one of these is a credential.** Every finding is a variable, constant or error-code *name*. The
patterns in `tools/fixtures/secret-patterns.json` deliberately match credential-shaped **names**
(seven of the eight do; only `private-key-block` matches a value), because a name is the cheap early
signal that a credential is about to be handled. The scan is doing what it was built to do; what is
missing is a way to say "this one, here, is a name and not a credential" that does not blind it.

### Why the two cheap fixes are closed off

`docs/PRD-02-ci-repair.md` §4:

> **The secret-scan allowlist is not available.** `.github/workflows/checks/secret-scan.mjs:35`
> declares `ALLOWLIST` with exactly one literal entry, and the harness asserts its length is 1 —
> deliberately, so a wildcard cannot blind the scan. DEV-007 must therefore be met by renaming
> identifiers, or by designing a scoped-exclusion mechanism as its own deliverable with its own
> harness assertions. **Appending entries is not an option.**

And renaming is closed off by **D-CI5**: 9 of the 65 are in frozen files, 3 are in `apps/api/src`
product code, 13 are in `packages/database`'s crypto layer including a §34.9 error code, and 10 are on
the published SDK surface. A repair ticket may not make a public-contract change (PRD §16.1, §45.5),
and PRD-02 §3 puts product code with the Founder. So the mechanism is the route the PRD itself names.

### The trap the mechanism must not fall into — D-CI6

`scanRepository()` reads **every git-tracked text file**, and
`tools/fixtures/secret-patterns.json#excludedPaths` is asserted by `tools/tests/secret-scan.test.mjs`
to equal exactly `['tools/fixtures/secret-patterns.json']`. So an exclusion file that lists
`CANARY_CREDENTIAL` in plain text **is itself a finding** — the configuration would trip the scan it
configures. Phase-2 **D-CI6** resolves it: exclusions are keyed by `path` + `patternId` + the
**SHA-256 digest** of the excluded identifier, never by the identifier's text, and never by a wildcard.
A digest is not a credential-shaped name, so the record is scannable; and it is strictly narrower than
an allowlist, because a *different* credential-shaped name in an excluded file still fails.

The same reasoning forbids putting the exclusion data under `tools/**`: `tools/tests/secret-scan.test.mjs`
runs `scanForSecrets()` over `tools/**` inside `pnpm test`, with only the one excluded path. The data
therefore lives at `.github/workflows/fixtures/secret-scan-exclusions.json`, beside the gate fixture
`FND-02` already put there (sub-PRD **D20a**: `.github/workflows/**` is `00-foundation`'s allocated
path and GitHub reads workflows only from its top level, so a subdirectory is safe).

### The existing controls this ticket must preserve

`.github/workflows/checks/workflows.test.mjs` `describe J` — all five must still hold, in substance:

- `ALLOWLIST` is exactly `['GITHUB_TOKEN']`, and no entry of `ALLOWLIST`, `PROSE_TREES` or
  `VALUE_PATTERN_IDS` contains a `*`;
- the synthetic positive control (`AWS_SECRET_ACCESS_KEY`, assembled at runtime) is detected;
- a value-shaped secret inside `docs/**` is still detected, so the prose narrowing is not a blind spot;
- ordinary prose and `${{ secrets.GITHUB_TOKEN }}` flag nothing;
- `scanRepository(REPO_ROOT)` inspects more than 50 files, reads at least one `docs/**` file, and
  **finds nothing** — the assertion that is red today and must be green after this ticket.

`tools/tests/secret-scan.test.mjs` additionally asserts the tools-scoped scan is clean, that the
inventory covers `package.json` and more than ten `tools/**` files, that `excludedPaths` is exactly one
path and never a `fixtures/` wildcard, and that six named patterns plus the private-key block each
detect a runtime-assembled control.

### Accepted caveats, carried forward

- **An exclusion list is a maintenance surface.** It grows as the repository grows. That is the
  accepted cost of keeping the scan on names rather than only values, and deliverable 4's staleness
  assertion is what stops it rotting: an entry that matches nothing is a failure, so the list prunes
  itself.
- **A digest is not secrecy.** The digests are not there to hide the identifiers — the identifiers are
  in the repository in plain sight. They are there so the *configuration file* is not itself a finding
  (D-CI6). Anyone can compute them; the harness prints the command that does.
- **This ticket does not rename anything and closes no product question.** Whether
  `CRITICAL_KEY_PREFIX` and friends should eventually be renamed is the **Founder**'s and the owning
  modules', not a repair ticket's. Every exclusion records the owning module so that conversation has a
  starting point.
- **Two contexts go green because of this ticket, not one.** The repository-wide scan runs both in
  `supply-chain-scan` (`node .github/workflows/checks/secret-scan.mjs`) and inside `ts-type-unit`
  (`describe J`'s last test, via `node --test … workflows.test.mjs`). Both are currently red on the same
  65 findings.

## Goal

Give the repository secret scan a way to record a *justified, narrow, self-pruning* exception, and use
it to bring the scan to zero findings without weakening it: the eight patterns still apply everywhere,
the one-entry `ALLOWLIST` is unchanged, no wildcard exists anywhere in the configuration, an
unrecognised credential-shaped name in an excluded file still fails, and every exclusion carries its
basis and its owning module. Completion is mechanically checkable:
`node .github/workflows/checks/secret-scan.mjs` exits 0 (PRD-02 §5 item 6),
`node --test .github/workflows/checks/workflows.test.mjs` is green including `describe J`'s
repository-wide assertion, and `pnpm test` is green.

## Non-goals

- **No renaming of any identifier, in any tree.** Closed off by **D-CI5** and PRD-02 §3 (product code,
  owner Founder) and PRD §16.1/§45.5 (published surfaces). A ticket that renames
  `FIELD_ENCRYPTION_KEY_INVALID` or `IDEMPOTENCY_KEY_MAX_LENGTH` is making a public-contract change,
  which this one may not.
- **No new entry in `ALLOWLIST`, and no change to its length-1 assertion.** PRD-02 §4: *"Appending
  entries is not an option."* Rejected outcome.
- **No wildcard, prefix, glob, regex or "any name beginning with X" rule anywhere in the exclusion
  data**, and no widening of `PROSE_TREES` or `VALUE_PATTERN_IDS`. Rejected outcomes — each would
  blind the scan, which is the failure mode the one-entry allowlist exists to prevent.
- **No new entry in `tools/fixtures/secret-patterns.json#excludedPaths`** beyond what deliverable 3
  strictly requires, and never a `fixtures/` wildcard. `tools/tests/secret-scan.test.mjs` asserts that
  set exactly, deliberately.
- **No pattern removed, loosened or narrowed.** The eight patterns and their regexes stay as `FND-01`
  wrote them.
- **No `.skip`, `.todo`, `continue-on-error`, `|| true`, or exit-code swallow** in the scanner, the
  harness or `ci.yml`. Rejected outcomes.
- **No change to `.github/workflows/ci.yml`** — `FND-21`'s this phase. The scan's invocation is
  unchanged.
- **No change to `.claude/**`, `CLAUDE.md`, `docs/**` or `.gitignore`** to remove a finding. Three of
  those are frozen and `.gitignore` is `FND-01`'s; and deleting a legitimate variable name to satisfy a
  scanner is a rejected outcome in any case.
- **No product code.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket:

- `.github/workflows/checks/secret-scan.mjs` — the mechanism.
- `.github/workflows/fixtures/secret-scan-exclusions.json` — **new**, the data.
- `.github/workflows/checks/workflows.test.mjs` — the harness assertions (`describe J` and a new
  section).
- `tools/fixtures/secret-patterns.json` — only if deliverable 3 requires the exclusions file to be
  listed in `excludedPaths`; see that deliverable.
- `tools/tests/secret-scan.test.mjs` — the matching assertion, for the same reason.

Does not touch:

- `.github/workflows/ci.yml`, `.github/workflows/checks/checkout-depth.test.mjs` — `FND-21`.
- `.github/workflows/{pr-contract,release-candidate}.yml`, `actions/setup/action.yml`,
  `checks/{pr-contract,workflow-model,verify-toolchain}.mjs`, `fixtures/prd-20-3-gates.json` —
  `FND-02`; read-only here.
- `.claude/scripts/deliver-ticket.mjs`, `tools/tests/frozen-paths.test.mjs`,
  `tools/tests/deliver-ticket.test.mjs`, `tools/tests/support/**` — `FND-20`.
- `tools/fixtures/entry-commands.json`, `tools/tests/{entry-commands,readme}.test.mjs`,
  `tools/check-workspace.mjs`, `README.md` — `FND-22`.
- root `package.json`, `pnpm-lock.yaml`, `tools/{ci-local,workspace-script}.mjs`,
  `tools/fixtures/script-owners.json`, `tools/tests/{scripts,ci-local}.test.mjs` — `FND-23`.
- `tools/workspace-assertions.mjs` (which exports `scanText`, `scanForSecrets` and
  `secretScanInventory`), `tools/tests/{layout,line-endings,pins,skeleton}.test.mjs` — `FND-01`;
  read-only here. **If the mechanism cannot be built without changing `scanText`, that is Feedback
  obligation 2, not a silent widening.**
- **every file that contains a finding** — `apps/**`, `packages/**`, `pipelines/**`, `.claude/**`,
  `CLAUDE.md`, `.gitignore`. This ticket excludes; it never edits them (D-CI5).
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, `templates/**`, the two `tools/*.ps1`,
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — frozen or
  unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.

**Serial-safety analysis.** `.github/workflows/checks/secret-scan.mjs` and
`.github/workflows/checks/workflows.test.mjs` were last written by `FND-02` (delivered, merged);
`tools/fixtures/secret-patterns.json` and `tools/tests/secret-scan.test.mjs` by `FND-01` (delivered,
merged). Phase-2 plan §3 allocates `workflows.test.mjs` to **this ticket alone** and requires `FND-21`
to add its regression guard as a *new sibling script* precisely so the two lanes do not contend for it.
No in-flight ticket declares any of the five paths.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. None of them runs the secret scan, `pnpm test`, or
`workflows.test.mjs`: the scan runs in `supply-chain-scan` and in `ts-type-unit`, neither of which is
required yet. This ticket writes no input to any of the six. **Verify rather than assume** —
acceptance item 10.

## Deliverables

1. **A scoped exclusion mechanism in `.github/workflows/checks/secret-scan.mjs`.** Add a third,
   clearly separated filter stage to `scan()`, after the `ALLOWLIST` filter and the prose narrowing,
   that drops a finding **only when all of** the following match an entry in the exclusions file:

   - `path` — the finding's label, as an **exact repository-relative path**. No glob, no prefix, no
     regex. A file that moves stops being excluded, which is correct.
   - `patternId` — the exact pattern that fired.
   - `identifierSha256` — the lowercase hex SHA-256 of the matched text, computed with `node:crypto`.
     A *different* credential-shaped name in the same file with the same pattern is **not** excluded.

   The stage must be a named, exported, pure function (`isExcluded(finding, exclusions)`) so the
   harness can drive it directly, and `ALLOWLIST`, `PROSE_TREES` and `VALUE_PATTERN_IDS` must be
   untouched. A header comment must record: what the mechanism is for, why the one-entry allowlist was
   not extended (PRD-02 §4), why entries are digest-keyed (**D-CI6** — a plaintext list would be a
   finding in itself), and the exact command a maintainer runs to compute a digest.

2. **The data file `.github/workflows/fixtures/secret-scan-exclusions.json`.** A `$comment` array
   stating the rule and the escape hatch, and an `exclusions` array whose every entry carries:

   | Field | Meaning |
   |---|---|
   | `path` | exact repository-relative path |
   | `patternId` | one of the eight fixture pattern ids |
   | `identifierSha256` | lowercase hex SHA-256 of the matched identifier |
   | `basis` | one sentence: what the identifier is, and why it is a name and not a credential |
   | `owner` | the module or ticket that owns the file (from `breakdown-plan.md` §4), or `frozen` |
   | `ticket` | `FND-24` |
   | `date` | `2026-08-15` |

   Populated from the live scan so that the repository-wide scan reports **zero** findings. The
   `$comment` must state, in substance: an entry is added only after establishing what the identifier is
   (as this ticket's Background table does); an entry is **never** added for a real credential — a real
   credential is removed and rotated, not excluded; there is no wildcard and none may be added; and an
   entry that no longer matches anything must be deleted, because the harness fails on it.

3. **The exclusions file must not be readable as a credential list.** Because it contains no
   identifier text, it should scan clean on its own. **Verify this rather than assume it**: if the
   populated file produces any finding, the correct fix is to remove whatever text produced it (a
   `basis` sentence that quotes an identifier, say), **not** to add the file to
   `tools/fixtures/secret-patterns.json#excludedPaths`. Adding it there is permitted only if the file
   genuinely cannot be written without a finding, and then it must be a single exact path (never a
   `fixtures/` wildcard) with `tools/tests/secret-scan.test.mjs`'s `excludedPaths` assertion updated
   deliberately and its "never a `fixtures/` wildcard" assertion kept. State which outcome occurred in
   the PR.

4. **Harness assertions in `.github/workflows/checks/workflows.test.mjs`.** Keep all five existing
   `describe J` controls unchanged in substance, and add a section for the mechanism asserting at
   minimum:

   - **No wildcard, anywhere.** No `path`, `patternId` or any other string field in the exclusions file
     contains `*`, `?`, a regex metacharacter used as one, or an empty value; every `path` is a real,
     existing, git-tracked file.
   - **Every entry is well-formed**: all seven fields present and non-empty, `patternId` is one of the
     eight fixture ids, `identifierSha256` matches `/^[0-9a-f]{64}$/`.
   - **No entry is stale — the list prunes itself.** Every exclusion must match at least one **actual**
     finding produced by an unfiltered scan of the repository. An exclusion that matches nothing fails
     the suite, so a rename or a deletion elsewhere forces the entry out.
   - **The exclusion is narrow — three negative controls, each of which must fail to be excluded**:
     (a) the same digest and pattern at a **different** path; (b) a **different** digest at an excluded
     path with the same pattern — i.e. a new credential-shaped name in an excluded file; (c) an inlined
     private key block (`private-key-block`) in an excluded path. Without these, "scoped" is a claim
     rather than a property.
   - **The scan is not blinded**: the runtime-assembled `AWS_SECRET_ACCESS_KEY` positive control is
     still detected in an ordinary file, and the `docs/**` value-shaped control still fires.
   - **Non-vacuity**: the exclusions array is non-empty, the unfiltered scan of the repository still
     produces findings (so the mechanism is doing work), and the filtered scan produces none.
   - **A declared count.** The file states how many exclusions it holds and the harness asserts the
     array length equals it — the same discipline that keeps `ALLOWLIST` at one, applied to a list that
     is allowed to be longer.

5. **The repository-wide assertions go green.** `describe J`'s
   *"finds no credential-shaped name in the git-tracked tree"* passes, and
   `node .github/workflows/checks/secret-scan.mjs` exits 0 printing its "no credential-shaped name
   outside the allowlist" line — with the count of exclusions applied also printed, so a human reading
   CI sees that exceptions were used and how many.

6. **`tools/tests/secret-scan.test.mjs` stays green and stays strict.** Its `excludedPaths` assertion,
   its inventory assertions and its seven detection controls are unchanged unless deliverable 3's
   fallback fires; if it does, only the `excludedPaths` assertion changes, and the change is stated in
   the PR.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression.

- [ ] `[machine]` **The reported defect is gone.** `node .github/workflows/checks/secret-scan.mjs`
      exits 0 on this branch, where on `main` it exits 1 with 65 findings. Both outputs (the `main` one
      abbreviated with its total) are pasted into the PR (PRD-02 §5 item 6).
- [ ] `[machine]` **The repository-wide harness assertion is green.**
      `node --test .github/workflows/checks/workflows.test.mjs` exits 0, including `describe J`'s
      *"finds no credential-shaped name in the git-tracked tree"* and all four other `describe J`
      controls.
- [ ] `[machine]` **The exclusions account for exactly the 65 findings, and nothing else.** The PR
      states the number of exclusion entries and shows that an unfiltered scan produces 65 findings of
      which every one matches an entry — no entry matching nothing (deliverable 4, staleness).
- [ ] `[machine]` **The mechanism is narrow — demonstrated by the three negative controls.** Each of
      (a) same digest, different path; (b) different digest, excluded path; (c) a private-key block in
      an excluded path is **still reported**. The three assertions are in the suite and their failure
      messages are quoted in the PR (deliverable 4).
- [ ] `[machine]` **The scan still bites on the real tree — demonstrated, not asserted.** Add a
      scratch file at the repository root containing a runtime-legitimate but credential-shaped name
      that is in no exclusion (for example a `*_TOKEN` constant), re-run the scanner, and record that it
      is reported by name; delete the file and confirm the scan is clean again and
      `git status --porcelain` is empty.
- [ ] `[machine]` **The allowlist is untouched and there is no wildcard anywhere.** `ALLOWLIST` is
      still exactly `['GITHUB_TOKEN']`, `PROSE_TREES` is still `['docs/']`, `VALUE_PATTERN_IDS` is
      still `['private-key-block']`, and the no-wildcard assertion covers the exclusions file too
      (Non-goals; deliverable 4).
- [ ] `[machine]` **No identifier was renamed and no scanned file was edited.**
      `git diff --name-only main...HEAD` contains no file under `apps/**`, `packages/**`,
      `pipelines/**`, `.claude/**`, and neither `CLAUDE.md` nor `.gitignore` (D-CI5; Non-goals).
- [ ] `[machine]` **Every exclusion records its basis and its owner.** All seven fields present on
      every entry, `patternId` valid, digest well-formed, `path` an existing git-tracked file
      (deliverable 4).
- [ ] `[machine]` **`tools/tests/secret-scan.test.mjs` is green**, with its `excludedPaths` assertion
      either unchanged or changed exactly as deliverable 3's fallback describes — stated either way in
      the PR.
- [ ] `[machine]` **The branch is mergeable under the live protection.** All six currently-required
      contexts are green on this pull request; names and conclusions pasted into the PR (File-scope).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-007`), user-visible change
      (**none** — CI tooling), non-goals, schema/API/event compatibility (**none** — no identifier
      renamed, which is exactly why the mechanism exists), tenant/PII/security impact (**the scan's
      coverage is narrowed by exactly the listed path+pattern+digest triples and by nothing else**;
      state the count, state that no real credential is excluded, and state that a new credential-shaped
      name in an excluded file still fails), source/licence impact (**none** — no dependency added;
      `node:crypto` is a built-in), cost impact (one SHA-256 per finding, negligible), rollback path
      (revert the commit — which returns the scan to 65 findings and keeps two CI contexts red, so the
      rollback note must say so), known gaps (the four Accepted caveats, plus F-CI1's correction of the
      PRD's location claim).

**Absent classes.** No `[fixture]` criteria in the plan's sense — the exclusions file is scanner
configuration, not a PRD §40.8 adapter fixture or a §14/§43 evaluation replay. No `[human]` criteria —
CI tooling with a mechanical acceptance surface and no customer-visible behaviour; no PRD §41.2 `UAT-*`
script applies. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: `node --test` for `.github/workflows/checks/**` (the runner `FND-02` registered)
and Vitest via `pnpm test` for `tools/**`. The construction pattern to copy is `describe J` itself —
every real assertion paired with a runtime-assembled positive control, so nothing passes vacuously.

1. **Read the mechanism for a blinding first.** Any wildcard, prefix match, `startsWith` on a path, an
   exclusion keyed only by path or only by pattern, a `patternId: "*"`, a second entry in `ALLOWLIST`, a
   widened `PROSE_TREES`, a removed pattern, or a scanner that exits 0 when it inspected nothing is a
   **rejected outcome** (Non-goals), not a style comment.
2. **Read the data for a real credential.** Every entry's `basis` must identify a *name*. If any entry
   describes something that could be an actual secret value, stop: the correct response to a real
   credential is removal and rotation, never an exclusion.
3. **Check the digests are real.** Recompute two or three by hand from the identifiers in the
   Background table (the scanner's header comment states the command) and confirm they match. A digest
   nobody can reproduce is not auditable.
4. **Baseline both ways.** On `main`, the scanner exits 1 with 65 findings; on the branch, exit 0. Run
   the unfiltered scan on the branch (by temporarily emptying the exclusions array) and confirm the 65
   return — this is what proves the exclusions, and not some other edit, are what changed the outcome.
5. **Negative test — the three narrowness controls.** Confirm each of (a), (b) and (c) in deliverable 4
   fails to be excluded, by reading the assertions **and** by driving `isExcluded` directly with
   synthetic findings.
6. **Negative test — staleness prunes.** Add a bogus exclusion for a path/digest that matches nothing
   and confirm the suite fails naming it; remove it. This is what stops the list rotting into an
   allowlist.
7. **Negative test — the real tree.** The scratch-file experiment from acceptance item 5, run on the
   actual repository root rather than in memory.
8. **Confirm no scanned file moved.** `git diff --name-only main...HEAD` lists only File-scope paths;
   no product tree, no frozen file.
9. **Suite and gates.** `node --test .github/workflows/checks/workflows.test.mjs`,
   `node .github/workflows/checks/secret-scan.mjs`, `pnpm test`, `pnpm lint`, `pnpm typecheck` green on
   this branch; `pnpm test` and the scanner re-run on `main` after the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Where the falsified item is a phase-2 decision, the writeback target is
`docs/prd/breakdown-plan-02-ci-repair.md` §4 as well, by a docs PR. Never patch spec into a plan, into
code, or by hand-editing the issue (CLAUDE.md, issue #53).

1. **The live finding set differs from the 65 measured here** — because another wave-2 ticket landed
   first, or a lane added a file. → Do **not** add exclusions on sight to make the number match.
   Establish what each new finding is exactly as the Background table does (what the identifier is, who
   owns the file, whether it is a name or a value), record the delta in **this ticket** (+0.1, `--sync`),
   and only then add entries. If a new finding is a *real* credential, the correct outcome is removal
   and rotation and an immediate escalation — never an exclusion.
2. **The mechanism cannot be built without changing `tools/workspace-assertions.mjs`** (for example
   `scanText` does not expose the matched text or the pattern id in a usable form). → That file is
   `FND-01`'s and is **outside this ticket's scope**. It exports `scanText`, `scanForSecrets` and
   `secretScanInventory`, all of which other suites depend on. Record the exact limitation here (+0.1)
   **before** touching it, and state the consequence: `tools/**` is `00-foundation`'s write-owns tree so
   it is a scope widening within the module, not a cross-module violation, but it widens the blast
   radius of a CI repair onto a helper every `tools/` suite imports.
3. **An identifier genuinely should be renamed** — for example a test-only constant in a delivered
   module that nobody depends on. → Not here. D-CI5 closed the renaming route for this ticket, and a
   rename in `packages/**` or `pipelines/**` is a cross-module file-scope violation. Record the
   suggestion in this ticket, exclude it for now with its basis, and raise the rename with the
   **Architect** as a ticket for the owning module. An exclusion that is later replaced by a rename is
   deleted by the staleness assertion automatically, which is the point of that assertion.
4. **The exclusions file itself produces a finding.** → Deliverable 3 is the decision path: remove the
   offending text first (a `basis` sentence must describe an identifier without quoting it), and only
   if that is impossible add the single exact path to `excludedPaths`, keeping the "never a `fixtures/`
   wildcard" assertion. Record which happened.
5. **The list grows past roughly 40 entries.** → Record it. That is the trigger for the ADR candidate
   below: at that size a per-file suppression convention or a narrowed pattern set may be the better
   design, and the choice should be recorded rather than reached by accretion.
6. **Someone proposes extending `ALLOWLIST` "just this once".** → Rejected by PRD-02 §4 in those words.
   The allowlist is global and unscoped; that is precisely why it holds one entry and why its length is
   asserted. **ADR candidate (raised here, not authored here — this ticket writes nothing under
   `docs/adr/`):** *how a repository-wide scanner records a justified exception* — digest-keyed scoped
   exclusions (this ticket) versus per-file suppression comments versus narrowing the patterns to
   value-shaped only. Owner: **Architect**; trigger: the list exceeding roughly 40 entries, or a second
   scanner needing the same mechanism.

**Escalation.** If the scan cannot be made both correct (zero findings on a repository that holds no
credential) and effective (loud on a credential-shaped name nobody has justified) without either a
wildcard or renaming a published identifier, then the *pattern set* — name-shaped matching across the
whole tree — is what needs a design decision, not this ticket. Stop, escalate to the human, and raise
it with the **Architect**. **Never** resolve it by adding a wildcard, by extending the allowlist, by
excluding a whole directory, by removing a pattern, or by making the scan non-fatal: two CI contexts
depend on this scan being right, and a scan that reports nothing discharges nothing.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial ticket. Implements DEV-007 by the route PRD-02 §4 authorises — a scoped-exclusion mechanism with its own harness assertions — because renaming is closed off by measurement (**D-CI5**): of the 65 live findings, 9 are in frozen files (`.claude/**`, `CLAUDE.md`), 3 in `apps/api/src` product code, 13 in `packages/database`'s crypto layer including a §34.9 error code, and 10 on the published SDK surface, so renaming would be a public-contract change under PRD §16.1/§45.5 that a repair ticket may not make. Exclusions are keyed by exact path + pattern id + **SHA-256 digest** of the identifier (**D-CI6**), because a plaintext exclusion list would itself be reported by the scan it configures — `scanRepository` reads every git-tracked file and `excludedPaths` is asserted to hold exactly one entry. Adds staleness, no-wildcard, declared-count and three narrowness negative controls so the list prunes itself and cannot decay into the wildcard allowlist PRD-02 §4 forbids. Corrects the PRD's location claim for this failure class (F-CI1): the findings span 8 trees, not 2. |
