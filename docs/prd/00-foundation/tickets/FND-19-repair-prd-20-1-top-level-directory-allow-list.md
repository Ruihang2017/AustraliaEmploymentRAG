---
id: FND-19
title: Repair the PRD 20.1 top-level directory allow-list
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-15
blocked_by: [FND-01]
blocks: []
---

# FND-19 — Repair the PRD 20.1 top-level directory allow-list

Implements PRD §20.1 (the monorepo layout is the tree the repository actually has) and PRD §20.3 /
§45.3 (the `pnpm test` gate must be **correct**, not merely loud), requirement **DEV-001**
(epic `E01-REPO`), against the layout guard `FND-01` delivered. No ADR — the property under test is
already decided by PRD §20.1 (the layout directories) and by `FND-01`'s own fixture design (three
allow-list classes: PRD §20.1 top levels, tracked non-§20.1 repository tooling, git-ignored
artifacts); this is a repair ticket against a **transcription of the tree that has fallen behind the
tree**, not against the guard's rule or its mechanism.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap, pinned toolchains, workspace skeleton](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
— `FND-01` created the fixture this ticket repairs (`tools/fixtures/prd-20-1-layout.json`, commit
`221c5d5`, *"FND-01: monorepo bootstrap, pinned toolchains, workspace skeleton"*) together with its
consumer `tools/workspace-assertions.mjs` and its suite `tools/tests/layout.test.mjs`, and is already
delivered and merged into `main`, so the edge is satisfied at authoring time and nothing waits on it.
**Why `builder`:** a bounded data change to one committed fixture, against a rule that is already
fixed by PRD §20.1 and `FND-01`'s fixture design — not a new subsystem decision.

## Background + basis

### What exists today

`tools/fixtures/prd-20-1-layout.json` and its consumer `assertLayout()` in
`tools/workspace-assertions.mjs` are merged into `main`. `assertLayout()` does two things, and only
the second is at issue:

1. every directory in the fixture's `directories` list must exist on disk (the PRD §20.1 tree);
2. every **directory** entry at the repository root must appear in a single allow-list built from
   three fixture keys — this is the part that is wrong:

```js
const allowed = new Set([
  ...fixture.topLevelFromLayout,
  ...fixture.topLevelPreexistingAllowed.entries,
  ...fixture.topLevelIgnored.entries,
]);
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!allowed.has(entry.name)) {
    problems.push(
      `unexpected top-level directory "${entry.name}" — not in PRD 20.1, not a pre-existing ` +
        'entry and not an ignored build artifact',
    );
  }
}
```

The three keys as committed:

| Key | Entries | Meaning |
|---|---|---|
| `topLevelFromLayout` | `apps`, `services`, `packages`, `pipelines`, `sdk`, `schemas`, `evals`, `infra`, `docs`, `tests` | the ten first segments of PRD §20.1 |
| `topLevelPreexistingAllowed.entries` | `.claude`, `.github`, `templates`, `tools` | *"Tracked top-level directories that predate FND-01 and are outside PRD section 20.1."* |
| `topLevelIgnored.entries` | `.git`, `node_modules`, `target`, `.venv`, `.pytest_cache`, `.ruff_cache` | *"Untracked build/tooling artifacts; all are git-ignored, none may be committed."* |

**The guard's rule is right and this ticket keeps it.** A repository root that grows a directory
nobody decided on — a stray `vendor/`, a build output committed by accident, a tool's cache
directory that later ends up tracked — is exactly the drift PRD §20.1 exists to prevent, and a
whole-root allow-list is the only formulation that catches an *addition* (a deny-list cannot). What
is wrong is that the allow-list is a **transcription of the repository root as it stood on
2026-08-03** and the root has legitimately changed since.

### The defect

On 2026-08-12 the repository adopted two upstream agent-pipeline patterns:

```text
npx agent-templates@latest adopt three-agent-architect-builder-reviewer .
npx agent-templates@latest adopt codex-three-agent-architect-builder-reviewer .
```

which installed `.agents/` (nine Codex skills, all tracked), `AGENTS.md` (a tracked root **file**),
and `.codex/` (tracked config plus scripts). Separately, `.worktrees/` is the root-level harness
worktree directory used at `concurrency > 1`, and `.gitignore` lines 29–31 ignore it
(*"agent-templates: root-level harness worktrees — never commit, never scan"*). None of the three is
in any of the three fixture keys, so `assertLayout()` reports all three.

### Evidence (settled — do not re-litigate)

Live reproduction on merged `main`, working tree clean, Node **24.18.0** prepended to `PATH` from
`C:\Users\HoraceHou\AppData\Local\node-24.18.0`, 2026-08-15:

