---
id: FND-32
title: The entry-file guard proves the skeleton contract, not that every entry file is still empty
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-20
blocked_by: []
blocks: [AUTC-01, RETR-01]
---

# FND-32 — The entry-file guard proves the skeleton contract, not that every entry file is still empty

Repairs `FND-01`'s entry-file guard — `tools/workspace-assertions.mjs#assertEntryFilesEmpty` and the
`tools/tests/skeleton.test.mjs` case *"keeps every entry file empty"* — which asserts that **every**
workspace member's entry file is still the byte-exact bootstrap stub. That was true of the repository
`FND-01` delivered and is now a wall in front of every ticket that implements a member, because
implementing a member means writing its entry file. `tools/vitest.config.mjs` runs this suite on
**every** later ticket's branch, so the wall is hit by work that never touches `tools/**`. Two tickets
hit it on the same run (Background). Against PRD §20.1 (the member layout the guard exists to protect)
and PRD §20.3/§45.3 (the standing gates every ticket must leave green). No ADR — nothing here decides
a new rule; PRD §20.1 and `FND-01`'s skeleton contract are unchanged, and this ticket makes one
assertion state the property instead of a snapshot.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is a **thirteenth** phase-2 ticket appended to `00-foundation`
under **D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*),
continuing the ids past `FND-31`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root** — the guard, both entry files it wrongly rejects and
every fact in Background are already on `main` @ `e1e08e4`.
**Why `builder`:** a bounded change to two files against a fixed contract, with the target shape of
both entry files already measured from the branches that need them (Background §3) and every
must-survive assertion enumerated below. The one judgement call — how conservative the
declaration-only matcher should be — is bounded by deliverable 2 and open question **Q-F32-A**.

## Background + basis

### 1. The reported failure — settled, do not re-diagnose

`tools/tests/skeleton.test.mjs:128-133`:

```js
it('keeps every entry file empty', () => {
  expect(assertEntryFilesEmpty()).toEqual([]);
  expect(ENTRY_FILE_CONTENT.ts).toBe('export {};\n');
  expect(ENTRY_FILE_CONTENT.rs).toBe('');
  expect(ENTRY_FILE_CONTENT.py).toBe('');
});
```

Two tickets in flight fail it, each on its own branch, each while doing exactly what its own
File-scope authorises:

| Ticket | Branch | Reported problem | Its own suite |
|---|---|---|---|
| `AUTC-01` | `ticket/AUTC-01` @ `4a8dff8` | `packages/auth/src/index.ts is not empty` | 12 files / 273 tests green; `pnpm ci:local` **17 of 18** |
| `RETR-01` | `ticket/RETR-01` @ `766ad18` | `services/search-rs/src/lib.rs is not empty` | 142 Rust tests green; `pnpm ci:local` **17 of 18** |

In both cases this guard is the **only** failing command of the eighteen `pnpm ci:local` runs. Neither
branch touches `tools/**`, and neither may: `tools/**` is `00-foundation`'s row (breakdown plan §4,
phase-2 plan §3), which is why the repair is this ticket and not a widened file-scope on either of
them.

For `RETR-01` the guard is not merely inconvenient, it is **categorically unsatisfiable**: `src/lib.rs`
is a Rust crate root, and a crate whose root is the empty string has no modules, no items and no
public surface at all. There is no way to write the crate and keep the file empty.

### 2. Measured scope — this blocks every member-implementing ticket, not two

Measured on `main` @ `e1e08e4` under Node 24.18.0, by enumerating the same three member lists the
guard itself uses (`pnpmMembers`, `cargoMembers`, `uvMembers`):

- The guard checks **28** entry files — 21 pnpm `src/index.ts`, 1 cargo `src/lib.rs`, 6 uv
  `<package>/__init__.py`.
- **18 of the 28 lie under `apps/`, `packages/` and `services/`** (5 apps, 12 packages, 1 service).
  The other 10 are under `tests/` (4), `pipelines/` (5) and `sdk/` (1).
- **All 28 are still the byte-exact stub.** `assertEntryFilesEmpty()` returns `[]` on `main`.

So the guard is green today and is already wrong, and it stands in front of every remaining ticket in
the PRD that implements a member — not only the two that have reached it.

**One correction to the framing this ticket was commissioned with, recorded because the ticket is the
source of truth and must be accurate:** *"all 18 are still the stub, 0 implemented"* is true of the
**entry files** and false of the **members**. Thirteen members already carry substantial
implementations while keeping their entry file empty — counted as `.ts` files under `src/` for pnpm
members and `.py` files under the member for uv members: `packages/domain` 57, `packages/pii` 57,
`packages/database` 57, `packages/contracts` 52, `packages/model-gateway` 31,
`packages/sdk-typescript` 23, `packages/observability` 15, `apps/api` 13, `packages/ui` 9, and four
pipelines (`corpus-builder` 160, `evaluation` 47, `embeddings` 37, `ingestion` 29). That fact is not a
counter-argument to the repair; it is the strongest evidence for it, and it is §3.

### 3. What the guard has already cost — measured, not asserted

Every one of those thirteen members declares `"main": "src/index.ts"` in its own manifest (and
`packages/database` additionally declares `"exports": { ".": "./src/index.ts", … }`), and in every one
of them that declared entry point is a **dead empty module**. The real barrel was moved elsewhere and
the reason was written into the source. Found by grep on `main` @ `e1e08e4`; these are the delivered
members' own words:

- `packages/model-gateway/src/profiles/index.ts:4-5` — *"WHY THIS IS THE BARREL AND `src/index.ts` IS
  NOT. `tools/workspace-assertions.mjs` (`assertEntryFilesEmpty`, asserted on every branch by
  `tools/tests/skeleton.test.mjs`) requires …"*
- `packages/pii/src/contract/index.ts:4-5` and `packages/pii/src/context/index.ts:5` — the same
  sentence.
- `packages/ui/src/ui.ts:4` — *"WHY NOT `src/index.ts`."*
- `packages/sdk-typescript/src/sdk.ts:4` and `src/internal/contracts.ts:17` — *"Not `src/index.ts`:
  … requires every workspace … to stay byte-exactly `export {};`"*.
- `apps/api/src/app.ts:7` — *"`src/index.ts` deliberately stays `export {};`"*.
- `packages/contracts/src/events/index.ts:6` and `packages/domain/src/budget/index.ts:10` — the same.

