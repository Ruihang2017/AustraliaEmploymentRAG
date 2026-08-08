---
id: FND-12
title: Repair the package-purity import scanner
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-08
blocked_by: [FND-04]
blocks: []
---

# FND-12 — Repair the package-purity import scanner

Implements PRD §39.1 / §45.2 (the `packages/contracts` import-graph rule) and PRD §20.3 / §45.3
(the `pnpm test` gate must be **correct**, not merely loud), enforced by the guard `FND-03`
introduced and `FND-04` extended. No ADR — the decision is already made in PRD §39.1
(*"`packages/domain` imports no Fastify, React, SQLite driver, provider SDK or Cloudflare/AWS
library"*), PRD §45.2 (`packages/contracts` owns *"Enums, schemas, generated clients, shared
boundary types"* and must not own *"Business orchestration, provider SDKs"*) and sub-PRD decision
**D22c** (the `.mjs` tooling rule); this is a repair ticket against a scanner that mis-implements
that decision.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-04 — OpenAPI root and generated TypeScript bindings](FND-04-openapi-root-and-generated-typescript-bindings.md)
— `FND-04` last wrote the file this ticket repairs (commit `4293581`, *"FND-04: repair three
bootstrap-state invariants (sub-PRD D22)"*) and is already delivered and merged into `main`, so the
edge is satisfied at authoring time and nothing waits on it.
**Why `builder`:** a bounded change to one helper function inside one test file, against a rule that
is already fixed by PRD §39.1/§45.2 and sub-PRD D22c — not a new subsystem decision.

## Background + basis

### What exists today

`packages/contracts/test/enums/package-purity.test.ts` is merged into `main`. `FND-03` created it
(deliverable 6 / acceptance item 8); `FND-04` repaired and extended it under sub-PRD **D22c**, which
added the `.mjs` block this ticket is about:

> `FND-04` / sub-PRD D22. `src/openapi/**` adds `.mjs` build tooling (loader, emitter, the two CLIs)
> that must import a YAML parser and a JSON-Schema validator — the `.ts` scan above never saw those
> files, so without this block they would escape the purity guard purely by file extension. That
> would be an accident, not a decision. The rule the PRD actually states (§39.1, §45.2) is about the
> PUBLISHED surface — a dependency inherited by every consumer — so `.mjs` tooling may import a
> declared **devDependency** and nothing else, and the manifest block below keeps `dependencies` and
> `peerDependencies` empty.

**That rule is correct and this ticket does not touch it.** `packages/contracts` is imported by every
package in the repository, so a dependency declared here is inherited everywhere; the guard is the
mechanical expression of PRD §45.2's package-boundary table. What is wrong is the *scanner* that
decides which strings in a file are module specifiers.

### The defect, verbatim

The file extracts specifiers with **text regexes, not syntax**:

```ts
/** Every module specifier in a file: static import/export, `import(...)` and `require(...)`. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) found.push(specifier);
    }
  }
  return found;
}
```

`FND-05` adds a **code generator**, `packages/contracts/src/events/codegen/emit.mjs`, which writes
import statements out as text. Its index emitter (line 208 at the time of writing) is:

```js
indexLines.push(`export type { ${name} } from '${specifier}';`);
```

The first pattern matches inside that template literal and captures the four-plus-character literal
string `${specifier}` as though it were a module specifier. It is not relative, it is not a
`node:` built-in and no package is named `${specifier}`, so the tooling test reports:

```
undeclared import in packages/contracts tooling:
src\events\codegen\emit.mjs -> ${specifier}
```

(`src/events/codegen/emit.mjs -> ${specifier}` on a POSIX checkout — the path separator comes from
`file.slice(PACKAGE_ROOT.length + 1)`, which is not normalised in this assertion.)

`emit.mjs` has **no** undeclared import: every specifier it actually emits is a relative `./….js`
path, and the file itself imports only `node:fs`/`node:path` and relative modules.

### Measurement (settled — do not re-litigate)

The four patterns above, run over every `.mjs` file under `packages/contracts/src` with `FND-05`
applied, yield exactly these non-relative, non-built-in captures:

| File | Captures that are not relative/built-in |
|---|---|
| `src/events/codegen/emit.mjs` | `["${specifier}"]` |
| `src/events/codegen/check.mjs`, `src/events/codegen/generate.mjs` | `[]` |
| `src/openapi/document.mjs` | `["yaml", "ajv/dist/2020.js"]` — both **declared devDependencies** (`yaml` `2.9.0`, `ajv` `8.20.0`), correctly allowed |
| `src/openapi/{emit,generate,generated-check,compatibility,conventions,tenant-leak}.mjs` | `[]` |

One capture, one file, one non-import. There is no second defect hiding behind this one.

**Live reproduction** — working tree at `ticket/FND-05`, Node 24.18.0, 2026-08-08:

```text
cd packages/contracts
node ../../node_modules/vitest/vitest.mjs run test/enums/package-purity.test.ts
```

```text
FAIL  test/enums/package-purity.test.ts > import graph > lets .mjs tooling import only Node
      built-ins, relative paths and declared devDependencies
AssertionError: undeclared import in packages/contracts tooling:
src\events\codegen\emit.mjs -> ${specifier}: expected [ Array(1) ] to deeply equal []

 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

**Eight of the nine tests pass.** The `.ts` purity scan, both non-vacuity checks, the
devDependency-leak scan, the existing impure-specifier control and the whole `package manifest`
block are all green. The defect is exactly one assertion wide, which is why the repair is one
helper deep — and why deliverable 5 requires everything else to survive untouched.

### Why it escaped, and why the manifest cannot fix it

Neither branch fails alone: the test does not exist on `FND-05`'s base, and `emit.mjs` does not exist
on `main`. Any correct rebase of `FND-05` onto `main` produces the failure. It cannot be fixed by
declaring a dependency — `${specifier}` is not a package name and never will be — so the only
resolutions are to repair the scanner or to weaken the guard, and weakening it is a rejected outcome
(Non-goals).

**It has been passing by luck since `FND-04`.** `main`'s own `packages/contracts/src/openapi/emit.mjs`
already emits import statements from inside a template literal — line 324:

```js
`import type { ${[...imports].sort().join(', ')} } from './schemas.js';`
```

The scanner reads that generated text too, and captures `./schemas.js`. It passes only because the
emitted specifier happens to be a literal relative path. The scanner has therefore been treating
generated import text as real imports since `FND-04` merged; `FND-05` is simply the first generator
whose emitted specifier is interpolated. This makes the distinction the repair must draw exact: the
problem is an **interpolated specifier**, not a template literal.

### This is the second instance of one defect class, and it will recur

`tools/tests/frozen-paths.test.mjs` was the first (repaired by **`FND-11`**): a repository-wide guard
written from a single ticket's viewpoint that misfires on later tickets. Sub-PRD **D22** already
raised the pattern as systemic (*"three files, two owning tickets, one defect class"*). Codegen is
not exotic in this plan — `PLTF-02` (TypeScript SDK) and `PLTF-03` (Python SDK) both generate from
`FND-04`'s OpenAPI root and will emit import statements as text — so a scanner that cannot tell
emitted text from real syntax will misfire again. That is why deliverable 2 requires an
anti-regression comment and why the acceptance checklist is written entirely around
generator-shaped fixtures rather than around the repository's current file list.

### Accepted caveats carried forward, not re-litigated

- **This stays a text scan, not a parser.** Regex extraction cannot distinguish a specifier inside a
  string, a comment or generated output from real syntax in the general case. Replacing it with a
  real import-graph analysis needs either a parser devDependency in
  `packages/contracts/package.json` (not this ticket's file-scope) or a hand-written one (far larger
  than this repair). It is a **Non-goal** with a named owner and an ADR candidate (Escalation).
- **Backtick-quoted specifiers are not matched at all today**, because all four patterns accept only
  `'` and `"` as the quote characters. A real import written as ``import x from `yaml`;`` would be
  missed. Widening the quote set is **explicitly out of scope** — see Non-goals for the reason and
  the owner. The gap is documented, not enforced; it is not created by this ticket and is not
  narrowed by it.
- **`file.slice(PACKAGE_ROOT.length + 1)` is not path-normalised** in the two offender messages, so
  Windows reports `src\events\…`. Cosmetic; not repaired here (it would be an unrelated edit inside
  the same file, and this repair is deliberately minimal).

## Goal

Repair `specifiersOf` in `packages/contracts/test/enums/package-purity.test.ts` so that it returns
only module specifiers that are **statically knowable from the source text**, and therefore reports
generated import *text* as what it is — not an import — while every real specifier it reports today
is still reported and every real violation still fails. Completion is mechanically checkable from
inline fixtures alone, with no dependency on which files happen to exist in the tree: a
generator-shaped source that produces an import statement with an interpolated specifier is clean; a
generator-shaped source that produces an import statement with a literal relative specifier still
yields that specifier; a source containing a genuine undeclared bare specifier still produces an
offender naming it; and relative, `node:` and declared-devDependency specifiers still classify
exactly as they do today.

## Non-goals

- **No change to any file other than `packages/contracts/test/enums/package-purity.test.ts`.**
- **No change to `packages/contracts/src/events/**` — in particular not to
  `src/events/codegen/emit.mjs` — and no change to anything else `FND-05` owns** (`schemas/events/**`,
  `packages/contracts/test/events/**`). `emit.mjs` is correct as written; the scanner is what is
  wrong. Editing the generator to dodge a regex (renaming the interpolation, splitting the string,
  adding a scanner-pleasing comment) is a **rejected outcome**: it would move the defect rather than
  fix it, it would break `FND-05`'s own generated-diff guarantee, and it would leave `PLTF-02` and
  `PLTF-03` to rediscover the same failure.
- **No change to `packages/contracts/package.json`.** No dependency, devDependency, script or field
  is added, removed or reordered. The manifest is append-only shared within this module (sub-PRD
  **D16**) and nothing in this repair needs it.
- **No weakening of the guard.** Deleting the `.mjs` tooling assertion, wrapping it in a conditional,
  marking it `.skip`, allow-listing `emit.mjs` or any other path, allow-listing the literal string
  `${specifier}`, allow-listing a directory named `codegen`, or making the failure non-fatal are all
  out of scope and are **rejected outcomes, not shortcuts**. So is exempting a file because its name
  or its directory looks like a generator: the rule is about what a string *is*, not about where it
  lives.
- **No widening of the scanner's quote set to backticks, and no new pattern of any kind.** The four
  patterns stay exactly four and keep their current quote characters. Reason: adding backtick
  matching is an *enlargement of the guard's detection surface*, not a repair of a false positive —
  it would make the scan report strings it has never reported, on evidence that does not exist (no
  `.ts` or `.mjs` file under `packages/contracts/src` uses a backtick-quoted import specifier today,
  measured above), and this ticket must not smuggle a behaviour change in behind a bug fix. Owner:
  the **Architect**, via a separate `00-foundation` ticket if it is wanted — most usefully as part of
  the parser question below rather than as another regex. The gap is recorded in Background as an
  accepted caveat so it is visible rather than forgotten.
- **No replacement of the regex scanner with a parser or a real import-graph tool**, and no new
  devDependency to enable one. Owner: the **Architect** (Escalation).
- **No change to the `.ts` purity scan's rule, the devDependency-leak scan's rule, the manifest block,
  or any `describe`/`it` name that already exists.** The repair is inside `specifiersOf`; the callers
  inherit it unchanged.
- **No change to `tools/tests/*.test.mjs`** — `FND-01`'s, with `FND-04`'s D22 repairs merged on top;
  and **no change to `tools/tests/frozen-paths.test.mjs`** — `FND-11`'s. A defect of the same class
  in a different file is a different ticket.
- **No change to breakdown plan §4, and no change to the PRD.** This ticket transcribes PRD
  §39.1/§45.2 and sub-PRD D22c; it does not amend them.

## File-scope (write-owns)

Owned by this ticket:

- `packages/contracts/test/enums/package-purity.test.ts` — **this one file, and nothing else.**

Does not touch:

- `packages/contracts/src/events/**`, `packages/contracts/test/events/**`, `schemas/events/**` —
  `FND-05` (same module, **in flight**; see the serial-safety analysis).
- `packages/contracts/src/{openapi,generated}/**`, `packages/contracts/test/{openapi,generated}/**`,
  `schemas/openapi/**` — `FND-04` (same module, delivered).
- `packages/contracts/src/{enums,ids}/**` and the other files under
  `packages/contracts/test/{enums,ids}/**` (including `test/enums/fixture.js`, from which this file
  imports `PACKAGE_ROOT`) — `FND-03` (same module, delivered).
- `packages/contracts/package.json` — append-only shared within this module (sub-PRD **D16**); this
  ticket appends nothing.
- `packages/domain/**` — `FND-06` … `FND-10`.
- `tools/**` (all of it, including `tools/tests/skeleton.test.mjs`, `tools/tests/scripts.test.mjs`,
  `tools/fixtures/script-owners.json` and `tools/tests/frozen-paths.test.mjs`), root manifests and
  lockfiles, `README.md`, `.gitignore` — `FND-01`, with `FND-04`'s D22 repairs and `FND-11`'s merged
  on top.
- `.github/workflows/**` — `FND-02`.
- Every other module's write-owns tree in breakdown plan §4.
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, the two pre-existing `tools/*.ps1`,
  `templates/**`, `CLAUDE.md`, `.claude/**` — frozen (breakdown plan §4).
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — unallocated
  (breakdown plan §4; sub-PRD **Q-F6** and the `.gitattributes` decision in `FND-11`).
- `docs/prd/**` — this ticket, the sub-PRD and the breakdown plan are changed by a **docs PR before**
  this ticket executes (CLAUDE.md: the ticket is the executable source of truth; spec changes go
  through the ticket, never through code).

**Serial-safety analysis.** `packages/contracts/test/enums/package-purity.test.ts` was last written
by `FND-04` (commit `4293581`), which is merged into `main`. One ticket is in flight against the same
package — `FND-05`, on branch `ticket/FND-05` — and its write-set is
`schemas/events/**` · `packages/contracts/src/events/**` · `packages/contracts/test/events/**`
(sub-PRD Work-breakdown table), which is **disjoint** from this one file. The two lanes may therefore
run concurrently without a file conflict. `FND-05` must **not** repair this file itself: two branches
editing the same helper is exactly the contention the file-scope cut exists to prevent, and
`FND-04`'s File-scope already records the same expectation for the `tools/` repairs (*"`FND-05`
shares these three files this wave and rebases onto this repair rather than re-doing it"*).

**Sequencing note (operational, not a DAG edge).** `blocks` is deliberately empty, and no in-flight
ticket's `blocked_by` is edited. The consequence must nevertheless be stated: **`FND-12` has to land
on `main` before `FND-05` can go green**, because `FND-05`'s branch fails the standing `pnpm test`
item on this assertion the moment it rebases. The edge is not added to `FND-05`'s frontmatter for two
reasons: `/start-all` cannot honor a dependency added to an already-started ticket (CLAUDE.md — it
comes back in `escalations`), and rewriting an in-flight ticket file re-publishes its issue and
re-triggers the drift path (issue #112). Running `FND-12` to completion before `FND-05` delivers is a
human scheduling decision, recorded here so it is not discovered by repeating the failure.

## Deliverables

All of the following land in `packages/contracts/test/enums/package-purity.test.ts`. Internal
organisation inside the file is the Builder's choice; the rule and the load-bearing mechanics below
are not.

1. **The scanner returns only statically knowable specifiers.**

   **Rule (normative).** A regex match whose captured specifier is **not statically knowable from the
   source text** is not a module specifier and MUST NOT be returned by `specifiersOf`. The marker for
   "not statically knowable" is that the captured specifier contains an **interpolation marker** —
   the two-character sequence `${`. Every other match is returned exactly as it is today, unchanged
   in value and in order.

   **Treatment chosen: skip the individual match; do not reject by quoting form.** The alternative —
   "reject template-literal-quoted matches entirely" — is both inapplicable and wrong here:

   - *Inapplicable.* All four patterns accept only `'` and `"` as the quote characters, so a
     backtick-quoted string is never matched in the first place; there is no template-literal-quoted
     match class to reject. The failing capture in `emit.mjs` is **single-quoted** (`from
     '${specifier}'`) and merely sits *inside* a template literal, so the quote character the regex
     sees carries no information about the interpolation.
   - *Wrong.* `main`'s `src/openapi/emit.mjs` line 324 emits
     ``` `import type { … } from './schemas.js';` ``` from inside a template literal with a
     statically knowable specifier. Discarding matches by container would throw that specifier away
     and silently shrink the guard. The property that matters is the **specifier**, not its
     surroundings.

   The rule is applied **inside `specifiersOf`**, so all four call sites — the `.ts` purity scan, the
   `.mjs` tooling scan, the devDependency-leak scan and the existing `detects an impure specifier`
   control — inherit it identically. No call site may get a private variant of the rule, and no
   caller may filter offenders after the fact: a scanner whose output depends on who is asking is the
   next version of this defect.

2. **An anti-regression comment at the helper**, replacing/extending the current one-line doc
   comment. It must state, in substance:
   - the rule: `specifiersOf` returns only specifiers that are statically knowable from the source
     text; a captured specifier containing `${` is generated *text*, not an import;
   - why, with the concrete case named: `FND-05`'s `src/events/codegen/emit.mjs` emits
     `` `export type { ${name} } from '${specifier}';` ``, and reporting `${specifier}` as an
     undeclared import blocked that ticket — **`FND-12`**;
   - that removing the interpolation guard restores that defect, and that this file is a **text
     scan, not a parser**: backtick-quoted specifiers are not matched at all, which is a recorded,
     accepted limitation owned by the Architect and not a licence to add patterns here.

   Deliverables 1 and 2 land together: a corrected scanner without the grounding comment is one
   careless edit away from the same defect, which is exactly what this ticket exists to prevent.

3. **Control fixtures that prove the repair on generator-shaped code, as inline string literals.**

   Both fixtures are **string literals inside the test file** — not reads of any repository file.
   This is load-bearing: `src/events/codegen/emit.mjs` does not exist on this ticket's base (`main`),
   so an acceptance criterion that reads it would be unrunnable here and would silently stop proving
   anything after `FND-05` lands. `sourceFiles(SRC)` walks `src/**` only, so the fixtures cannot
   scan themselves. Escaping is the Builder's choice (a plain double-quoted TypeScript string carries
   backticks and `${` literally).

   - **`GENERATED_INTERPOLATED`** — byte-identical to `FND-05`'s emitted-index statement:
     `` indexLines.push(`export type { ${name} } from '${specifier}';`); ``
   - **`GENERATED_LITERAL`** — byte-identical to `main`'s `src/openapi/emit.mjs` line 324 shape:
     `` `import type { ${[...imports].sort().join(', ')} } from './schemas.js';` ``

4. **A control that classifies synthetic sources through the same code path as the real tree.**
   The `.mjs` tooling test's offender logic — walk `specifiersOf`, skip relative/built-in, reduce a
   bare specifier to its package name (`@scope/name` from the first two segments, otherwise the first
   segment), report anything outside the allowed set — must be reachable from a control assertion
   with a **synthetic source and a synthetic allowed set**, and it must be the **same** code the
   real-tree scan runs. A second, hand-copied implementation inside the control test is a rejected
   outcome: it would pass while the real scan misbehaves, which is precisely how this defect reached
   `main`. (Extracting a small pure helper inside this file is the obvious way and is permitted; the
   mechanism is free, the identity is not.)

5. **Everything else in the file is preserved behaviourally.** All existing `describe`/`it` blocks
   stay, with their current names and their current rules: the `.ts` scan, both non-vacuity checks
   (`files.length > 20`, `toolFiles.length > 3` and the `src/openapi/emit.mjs` membership assertion),
   the `.mjs` tooling scan over the **real** tree with the **real** manifest, the devDependency-leak
   scan, the existing `detects an impure specifier when one is present` control and the whole
   `package manifest` describe block. They may be re-ordered or share the new helper; none may be
   deleted, skipped, renamed or weakened.

6. **No other change to the file's public behaviour**: it remains a Vitest suite under
   `packages/contracts/test/enums/`, collected by the package's `test` script, requiring no network
   access and no new import.

## Acceptance checklist (classified)

Every `[machine]` item below is reproducible offline: the fixtures are string literals inside the
test file and the only filesystem reads are the ones the suite already performs.

- [ ] `[machine]` **Generator-shaped source with an interpolated specifier is clean — the defect.**
      `specifiersOf(GENERATED_INTERPOLATED)` returns `[]`, and running the deliverable-4 classifier
      over `GENERATED_INTERPOLATED` with **any** allowed set (including the empty set) reports **no**
      offender. `${specifier}` appears nowhere in the result (deliverable 1; Background — the
      `FND-05` failure).
- [ ] `[machine]` **Generator-shaped source with a literal specifier still yields it — the repair is
      not "ignore template literals".** `specifiersOf(GENERATED_LITERAL)` returns exactly
      `['./schemas.js']` (deliverable 1; `main`'s `src/openapi/emit.mjs` line 324).
- [ ] `[machine]` **The guard still bites: a genuine undeclared import in a `.mjs` file is still
      reported.** The deliverable-4 classifier, run over a synthetic `.mjs` source containing
      `import Fastify from 'fastify';`, `const db = require('better-sqlite3');` and
      `await import('@aws-sdk/client-s3');` with the allowed set `new Set(['yaml'])`, reports exactly
      three offenders naming `fastify`, `better-sqlite3` and `@aws-sdk/client-s3` — and the message
      still names **every** offender, not just the first (PRD §39.1, §45.2; sub-PRD D22c).
- [ ] `[machine]` **A real relative import still classifies correctly.** `specifiersOf` returns
      `'./legal-status.js'`, `'../ids/uuidv7.js'` and `'node:fs'` for the corresponding synthetic
      sources, and the classifier reports **none** of them as an offender for any allowed set
      (deliverable 1; `isRelativeOrBuiltin` unchanged).
- [ ] `[machine]` **A real declared-devDependency import still classifies correctly, both ways.**
      With the allowed set `new Set(['yaml', 'ajv'])`, synthetic sources importing `'yaml'` and
      `'ajv/dist/2020.js'` produce **no** offender (sub-tree specifiers reduce to their package
      name); with the allowed set `new Set()` the **same** sources produce **two** offenders naming
      `yaml` and `ajv/dist/2020.js`. The scoped case `'@aws-sdk/client-s3'` reduces to `@aws-sdk/client-s3`
      (deliverable 4; the reduction rule is unchanged).
- [ ] `[machine]` **Same code path, not a copy.** The controls above exercise the function the
      real-tree `.mjs` scan calls; the file contains exactly one implementation of specifier
      extraction and exactly one of offender classification (deliverable 4).
- [ ] `[machine]` **No weakening.** The file contains no path, filename, directory or literal-string
      allow-list and no `.skip`/`.todo`/`.concurrent` marker; the `.mjs` tooling test still walks the
      real `src/**/*.mjs` tree with the real `package.json`; `toolFiles.length > 3`,
      `files.length > 20` and the `src/openapi/emit.mjs` membership assertion are intact; every
      pre-existing `describe`/`it` name is unchanged; the four patterns are still exactly four and
      still accept only `'` and `"` (deliverable 5; Non-goals).
- [ ] `[machine]` **Anti-regression comment present** at the helper, naming `FND-12`, the
      interpolation rule, the `emit.mjs` case and the recorded backtick limitation (deliverable 2).
- [ ] `[machine]` **The diff is one file.** `git diff --name-only main...HEAD` on this ticket's branch
      lists exactly `packages/contracts/test/enums/package-purity.test.ts` (File-scope). In
      particular `packages/contracts/package.json` and
      `packages/contracts/src/events/codegen/emit.mjs` are absent from it.
- [ ] `[machine]` **Suite green — the standing item (PRD §45.3).** In this environment, with Node
      **24.18.0** prepended to `PATH` from `C:\Users\HoraceHou\AppData\Local\node-24.18.0`:
      `corepack pnpm test` (the workspace suite, which runs this file) and
      `node node_modules/vitest/vitest.mjs run --config tools/vitest.config.mjs` (the root `tools`
      suite) both green on this ticket's branch.
- [ ] `[machine]` `corepack pnpm lint` and `corepack pnpm typecheck` green (PRD §20.3).
- [ ] `[machine]` **Cross-branch evidence (the point of the ticket).** With this ticket's repaired
      file applied on top of `FND-05`'s branch content — a **local, throwaway** check, never pushed
      and never committed to either branch — `packages/contracts/test/enums/package-purity.test.ts`
      is green and `src/events/codegen/emit.mjs` is reported clean. Not required to merge if the two
      branches cannot be combined locally; the fixture-based items above are the binding evidence,
      and this one is the confirmation that they modelled the real failure.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-001`, `E02-CONTRACTS`),
      user-visible change (**none** — a test-only repair) and non-goals, schema/API/event
      compatibility impact (**none** — no schema, document or generated artifact changes),
      tenant/PII/security impact (**none** — the file reads source text and `package.json` only, no
      data path), source/licence impact (**none** — no dependency added), cost/memory/latency impact
      (none), rollback path (revert the single-file commit — which restores the defect and re-blocks
      `FND-05`, so the rollback note must say so), known gaps (the two accepted caveats in
      Background: this is a text scan, not a parser; backtick-quoted specifiers are unmatched).

**Absent classes.** No `[fixture]` criteria: nothing recorded is replayed — the controls are string
literals inside the test, and the plan's `[fixture]` class is PRD §40.8 adapter fixtures and PRD
§14/§43 evaluation replays, neither of which exists before modules `05` and `21`. No `[human]`
criteria: the change is pure logic with a fully mechanical acceptance surface, produces no
customer-visible behaviour, and no PRD §41.2 `UAT-*` script applies — nothing is carried to the
Gate 2 smoke test. No Rust or Python surface: `cargo test --workspace` and `uv run pytest` are
unaffected beyond the repo-wide green `FND-01` established.

## Test plan

Reviewer steps. All steps are offline; no network, no mocks, no recorded fixtures. Harness: Vitest,
the framework `FND-01` registered, invoked in this environment with Node **24.18.0** prepended to
`PATH` from `C:\Users\HoraceHou\AppData\Local\node-24.18.0` — `corepack pnpm test` for the workspace
suite and `node node_modules/vitest/vitest.mjs run --config tools/vitest.config.mjs` for the root
`tools` suite. The construction pattern to copy is the file's own surviving control,
`detects an impure specifier when one is present` (assertions on `specifiersOf` over inline string
literals), plus its sibling `packages/contracts/test/enums/*.test.ts` suites.

1. **Read the rule, not the regexes.** Confirm the interpolation guard lives inside `specifiersOf`
   and nowhere else, that no caller filters offenders afterwards, and that the four patterns are
   unchanged in count and in quote characters. A guard implemented per-caller, or a fifth pattern, is
   a defect against deliverable 1 / the Non-goals.
2. **Hunt for an allow-list.** Grep the file for `emit`, `codegen`, `specifier`, `openapi`, `events`,
   `skip`, `todo`. The only occurrences may be inside the deliverable-2 comment and the deliverable-3
   fixture strings. Any path, filename, directory or literal-string exemption is a rejected outcome
   (Non-goals), not a style choice.
3. **Run the two fixture assertions and read them against the sources.** Open
   `GENERATED_INTERPOLATED` beside `FND-05`'s `packages/contracts/src/events/codegen/emit.mjs`
   (branch `ticket/FND-05`) and `GENERATED_LITERAL` beside `main`'s
   `packages/contracts/src/openapi/emit.mjs` line 324. A paraphrased fixture is a defect: the whole
   point is that the fixture is the shape that actually failed.
4. **Negative test — the guard still bites.** Temporarily append `import Fastify from 'fastify';` to
   any `.mjs` file under `packages/contracts/src` and run `corepack pnpm test`: the tooling test must
   **fail**, naming that file and `fastify`. Restore, and confirm `git status --porcelain` is clean.
5. **Negative test — the repair is not "ignore template literals".** Temporarily change
   `GENERATED_LITERAL`'s expected result to `[]` and re-run: the suite must fail. Restore.
6. **Negative test — the interpolation guard is live.** Temporarily remove the guard from
   `specifiersOf` and re-run: the `GENERATED_INTERPOLATED` assertion must fail, naming
   `${specifier}`. Restore.
7. **Non-vacuity of the real-tree scan.** Confirm the `.mjs` scan still enumerates the real files
   (`toolFiles.length > 3`, `src/openapi/emit.mjs` present) and still reads the real
   `packages/contracts/package.json` — the repair must not have turned the real scan into a
   fixture-only exercise.
8. **Cross-branch confirmation.** In a scratch worktree, apply this ticket's repaired file on top of
   `FND-05`'s branch content and run the package suite: `src/events/codegen/emit.mjs` reports clean.
   Discard the scratch worktree; nothing is pushed and neither branch is committed to.
9. **Scope and green.** `git diff --name-only main...HEAD` lists exactly one file; `corepack pnpm
   test`, `corepack pnpm lint` and `corepack pnpm typecheck` are green on this ticket's branch and on
   `main`.

## Feedback obligation

**General rule.** If implementation falsifies anything in this ticket, update **this ticket** (and
`docs/prd/00-foundation/README.md` where the decision is recorded) **first** — version +0.1 with a
changelog line — then change code, then re-publish the issue from the ticket
(`publish-tickets.mjs --sync`). Silent divergence is an incomplete ticket. Spec is never patched into
an implementation plan, into code, or by hand-editing the issue (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its writeback target:**

1. **The `${` marker proves insufficient** — a generator emits an import statement whose specifier is
   built by concatenation (`'./' + name + '.js'`), or a `.mjs` file has a genuinely dynamic
   `import()` whose specifier is a real package resolved at runtime. → Do **not** broaden the rule
   locally and do **not** add a pattern. Record the exact source line in **this ticket** and in
   **`docs/prd/00-foundation/README.md`**, then change the rule — the rule is the contract, and a
   scanner rule that drifts silently is how this defect and `FND-11`'s were both born.
2. **The repair cannot be contained in one file** — for example the helper must move somewhere both
   `packages/contracts` and `packages/domain` can use, or a parser devDependency is genuinely
   required. → Both are outside this File-scope (`packages/contracts/package.json` is append-only
   shared, sub-PRD **D16**; `packages/domain/**` is `FND-06` … `FND-10`). Update **this ticket's
   File-scope and deliverables** (version +0.1, changelog line, `--sync`) **before** touching them,
   and state the serial-safety consequence explicitly: `FND-05` is in flight in the same package.
3. **A real backtick-quoted import specifier is found anywhere under `packages/contracts/src`.** →
   That falsifies the measurement in Background and the Non-goal that rests on it. Do **not** widen
   the quote set inside this ticket. Record the file and line in this ticket and in
   **`docs/prd/00-foundation/README.md`**, and raise it with the **Architect** as a separate
   `00-foundation` ticket — the widening changes what the guard reports and needs its own acceptance
   evidence, not a line in a repair.
4. **`FND-05` (or any other in-flight ticket) turns out to have repaired this file too.** → Two
   branches editing one helper is the contention the file-scope cut exists to prevent. Stop, do not
   merge both, and escalate to the human with the Architect: one ticket owns the file, and per
   `FND-04`'s precedent the other rebases onto the repair rather than re-doing it.
5. **A third defect of this class is found while working** — another repository-wide guard that
   reads text and misclassifies a later ticket's output. → Record the measurement (file, line,
   observed message) in this ticket, fix it here **only if** it is inside this one file and inside
   this ticket's stated goal; otherwise raise it as a new `00-foundation` ticket with the Architect.
   Do not silently broaden a repair that an in-flight ticket is waiting on.

**Escalation.** If a correct scanner cannot be built from text matching — if the interpolation rule
cannot separate emitted text from real syntax without either false positives on generated code or
false negatives on real imports — then the guard's *mechanism*, not this ticket, is what is wrong,
and PRD §39.1/§45.2's enforcement needs an import-graph analysis instead of a regex. Stop, escalate
to the human, and raise it with the **Architect**. **ADR candidate (raised here, not authored here —
this ticket writes nothing under `docs/adr/`):** *how the `packages/contracts` import-boundary rule is
mechanically enforced* — a text scan with recorded blind spots versus a parser-backed import graph
with a devDependency in the most widely inherited package in the repository. Owner: **Architect**;
natural trigger: `PLTF-02`/`PLTF-03`, the next generators to emit import statements as text, or a
third recurrence of this defect class. **Never** resolve any of this by deleting, skipping,
allow-listing or narrowing the `.mjs` tooling assertion so the suite goes green — the point is a
correct guard, not a quiet one.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-08 | Initial ticket. Repairs `specifiersOf` in `packages/contracts/test/enums/package-purity.test.ts`, whose text regexes matched inside a template literal and reported `FND-05`'s generated import text — the literal string `${specifier}` from `packages/contracts/src/events/codegen/emit.mjs` — as an undeclared import, failing any correct rebase of `FND-05` onto `main` with `undeclared import in packages/contracts tooling: src\events\codegen\emit.mjs -> ${specifier}`. No manifest change can satisfy `${specifier}`, so the scanner is the only correct fix. Second instance of the defect class `FND-11` repaired (a repository-wide guard written from one ticket's viewpoint); `PLTF-02` and `PLTF-03` will emit import statements as text too. |