```text
node -e "import('./tools/workspace-assertions.mjs').then(m=>console.log(JSON.stringify(m.assertLayout(),null,1)))"
```

```text
[
 "unexpected top-level directory \".agents\" — not in PRD 20.1, not a pre-existing entry and not an ignored build artifact",
 "unexpected top-level directory \".codex\" — not in PRD 20.1, not a pre-existing entry and not an ignored build artifact",
 "unexpected top-level directory \".worktrees\" — not in PRD 20.1, not a pre-existing entry and not an ignored build artifact"
]
```

Through the suite, the same three strings fail exactly one test out of 111:

```text
FAIL  tools/tests/layout.test.mjs > PRD 20.1 layout > replays green against the committed fixture
AssertionError: expected [ …(3) ] to deeply equal []
```

Three problems, one assertion, one file. The other four tests in `tools/tests/layout.test.mjs` — the
brace-notation transcription check, the renamed-directory check, the `vendor` unexpected-directory
check and the *reads the filesystem, not the git index* check — are green, as is the rest of the
workspace suite.

### Consequence — why this is not cosmetic

`deliver-ticket.mjs` re-runs the full suite on the **merged default branch** as the last Definition
of Done gate, and the Reviewer runs the suite independently before clearing. A permanently red test
on `main` therefore makes `dodPassed` **false for every ticket regardless of its own correctness** —
observed already for `DATA-08`, `RUNT-06`, `CRPS-05`, `CRPS-08` and `EVID-07` — and it puts an
unrelated red line in front of every Reviewer, which invites a spurious `BOUNCE`. The blast radius is
the whole plan, not this module.

### This is the third instance of one defect class

`tools/tests/frozen-paths.test.mjs` was the first (repaired by **`FND-11`**: `FND-01`'s file-scope
encoded as a repository-wide invariant). `packages/contracts/test/enums/package-purity.test.ts` was
the second (repaired by **`FND-12`**: a text scanner that read `FND-05`'s generated import text as
real imports). Both are the same shape as this one: **a repository-wide guard written from one
ticket's viewpoint, misfiring on later work.** The distinguishing feature here is that the guard is
not merely mistranscribed — it is *correct as of a date*, and nothing in the file says which date or
what a future maintainer is supposed to do when the root legitimately changes. That is what
deliverable 2 addresses, and it is why this repair adds prose to a data file rather than only data.

### Finding: there is no dynamic "ignored" escape hatch — `topLevelIgnored` is a hardcoded list

The failure message says *"not an ignored build artifact"*, which reads as though a git-ignored
directory were exempt. **It is not.** `assertLayout()` performs no git access of any kind: it takes a
`root` argument, calls `readdirSync`, and compares names against three literal arrays read from the
fixture. `topLevelIgnored` is simply the third array — a *statically enumerated* list of names that
happen to also be git-ignored. `.worktrees/` is genuinely git-ignored and is reported anyway, because
being git-ignored has never been what that key means.

**Decision: keep it static. Do not make the guard consult git.** Three independent reasons, each
sufficient:

1. **It would blunt the guard exactly where it matters.** `.gitignore` is itself an editable file
   inside the repository, and (unlike `docs/PRD.md`) it is **allocated** — breakdown plan §4 lists
   `.gitignore` in `00-foundation`'s write-owns row (added in plan v0.3 under **Q-F7**). "Anything
   git-ignored is allowed at the root" would let any ticket that can append one line to `.gitignore`
   silently retire the layout guard for any directory it likes. A guard whose allow-list can be
   widened as a side effect of an unrelated edit is not a guard.
2. **It would break the assertion's own design invariant.** `tools/tests/layout.test.mjs` exercises
   `assertLayout(root)` against **scratch roots** created with `mkdtempSync` under the OS temp
   directory — three of its five tests do. Those roots contain no git repository, so
   `git check-ignore` there would either fail outright or answer from the user's *global* ignore
   file, making the guard's behaviour depend on ambient machine configuration. `FND-01` states the
   filesystem-only property explicitly, and one of its tests exists solely to pin it
   (*"reads the filesystem, not the git index"*). Adding git access falsifies that test's premise.
3. **It is not needed.** The three offenders are three named, decided directories. Enumerating them
   is a smaller, more auditable change than converting a pure filesystem assertion into a
   git-dependent one, and it leaves the "unexpected directory" failure mode fully intact.

### Decision: allow-list, not PRD §20.1 — and `docs/PRD.md` is deliberately not touched

The three directories are **agent-pipeline tooling, not product layout.** PRD §20.1 describes the
monorepo the product is built in; `.claude`, `.github`, `templates` and `tools` are equally real and
equally permanent and are equally *not* in §20.1 — they live in `topLevelPreexistingAllowed` precisely
because that distinction is the fixture's whole point. `.agents`, `.codex` and `.worktrees` are the
same kind of thing as `.claude`: they carry the pipeline that builds the product, not the product.
Two mechanical consequences make this more than a preference:

- `docs/PRD.md` is **frozen** by breakdown plan §4 (*"frozen — no module writes"*). A repair ticket
  cannot amend it, and a ticket that needed to would be a docs PR authored by the Architect, not a
  Builder change. Editing it would also fail `tools/tests/frozen-paths.test.mjs` on this branch.
- The fixture's `source`/`directories` pair is asserted to be a **verbatim** transcription of §20.1's
  fenced block, expanded from brace notation, with `toHaveLength(47)`. Adding entries there without
  changing the PRD would fail that test; changing both would enlarge a repair into a specification
  change.

So: **§20.1 is unchanged, the PRD is unchanged, and the three directories are added to the fixture's
allow-list keys.** `.agents` and `.codex` are tracked (verified: `git ls-files .agents` → 9 files;
`git ls-files .codex` → tracked config and scripts), so they belong with the other tracked non-§20.1
tooling in `topLevelPreexistingAllowed`. `.worktrees` is untracked and git-ignored, exactly the
category `topLevelIgnored` describes, so it goes there.

### Accepted caveats carried forward, not re-litigated

- **The key name `topLevelPreexistingAllowed` becomes slightly narrower than its contents**: after
  this repair it holds four entries that predate `FND-01` and two adopted after it. Renaming the key
  would require an edit to `tools/workspace-assertions.mjs` line 46 (and would widen a one-file
  repair for a cosmetic gain), so the key name stays and its `$comment` is rewritten to state the
  real membership rule (deliverable 2). Same class of accepted cosmetic debt as `FND-12`'s
  unnormalised path separator.
- **The failure message's wording — *"not a pre-existing entry and not an ignored build artifact"* —
  is likewise left as it is**, in `tools/workspace-assertions.mjs`, which this ticket does not touch.
  It is imprecise for the same reason and for the same one-file reason.
- **The guard covers directories only.** `AGENTS.md`, the tracked root file the same adoption
  installed, is invisible to `assertLayout()` because of the `if (!entry.isDirectory()) continue;`
  line. That is `FND-01`'s design, it is not a defect this ticket found, and extending the guard to
  root files is a **Non-goal** with a named owner — a genuine enlargement of what the guard reports,
  which must not be smuggled in behind a repair (the `FND-12` precedent).
- **The allow-list is still a snapshot.** After this repair it is a *dated, explained* snapshot
  rather than an undated one, but a fourth adopted directory will fail it again. That is the
  intended behaviour — the alternative is a guard that allows everything — and the escape hatch is
  written into the file by deliverable 2.

## Goal

Repair `tools/fixtures/prd-20-1-layout.json` so that its top-level allow-list describes the
repository root as it actually is — the ten PRD §20.1 first segments, the tracked non-§20.1 tooling
directories including the two adopted on 2026-08-12, and the git-ignored artifact directories
including the root-level harness worktree directory — while the guard keeps its rule, its mechanism
and its bite unchanged: still a pure filesystem read with no git access, still a whole-root
allow-list, and still a loud named failure for any top-level directory nobody has decided on.
Completion is mechanically checkable: `assertLayout()` returns `[]` on this branch's repository root,
`pnpm test` is green, and a directory created at the root that is in none of the three lists still
fails the assertion by name — demonstrated by running it, not asserted.

## Non-goals

- **No change to any file other than `tools/fixtures/prd-20-1-layout.json`.** In particular no change
  to `tools/workspace-assertions.mjs`, `tools/tests/layout.test.mjs`, `tools/check-workspace.mjs` or
  any other `tools/tests/*.test.mjs` — all `FND-01`'s, all delivered and merged.
- **No change to `docs/PRD.md` §20.1, and no change to the fixture's `source` or `directories` keys.**
  The 47-directory transcription and its brace-notation source stay byte-identical. See the decision
  in Background.
- **No git access added to `assertLayout()`, and no "allow anything git-ignored" rule** — rejected
  outcome, with three reasons recorded in Background. `topLevelIgnored` stays a static enumeration.
- **No weakening of the guard.** Deleting the unexpected-directory loop, wrapping it in a
  conditional, marking the failing test `.skip`/`.todo`, narrowing the loop to a subset of the root,
  adding a wildcard/prefix rule (for example "allow any name beginning with `.`"), or making the
  failure non-fatal are all out of scope and are **rejected outcomes, not shortcuts**. A dot-prefix
  rule in particular would allow `.aws`, `.env.d`, `.terraform` and every future tool's dot-directory
  without a decision, which is the whole failure mode. The point is a correct guard, not a quiet one.