That is **eight delivered members whose public surface was shaped by a test rather than by a design
decision**, each importing consumers around a manifest entry point that resolves to nothing. The
defect is therefore not hypothetical and not confined to the two blocked branches; it has been paid
for repeatedly and silently, in the only currency this kind of defect is ever paid in — a worse
design that keeps the suite green.

### 4. This is the fourth instance of one defect class in this repository

Each is a check that encoded **the state of the world at the moment it was written** rather than the
property it meant to protect.

| # | Guard | What it pinned | Repaired by |
|---|---|---|---|
| 1 | `DATA-01`'s `test/migrate/**` | the repository's exact migration filename list | **`DATA-10`** |
| 2 | `DATA-04`'s `test/tenancy/schema.test.ts:98` | the database's exact tenancy table set | **`DATA-11`** |
| 3 | `FND-25`'s `TOP_LEVEL_KEY` | a name the repository's own secret scan reports | **`FND-28`** |
| 4 | `FND-01`'s entry-file guard | *"every entry file is empty"* — the repository at bootstrap | **this ticket** |

**And the class is older and wider than those four, which is the point rather than a quibble.** The
sub-PRD already names it systemic: `00-foundation/README.md` **D22** records that
`tools/tests/skeleton.test.mjs` — *this same file* — has been repaired for this same class **twice
before**: `FND-04` replaced *"declares no dependency beyond the toolchain in any member manifest"*
with the durable exact-pin rule, and `RUNT-06` replaced *"a member tsconfig has exactly `extends` and
`include`"* with *"extends the shared base and adds nothing beyond `compilerOptions`"* (the comment
at `skeleton.test.mjs:51-60` explains that one in the file). D22 closes with an escalation that is
still open and that this ticket is the fifth answer to:

> **Escalation for the Architect: three files, two owning tickets, one defect class — the pattern is
> systemic, and a `/breakdown-prd` review of every "asserts the repository as it is today" test is
> worth more than three more in-flight repairs.**

`FND-11`, `FND-12` and `FND-19` are three further repairs of the same class. This ticket does not
close D22's escalation and does not pretend to; it repairs the third and last bootstrap snapshot in
`skeleton.test.mjs` and records the count so the sweep can be scoped by someone who is not also
unblocking two branches (Feedback obligation 4).

### 5. What the guard is actually for — read out of the source, not taken on report

`assertEntryFilesEmpty` (`tools/workspace-assertions.mjs:232-261`) is one of four assertion families
in a module whose header states its remit: *"Pure filesystem reads. No network, no mutation, no
credential access"*, and whose functions *"name the offending path or value, so a negative test …
fails loudly rather than flipping a boolean"*. Its own doc line reads *"Entry files must contain
nothing but an empty export/module (**FND-01 File-scope**)"* — and that citation is the tell. The
guard is scoped, in its own words, to **one ticket's file-scope**: it proves that `FND-01`, having
been authorised to create a skeleton and nothing else, did not smuggle implementation into it. The
defect is that a self-check on `FND-01`'s own deliverable was promoted to a permanent,
repository-wide invariant enforced on every later branch. That is the same shape as instance 2, where
a check over `DATA-04`'s eight tables was run against the whole database.

The **structural** half of the skeleton contract is asserted elsewhere and is not this ticket's to
change: `assertSkeleton` (`:167-230`) proves every pnpm member has `package.json`, `tsconfig.json` and
`src/index.ts`, every cargo member has `Cargo.toml` and `src/lib.rs`, and every uv member has
`pyproject.toml` and **exactly one** package directory containing `__init__.py`. Member registration
itself is proved by `pnpmMembers` / `cargoMembers` / `uvMembers` reading `pnpm-workspace.yaml`,
`Cargo.toml` and `pyproject.toml`, and by the inventory assertion at `skeleton.test.mjs:41-45`. So
*"the member exists, is registered, and has an entry file at the conventional path"* already holds
without this function, and **no member can be skipped**: the loops at `:250-258` are driven by the
member lists, not by a hardcoded file list.

What is left, and what this ticket must preserve, is the part only this function proves: **no
implementation is smuggled into an entry file.** Its three non-vacuity controls
(`skeleton.test.mjs:135-153`) are exactly that claim, and they are the guard's whole worth — the
28-file loop passes vacuously today because every file is a stub, so the controls are the only reason
the assertion means anything.

### 6. What the property should become

> A workspace member's entry file **declares** the member's surface; it never **contains** it. It may
> be the bootstrap stub, or it may point at the modules that implement the member — and nothing else,
> at any point in the member's life.

Read the two halves separately. *"A member's entry file may be non-empty once its implementing ticket
has landed"* — the half that unblocks — is delivered by allowing re-exports. *"No implementation is
smuggled into a stub"* — the half that must not weaken — is delivered by the fact that **smuggled
code is by definition implementation written inline in the entry file**, and inline implementation is
what the rule forbids, on every member, forever, whether or not its ticket has landed.

That is what makes the central design question answerable at all. Recorded as settled reasoning so it
is not re-derived: **no filesystem check can distinguish "code ticket X legitimately wrote" from "code
smuggled ahead of ticket X" by looking at that code**, because the two are the same bytes. The
distinction can only come from a declaration *outside* the file — and any marker *inside* the file is
worthless, since whoever smuggles the code writes the marker too. The mechanism below sidesteps that
impossibility instead of pretending to solve it: it does not ask *who wrote this*, it asks *is this a
declaration or an implementation*, which is a property of the text and needs no external authority.

### 7. The mechanism — a declaration-only entry file (recommended)

`ENTRY_FILE_CONTENT` stops being *the permitted content* and becomes *the stub form*. An entry file
passes if it is either the stub or **declaration-only**:

| Language | Entry file | Permitted, in addition to the stub |
|---|---|---|
| TypeScript | `<member>/src/index.ts` | `export … from '…'` / `export * from '…'` / `export * as N from '…'` / `export type … from '…'` re-exports; comments, doc comments, blank lines. **No** value declaration, no function or class declaration, no bare `import`, no executable statement. |
| Rust | `<member>/src/lib.rs` | `mod` / `pub mod` declarations without a body, `use` / `pub use`, inner attributes (`#![…]`), comments and doc comments. **No** item with a body — no `fn`, `struct`, `enum`, `impl`, no inline `#[cfg(test)] mod tests { … }`. |
| Python | `<member>/<pkg>/__init__.py` | `import …` / `from … import …`, a module docstring, `__all__ = [...]`, comments. **No** other assignment, no `def`, no `class`, no executable statement. |

