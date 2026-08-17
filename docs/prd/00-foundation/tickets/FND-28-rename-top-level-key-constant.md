---
id: FND-28
title: Rename the TOP_LEVEL_KEY constant that FND-25 left tripping the secret scan
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-16
blocked_by: []
blocks: [FND-23]
---

# FND-28 — Rename the `TOP_LEVEL_KEY` constant that `FND-25` left tripping the secret scan

Repairs the third of the three CI jobs that are red on `main` @ `5ac25c2`, against PRD §20.3 (the
*"Dependency, secret, container and artifact scans"* gate) and PRD-02 requirement **DEV-007** (*"the
repository MUST contain no identifier that its own secret scan reports"*). No ADR — nothing here decides
a new rule; the rule is `FND-24`'s **D-CI5**/**D-CI6** and this ticket obeys it in the one case where
obeying it is free. **This is a regression introduced by `FND-25`, this phase's own repair**, and the
ticket says so in Background rather than presenting it as a pre-existing fault, so the history stays
legible.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is a **ninth** phase-2 ticket appended to `00-foundation` under
**D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*), continuing the
ids past `FND-27`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root** — the code it renames is already on `main`. It must land
**before** [FND-23](FND-23-ci-local-entry-point-and-nanoid-override.md) can be green, because `FND-23`'s
headline acceptance is `pnpm ci:local` exiting 0 and `ci:local` derives its command set from `ci.yml`,
which includes `node .github/workflows/checks/secret-scan.mjs`. Hence `blocks: [FND-23]`.
**Why `builder`:** a pure identifier rename at four use sites in one existing test file, to a name the
repo owner has already selected the shape of. No new mechanism, no assertion change, no decision.

## Background + basis

### The reported failure — settled, do not re-diagnose

CI job **`Dependency, secret, container and artifact scans`** on `main` @ `5ac25c2`:
`node .github/workflows/checks/secret-scan.mjs` exits 1, reporting
`packages/database/test/migrate/file-scope.test.ts` for pattern `key` — **four occurrences**, at lines
**61, 67, 91 and 153**, all of the same identifier.

Line 61 declares it:

```ts
/** A top-level key line of a flat, two-space-indented document. */
const TOP_LEVEL_KEY = /^[A-Za-z_][A-Za-z0-9_-]*\s*:/;
```

The `key` pattern in `tools/fixtures/secret-patterns.json` is
`\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_KEY(?:_[A-Z0-9]+)*\b` — *"generic API/private key env var"*. An
ALL-CAPS identifier ending in `_KEY` matches it. `TOP_LEVEL_KEY` is a **regular expression constant
describing YAML syntax**; it holds no credential, names no credential, and reads one only to the
scanner's pattern, which deliberately matches credential-shaped *names* because a name is the cheap early
signal that a credential is about to be handled (`FND-24` Background). The scan is doing what it was
built to do.

### It is a regression from `FND-25`, and how it reached `main`