- **No extension of the guard to root-level files** (`AGENTS.md` and its neighbours). Owner: the
  **Architect**, via a separate `00-foundation` ticket if it is wanted; it changes what the guard
  reports and needs its own acceptance evidence.
- **No renaming of the fixture keys, no reordering or reformatting of the file beyond the entries and
  comments this ticket adds**, and no change to the `doNotRead` key (PRD §45.1 item 6 / breakdown
  plan §9 R9 blind gold).
- **No change to `.gitignore`, `.agents/**`, `.codex/**`, `AGENTS.md`, `CLAUDE.md` or `.claude/**`.**
  The adopted tooling is correct as installed; the fixture is what is stale. Deleting or relocating a
  directory to satisfy the guard is a rejected outcome.
- **No change to breakdown plan §4, to `docs/prd/00-foundation/README.md`, or to any other ticket
  file.** This ticket is an addition under `docs/prd/`; spec changes elsewhere go through a docs PR
  (CLAUDE.md).

## File-scope (write-owns)

Owned by this ticket:

- `tools/fixtures/prd-20-1-layout.json` — **this one file, and nothing else.**

Does not touch:

- `tools/workspace-assertions.mjs` — `FND-01`, with `RUNT-06`'s merged repair on top (commit
  `4cd6714`, the member-tsconfig key-set relaxation); this ticket adds no fixture key, so the
  consumer needs no edit.