**Why this one.** It is not a style rule this ticket invents and imposes on two branches — it is what
both blocked tickets already specify, and what both already wrote. Verified in the ticket files and in
the branches, on 2026-08-20:

- `AUTC-01` File-scope line 152: *"`packages/auth/src/index.ts` — **root barrel, core exports only**"*.
  `git show ticket/AUTC-01:packages/auth/src/index.ts` @ `4a8dff8` is a doc comment plus one line:
  `export * from './core/index.js';`
- `RETR-01` File-scope lines 137-138: *"`services/search-rs/src/lib.rs` (this ticket creates **the
  crate root's module list containing only `pub mod service;`**)"*. `git show
  ticket/RETR-01:services/search-rs/src/lib.rs` @ `766ad18` is exactly `pub mod service;`

Both pass the rule as written. And all three smuggling controls keep failing, **unchanged, on their
current targets** — which is why this mechanism is preferred over every alternative below:
`console.log('x');` is an executable statement, `pub fn x() {}` is an item with a body, and `X = 1` is
an assignment that is not `__all__`. The controls need no re-pointing, no rewrite, and no synthetic
substitute.

Two further reasons, both durable rather than convenient: the rule is **stronger than "empty" in one
respect** — it forbids import-time side effects in a member's declared entry point, which is a
property this repository already cares about (`packages/contracts`'s purity suite, `packages/domain`'s
framework independence, PRD §39.1/§45.2) and which "empty" only achieved by accident; and it is a
**property, not a snapshot**, so it stays true for every member ever implemented, which is the test
the last five repairs of this class have each had to apply.

### 8. Alternatives rejected — recorded so nobody re-derives them

- **A declared implemented-members fixture** under `tools/fixtures/`, each member `stub` or
  `implemented`, flipped by its implementing ticket. **Rejected:** `tools/**` is `00-foundation`'s
  serial-owned row, so each of ~28 implementing tickets across ~15 modules would need its own declared
  cross-module edit — the "one repair versus N exceptions" trade `DATA-11` weighed and rejected, and
  the decay path `FND-28` documented for `FND-24`'s exclusion list, where a list that accumulates
  routine entries stops being read as a list of exceptions.
- **Drop the content check and keep only the structural half** (the entry file exists at the
  conventional path). **Rejected:** it makes the function vacuous and deletes all three non-vacuity
  controls with it. `DATA-11`'s formulation applies unchanged — *"dropping to 'the tables exist' is a
  rejected outcome, however green the suite is"*.
- **Derive "implemented" from the member being otherwise non-empty** (a `src/` tree beyond the entry
  file, or a test area). **Rejected by measurement**, not by taste: `packages/domain` has **57** source
  files and **73** test files and is the target of the TypeScript smuggling control at
  `skeleton.test.mjs:136`, so this heuristic would classify it *implemented*, admit
  `console.log('x');` into its entry file, and the control would silently stop biting. It is also a
  heuristic that a smuggler defeats by adding a second file.
- **Derive it from git or the tracker** — has this member's ticket landed on the default branch?
  **Rejected:** the module's header commits it to pure filesystem reads with no network; the answer
  differs between a ticket branch and `main`, so the suite would give different verdicts on the same
  bytes; and it would pass smuggled code that is merely committed.
- **Parse the ticket corpus under `docs/prd/**`** for the entry file's declared owner. **Rejected:**
  `docs/prd/**` is the Architect's and is prose; a `tools/**` test that parses File-scope sections
  couples the test suite to document formatting, and a reformatted heading would red the workspace.

### 9. A hard constraint from outside this ticket's file-scope — do not trip on it

`packages/database/test/migrate/file-scope.test.ts:207-217` (`01-app-data`'s, written by `DATA-01`,
repaired by `DATA-10`/`FND-25`) asserts, in the case *"leaves the `tools/` workspace assertions to
`00-foundation`"*, three **literal strings** about this ticket's two files:

```ts
const skeleton = repoText('tools/tests/skeleton.test.mjs');
expect(skeleton).toContain("it('pins every member dependency to an exact version, with no range'");
expect(skeleton).toContain('EXACT_VERSION');
expect(repoText('tools/workspace-assertions.mjs')).toContain('assertEntryFilesEmpty');
```

So the export **named `assertEntryFilesEmpty` must still be present in
`tools/workspace-assertions.mjs`** after this ticket, the test title *"pins every member dependency to
an exact version, with no range"* must survive **verbatim**, and the identifier `EXACT_VERSION` must
survive. A rename of any of the three reds a `packages/database` suite that this ticket may not touch
(File-scope) and converts a one-module repair into a cross-module one. Deliverable 4 handles it.

### 10. Accepted caveats, carried forward

- **The guard is green on `main` today and is already wrong.** Every argument of the form *"the tests
  pass, so they are fine"* is answered by acceptance item 2, not by a re-run. This is why acceptance
  is two-sided and why the smuggling item, not the green item, carries the claim.
- **Neither `AUTC-01` nor `RETR-01` is re-litigated here.** Their branches are used as the
  reproduction and as evidence of the target shape. Their implementations are not reviewed, re-run or
  modified by this ticket, and nothing here clears them.
- **This ticket does not repair the eight deformed members** listed in §3. Moving a barrel back to
  `src/index.ts` is each owning module's work, is a public-surface change under PRD §16.1/§45.5, and
  is out of scope. What this ticket does is remove the reason they had to move.
- **`00-foundation/README.md` is frozen for this phase** (phase-2 plan header). The sub-PRD row for
  this ticket, if one is wanted, is a separate Architect docs change; the Builder must not edit
  `docs/prd/**` in any case.

## Goal

Make `tools/workspace-assertions.mjs`'s entry-file guard assert the **skeleton contract** — every
registered member has an entry file at the conventional path, and that file declares the member's
surface rather than containing it — instead of asserting that the repository is still in the state
`FND-01` delivered. After this ticket, a member whose implementing ticket has landed keeps
`tools/tests/skeleton.test.mjs` green with a re-export-only entry file, while implementation written
inline into any entry file, on any member, still fails and still names the file. Completion is
mechanically checkable in both directions: green with the two real blocked files in the working tree,
and red — naming the file — under each of the three smuggling controls.

## Non-goals

- **No product code, in any tree.** `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `sdk/**`,
  `tests/**` are untouched, including every entry file. In particular this ticket does **not** write
  `packages/auth/src/index.ts` or `services/search-rs/src/lib.rs`; those are `AUTC-01`'s and
  `RETR-01`'s, and this ticket only makes room for them (phase-2 plan §3: product trees are untouched
  by this phase).
- **No manifest change.** No `package.json`, no `Cargo.toml`, no `pyproject.toml`, no
  `pnpm-workspace.yaml`, no lockfile — not a member's and not the root's. Moving a barrel or changing
  an `exports` map is §3's deformation, and undoing it is out of scope.
- **This is not a weakening.** Explicitly rejected outcomes, any one of which fails the ticket however
  green the suite is: deleting an `it(`; `.skip` / `.todo` / `it.only` / `retry` / any flake
  annotation; making any of the three smuggling controls pass by re-pointing it at a file nobody
  implements, by weakening its expectation, or by deleting it; reducing the guard to "the entry file
  exists"; or making the assertion loop skip a member.
- **No change to the other assertion families** in `tools/workspace-assertions.mjs` — `assertLayout`,
  `readPinValue`/`assertPins`, `pnpmMembers`/`cargoMembers`/`uvMembers`, `assertSkeleton`, `scanText`,
  `scanForSecrets`, `secretScanInventory` — and no change to any fixture under `tools/fixtures/`.
- **No change to the CRLF normalisation** at `:238-241`. The committed blobs are LF and the working
  tree is CRLF; the comparison normalises before comparing and must keep doing so, or every assertion
  in this family fails on Windows.
- **No test-runner, timeout or config change.** `tools/vitest.config.mjs` is `FND-26`'s.
- **No rename of `assertEntryFilesEmpty`, of `EXACT_VERSION`, or of the pin-check test title.**
  Background §9; deliverable 4.
- **No sweep of the rest of the class.** `FND-11`, `FND-12`, `FND-19`, `DATA-10`, `DATA-11` and D22's
  open escalation are not this ticket's; a new instance found while reading is reported to the
  Architect (Feedback obligation 4), not fixed here.

## File-scope (write-owns)

Owned by this ticket — **two files, and nothing else**:

- `tools/workspace-assertions.mjs` — the `ENTRY_FILE_CONTENT` constant (`:16-20`) and
  `assertEntryFilesEmpty` (`:232-261`) only.
- `tools/tests/skeleton.test.mjs` — the case *"keeps every entry file empty"* (`:128-133`) and
  whatever new pure-function controls deliverable 3 adds.

Does not touch:

- **Any member's entry file**, and no `package.json`, `Cargo.toml`, `pyproject.toml`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock` or `tsconfig*.json` — anywhere,
  including the root. Entry files are mutated **only** in the working tree by the controls, and
  restored, with `git status --porcelain` shown clean.
- `tools/fixtures/**` — `FND-01`'s and `FND-24`'s. Read-only here, including
  `prd-20-1-layout.json`, `toolchain-pins.json`, `secret-patterns.json` and `script-owners.json`.
- `tools/check-workspace.mjs` (imports `assertLayout`, `assertPins`, `loadFixture` — none of them
  touched), `tools/ci-local.mjs`, `tools/workspace-script.mjs`, `tools/vitest.config.mjs`,
  `tools/eslint.config.mjs`, the two frozen `tools/*.ps1`.
- `tools/tests/**` other than `skeleton.test.mjs` — `layout.test.mjs`, `pins.test.mjs`,
  `scripts.test.mjs`, `readme.test.mjs`, `frozen-paths.test.mjs`, `line-endings.test.mjs`,
  `entry-commands.test.mjs`, `secret-scan.test.mjs`, `ci-local.test.mjs`, `support/**`.
- `.github/workflows/**`, including `checks/verify-toolchain.mjs`, which imports `assertPins`,
  `loadFixture`, `readPinValue` and `REPO_ROOT` — none of them touched.
- `packages/database/test/migrate/file-scope.test.ts` — `01-app-data`'s. **Read-only, and it reads
  this ticket's two files**: Background §9. It must stay green **without being edited**.
- `docs/PRD.md`, `docs/prd/**`, `docs/adr/**`, `CLAUDE.md`, `.claude/**`, `templates/**`, `README.md`
  — frozen, the Architect's, or another ticket's.

**No cross-module declaration is needed.** Both files are in `tools/**`, which is `00-foundation`'s
row in breakdown plan §4 and phase-2 plan §3. Within the module the area is `FND-01`'s, and `FND-01`
is delivered — so the repair comes as a new ticket rather than a re-run, the route `DATA-10`,
`DATA-11` and `FND-11` each took, and the route `FND-04` and `RUNT-06` took for the two previous
repairs of this very file.

**Serial-safety analysis.** `tools/workspace-assertions.mjs` and `tools/tests/skeleton.test.mjs` are
declared in **no** other ticket's write-owns under `docs/prd/**` — verified by search on 2026-08-20.
Of the phase-2 tickets, `FND-26` owns `tools/vitest.config.mjs`, `FND-23` owns `tools/ci-local.mjs`
and `tools/workspace-script.mjs`, `FND-22` owns `README.md` and `tools/tests/readme.test.mjs`, and
`FND-24`/`FND-27` own `.github/workflows/**` and a Python guard; none contends. `ticket/AUTC-01` and
`ticket/RETR-01` contain no path under `tools/` at all — that is the whole reason this ticket exists —
so all three may proceed as parallel lanes, and only the merge order matters: this ticket must land
**before** either of them can report a green `pnpm ci:local`.

## Deliverables

1. **`assertEntryFilesEmpty` stops comparing every entry file to the bootstrap stub.** It reports a
   problem when an entry file is neither the stub (`ENTRY_FILE_CONTENT[kind]`, CRLF-normalised as
   today) **nor** declaration-only for its language, per the table in Background §7. The message keeps
   the module header's contract — it **names the offending path**, and it additionally names the
   **first offending line and its content**, because a matcher that rejects a legitimate file must be
   diagnosable in one read rather than by bisection. The 28-file loop still iterates the member lists,
   so no member can be skipped, and the CRLF normalisation at `:238-241` is unchanged.

2. **The matcher is conservative, and its conservatism is deliberate and documented.** Recognise the
   permitted forms line-wise or statement-wise; do not add a parser or a dependency (no member
   manifest and no lockfile may change — Non-goals). **An unrecognised construct is a failure, not a
   pass** — a guard that silently admits what it does not understand is the failure mode this whole
   ticket class is about. State the choice in a comment, and see **Q-F32-A** for the residual risk and
   its escape hatch.

3. **The three smuggling controls keep their current targets and their current expectations, and two
   pure-function controls are added.** `skeleton.test.mjs:135-153` must pass **unmodified** except for
   any rename forced by deliverable 5 — `console.log('x');`, `pub fn x() {}` and `X = 1` each still
   produce a problem naming the file. In addition, and following the idiom this file already uses for
   the pin check (`unpinnedSpecifiers`, *"Pure and total, so the assertion above can be proved
   non-vacuous against synthetic ranges"*, `:22-26`), export a **pure, total** classifier and assert
   it directly on synthetic inputs, so the guard is provably non-vacuous without touching the
   filesystem:
   - **accepts**: the three stubs; `export * from './core/index.js';` with a preceding doc comment
     (the real `AUTC-01` file); `pub mod service;` (the real `RETR-01` file); `from .x import Y` plus
     `__all__ = ['Y']`.
   - **rejects**: `export {};\nconsole.log('x');`; `export const x = 1;`; `import './side-effect.js';`;
     `pub fn x() {}`; `#[cfg(test)] mod tests { fn t() {} }`; `X = 1`; `def f(): pass`.

4. **The three externally-pinned strings survive.** `assertEntryFilesEmpty` remains an **exported
   name** of `tools/workspace-assertions.mjs`; `EXACT_VERSION` and the title *"pins every member
   dependency to an exact version, with no range"* remain byte-identical in `skeleton.test.mjs`
   (Background §9). If a more accurate internal name is wanted, add it and keep `assertEntryFilesEmpty`
   as the exported entry point, with a one-line comment stating that
   `packages/database/test/migrate/file-scope.test.ts:216` pins the name and that changing it is a
   cross-module edit this ticket does not own.

5. **The test title stops claiming what is no longer proven.** *"keeps every entry file empty"* is
   renamed to state the property actually asserted, and the two assertions inside it are re-aimed
   accordingly: `ENTRY_FILE_CONTENT` is now the **stub form**, not the permitted content, so the three
   `toBe` checks stay (the stub shape is still pinned) under a name and a comment that say what they
   are for. A title that outlives its assertion is how the next reader is misled — `DATA-11`
   deliverable 1's rule, applied here.

6. **A `FND-32` note at the top of the guard**, one short paragraph: entry files declare a member's
   surface and never contain it; a member's entry file legitimately becomes non-empty when its ticket
   lands; the previous *"still empty"* rule was `FND-01`'s File-scope self-check promoted to a
   repository-wide invariant, and it is the third bootstrap snapshot removed from this file after
   `FND-04`'s and `RUNT-06`'s (D22). The next person to implement a member should find out why nothing
   broke without reading this ticket.

7. **A properties-to-tests enumeration in the PR**, one row per must-survive assertion in the table
   below, each with the test that proves it **after** the change and a one-word verdict
   (`unchanged` / `rewritten` / `dropped`). Every row must have an "after". Any `dropped` other than
   the explicitly authorised *"every entry file equals the stub"* clause fails the ticket.

## The hard limit — what must not weaken

**This must not weaken what the guard proves.** Enumerated from `tools/tests/skeleton.test.mjs` on
2026-08-20 so the Builder repairs against a list rather than an impression. Everything below except
**A9** must survive **untouched**; A9 is the only assertion this ticket may rewrite.

| # | Assertion | Lines | Must survive as |
|---|---|---|---|
| A1 | `has the expected member inventory` — pnpm 21, cargo `['services/search-rs']`, uv 6 | `:41-45` | Untouched |
| A2 | `gives every member its manifest, its tsconfig and its entry file` — `assertSkeleton() === []` | `:47-49` | Untouched. This is the structural half; it is not this ticket's to move |
| A3 | `makes every pnpm member tsconfig extend tsconfig.base.json and add nothing beyond compilerOptions` (`RUNT-06`'s repair, comment `:51-60`) | `:61-70` | Untouched |
| A4 | `turns strict and noUncheckedIndexedAccess on in the shared base config` | `:72-76` | Untouched |
| A5 | `makes pnpm typecheck non-vacuous: every pnpm member declares the script` | `:78-85` | Untouched |
| A6 | `pins every member dependency to an exact version, with no range` (`FND-04`/D22's repair, comment `:87-95`) | `:96-108` | Untouched, **title byte-identical** — externally pinned (§9) |
| A7 | `rejects %s (%s) as an unpinned specifier` — 7 parameterised cases, the pin check's positive control | `:112-122` | Untouched, all seven |
| A8 | `accepts an exact version, so the pin check is not simply always-failing` | `:124-126` | Untouched |
| A9 | `keeps every entry file empty` — `assertEntryFilesEmpty() === []` plus the three `ENTRY_FILE_CONTENT` pins | `:128-133` | **The only rewrite.** The stub-form pins survive; the "every file equals it" claim becomes the declaration-only rule |
| A10 | `fails when code is smuggled into a TypeScript entry file` — `packages/domain/src/index.ts` + `console.log('x');` | `:135-141` | **Still fails, same target, same expectations** |
| A11 | `fails when code is smuggled into the Rust entry file` — `services/search-rs/src/lib.rs` + `pub fn x() {}` | `:143-147` | **Still fails, same target, same expectation** |
| A12 | `fails when code is smuggled into a Python entry file` — `sdk/python/taxrag_sdk/__init__.py` + `X = 1` | `:149-153` | **Still fails, same target, same expectation** |
| A13 | `fails when a member tsconfig stops extending the base config` | `:155-163` | Untouched |
| A14 | `pins every Python member to the same requires-python value, with no drift` — `==3.14.6` | `:165-171` | Untouched |
| A15 | `unpinnedSpecifiers` and `EXACT_VERSION` — the exported pure helper and its regex | `:15-26` | Untouched; `EXACT_VERSION` externally pinned (§9) |
| A16 | `withTemporaryEdit` — mutates a real file, runs the body, restores the **exact original bytes** in a `finally` | `:28-38` | Untouched. A10–A12 depend on the restore; a control that leaves the tree dirty is a defect |

**A10, A11 and A12 are the items that carry the claim.** A guard that goes green proves nothing here:
it is green on `main` today, over 28 files that are all stubs, and it is still wrong.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression — its signature is `node:internal/modules/esm/get_format`,
concentrated in tests that spawn a child process.

- [ ] `[machine]` **The defect is reproduced before it is repaired.** The PR records
      `assertEntryFilesEmpty()` reporting `packages/auth/src/index.ts is not empty` with
      `ticket/AUTC-01` @ `4a8dff8`'s file in the working tree, **and**
      `services/search-rs/src/lib.rs is not empty` with `ticket/RETR-01` @ `766ad18`'s file in the
      working tree, with runner output pasted. **The real files from those branches, not a synthetic
      substitute** — a repair whose starting evidence is a hand-made non-empty file has not been
      verified against the reproduction.
- [ ] `[machine]` **The same reproduction is green after.** With **both** files present in the working
      tree together, `pnpm --filter … vitest run tools/tests/skeleton.test.mjs` (or the workspace
      command that runs it) passes, including A1–A16. The tree is restored afterwards and
      `git status --porcelain` is shown **clean**.
- [ ] `[machine]` **Smuggling still fails, and names the file — the item that carries the claim.**
      Each of A10, A11 and A12 is run and **fails** with its file named: `console.log('x');` appended
      to `packages/domain/src/index.ts`, `pub fn x() {}` appended to
      `services/search-rs/src/lib.rs`, `X = 1` appended to `sdk/python/taxrag_sdk/__init__.py`. Then
      the same three are run **with `ticket/AUTC-01`'s and `ticket/RETR-01`'s entry files in the tree**
      — genuine implementation is accepted in the same run in which genuine smuggling is rejected.
      Output pasted for every case; tree restored; `git status --porcelain` clean. State plainly in the
      PR why this item and not the green one carries the claim: the guard is green on `main` today and
      is already wrong.
- [ ] `[machine]` **Smuggling into a member whose ticket has not landed still fails.** At least two
      further injections beyond A10–A12, into entry files of members with no landed implementing
      ticket — for example `export const SESSION_TTL = 900;` into `packages/citations/src/index.ts`
      and `def run(): pass` into `pipelines/adapters/taxrag_pipeline_adapters/__init__.py`. Each fails
      naming the file; tree restored; `git status --porcelain` clean.
- [ ] `[machine]` **The pure controls prove non-vacuity without the filesystem.** Deliverable 3's
      accept- and reject-lists are asserted directly against the exported classifier, including the
      two real entry-file bodies verbatim. Pass count stated.
- [ ] `[machine]` **No assertion was dropped.** The deliverable-7 A1–A16 table is in the PR with an
      "after" named for **every** row, and `git diff main...HEAD` contains no deleted `it(`, no
      `.skip`/`.todo`/`it.only`/`retry`, and no expectation loosened, **except** A9, which is the
      point of the ticket. The Reviewer re-checks this by reading the diff.
- [ ] `[machine]` **The externally pinned strings survive.** `packages/database` is green **without
      being edited**: `pnpm --filter @taxrag/database test` passes, including *"leaves the `tools/`
      workspace assertions to `00-foundation`"*. Grep output in the PR shows `assertEntryFilesEmpty`
      still exported from `tools/workspace-assertions.mjs`, and `EXACT_VERSION` plus the title
      *"pins every member dependency to an exact version, with no range"* byte-identical in
      `skeleton.test.mjs` (Background §9).
- [ ] `[machine]` **The diff is two files.** `git diff --name-only main...HEAD` lists exactly
      `tools/workspace-assertions.mjs` and `tools/tests/skeleton.test.mjs`. In particular **no entry
      file, no manifest, no lockfile, no fixture and no `packages/**` path appears** (File-scope;
      Non-goals).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). The declared test
      command `pnpm ci:local` (CLAUDE.md) exits 0, with its command count stated — **18 of 18**. Both
      blocked branches reported **17 of 18** with this guard as the only failure, so a single command
      verifies the repair. `pnpm typecheck` green; `pnpm lint`'s result reported and compared against
      the known pre-existing set (`FND-30`), so this ticket is neither blocked by it nor credited
      with it.
- [ ] `[machine]` **The two blocked branches are measured, not assumed.** For **each** of
      `ticket/AUTC-01` @ `4a8dff8` and `ticket/RETR-01` @ `766ad18`, the PR states the result of
      running `tools/tests/skeleton.test.mjs` from this ticket's branch against that branch's entry
      file in the tree. This ticket does **not** merge, rebase, review or modify either branch, and
      does not claim either is otherwise green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a test-harness repair
      under PRD §20.3/§45.3 guarding the PRD §20.1 layout; unblocks `AUTC-01` and `RETR-01`),
      user-visible change (**none** — test/tooling code), schema/API/event compatibility (**none**),
      tenant/PII/security impact (**none**; state that the guard's reach is unchanged — all 28 entry
      files are still checked, on every branch, and the module still performs pure filesystem reads
      with no network and no mutation), source/licence impact (**none**), cost impact (**none** beyond
      suite runtime — state it), rollback path (revert the commit, which restores the pinning and
      re-blocks `AUTC-01` and `RETR-01` — the rollback note must say so), known gaps (the Accepted
      caveats; **Q-F32-A** as decided; the eight deformed members of §3, unrepaired by design; and
      D22's still-open escalation).
- [ ] No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43 evaluation
      replay.
- [ ] No `[human]` criteria — a tooling/test-only change with a wholly mechanical acceptance surface;
      no PRD §41.2 `UAT-*` script applies.
- [ ] **No Rust and no Python source is written** (PRD §45.3). Rust and Python entry files are read,
      and are mutated only by the controls and restored.

## Test plan

Reviewer steps. All offline; no network, no corpus, no provider. **Step 0 in every shell:** confirm
`node -v` prints `v24.18.0`. Harness: Vitest via `tools/vitest.config.mjs`, plus the declared
`pnpm ci:local` for the workspace.

1. **Read the diff for a weakened guard first, before anything else.** Walk the A1–A16 table against
   the diff and confirm each "after" exists and asserts the same property at the same strength. A
   deleted `it(`, a re-pointed or softened smuggling control, a `.skip`/`.todo`/`retry`, or a matcher
   that passes on anything it does not recognise is a **BOUNCE**, not a style comment — including one
   that makes the suite green.
2. **Re-run the smuggling controls yourself, and go beyond the three.** Append implementation to at
   least two entry files of members whose tickets have not landed, in two different languages. Each
   must fail naming the file. Restore after each and confirm `git status --porcelain` clean. A guard
   that stays green under any of these is the outcome this repair is most at risk of producing.
3. **Re-run the reproduction yourself.** Check out `ticket/AUTC-01` @ `4a8dff8`'s
   `packages/auth/src/index.ts` and `ticket/RETR-01` @ `766ad18`'s `services/search-rs/src/lib.rs`
   into the working tree over this ticket's branch, run the suite green, then restore.
4. **Probe the matcher's edges** — the false-positive risk is the one this repair introduces. Try a
   re-export with a type-only modifier, a multi-line re-export, a re-export with a trailing comment, a
   `pub use` in Rust, an inner attribute, a Python `__all__` spanning lines. Anything legitimate that
   is rejected is a finding: report it against **Q-F32-A** rather than accepting it silently.
5. **Check the external pins.** `pnpm --filter @taxrag/database test` green **with no edit** to
   `packages/database`; the three literal strings of Background §9 present.
6. **Check the boundary.** `git diff --name-only main...HEAD` is exactly two files under `tools/`. Any
   entry file, manifest, lockfile or fixture in the diff is a file-scope violation regardless of the
   code's quality.
7. **Suite and gates.** `pnpm ci:local` **18 of 18** and `pnpm typecheck` green on the branch; re-run
   on the default branch after the merge.

## Open questions

| ID | Question | Status | Decides |
|---|---|---|---|
| **Q-F32-A** | How conservative should the declaration-only matcher be, and what happens the first time it rejects a legitimate entry file? A line/statement-shaped matcher that fails on anything it does not recognise cannot admit smuggled code, but can block a member whose entry file uses a form nobody anticipated — which is the failure mode this ticket exists to remove. | **OPEN — does not block, and is not required by acceptance.** Deliverable 2 fixes the *direction* (reject the unrecognised) and leaves the *breadth* of the recognised set to the Builder, informed by test-plan step 4. The escape hatch is procedural, not technical, and is not negotiable: a legitimate rejection is raised with the **Architect** as a +0.1 amendment to *this* ticket that widens the recognised set — never worked around by loosening the guard locally, adding a per-file exemption, or moving a barrel out of `src/index.ts` again. | **The Builder**, reported in the PR; the **Architect** on the first legitimate rejection. |
| **Q-F32-B** | Should `blocks:` enumerate every member-implementing ticket in the PRD rather than only `AUTC-01` and `RETR-01`? | **RESOLVED 2026-08-20 — no, deliberately.** Two reasons, both measured. (a) The guard is *survivable* for TypeScript by routing the barrel out of `src/index.ts`, and thirteen members have already done exactly that (Background §3), so a blanket list would assert a hard block that has demonstrably not been hard for most tickets. (b) A `blocks:` list is a scheduling claim, and this ticket verifies its claims by reading File-scope sections; verifying ~50 remaining tickets one by one is disproportionate to an edge that changes nothing — `dag-core.mjs` schedules on `blocked_by`, and only `AUTC-01` and `RETR-01` carry the reciprocal edge. The honest statement is the one in Background §2: the guard stands in front of every member-implementing ticket, and the two that are blocked **now** are the two that are named. A third ticket that hits it adds its own `blocked_by` edge by the route Feedback obligation 1 prescribes. | **The Architect**, 2026-08-20. |

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **A third ticket is found blocked by this guard while this one is in flight.** → Record it here
   (+0.1, `--sync`) and add the reciprocal `blocked_by: [FND-32]` edge to *that ticket* by a docs
   change, as `Q-F32-B` prescribes. Do **not** widen this ticket's scope to repair anything on that
   ticket's behalf.
2. **The declaration-only rule cannot accept one of the two real entry files** — `AUTC-01`'s
   `export * from './core/index.js';` or `RETR-01`'s `pub mod service;`. → It can, and both were read
   from their branches on 2026-08-20 (Background §7), so this would mean the matcher is wrong rather
   than the rule. Fix the matcher. If the rule itself turns out to be the problem, **stop** — that
   falsifies the ticket's central premise and is an Architect decision, not a Builder one.
3. **Keeping A10, A11 or A12 green-when-it-should-be-red appears to require re-pointing it at a
   different file, or weakening its expectation.** → **Stop and report.** Those three controls are the
   guard's entire worth, and a repair that keeps the loop while defeating the controls is strictly
   worse than the defect. Raise it with the **Architect** with what was tried; do not fall back to a
   loosened control while waiting.
4. **Another guard is found that encodes the repository as it is today.** → Record the file, the
   assertion and how it will break, and raise it with the **Architect** as a separate ticket for its
   owning module. Do not absorb it (Non-goals). This is the **fourth** instance of the class in this
   repository and at least the **sixth** counting `FND-11`, `FND-12` and `FND-19`; D22's escalation
   for a systematic sweep is still open, and a further finding is evidence for that sweep rather than
   work for this ticket.
5. **`ticket/AUTC-01` or `ticket/RETR-01` cannot be reproduced** (rebased away, sha unreachable). →
   Report it, proceed with the deliverable-3 pure controls using the two file bodies quoted verbatim
   in Background §7, and say so explicitly in the PR rather than letting acceptance items 1–2 read as
   satisfied.
6. **Somebody proposes an allow-list of implemented members instead, "since it is simpler".** →
   Rejected in Background §8 with the reason: it makes ~28 tickets across ~15 modules each perform a
   cross-module edit into `00-foundation`'s serial-owned row, and it decays exactly as `FND-28`
   documented for `FND-24`'s exclusion list. If the argument is genuinely new, raise it with the
   **Architect** as a change to *this ticket*.

**Escalation.** If it proves impossible to accept an implemented member's entry file **without**
losing the ability to reject implementation smuggled into a stub, then what needs deciding is how this
repository guards its member skeleton at all — not this ticket. Stop, escalate to the human, and raise
it with the **Architect**. **Never** resolve it by deleting a control, skipping the case, exempting a
path, or asserting only that the entry file exists: a guard that no longer distinguishes a declaration
from an implementation discharges nothing, while being — unlike today's guard — permanently green.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-20 | Initial ticket. Repairs `FND-01`'s entry-file guard (`tools/workspace-assertions.mjs#assertEntryFilesEmpty`, `tools/tests/skeleton.test.mjs` *"keeps every entry file empty"*), which asserts that every workspace member's entry file is still the byte-exact bootstrap stub and is therefore a wall in front of every ticket that implements a member — `tools/vitest.config.mjs` runs the suite on every later branch, so the wall is hit by work that never touches `tools/**`. Two tickets hit it on the same run: `ticket/AUTC-01` @ `4a8dff8` (`packages/auth/src/index.ts is not empty`; its own suite 12 files / 273 tests green, `ci:local` 17 of 18) and `ticket/RETR-01` @ `766ad18` (`services/search-rs/src/lib.rs is not empty`; 142 Rust tests green, `ci:local` 17 of 18) — and for `RETR-01` the guard is categorically unsatisfiable, since a Rust crate root that is the empty string has no modules and no public surface at all. **Measured on `main` @ `e1e08e4`:** the guard checks **28** entry files (21 pnpm, 1 cargo, 6 uv), **18** of them under `apps/`, `packages/` and `services/`, and **all 28 are still the stub**. Corrects the framing it was commissioned with: *"0 implemented"* is true of the entry files and false of the members — **thirteen** members already carry substantial implementations while keeping the entry file empty (`packages/domain` 57 source files, `packages/pii` 57, `packages/database` 57, `packages/contracts` 52, `pipelines/corpus-builder` 160, …), which is the strongest evidence for the repair rather than against it: every one of them declares `"main": "src/index.ts"` pointing at a dead empty module, and **eight** carry source comments naming this guard as the reason their real barrel is elsewhere (`packages/model-gateway/src/profiles/index.ts:4-5`, `packages/pii/src/contract/index.ts:4-5`, `packages/ui/src/ui.ts:4`, `packages/sdk-typescript/src/sdk.ts:4`, `apps/api/src/app.ts:7`, …). So the guard has already deformed eight delivered public surfaces silently. Names this the **fourth instance of one defect class** — (1) `DATA-01`'s pinned migration list → `DATA-10`; (2) `DATA-04`'s pinned tenancy table set → `DATA-11`; (3) `FND-25`'s scan-flagged name → `FND-28`; (4) this — and records that the class is older and wider: `00-foundation/README.md` **D22** already documents *this same file* being repaired for it twice (`FND-04`'s dependency assertion, `RUNT-06`'s tsconfig assertion) and closes with a still-open escalation for a systematic sweep, which this ticket answers for one file and explicitly does not close. Establishes from the source what the guard is for: its own doc line cites *"FND-01 File-scope"*, i.e. it is a self-check that one ticket did not smuggle implementation into the skeleton it created, wrongly promoted to a repository-wide invariant — while the structural half (member registered, entry file present at the conventional path, no member skipped) is already proved by `assertSkeleton` and the member-list loops and is not this ticket's to move. States the property it should become: **an entry file declares a member's surface and never contains it.** Records as settled that no filesystem check can distinguish legitimate implementation from smuggled implementation by looking at the code — they are the same bytes — and that any in-file marker is forgeable by the smuggler; the chosen mechanism sidesteps that rather than pretending to solve it, by asking *is this a declaration or an implementation* instead of *who wrote it*. **Mechanism: declaration-only entry files** — TypeScript re-exports, Rust `mod`/`use` with no bodied item, Python imports plus `__all__`, in each case alongside the existing stub. Chosen because it is not imposed on the two blocked tickets but is **what both already specify and already wrote**, verified in the files on 2026-08-20: `AUTC-01`'s File-scope line 152 says *"root barrel, core exports only"* and its branch file is `export * from './core/index.js';`, `RETR-01`'s lines 137-138 say *"the crate root's module list containing only `pub mod service;`"* and its branch file is exactly that. It also keeps **all three** smuggling controls failing unchanged on their current targets (`console.log('x');` is an executable statement, `pub fn x() {}` an item with a body, `X = 1` an assignment that is not `__all__`), is stronger than "empty" in forbidding import-time side effects in a declared entry point, and is a property rather than a snapshot. Records four rejected alternatives with reasons — a `tools/fixtures/` implemented-members allow-list (~28 cross-module edits into `00-foundation`'s serial row, and the decay `FND-28` documented for `FND-24`'s exclusion list); dropping the content check for the structural half alone (vacuous, deletes all three controls — `DATA-11`'s *"dropping to 'the tables exist' is a rejected outcome"*); deriving "implemented" from the member being otherwise non-empty, **rejected by measurement** because `packages/domain` has 57 source and 73 test files and is the target of the TypeScript control, so the heuristic would admit `console.log` into its entry file; and deriving it from git or the tracker (the module is committed to pure filesystem reads, and the verdict would differ between a branch and `main`). Flags a hard constraint from outside the file-scope, found by grep on 2026-08-20: `packages/database/test/migrate/file-scope.test.ts:207-217` pins the literal strings `assertEntryFilesEmpty`, `EXACT_VERSION` and the title *"pins every member dependency to an exact version, with no range"*, so a rename would red an `01-app-data` suite this ticket may not touch and turn a one-module repair into a cross-module one. Enumerates the must-survive assertions as **A1–A16**, read out of `skeleton.test.mjs` on 2026-08-20, of which **A9 alone** may be rewritten. Acceptance is **two-sided** — green with both real blocked entry files in the tree together, and still **red, naming the file**, for A10–A12 plus at least two further injections into members whose tickets have not landed — and says plainly that a green run proves nothing, because the guard is green on `main` today over 28 stub files and is still wrong. Notes that `pnpm ci:local` is the repo's declared test command and that both blocked tickets reported **17 of 18** with this as the only failure, so the repair is verifiable by one command going to 18 of 18. Carries `blocked_by: []` (a root — the guard and both rejected files are already on `main`) and `blocks: [AUTC-01, RETR-01]`, with **Q-F32-B** recording why the list is not extended to every member-implementing ticket. |