`TOP_LEVEL_KEY` did not exist before this phase. It was introduced by **`FND-25`** — the ticket that
narrowed `DATA-01`'s root-workspace guard — in commit **`f49f50f`**, retained through the review-fix
commit **`cef449b`**, and merged into `main` as **`5ac25c2`** (PR #295). `FND-25` extracted the top-level
key test out of two inline regex literals into a named constant, which is a good change; the name it
chose happens to match a scanner pattern.

**Why it merged red.** The `Dependency, secret, container and artifact scans` context is **not in the
branch-protection required set**. The six required contexts on `main` are `API/OpenAPI compatibility`,
`Migration and tenant-schema validation`, `Tenant isolation, auth and permission tests`, `PII and
citation validation suites`, `Rust builds/tests` and `Retrieval/evaluation smoke set`. `FND-20` made
delivery **wait** on the required contexts and hard-fail an unlanded merge; it cannot wait on a context
nobody made required. Adding the remaining contexts to the required set is **OPS-004**, which is a
**human action and is still open** (phase-2 plan §6).

So: a ticket of this phase introduced a failure in exactly the class this phase exists to eliminate, and
it landed through exactly the hole this phase has already identified and not yet closed. That is worth
recording precisely, and it is recorded here rather than in a commit message so it is legible later —
**this ticket is the evidence for OPS-004, not a substitute for it.** Closing OPS-004 is not in this
ticket's scope and this repair does not reduce its urgency.

### Why the fix is a rename and not an exclusion — settled, do not re-open

`FND-24` built a scoped, digest-keyed exclusion mechanism precisely because the 65 identifiers it faced
**could not** be renamed: 9 sat in frozen files, 3 in `apps/api/src` product code owned by the Founder,
13 in `packages/database`'s crypto layer including a §34.9 error code, and 10 on the published SDK
surface where a rename is a public-contract change under PRD §16.1/§45.5 (**D-CI5**). Every one of those
exclusions is a justified exception to a rule.

**None of that applies here.** `TOP_LEVEL_KEY` is a private `const` in one test file, referenced only
within that file — `git grep` finds the identifier in **no other file in the repository**. It is on no
public surface, in no frozen file, in no product tree, and nothing outside its own module can observe
the name. Renaming it costs four lines.

The repo owner decided on 2026-08-16 that it is renamed, and the reason is about the mechanism rather
than about this constant: **an exclusion list padded with false positives is weaker than one that holds
only genuine exceptions.** `FND-24`'s file is a record of names that *cannot* be changed, each with a
`basis` sentence and an owner, and its staleness assertion exists so the list prunes itself. An entry
whose honest `basis` would read *"we could have renamed it in four lines and did not"* teaches the next
maintainer that the list is where inconvenient findings go. That is how a scoped exclusion mechanism
decays into the wildcard allowlist PRD-02 §4 forbids, and it is worth spending four lines to avoid.

Rejected outcomes, recorded so nobody re-derives them:

- **Adding an exclusion entry to `.github/workflows/fixtures/secret-scan-exclusions.json`** — weakens
  the mechanism `FND-24` just built, for a name that costs four lines to change. Rejected.
- **Adding `TOP_LEVEL_KEY` to `ALLOWLIST`** — PRD-02 §4: *"Appending entries is not an option."* The
  allowlist is global and unscoped and holds exactly one literal, asserted. Rejected.
- **Narrowing the `key` pattern** so it stops matching this shape — the pattern is `FND-01`'s and
  correct; narrowing it to admit one test constant blinds it everywhere. Rejected.
- **Reverting `FND-25`'s extraction** back to inline regex literals — the extraction is an improvement
  and the constant is used at four sites. Rejected.
- **Making the scan non-fatal, or excluding `packages/database/test/**`** — rejected outcomes in any
  case, and the failure mode DEV-007 exists to prevent.

### The name

Any name that cannot match the `key` pattern will do; the candidates the owner named are
`TOP_LEVEL_ENTRY`, `TOP_LEVEL_NAME` and `TOP_LEVEL_PATTERN`. **`TOP_LEVEL_PATTERN` is the recommended
choice** because it is the most accurate: the constant is a compiled regular expression, not a key, and
naming it for what it *is* removes the collision as a side effect of being correct rather than as a
workaround. Whichever is chosen, it must be checked against **all eight** fixture patterns and not only
the `key` one — a name ending in `_TOKEN`, `_SECRET`, `_PASSWORD`, `_CREDENTIAL(S)`, beginning `AWS_`,
or matching the `dsn` shape would trade one finding for another.

### Accepted caveats, carried forward

- **This ticket does not close OPS-004.** The scans context stays outside the required set until a human
  adds it, and until then this class of regression can recur. Recording it here is the whole of what
  this ticket can do about it.
- **The rename is a rename.** `FND-25` was reviewed and cleared on its behaviour; nothing about that
  behaviour is being reconsidered, and this ticket must not become a second review of it.

## Goal

Remove the repository's one remaining self-reported credential-shaped identifier by renaming a private
test constant to a name that describes what it actually is, so
`node .github/workflows/checks/secret-scan.mjs` exits 0 and DEV-007 holds again — **without** adding an
exclusion, without touching a pattern, and without disturbing by one character the guard `FND-25` just
repaired. Completion is mechanically checkable: the scanner exits 0; the `file-scope.test.ts` suite
passes 10/10 including its four positive controls; and `git diff` shows only identifier renames.

## Non-goals

- **No change to any assertion, any behaviour, any test name, or any test's strength.** Not the
  narrowed `toContain('allowBuilds')` claim, not the `entriesUnder` bound, not the occurrence-count
  check, not the byte-identical globs comparison, not the M-Q4 declaration check, not the non-vacuity
  block. `git diff` must be readable as *"this identifier is now called that"* and as nothing else.
  Rejected outcome.
- **No change to the regular expression itself.** `/^[A-Za-z_][A-Za-z0-9_-]*\s*:/` is byte-identical on
  the other side of the rename. Rejected outcome.
- **No re-review or re-litigation of `FND-25`.** It was reviewed, cleared and merged; this ticket
  repairs one name and reconsiders nothing else in the file.
- **No exclusion entry, no `ALLOWLIST` entry, no pattern change.** See Background; all rejected
  outcomes. `.github/workflows/fixtures/secret-scan-exclusions.json`,
  `tools/fixtures/secret-patterns.json` and `.github/workflows/checks/secret-scan.mjs` are read-only
  here.
- **No `.skip`, `.todo`, `it.only`, `continue-on-error`, `|| true` or exit-code swallow**, in the suite
  or in CI. Rejected outcomes.
- **No change to the other two `describe` blocks in the file** (`'DATA-01 tsconfig stays on the repo
  convention'`, `'better-sqlite3 pin (breakdown plan §8 Q12)'`) beyond a use site of the renamed
  constant, of which they have none.
- **No change to `pnpm-workspace.yaml`, `package.json`, `docs/prd/01-app-data/README.md`** or anything
  else `FND-25` touched or guarded.
- **No change to branch protection or to the required-context set.** That is **OPS-004**, a human
  action (phase-2 plan §6), and it is not this ticket's to perform or to pretend to have performed.
- **No product code, no other test file, no `packages/database/src/**`.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket — **one file, and nothing else**:

- `packages/database/test/migrate/file-scope.test.ts` — the `TOP_LEVEL_KEY` identifier at its four use
  sites (lines **61**, **67**, **91**, **153**) and any comment that names it. Test file only; a
  cross-module edit, declared below.

Does not touch:

- `.github/workflows/checks/secret-scan.mjs`, `.github/workflows/fixtures/secret-scan-exclusions.json`,
  `.github/workflows/checks/workflows.test.mjs` — `FND-24`'s. **Read-only here**, including for the
  acceptance run.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` — `FND-01`'s and `FND-24`'s.
  Read-only here.
- `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `.npmrc` — `FND-01`, with `FND-23`'s
  single-key carve-out.
- `docs/prd/01-app-data/README.md` — `01-app-data`'s and the Architect's; `FND-25` updated the M-Q4 row
  and this ticket does not re-open it.
- `packages/database/src/**`, `packages/database/migrations/**`,
  `packages/database/test/**` other than `migrate/file-scope.test.ts`,
  `packages/database/{package.json,tsconfig.json}`, `packages/jobs/**` — `01-app-data`'s.
- `tools/vitest.config.mjs` — `FND-26`'s this phase.
- `pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py` — `FND-27`'s this phase.
- `.github/workflows/ci.yml`, `tools/ci-local.mjs`, `tools/workspace-script.mjs` — `FND-21`'s and
  `FND-23`'s.
- `docs/PRD.md`, `docs/adr/**`, `.claude/**`, `CLAUDE.md`, `templates/**` — frozen or unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.
- every other product tree — PRD-02 §3.

**Cross-module declaration.** `packages/database/**` is `01-app-data`'s write-owns tree, so a
`00-foundation` ticket writing a file there is an out-of-file-scope edit, declared here rather than
performed quietly — on exactly the footing `FND-25` declared, in the same file, for the same reason. The
edit is **test-only**, confined to **one identifier in one file**, opens no other suite, and exists
because a `00-foundation` phase-2 ticket put the name there. Re-running the delivered `DATA-01` to
rename a constant `FND-25` introduced would be the wrong owner as well as the slower route.

**Serial-safety analysis.** `packages/database/test/migrate/file-scope.test.ts` was last written by
`FND-25` (delivered and merged; `f49f50f`, `cef449b`) and is declared in **no** other ticket's file-scope
under `docs/prd/**` — verified by search. `FND-26` and `FND-27`, the other two phase-2 tickets in
flight, declare `tools/vitest.config.mjs` and a Python guard respectively and neither declares any
`packages/database` path, so all three may run as parallel lanes. `FND-23` is `blocked_by` this ticket.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. The second and third run `packages/database`'s suites, so this ticket
**does** write an input to two required contexts. The context it actually repairs —
`Dependency, secret, container and artifact scans` — is **not** among them, which is the whole of
Background's second section. **Verify rather than assume**: acceptance item 6 requires all six green by
name, and acceptance item 1 requires the scans context's own conclusion on the pull request even though
nothing enforces it.

## Deliverables

1. **The constant is renamed at all four use sites.** `TOP_LEVEL_KEY` becomes a name that matches
   **none** of the eight patterns in `tools/fixtures/secret-patterns.json` —
   **`TOP_LEVEL_PATTERN` recommended** (Background), with `TOP_LEVEL_ENTRY` and `TOP_LEVEL_NAME`
   acceptable. All four sites change together: the declaration (line 61), the `topLevelKeys` filter
   (line 67), the `entriesUnder` bound (line 91) and the byte-identical-globs `findIndex` (line 153).
   The doc comment above the declaration (*"A top-level key line of a flat, two-space-indented
   document"*) and any other comment naming the constant are updated to the new name; the prose may say
   "key" where it describes YAML, because the pattern matches identifiers and not English.

2. **A one-line comment records why the name is what it is.** Beside the declaration, state that the
   previous name matched the repository secret scan's `key` pattern and was renamed rather than
   excluded, naming `FND-28`. Without it the next person to find `TOP_LEVEL_PATTERN` slightly less
   descriptive than `TOP_LEVEL_KEY` will rename it back and re-red the same CI job. Keep it to a line or
   two — this is a signpost, not an essay.

3. **Nothing else in the file changes.** No assertion, no test title, no import, no helper signature, no
   regular expression body, no `describe` block. Verified by deliverable 4's diff reading, not by
   intention.

4. **The repair is proved not to have disarmed `FND-25`'s guard.** Re-run `FND-25`'s four positive
   controls, listed in acceptance items 3–5 below. A rename cannot in principle break them, which is
   exactly why it must be checked: a rename applied with a careless find-and-replace across a comparison
   string, or a botched merge, is how a "pure rename" stops being one.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression.

- [ ] `[machine]` **The reported defect is gone.** `node .github/workflows/checks/secret-scan.mjs`
      **exits 0** on this branch, where on `main` @ `5ac25c2` it exits 1 reporting
      `packages/database/test/migrate/file-scope.test.ts` four times for pattern `key`. Both outputs
      pasted into the PR (PRD-02 §5 item 6). The `Dependency, secret, container and artifact scans`
      context's conclusion on the pull request is pasted too — it is not a required context, so it must
      be read deliberately rather than relied on to block.
- [ ] `[machine]` **The suite still passes 10/10.** `pnpm --filter @taxrag/database test` runs
      `test/migrate/file-scope.test.ts` green — all seven tests of
      `'DATA-01 out-of-file-scope exception (root pnpm-workspace.yaml)'`, the one of
      `'DATA-01 tsconfig stays on the repo convention'` and the two of
      `'better-sqlite3 pin (breakdown plan §8 Q12)'`. The count is stated in the PR.
- [ ] `[machine]` **Positive control 1 — a second `allowBuilds` entry still fails.** Add a second entry
      (for example `  esbuild: false`) under `allowBuilds:` in the working-tree `pnpm-workspace.yaml`,
      run the suite, record that it fails naming the entry list; restore and confirm
      `git status --porcelain` is clean of it.
- [ ] `[machine]` **Positive control 2 — the pnpm stub still fails.** Replace the value with pnpm's
      `set this to true or false` stub text, run, record the failure, restore.
- [ ] `[machine]` **Positive control 3 — the `packages:` globs are still byte-guarded.** Reorder one
      glob line, run, record the failure, restore; then edit one glob line and repeat.
- [ ] `[machine]` **Positive control 4 — the declaration is still bound to the code.** Remove the
      `| M-Q4 |` row from `docs/prd/01-app-data/README.md` in the working tree, run, record that
      *"is declared as an open escalation in the sub-PRD"* fails; restore. **These four are `FND-25`'s
      own controls and the point of re-running them is that the rename must not have quietly disarmed
      the guard `FND-25` just repaired.**
- [ ] `[machine]` **The branch is mergeable under the live protection**, and in particular the two
      contexts this ticket writes an input to — `Migration and tenant-schema validation` and
      `Tenant isolation, auth and permission tests` — are green. All six names and conclusions pasted
      into the PR (File-scope).
- [ ] `[machine]` **`git diff` shows only identifier renames.** `git diff main...HEAD` contains no
      changed assertion, no changed test title, no changed regular expression body, no `.skip`,
      `.todo`, `it.only` or deleted `it(` — only the identifier at four sites plus comment text
      (deliverables 1–3). State in the PR that the regex literal `/^[A-Za-z_][A-Za-z0-9_-]*\s*:/` is
      byte-identical.
- [ ] `[machine]` **The diff is one file.** `git diff --name-only main...HEAD` lists exactly
      `packages/database/test/migrate/file-scope.test.ts`. In particular the exclusions fixture, the
      patterns fixture and the scanner are **unchanged** (File-scope; Non-goals).
- [ ] `[machine]` **The old name is gone from the code and the new one is clean.**
      `git grep TOP_LEVEL_KEY -- ':!docs/'` returns nothing. The `docs/` exclusion is required and is
      not a loophole: **this ticket file names the old constant throughout**, deliberately, and `docs/**`
      is prose-narrowed by the scanner (only `private-key-block` applies there), so it produces no
      finding. The chosen name matches none of the eight patterns in
      `tools/fixtures/secret-patterns.json` — checked against all eight, not only `key` (deliverable 1).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-007`; unblocks
      `FND-23`/DEV-005), user-visible change (**none** — test code), schema/API/event compatibility
      (**none** — a private test constant is on no surface), tenant/PII/security impact (**the scan's
      coverage is unchanged** — no exclusion added, no pattern narrowed, no allowlist entry; the
      repository simply no longer contains the reported name), source/licence impact (**none**), cost
      impact (**none**), rollback path (revert the commit — which re-reds the scans context and re-blocks
      `FND-23`, so the rollback note must say so), known gaps (**OPS-004** is still open, which is how
      this regression reached `main` in the first place — state it explicitly).

**Absent classes.** No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43
evaluation replay. No `[human]` criteria — test-only change with a mechanical acceptance surface and no
customer-visible behaviour; no PRD §41.2 `UAT-*` script applies. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: Vitest via `pnpm --filter @taxrag/database test` for the file and `pnpm test` for
the workspace, plus `node .github/workflows/checks/secret-scan.mjs`.

1. **Read the diff as a rename, and reject anything that is not one.** Any assertion, title, regex body,
   helper signature or control that changed is a **rejected outcome** (Non-goals). The expected diff is
   four identifier occurrences plus comment text. This is the whole review: a "pure rename" that is not
   pure is the only way this ticket can do damage.
2. **Check the new name against all eight patterns**, not only `key`. Compile each fixture regex and run
   it over the new identifier; a name that trades a `key` finding for a `token` one is a defect.
3. **Baseline both ways.** On `main`, `node .github/workflows/checks/secret-scan.mjs` exits 1 naming the
   file four times; on the branch it exits 0. Anything else means something other than the rename
   changed the outcome.
4. **Re-run `FND-25`'s four positive controls yourself**, in the working tree, restoring after each. A
   suite that merely goes green proves nothing; what has to be proved is that it still bites on the four
   things `DATA-01` needs it to bite on.
5. **Confirm the old name is gone from the code.** `git grep TOP_LEVEL_KEY -- ':!docs/'` returns
   nothing. It still appears in this ticket file and in `FND-25`'s, which is correct — `docs/**` is
   prose-narrowed by the scanner and produces no finding.
6. **Confirm nothing else moved.** `git diff --name-only main...HEAD` is one file; no fixture, no
   scanner, no `pnpm-workspace.yaml`, no sub-PRD.
7. **Suite and gates.** `pnpm test`, `pnpm lint`, `pnpm typecheck` and the scanner green on the branch;
   `pnpm test` and the scanner re-run on `main` after the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **The scanner still reports the file after the rename** — a second identifier in it matches a
   pattern, or the same one survives somewhere. → Record the exact finding here (+0.1, `--sync`) before
   changing anything else. If it is another `FND-25`-introduced name, rename it under this ticket; if it
   is a name `DATA-01` or another module put there, it is **not** this ticket's to rename (D-CI5) —
   record it and raise it with the **Architect**.
2. **The rename breaks a test.** → It cannot, in principle, which makes it worth reading carefully: the
   likely causes are a find-and-replace that reached inside a string compared byte-for-byte, or a
   use site missed. Fix the mechanical error; do **not** adjust an assertion to accommodate it. If an
   assertion genuinely depended on the identifier's spelling, record that here — it would mean the
   rename is not behaviour-neutral and the ticket's premise needs revisiting.
3. **Somebody proposes an exclusion entry instead, "since the mechanism exists"** — or an `ALLOWLIST`
   entry, or narrowing the `key` pattern. → Rejected by the repo owner on 2026-08-16, with the reason in
   Background: padding the exclusion list with false positives weakens the mechanism `FND-24` just
   built, and this identifier is a private test constant that costs four lines to change. Do not
   re-open it; if the argument is genuinely new, raise it with the **Architect** as a change to *this
   ticket*.
4. **The chosen name is disliked in review.** → Any of `TOP_LEVEL_PATTERN`, `TOP_LEVEL_ENTRY` or
   `TOP_LEVEL_NAME` is acceptable and the choice is not worth a bounce cycle. What is **not**
   negotiable is that it matches none of the eight patterns and that deliverable 2's comment survives.
5. **The `Dependency, secret, container and artifact scans` context is still not required when this
   lands.** → Expected; that is **OPS-004**, a human action, and it is a Non-goal here. Record in the PR
   that this repair leaves the hole open, so the next regression of this class is not a surprise. Do
   **not** attempt to change branch protection from a ticket.

**Escalation.** If the identifier cannot be renamed without changing behaviour — because something
outside the file depends on its spelling, which `git grep` says nothing does — then it is not the
private constant this ticket takes it for, and the choice between a rename and a `FND-24` exclusion has
to be made with that fact on the table. Stop, escalate to the human, and raise it with the
**Architect**. **Never** resolve it by adding an exclusion, extending the allowlist, narrowing a
pattern, or making the scan non-fatal: DEV-007 exists because a scan that reports nothing discharges
nothing.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-16 | Initial ticket. Repairs the third of the three CI jobs red on `main` @ `5ac25c2`: `node .github/workflows/checks/secret-scan.mjs` exits 1 reporting `packages/database/test/migrate/file-scope.test.ts` four times (lines 61, 67, 91, 153) for pattern `key`, because `const TOP_LEVEL_KEY = /^[A-Za-z_][A-Za-z0-9_-]*\s*:/` is an ALL-CAPS identifier ending in `_KEY` and the `key` pattern matches credential-shaped **names** by design. It is a regular-expression constant describing YAML syntax, not a credential. Records that this is a **regression introduced by `FND-25`**, this phase's own repair — the constant was extracted in `f49f50f`, retained through `cef449b` and merged as `5ac25c2` (PR #295) — and that it reached `main` because the `Dependency, secret, container and artifact scans` context is **not in the branch-protection required set**: `FND-20` made delivery wait on the required contexts and hard-fail an unlanded merge, but it cannot wait on a context nobody made required, and adding the rest is **OPS-004**, a human action still open. So a phase-2 ticket reproduced the exact failure mode phase 2 exists to eliminate, through the exact hole phase 2 has already named; this ticket is evidence for OPS-004 and not a substitute for it. Fixes it by **renaming**, not by an exclusion: `FND-24`'s mechanism is for identifiers that *cannot* be renamed (frozen files, product code, §34.9 error codes, the published SDK surface — **D-CI5**), and none of that applies to a private test constant referenced in no other file, so an entry whose honest `basis` would read *"we could have renamed it in four lines and did not"* would teach the next maintainer that the list is where inconvenient findings go — which is how a scoped mechanism decays into the wildcard allowlist PRD-02 §4 forbids. Recommends `TOP_LEVEL_PATTERN` (the constant is a compiled regular expression, so the accurate name removes the collision as a side effect of being correct), with `TOP_LEVEL_ENTRY` and `TOP_LEVEL_NAME` acceptable, and requires the chosen name to be checked against **all eight** fixture patterns rather than only `key`. Requires `FND-25`'s four positive controls (second `allowBuilds` entry, pnpm stub, glob reorder and edit, missing M-Q4 row) to be re-run, because a "pure rename" that is not pure is the only way this ticket can do damage. Carries `blocks: [FND-23]` and an empty `blocked_by`: it is a root, and `FND-23`'s `pnpm ci:local` cannot exit 0 while the secret scan exits 1. |