- `tools/tests/layout.test.mjs`, `tools/tests/frozen-paths.test.mjs` (`FND-11`'s),
  `tools/tests/line-endings.test.mjs`, `tools/tests/secret-scan.test.mjs` — which asserts this
  fixture's **path** appears in the scanned inventory, unchanged here — and the other
  `tools/tests/*.test.mjs` files, `tools/check-workspace.mjs`, `tools/workspace-script.mjs`,
  `tools/vitest.config.mjs`, `tools/eslint.config.mjs`, the other four `tools/fixtures/*.json`,
  `tools/pytest_exit_zero_when_empty.py` — `FND-01`.
- `tools/validate-prd.ps1`, `tools/export-visible-transcript.ps1` — **frozen** (breakdown plan §4,
  "the two pre-existing `tools/*.ps1`").
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, `templates/**`, `CLAUDE.md`, `.claude/**` —
  frozen (breakdown plan §4). `.agents/**`, `.codex/**` and `AGENTS.md` are agent-pipeline tooling of
  the same character and are likewise not written by this ticket.
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — unallocated
  (breakdown plan §4; sub-PRD **Q-F6** and the `.gitattributes` decision in `FND-11`).
- `.gitignore`, root manifests, lockfiles and tool-version files, `README.md` — `FND-01`.
- `.github/workflows/**` — `FND-02`. `packages/**`, `apps/**`, `schemas/**` and every other module's
  write-owns tree in breakdown plan §4.
- `docs/prd/**` — this ticket, the sub-PRD and the breakdown plan are changed by a **docs PR before**
  this ticket executes (CLAUDE.md: the ticket is the executable source of truth; spec changes go
  through the ticket, never through code).

**Frozen-path note.** `tools/**` is **not** frozen: breakdown plan §4 allocates it to `00-foundation`
as a write-owns path, and only the two pre-existing `tools/*.ps1` scripts inside it are frozen
(`FND-11` deliverable 1, entries 4–5). Writing `tools/fixtures/prd-20-1-layout.json` is therefore
inside this module's allocation and passes `tools/tests/frozen-paths.test.mjs`. This is the same
basis `FND-11` used to write `tools/tests/frozen-paths.test.mjs` and `FND-04` used under sub-PRD D22
to repair `tools/tests/{skeleton,scripts}.test.mjs`.

**Serial-safety analysis.** `tools/fixtures/prd-20-1-layout.json` has exactly one commit in its
history — `221c5d5` (`FND-01`), merged into `main`. No in-flight ticket declares it in its file-scope.
Its two consumers (`tools/workspace-assertions.mjs`, `tools/check-workspace.mjs`) are read-only with
respect to this change and are not edited here, so no other lane can conflict on it. Any ticket
running concurrently benefits the moment this lands and needs no rebase decision.

**Sequencing note (operational, not a DAG edge).** `blocks` is deliberately empty and no other
ticket's frontmatter is edited: `/start-all` cannot honor a dependency added to an already-started
ticket (CLAUDE.md — it returns in `escalations`), and rewriting in-flight ticket files re-publishes
their issues and re-triggers the drift path (issue #112). The operational consequence must
nevertheless be stated: **until `FND-19` lands on `main`, every ticket's Definition-of-Done check
fails on this one assertion**, whatever its own correctness. Running it to completion ahead of the
queue is a human scheduling decision, recorded here so it is not rediscovered by repeating the
failure a sixth time.

## Deliverables

All of the following land in `tools/fixtures/prd-20-1-layout.json`. Formatting inside the file is the
Builder's choice as long as it remains valid JSON in the file's existing two-space style; the entries
and the stated rules are not.

1. **`topLevelPreexistingAllowed.entries` gains the two tracked adopted directories**, so the key
   reads (order is the Builder's choice; membership is not):

   | Entry | Basis |
   |---|---|
   | `.claude` | pre-existing, frozen by breakdown plan §4 (`FND-01`) |
   | `.github` | pre-existing; `.github/workflows/**` allocated to `00-foundation` (`FND-02`) |
   | `templates` | pre-existing, frozen by breakdown plan §4 (`FND-01`) |
   | `tools` | pre-existing; allocated to `00-foundation` (`FND-01`) |
   | `.agents` | **new** — tracked Codex skills installed 2026-08-12 by `npx agent-templates@latest adopt codex-three-agent-architect-builder-reviewer .` |
   | `.codex` | **new** — tracked Codex config + scripts, same adoption |

   No other entry is added, removed or renamed.

2. **`topLevelIgnored.entries` gains `.worktrees`**, alongside the existing `.git`, `node_modules`,
   `target`, `.venv`, `.pytest_cache`, `.ruff_cache`. Basis: the root-level harness worktree
   directory used at `concurrency > 1`, git-ignored by `.gitignore`
   (*"agent-templates: root-level harness worktrees — never commit, never scan"*), never committed.
   Note for the Builder: `.claude/worktrees/` and `.codex/worktrees/` are **nested**, not top-level,
   and need no entry.

3. **Anti-regression comments that state the rule and the escape hatch.** The two `$comment` fields
   this ticket edits must, in substance:

   - **`topLevelPreexistingAllowed.$comment`** — replace *"Tracked top-level directories that predate
     FND-01"* with the membership rule the key actually encodes: **tracked** top-level directories
     that are outside PRD §20.1 and are legitimately part of this repository — repository tooling
     predating `FND-01` plus agent-pipeline tooling adopted since (`.agents`, `.codex`, 2026-08-12).
     It must record that the key's *name* is now narrower than its contents, deliberately, because
     renaming it would require editing `tools/workspace-assertions.mjs` (`FND-19`).
   - **`topLevelIgnored.$comment`** — keep the existing meaning (untracked, git-ignored, never
     committed) and add the load-bearing clarification that this key is a **static enumeration**:
     `assertLayout()` performs **no git access at all**, so being git-ignored does not by itself
     exempt a directory — a new git-ignored top-level directory must be added here explicitly. It
     must state why the guard is not made to consult git: `.gitignore` is itself writable by
     `00-foundation`, so "anything git-ignored is allowed" would let an unrelated one-line edit
     retire the layout guard, and `tools/tests/layout.test.mjs` runs `assertLayout` against scratch
     roots that contain no git repository (`FND-19`).

   Additionally, either in the file's top-level `$comment` array or in the two comments above, the
   **escape hatch** must be written down in one place: *when the repository root legitimately gains a
   directory, add it to `topLevelPreexistingAllowed` (tracked) or `topLevelIgnored` (git-ignored,
   untracked) with its basis and date — never to `source`/`directories`, which are a verbatim
   transcription of PRD §20.1 and change only when the PRD does; and never by weakening the check.*
   A future maintainer must be able to act correctly from the file alone.

   Deliverables 1–2 and 3 land together: a corrected list without the grounding comments is one
   adoption away from the same undated snapshot, which is exactly what this ticket exists to prevent.

4. **`source`, `directories` and `doNotRead` are byte-identical to `main`.** The 47-entry expansion,
   the ten `topLevelFromLayout` entries and the blind-gold key are untouched.

5. **No change to the file's contract**: it remains valid JSON at
   `tools/fixtures/prd-20-1-layout.json`, loaded by `loadFixture('prd-20-1-layout.json', root)`,
   consumed by `assertLayout()` in `tools/workspace-assertions.mjs` and by `tools/check-workspace.mjs`
   with the same three keys and the same shapes (`topLevelFromLayout` an array of strings; the other
   two objects with `$comment` and `entries`). No key is added, so no consumer edit is required —
   if one turns out to be required, that is Feedback obligation 2, not a silent scope widening.

## Acceptance checklist (classified)

Every `[machine]` item below is reproducible offline, in this environment, with Node **24.18.0**
prepended to `PATH` from `C:\Users\HoraceHou\AppData\Local\node-24.18.0` and `node -v` confirmed
**before** any run (CLAUDE.md — a red suite under Node 22.11.0 is an environment fault, not a
regression).

- [ ] `[machine]` **The reported defect is gone.**
      `node -e "import('./tools/workspace-assertions.mjs').then(m=>console.log(JSON.stringify(m.assertLayout())))"`
      prints `[]` on this ticket's branch, where on `main` it prints the three
      `unexpected top-level directory` strings for `.agents`, `.codex` and `.worktrees` (Background —
      Evidence). Both outputs are pasted into the PR.
- [ ] `[machine]` **The failing test passes.** `tools/tests/layout.test.mjs > PRD 20.1 layout >
      replays green against the committed fixture` is green, and the other four tests in that file
      are still green and still present (deliverable 4; Non-goals).
- [ ] `[machine]` **The guard still bites — demonstrated on the real repository root, not asserted.**
      Create a genuinely unexpected top-level directory (`mkdir zz-layout-probe`, containing one
      file), re-run the command from item 1 and the suite, and record the observed failure message:
      it must name `zz-layout-probe`. Then remove the directory and confirm both go green again and
      `git status --porcelain` is clean. The PR quotes the failure text verbatim. A `[machine]` item
      satisfied by pointing at the pre-existing `vendor` scratch-root test **does not count** — that
      test must also still pass, but this item is specifically about the real root.
- [ ] `[machine]` **The guard still bites for a git-ignored name it does not know.** Repeat item 3
      with a directory name that `.gitignore` already causes to be ignored but that is **not** in
      `topLevelIgnored.entries` — for example `mkdir dist` if `.gitignore` ignores it, otherwise add
      **no** ignore rule and instead confirm by reading that `assertLayout()` contains no `git`
      invocation and no `child_process` import. Purpose: prove on this branch that the repair did not
      become "allow anything ignored" (Background — the escape-hatch decision).
- [ ] `[machine]` **Static enumeration preserved.** `tools/workspace-assertions.mjs` is unchanged
      (absent from the branch diff) and still performs pure filesystem reads; the fixture contains no
      wildcard, prefix, regex or dot-prefix rule — the three lists are literal name arrays
      (Non-goals).
- [ ] `[machine]` **PRD §20.1 untouched.** `git diff main...HEAD -- docs/PRD.md` is empty, and the
      fixture's `source`, `directories`, `topLevelFromLayout` and `doNotRead` keys are byte-identical
      to `main` (`git diff main...HEAD -- tools/fixtures/prd-20-1-layout.json` shows changes only
      inside `topLevelPreexistingAllowed` and `topLevelIgnored`). The transcription test's
      `toHaveLength(47)` still passes (deliverable 4).
- [ ] `[machine]` **Entries match the deliverable tables exactly** — six entries in
      `topLevelPreexistingAllowed.entries` (adding `.agents`, `.codex`), seven in
      `topLevelIgnored.entries` (adding `.worktrees`), nothing removed, nothing else added
      (deliverables 1–2).
- [ ] `[machine]` **Anti-regression comments present**, carrying: the real membership rule for the
      tracked key; the explicit statement that `assertLayout()` makes **no** git access so
      git-ignored is not self-exempting, with the reason; the escape hatch for the next legitimate
      root directory; and the ticket id `FND-19` (deliverable 3).
- [ ] `[machine]` **The diff is one file.** `git diff --name-only main...HEAD` on this ticket's
      branch lists exactly `tools/fixtures/prd-20-1-layout.json` (File-scope). `tools/**` is
      `00-foundation`'s write-owns tree, so `tools/tests/frozen-paths.test.mjs` is green on this
      branch — confirm it, since this ticket writes inside a directory two of whose files are frozen.
- [ ] `[machine]` **Full suite green — the standing item and the reason this ticket exists**
      (PRD §20.3, §45.3). `pnpm test` on this ticket's branch: **111 of 111** tests passing, exit 0,
      with `node -v` printing `v24.18.0` recorded alongside the result. The pass count is stated in
      the PR so a masked test cannot pass as a fix.
- [ ] `[machine]` `pnpm lint` and `pnpm typecheck` green (PRD §20.3). `node tools/check-workspace.mjs`
      (the same assertions outside vitest) exits 0.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-001`, `E01-REPO`),
      user-visible change (**none** — repository tooling data), non-goals, schema/API/event
      compatibility impact (**none**), tenant/PII/security impact (**none** — the guard reads
      directory names only, no data path, no credential access), source/licence impact (**none** — no
      dependency added), cost/memory/latency impact (none), rollback path (revert the single-file
      commit — which restores the defect and re-reds every ticket's DoD gate, so the rollback note
      must say so), known gaps (the four Accepted caveats in Background: the narrowed key name, the
      stale message wording, directories-only coverage, and the snapshot nature of the list).

**Absent classes.** No `[fixture]` criteria in the plan's sense: this ticket replays no recorded data
— it *edits* a committed fixture, but the plan's `[fixture]` class is PRD §40.8 adapter fixtures and
PRD §14/§43 evaluation replays, neither of which exists before modules `05` and `21`. No `[human]`
criteria: the change is repository tooling data with a fully mechanical acceptance surface and no
customer-visible behaviour, so no PRD §41.2 `UAT-*` script applies and nothing is carried to the
Gate 2 smoke test. No Rust or Python surface: `cargo test --workspace` and `uv run pytest` are
unaffected beyond the repo-wide green `FND-01` established.

## Test plan

Reviewer steps. All steps are offline; no network, no mocks. **Step 0 in every shell:** prepend
`C:\Users\HoraceHou\AppData\Local\node-24.18.0` to `PATH` and confirm `node -v` prints `v24.18.0` —
under Node 22.11.0 this suite fails with `node:internal/modules/esm/get_format` errors that have
nothing to do with this ticket (CLAUDE.md). Harness: vitest via `pnpm test`
(`node tools/workspace-script.mjs test` → `vitest run --config tools/vitest.config.mjs`), the
framework `FND-01` registered. The construction pattern to copy is the fixture's own existing
`$comment` fields, which already carry basis prose beside the data.

1. **Read the diff against the root.** Run `ls -a` at the repository root beside the repaired
   fixture. Every top-level **directory** present must appear in exactly one of the three lists, and
   every entry added must exist. An entry added for a directory that is not there, or a
   dot-directory left unexplained, is a defect.
2. **Read the classification, not just the membership.** `git ls-files .agents | wc -l` and
   `git ls-files .codex | head` must show tracked files (so `topLevelPreexistingAllowed` is the right
   key), and `git check-ignore -v .worktrees` must report the `.gitignore` rule while
   `git ls-files .worktrees` is empty (so `topLevelIgnored` is the right key). A tracked directory
   placed in the ignored list, or vice versa, is a defect even though the suite would be green.
3. **Baseline both ways.** On `main`, run the item-1 command and confirm the three failure strings;
   on the ticket branch, confirm `[]`. This is the before/after that proves the ticket did what it
   claims.
4. **Negative test — an unexpected directory on the real root.** `mkdir zz-layout-probe` at the
   repository root, add a file to it, re-run `pnpm test`: `replays green against the committed
   fixture` must **fail**, naming `zz-layout-probe`. `rm -rf zz-layout-probe`, re-run: green.
   `git status --porcelain` clean afterwards. **This is the load-bearing step** — a repair that made
   the guard permissive would pass every other item here.
5. **Negative test — the entries are live.** Temporarily remove `.agents` from the repaired list and
   re-run: the assertion must fail naming `.agents`. Restore. Repeat for `.worktrees`. This proves
   the entries are what makes the suite green, not some other edit.
6. **Hunt for a weakening.** Read the fixture and `tools/workspace-assertions.mjs` for: any wildcard
   or prefix rule; any dot-prefix allowance; any `.skip`/`.todo`; any new key; any `child_process` or
   `git` usage in the assertion; any change to the `if (!allowed.has(entry.name))` loop. All are
   rejected outcomes (Non-goals), not style choices. `tools/workspace-assertions.mjs` must be absent
   from the branch diff entirely.
7. **Confirm the PRD side is untouched.** `git diff main...HEAD -- docs/PRD.md` empty; the fixture's
   `source`/`directories`/`topLevelFromLayout`/`doNotRead` unchanged; the transcription test green
   with its `toHaveLength(47)`.
8. **Scope and green.** `git diff --name-only main...HEAD` lists exactly one file. `pnpm test`
   (111/111, exit 0), `pnpm lint`, `pnpm typecheck` and `node tools/check-workspace.mjs` all green on
   this ticket's branch; `pnpm test` also re-run on `main` **after** the merge, since the
   post-merge run on the default branch is the gate this ticket exists to unblock.

## Feedback obligation

**General rule.** If implementation falsifies anything in this ticket, update **this ticket** (and
`docs/prd/00-foundation/README.md` where the decision is recorded) **first** — version +0.1 with a
changelog line — then change code, then re-publish the issue from the ticket
(`publish-tickets.mjs --sync`). Silent divergence is an incomplete ticket. Spec is never patched into
an implementation plan, into code, or by hand-editing the issue (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its writeback target:**

1. **A fourth unexpected top-level directory appears** while the ticket is in flight — another
   adoption, a new tool's cache, or a lane worktree directory under a different name. → Do **not**
   add it on sight. Establish first what it is (tracked or ignored; decided or accidental) exactly as
   Test plan step 2 does, record the finding in **this ticket** (+0.1, changelog, `--sync`), and only
   then add it with its basis and date. An entry added without a basis is how this list became a
   snapshot nobody could maintain. If it turns out to be an *accident* — a build output, a stray
   directory — the correct outcome is to delete or ignore the directory, not to allow it.
2. **The repair cannot be contained in the fixture** — for example a new key is genuinely needed, or
   `tools/workspace-assertions.mjs` must change to keep the comment honest. → That file is `FND-01`'s
   (with `RUNT-06`'s repair on top). Update **this ticket's File-scope and deliverables** (+0.1,
   changelog line, `--sync`) **before** touching it, and state the consequence: `tools/**` is
   `00-foundation`'s write-owns tree so this is a scope widening within the module, not a
   cross-module violation, but it widens the blast radius of a repair every ticket's DoD is waiting
   on.
3. **Adding the entries does not make `pnpm test` green** — the suite still fails, here or elsewhere.
   → First re-check `node -v` (CLAUDE.md: this is the single largest source of wasted work in this
   repo) and check `apps/*/node_modules/<pkg>` for a symlink into `.claude/worktrees/` or
   `.worktrees/` (the lane-worktree poisoning signature; the repair is to delete that package's
   `node_modules` and reinstall — `pnpm install --force` does not fix it). Only if both are clean is
   it a real second defect: record the measurement (command, branch, observed output) in this ticket
   and fix it here **only if** it is inside this one file and this ticket's stated goal; otherwise
   raise it as a new `00-foundation` ticket with the Architect.
4. **Someone proposes making the guard consult git** to avoid maintaining the list. → That is a
   change to the guard's mechanism, not a repair, and it is rejected here with three recorded
   reasons. Do **not** adopt it inside this ticket. If it is genuinely wanted, raise it with the
   **Architect** as a separate `00-foundation` ticket carrying its own answer to reason 1 (a
   `.gitignore` edit must not be able to retire the layout guard) and reason 2 (the scratch-root
   tests have no git repository).
5. **`.agents`, `.codex` or `.worktrees` turns out to be something other than described** — untracked
   where this ticket says tracked, or committed where this ticket says never committed. → The key
   assignment in deliverable 1/2 is then wrong. Record the evidence (`git ls-files`,
   `git check-ignore -v`) in this ticket, correct the assignment, and re-publish; do not leave a
   tracked directory sitting in the "untracked artifacts" list, because the next maintainer will read
   that comment as fact.

**Escalation.** If the allow-list cannot be made both correct (green on a legitimate repository root)
and effective (loud on a top-level directory nobody decided on) without either git access or a
wildcard, then the guard's *mechanism* — a hand-maintained enumeration — is what is wrong, not this
ticket, and PRD §20.1's mechanical enforcement needs a different design. Stop, escalate to the human,
and raise it with the **Architect**. **ADR candidate (raised here, not authored here — this ticket
writes nothing under `docs/adr/`):** *how the repository-root layout invariant is maintained as the
agent tooling around the product evolves* — a dated enumeration with an escape hatch (today) versus a
derived rule (git-tracked ∪ ignored, with its own bypass risk) versus dropping root-level coverage in
favour of the §20.1 subtree only. Owner: **Architect**; natural trigger: the fourth adopted top-level
directory, or a fourth recurrence of the `FND-11`/`FND-12`/`FND-19` defect class. **Never** resolve
any of this by deleting, skipping or narrowing the unexpected-directory assertion so the suite goes
green — every ticket's Definition of Done depends on this suite being right, not quiet.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial ticket. Repairs `tools/fixtures/prd-20-1-layout.json`, whose top-level allow-list was a transcription of the repository root as it stood at `FND-01` and has since fallen behind it: the 2026-08-12 adoption of the two upstream agent patterns installed tracked `.agents/` and `.codex/`, and the git-ignored root-level harness worktree directory `.worktrees/` appeared with `concurrency > 1`, so `assertLayout()` reports all three and `tools/tests/layout.test.mjs > replays green against the committed fixture` fails on merged `main` — making `dodPassed` false for every ticket (observed: `DATA-08`, `RUNT-06`, `CRPS-05`, `CRPS-08`, `EVID-07`) and putting an unrelated red line in front of every Reviewer. Established that there is **no** dynamic ignored-directory escape hatch — `topLevelIgnored` is a static name list and `assertLayout()` performs no git access — and decided to keep it static (a `.gitignore` edit must not be able to retire the guard; the suite's scratch roots have no git repository). Third instance of the defect class `FND-11` and `FND-12` repaired: a repository-wide guard written from one ticket's viewpoint misfiring on later work. |
