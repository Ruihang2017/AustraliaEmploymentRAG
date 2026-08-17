---
id: FND-30
title: Clear the eleven standing pnpm lint problems at their cause
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-17
blocked_by: []
blocks: [FND-26]
---

# FND-30 — Clear the eleven standing `pnpm lint` problems at their cause

Repairs a **pre-existing, standing failure of the `pnpm lint` gate** — 10 errors and 1 warning on `main`
@ `c9e1706`, none of them in a recently-changed file — which blocks
[FND-26](FND-26-global-vitest-test-timeout.md) from meeting its standing acceptance item *"`pnpm lint`
and `pnpm typecheck` green"*. Against PRD §20.3 / §45.3 (the lint gate is one of the three standing
gates every ticket must leave green). No ADR — nothing here decides a new rule; ESLint's configuration
is `FND-01`'s and unchanged, and this ticket simply obeys it in eleven places.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is an **eleventh** phase-2 ticket appended to `00-foundation`
under **D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*), continuing
the ids past `FND-29`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root.** It must land **before**
[FND-26](FND-26-global-vitest-test-timeout.md) can report `testsPassed=true`, because every ticket's
standing acceptance includes a green `pnpm lint` and `FND-26` cannot reach one by any change inside its
own two-file scope. Hence `blocks: [FND-26]`.
**Why `builder`:** eleven mechanical repairs in five files, each with a known cause and a known
one-line shape, and no decision left open. No new mechanism, no behaviour change, no product surface.

## Background + basis

### The reported failure — settled, do not re-diagnose

`pnpm lint` (which `tools/workspace-script.mjs` dispatches as
`eslint --config tools/eslint.config.mjs .`) **exits 1** on `main` @ `c9e1706` with **11 problems (10
errors, 1 warning)**:

| File | Line:col | Rule |
|---|---|---|
| `.codex/scripts/dag-core.mjs` | 14:40 | `no-irregular-whitespace` |
| `.codex/scripts/dag-core.mjs` | 41:53 | `no-empty` |
| `.codex/scripts/deliver-ticket.mjs` | 179:11 | `no-empty` |
| `.codex/scripts/deliver-ticket.mjs` | 452:13 | `no-empty` |
| `.codex/scripts/deliver-ticket.mjs` | 562:7 | `no-useless-assignment` (`'last'` assigned but unused) |
| `.codex/scripts/prd-phase.mjs` | 100:68 | `no-irregular-whitespace` |
| `.codex/scripts/publish-tickets.mjs` | 78:65 | `no-empty` |
| `.codex/scripts/publish-tickets.mjs` | 120:9 | `no-empty` |
| `.codex/scripts/publish-tickets.mjs` | 346:68 | `no-empty` |
| `.codex/scripts/publish-tickets.mjs` | 417:53 | `no-irregular-whitespace` |
| `packages/database/test/tenant/context.test.ts` | 267:5 | *warning* — unused `eslint-disable` directive |

**`pnpm lint` is not in the CI command set.** The nine CI jobs do not run it, so none of these problems
reddens a CI job and this ticket does not change the CI picture at all. It is being repaired now for one
reason, stated plainly so nobody infers a larger one: **`pnpm lint` green is a standing acceptance item
on every ticket in this repository**, `FND-26` cannot reach it from inside its own file-scope, and the
repo owner chose on 2026-08-17 to repair the defects rather than relax `FND-26`'s acceptance.

### `.codex/**` is repository code, not the human's Codex configuration — settled

The Builder must not hesitate here, and must not overreach either. Both facts are verified:

- **The in-repo `.codex/` tree is tracked repository code.** `git ls-files .codex` returns **13 files**
  (5 agent TOMLs, `config.toml`, 7 scripts). It is not git-ignored (`git check-ignore` exits 1 for
  `.codex/scripts/dag-core.mjs`). `FND-19` classified it explicitly as *"tracked Codex config +
  scripts"* and added it to the PRD §20.1 top-level allow-list on that basis; `FND-16` linted
  `.codex/scripts` deliberately. It is inside the lint scope by design.
- **`~/.codex/config.toml` — the human's user-level Codex configuration — is a different file and is
  emphatically out of scope.** CLAUDE.md's sandbox-flags rule says the per-invocation `-c` flags must
  **not** be written into `~/.codex/config.toml` because *"it would change the human's interactive
  Codex, which is not ours to touch."* That rule is about the **home-directory** file. The in-repo
  `.codex/config.toml` is a tracked repo file — and it is **still not touched by this ticket**, because
  no lint problem is in it.

### The `no-irregular-whitespace` errors are NOT stray invisible characters — read this before editing

**This is the finding most likely to turn a correct-looking fix into a silent regression, so it is
stated as a finding rather than left to be discovered.** All three `no-irregular-whitespace` sites are
the **same deliberate, load-bearing character**: a literal **U+FEFF (byte-order mark)** inside a regular
expression whose job is to *strip a BOM*. Verified by code point on 2026-08-17:

```
.codex/scripts/dag-core.mjs:14        col 40  U+FEFF
  const fmOf = (text) => (text.replace(/^<U+FEFF>/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || ''
.codex/scripts/prd-phase.mjs:100      col 68  U+FEFF
  const text = readFileSync(join(tdir, f), 'utf8').replace(/^<U+FEFF>/, '')
.codex/scripts/publish-tickets.mjs:417 col 53  U+FEFF
  const text = readFileSync(path, 'utf8').replace(/^<U+FEFF>/, '') // strip BOM (PowerShell 5.1 utf8 writes one)
```

ESLint's `no-irregular-whitespace` defaults skip string literals but **not** regular-expression
literals, which is exactly why these three and no others are reported.

**Deleting the character would silently break BOM stripping in the ticket parser, the phase tool and the
issue publisher** — on a Windows repository whose own CLAUDE.md records a UTF-16/BOM incident that
stopped every shell startup file from executing and cost a day. The correct repair is to replace the
literal with the **escape `\uFEFF`**, which is byte-identical in behaviour, satisfies the rule, and
makes the intent visible in the source. Neither file currently uses the escaped form anywhere
(`grep -i feff` finds nothing), so this is a change of representation, not a duplication.

Because the character is invisible, **the fix must be verified byte-wise, not by eye**: a code-point
scan showing no character above U+007F remains at those lines, plus a behavioural check that BOM
stripping still works.

### The `no-empty` and `no-useless-assignment` errors — causes, verified

All five `no-empty` sites are deliberate swallow-the-error `catch {}` blocks around a probe:

```
dag-core.mjs:41           try { ok = statSync(tdir).isDirectory() } catch {}
deliver-ticket.mjs:179    } catch {}                  // MR-lookup probe
deliver-ticket.mjs:452    } catch {}                  // template-directory probe
publish-tickets.mjs:78    try { ticketsDirOk = statSync(ticketsDir).isDirectory() } catch {}
publish-tickets.mjs:120   } catch {}                  // `<cli> auth status` probe
publish-tickets.mjs:346   ... finally { try { unlinkSync(path) } catch {} }
```

In each, swallowing is genuinely correct: the absence of a directory, an unreadable forge response or a
failed temp-file unlink is a normal outcome the surrounding code already handles through a flag or a
`finally`. **ESLint's `no-empty` ignores a block that contains a comment**, so the sanctioned repair is
to say *why* swallowing is correct in each block — which is also the information a future reader needs.
A blanket `eslint-disable` says nothing and is a rejected outcome.

`deliver-ticket.mjs:562` is `let last = ''` inside `waitForMergeable`, whose initial value is
overwritten before it is ever read. The repair is to remove the dead initializer (or the variable, if it
is genuinely unread) — **not** to silence the rule.

`packages/database/test/tenant/context.test.ts:267` is a stale
`// eslint-disable-next-line @typescript-eslint/require-await -- reproducing an async sink deliberately`
that no longer suppresses anything. It is auto-fixable; the trailing rationale disappears with it, which
is correct because the directive it explained is gone.

### `.codex/scripts/` mirrors `.claude/scripts/` — recorded as a risk, not fixed here

`.codex/scripts/` carries same-named counterparts of four `.claude/scripts/` files, and **`.claude/**`
is in `tools/eslint.config.mjs`'s `ignores` list**, so only the Codex copies are linted. Two things
follow, both recorded rather than acted on:

1. **The copies have already drifted**, measured on 2026-08-17: `dag-core.mjs` and `prd-phase.mjs` are
   byte-for-byte identical in size (9953 / 8947), but `publish-tickets.mjs` is **16839 bytes under
   `.claude/` and 26040 under `.codex/`**, and `deliver-ticket.mjs` is **41353 versus 60692**. Two
   copies of the pipeline scripts, one of them unlinted, is the `FND-11`/`FND-12`/`FND-19`/`FND-27`
   defect class — a rule transcribed into a second place, where it rots.
2. **Both copies of the three BOM regexes contain the identical literal U+FEFF**, but only the `.codex/`
   copies are reported, because `.claude/**` is unlinted. After this ticket the two trees will differ by
   three characters that mean the same thing.

**Neither is repaired here** (Non-goals), because deciding what `.codex/**` is *for* — a mirror to keep
in sync, a fork to diverge deliberately, or a tree to delete — is an architectural decision with an
owner, not a lint fix. It is recorded as **Q-CI-F** in Open questions.

### Accepted caveats, carried forward

- **This changes no CI outcome.** `pnpm lint` is not in the CI command set. The value delivered is a
  standing gate that can be believed, and `FND-26` unblocked.
- **`.claude/**` stays unlinted and stays as it is.** It is a frozen path (`tools/tests/frozen-paths.test.mjs`)
  and outside this ticket entirely.
- **Eleven small repairs are eleven chances to change behaviour by accident.** The acceptance surface is
  built around that: a byte-wise check for the invisible characters, and an execution check for each
  changed script rather than a lint-only check.

## Goal

Make `pnpm lint` exit 0 by repairing each of the eleven reported problems **at its cause** — the
invisible BOM literals replaced by `\uFEFF` escapes with behaviour preserved, each deliberately empty
`catch` given the comment that explains why swallowing is correct, the dead assignment removed, and the
stale disable directive dropped — **without** adding a single `eslint-disable`, without touching the
lint configuration or any ignore list, and without changing what any script does. Completion is
mechanically checkable: `pnpm lint` exits 0; `pnpm test` and `pnpm typecheck` stay green; the diff is
exactly the five named files; a grep proves no `eslint-disable` was added and no ignore entry appeared;
and each changed script is shown to still **run**, not merely to lint.

## Non-goals

- **No `eslint-disable`, `eslint-disable-next-line`, `eslint-disable-line` or file-level
  `/* eslint ... */` comment added anywhere**, for any of the eleven problems. Rejected outcome — the
  point of this ticket is that the errors are real and small, not that the linter is noisy. (Removing
  the one **existing**, now-unused directive at `context.test.ts:267` is a deliverable and is the exact
  opposite of this.)
- **No change to `tools/eslint.config.mjs`.** Not the `ignores` array, not the rule set, not the
  `basePath`, not the `files` globs. Adding `.codex/**` — or any of the five files — to an ignore list
  is a **rejected outcome**, as is creating an `.eslintignore`. `FND-16` already rejected exactly this
  route for this tree.
- **No behaviour change in any script.** The BOM regexes match the same input after the change as
  before; the `catch` blocks still swallow exactly what they swallowed; `waitForMergeable` behaves
  identically. A diff that alters control flow, error handling, output text or exit codes fails this
  ticket even if lint goes green.
- **No deletion of the U+FEFF handling.** Removing the character instead of escaping it is a **rejected
  outcome** (Background) — it would silently break BOM stripping in the ticket parser, the phase tool
  and the issue publisher on the very Windows toolchain that writes those BOMs.
- **No reconciliation of `.codex/scripts/` with `.claude/scripts/`**, in either direction, and no
  deletion of either tree. That is **Q-CI-F** and is an Architect decision (Background). Rejected
  outcome here.
- **No change to `.claude/**`** — frozen (`tools/tests/frozen-paths.test.mjs`), unlinted, and out of
  scope.
- **No change to `.codex/**` beyond the four named scripts** — not `.codex/config.toml`, not
  `.codex/agents/*.toml`, not `dag-report.mjs`, `dag-scan.mjs` or `milestone-dag.mjs`, none of which is
  reported.
- **No change to any assertion, test title or test strength in `context.test.ts`.** Exactly one comment
  line is removed; the `setTenantAuditSink(async (event) => {...})` block and every `expect` in the file
  are byte-identical.
- **No `.skip`, `.todo`, `it.only`, `retry`, `continue-on-error` or exit-code swallow**, in any suite or
  in CI. Rejected outcomes.
- **No addition of `pnpm lint` to the CI command set.** That is a gate-list change, `FND-21`'s and
  `FND-24`'s territory, and it is not this ticket's to make or to pretend to have made.
- **No dependency change, no ESLint version bump.** The pins stay exactly as they are
  (`tools/tests/skeleton.test.mjs` asserts exact pins; **D17**: no silent upgrade).
- **No product code.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket — **five files, and nothing else**:

- `.codex/scripts/dag-core.mjs` — the U+FEFF literal at 14:40 and the empty `catch` at 41:53.
- `.codex/scripts/deliver-ticket.mjs` — the empty `catch`es at 179:11 and 452:13, and the dead
  `let last = ''` at 562:7.
- `.codex/scripts/prd-phase.mjs` — the U+FEFF literal at 100:68.
- `.codex/scripts/publish-tickets.mjs` — the empty `catch`es at 78:65, 120:9 and 346:68, and the U+FEFF
  literal at 417:53.
- `packages/database/test/tenant/context.test.ts` — the one unused `eslint-disable` directive line at
  267:5, and nothing else in the file. A cross-module edit, declared below.

Line numbers are as measured on `main` @ `c9e1706`; if they have moved, the **rule and the construct**
identify the site, not the number.

Does not touch:

- `tools/eslint.config.mjs` — `FND-01`'s, and a rejected outcome here (Non-goals).
- `.claude/**` — frozen (`tools/tests/frozen-paths.test.mjs`); `.claude/scripts/deliver-ticket.mjs` is
  `FND-20`'s single carve-out and is not this ticket's.
- `.codex/config.toml`, `.codex/agents/**`, `.codex/scripts/{dag-report,dag-scan,milestone-dag}.mjs` —
  no problem is reported in them.
- `~/.codex/config.toml` — the **human's**, never touched by pipeline work (CLAUDE.md).
- `packages/database/src/**`, `packages/database/migrations/**` and every other
  `packages/database/test/**` file — `01-app-data`'s;
  `test/tenant/concurrency.test.ts` is `FND-29`'s this phase.
- `tools/vitest.config.mjs`, `tools/workspace-script.mjs` — `FND-26`'s this phase.
- `tools/fixtures/**`, `tools/tests/**` — `FND-01`'s, `FND-20`'s and `FND-23`'s.
- `.github/workflows/**` — `FND-21`'s and `FND-24`'s. A lint repair is not a gate-list change.
- root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc` — `FND-01`, with `FND-23`'s
  single-key carve-out.
- `docs/PRD.md`, `docs/adr/**`, `CLAUDE.md`, `templates/**` — frozen or unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.
- every product tree — PRD-02 §3.

**Cross-module declaration.** `packages/database/**` is `01-app-data`'s write-owns tree, so a
`00-foundation` ticket writing `test/tenant/context.test.ts` is an out-of-file-scope edit, **declared
here rather than performed quietly** — the same shape `FND-25`, `FND-28` and `FND-29` used. The edit is
the removal of **one comment line** in a test file, changes no assertion, and exists because the
repository-wide lint gate reports it.

**Serial-safety analysis.** The four `.codex/scripts/*.mjs` files are declared in **no** other ticket's
file-scope under `docs/prd/**` — verified by search on 2026-08-17; `FND-16` and `FND-19` referenced the
tree but are delivered and merged. `packages/database/test/tenant/context.test.ts` is declared by no
other ticket; `FND-29` owns `concurrency.test.ts` in the same directory and the two files are disjoint,
so the lanes may run concurrently. `FND-26` is `blocked_by` this ticket and never concurrent with it.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. `context.test.ts` runs inside the second and third, so this ticket
**does** write an input to two required contexts; `.codex/scripts/**` is an input to none of the nine CI
jobs. **Verify rather than assume** — acceptance requires all six green on the pull request, by name.

## Deliverables

1. **The three U+FEFF literals become `\uFEFF` escapes, with behaviour preserved.** In
   `dag-core.mjs:14`, `prd-phase.mjs:100` and `publish-tickets.mjs:417`, the regular expression
   `/^<U+FEFF>/` becomes `/^\uFEFF/`. **The character is not deleted** (Non-goals) — these regexes strip
   the BOM that PowerShell 5.1's `utf8` encoding writes, as `publish-tickets.mjs:417`'s own trailing
   comment says. Where a site has no such comment, add a short one so the next reader does not "clean
   up" the escape.

2. **Each deliberately empty `catch` gains the sentence that makes it deliberate.** At `dag-core.mjs:41`,
   `deliver-ticket.mjs:179`, `deliver-ticket.mjs:452`, `publish-tickets.mjs:78`, `:120` and `:346`,
   put a comment **inside** the block saying what may fail and why swallowing it is correct — for
   example *"no tickets directory here; `ok` stays false and the caller skips this module"*. ESLint's
   `no-empty` ignores a block containing a comment, so this satisfies the rule **at the cause**. A
   blanket `eslint-disable`, an `error` parameter that is then ignored, or a rethrow that changes
   behaviour are all rejected outcomes. Six blocks, six *distinct* reasons — six copies of the same
   generic sentence does not discharge this deliverable, because the point is the information.

3. **The dead assignment is removed, not silenced.** `deliver-ticket.mjs:562`'s `let last = ''` loses its
   unread initializer; if `last` is genuinely never read anywhere, the declaration goes too. Read the
   surrounding `waitForMergeable` loop and confirm which before editing — `waitForMergeable`'s polling
   behaviour and its returned status must be identical afterwards.

4. **The stale disable directive is removed.** `packages/database/test/tenant/context.test.ts:267` — the
   whole `// eslint-disable-next-line @typescript-eslint/require-await -- ...` line goes, including its
   rationale, which described a suppression that no longer applies. Nothing else in the file changes.
   Confirm the rule really is no longer triggered rather than assuming the warning is correct: if
   removing the line produces an error, that is Feedback obligation 2.

5. **Evidence that every changed script still runs.** `.codex/scripts/*.mjs` are executable pipeline
   scripts, and *"it lints"* is not *"it works"* — three of the four changes are inside the code path
   that parses ticket frontmatter. Record, in the PR, a real invocation and its output tail for each
   changed script, using its **read-only** mode:

   | Script | Non-mutating invocation |
   |---|---|
   | `dag-core.mjs` | exercised through `node .codex/scripts/dag-scan.mjs docs/prd` — must exit 0 and print its `SCAN-JSON` line with the expected ticket count |
   | `prd-phase.mjs` | `node .codex/scripts/prd-phase.mjs context docs/prd` and `... check docs/prd` — read-only modes |
   | `publish-tickets.mjs` | `node .codex/scripts/publish-tickets.mjs docs/prd/00-foundation` **without** `--create` — the default is a dry-run preview and **must stay one**; the run must create no issue |
   | `deliver-ticket.mjs` | invoked with no arguments, it must print its usage line and exit non-zero. **Do not run a real delivery from this ticket.** |

   Additionally, prove the BOM handling still works: feed each of the three parsers a BOM-prefixed input
   and show the frontmatter is still parsed. **This is the check that a "clean up the invisible
   character" mistake would fail**, and a lint-green diff would not.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md).

- [ ] `[machine]` **The reported defect is gone.** `pnpm lint` **exits 0** on this branch, where on
      `main` @ `c9e1706` it exits 1 with 11 problems (10 errors, 1 warning). Both outputs pasted into
      the PR (PRD-02 §5 item 6), including the full "before" table so the count is checkable.
- [ ] `[machine]` **No `eslint-disable` was added — grep-checkable.**
      `git diff main...HEAD | grep -i "eslint-disable"` shows **only removals** (the one line at
      `context.test.ts:267`) and **no additions**. The command and its full output are pasted into the
      PR. An added suppression fails this item even if `pnpm lint` exits 0 (Non-goals).
- [ ] `[machine]` **No ignore-list entry was added.** `git diff --name-only main...HEAD` does not
      contain `tools/eslint.config.mjs`, and no `.eslintignore` exists in the tree
      (`git ls-files | grep eslintignore` returns nothing). Both pasted into the PR.
- [ ] `[machine]` **The invisible characters are gone byte-wise, and the behaviour is not.** A
      code-point scan of the three changed lines shows **no character above U+007F** remains at those
      sites, `git grep -n "\\\\uFEFF" -- .codex/scripts` shows the three escapes, and the BOM-parsing
      evidence from deliverable 5 is in the PR. **Verified by code point, not by eye** — the character
      is invisible, and this repo has already paid for an invisible-character incident (CLAUDE.md,
      UTF-16 startup files).
- [ ] `[machine]` **Every changed script still runs.** The four invocations in deliverable 5 are pasted
      with their output tails and exit codes: `dag-scan.mjs` exits 0 with its `SCAN-JSON` line,
      `prd-phase.mjs context` and `check` exit 0, `publish-tickets.mjs` runs its **dry-run** preview and
      creates nothing, `deliver-ticket.mjs` prints usage and exits non-zero. Lint-green without this is
      not acceptance.
- [ ] `[machine]` **The diff touches only the five named files.** `git diff --name-only main...HEAD`
      lists exactly `.codex/scripts/dag-core.mjs`, `.codex/scripts/deliver-ticket.mjs`,
      `.codex/scripts/prd-phase.mjs`, `.codex/scripts/publish-tickets.mjs` and
      `packages/database/test/tenant/context.test.ts` — and in particular **no** `.claude/**` path, no
      `tools/**` path, no `.codex/config.toml`, no `.codex/agents/**` (File-scope).
- [ ] `[machine]` **No behaviour changed.** `git diff main...HEAD` reads as: three regex literals
      re-spelled identically, six comments added inside existing `catch` blocks, one dead initializer
      removed, one comment line removed. No changed control flow, no changed output string, no changed
      exit code, no changed assertion, no changed test title. State this explicitly in the PR and name
      the `waitForMergeable` check from deliverable 3.
- [ ] `[machine]` **Each empty block's comment says something specific.** Six blocks, six distinct
      reasons naming what can fail and why swallowing it is correct (deliverable 2). Six copies of one
      generic sentence fails this item — it would satisfy the linter and leave the next reader exactly
      as uninformed.
- [ ] `[machine]` **`pnpm test` and `pnpm typecheck` are still green.** `pnpm test` exits 0 with the
      pass count stated in the PR — including `packages/database`, whose `context.test.ts` this ticket
      edits — and `pnpm typecheck` exits 0. If `pnpm test` shows the intermittent
      `concurrency.test.ts` assertion failure (`FND-29`'s defect, expected until it lands), say so
      explicitly and re-run: it is neither this ticket's regression nor a reason to relax this item.
- [ ] `[machine]` **The branch is mergeable under the live protection**, and in particular the two
      contexts `context.test.ts` is an input to — `Migration and tenant-schema validation` and
      `Tenant isolation, auth and permission tests` — are green. All six names and conclusions pasted
      into the PR (File-scope).
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a standing-gate repair
      under PRD §20.3/§45.3; unblocks `FND-26`), user-visible change (**none** — pipeline scripts and
      test code), schema/API/event compatibility (**none**), tenant/PII/security impact (**none** — no
      product code, no credential, no scanner or guard touched; state that no suppression was added, so
      no check lost coverage), source/licence impact (**none**), cost impact (**none**), rollback path
      (revert the commit — which re-reds `pnpm lint` and re-blocks `FND-26`, so the rollback note must
      say so), known gaps (**Q-CI-F** — `.codex/scripts/` and `.claude/scripts/` are drifted mirrors and
      only one of the two is linted; state the measured byte sizes).

**Absent classes.** No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43
evaluation replay. No `[human]` criteria — tooling and test code with a mechanical acceptance surface
and no customer-visible behaviour; no PRD §41.2 `UAT-*` script applies. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`.

1. **Read the diff for a suppression first.** Any added `eslint-disable`, any `tools/eslint.config.mjs`
   change, any new `.eslintignore` is a **rejected outcome** (Non-goals) and ends the review.
2. **Check the three BOM sites by code point, not by eye.** Confirm `\uFEFF` is present as an escape,
   that no literal U+FEFF remains at those lines, and that the regex still matches a real BOM — run the
   BOM-prefixed parse yourself rather than trusting the diff. **A deleted character would look like a
   tidy fix and would break ticket parsing on Windows.**
3. **Read each `catch` comment for content.** It must name what can fail and why swallowing is correct.
   Generic filler satisfies the linter and defeats the ticket.
4. **Check `waitForMergeable` line by line.** The dead initializer is removed; the polling loop, its
   exit conditions and its return value are unchanged.
5. **Run the four scripts yourself**, in their read-only modes (deliverable 5). Confirm
   `publish-tickets.mjs` ran a **dry run** and created no issue — check the tracker if in any doubt.
6. **Confirm the boundary.** `git diff --name-only main...HEAD` is exactly the five files; no
   `.claude/**`, no `tools/**`, no `.codex/config.toml`.
7. **Gates.** `pnpm lint` exits 0, `pnpm test` and `pnpm typecheck` green on the branch; all three
   re-run on `main` after the merge. Distinguish an `FND-29` intermittent failure from a regression
   before attributing anything to this diff.

## Open questions

| ID | Question | Status | Decides |
|---|---|---|---|
| **Q-CI-F** | What is `.codex/scripts/` *for*, given it holds same-named counterparts of four `.claude/scripts/` files, two of which have already drifted substantially (`publish-tickets.mjs` 16839 vs 26040 bytes; `deliver-ticket.mjs` 41353 vs 60692, measured 2026-08-17) — and given `.claude/**` is in ESLint's `ignores` so only the Codex copies are linted, meaning after this ticket the two trees differ by three characters that mean the same thing? Mirror to keep in sync, deliberate fork, or a tree to delete? | **OPEN — does not block this ticket.** Recorded as a **follow-up**, not repaired here: two copies of the pipeline scripts is the `FND-11`/`FND-12`/`FND-19`/`FND-27` defect class, but deciding the tree's purpose is an architectural call with an owner, not a lint fix. | **The Architect**, with the repo owner. Route: a new ticket if the answer is "reconcile" or "delete". |

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **`pnpm lint` reports a problem not in the table of 11** — a twelfth error, or a different rule at a
   listed site. → Record the exact finding here (+0.1, `--sync`) before changing anything else. If it is
   in one of the five owned files, fix it under this ticket by the same rules (cause, not suppression).
   If it is in a file this ticket does not own, it is **not** this ticket's to fix — record it and raise
   it with the **Architect**.
2. **Removing the `eslint-disable` at `context.test.ts:267` produces an error** instead of clearing a
   warning. → Then the directive was **not** unused and the reported warning is wrong about it. Restore
   the line exactly as it was, record the finding here (+0.1), and raise it with the **Architect**. Do
   **not** make the test `async`-clean by changing the sink — that is a behaviour change in
   `01-app-data`'s test (Non-goals).
3. **A `catch` block turns out to be swallowing something that should be handled** — the probe hides a
   real error the caller needed. → Record it here (+0.1) and raise it with the **Architect** as a
   separate ticket. Do **not** change the error handling under a lint ticket: *"the linter made me do
   it"* is how a behaviour change reaches `main` unreviewed. Add the honest comment for now, saying what
   is swallowed, and let the finding travel on its own.
4. **Somebody proposes adding `.codex/**` to the ignore list, "since it is only Codex tooling".** →
   Rejected by the repo owner on 2026-08-17, and already rejected once by `FND-16`. `.codex/` is tracked
   repository code (13 files, not git-ignored) and it is inside the lint scope deliberately; the eleven
   problems are real and small. Raise it with the **Architect** if the argument is genuinely new.
5. **Somebody proposes reconciling `.codex/scripts/` with `.claude/scripts/` in the same branch.** →
   That is **Q-CI-F** and is a Non-goal here. A drift repair spanning two pipeline trees is not a lint
   fix and must not travel inside one.

**Escalation.** If any of the eleven cannot be repaired without changing behaviour — the U+FEFF escape
does not strip the same input, a `catch` cannot be commented without restructuring, `last` turns out to
be load-bearing — **stop and report**. Record which, with the evidence, and raise it with the
**Architect**. **Never** resolve it with an `eslint-disable`, an ignore-list entry, or by deleting the
BOM handling: a gate that has been silenced reports green and guards nothing, and this phase exists
because a gate that is not believed is a gate that is not read.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-17 | Initial ticket. Repairs the **11 standing `pnpm lint` problems** (10 errors, 1 warning) on `main` @ `c9e1706`, all pre-existing and none in a recently-changed file: three `no-irregular-whitespace`, five `no-empty`, one `no-useless-assignment` across four `.codex/scripts/*.mjs`, plus one unused-`eslint-disable` warning in `packages/database/test/tenant/context.test.ts`. States plainly that **`pnpm lint` is not in the CI command set**, so this changes no CI outcome; it is repaired now because a green `pnpm lint` is a standing acceptance item on every ticket and `FND-26` cannot reach one from inside its own two-file scope — the repo owner chose on 2026-08-17 to repair the defect rather than relax `FND-26`'s acceptance. Establishes two facts by reading the repo so the Builder neither hesitates nor overreaches: **the in-repo `.codex/` tree is tracked repository code** (`git ls-files .codex` → 13 files, not git-ignored; `FND-19` added it to the PRD §20.1 allow-list as *"tracked Codex config + scripts"*, `FND-16` linted `.codex/scripts` deliberately), and it is a **different file from `~/.codex/config.toml`**, the human's user-level Codex configuration that CLAUDE.md forbids touching. Records the finding that changes the shape of the fix: all three `no-irregular-whitespace` sites are the **same deliberate, load-bearing character** — a literal **U+FEFF** inside regexes whose job is to strip the BOM PowerShell 5.1's `utf8` encoding writes — so **deleting it would silently break BOM stripping in the ticket parser, the phase tool and the issue publisher**, and the correct repair is the behaviour-identical escape `\uFEFF`, verified **byte-wise** because the character is invisible and this repo has already paid for an invisible-character incident (CLAUDE.md's UTF-16 startup files). Requires each of the six deliberately empty `catch` blocks to gain a **distinct** comment naming what can fail and why swallowing is correct (ESLint's `no-empty` ignores a commented block, so this is a fix at the cause), the dead `let last = ''` in `waitForMergeable` to be **removed** rather than silenced, and the stale directive line to go. Makes rejected outcomes explicit: any added `eslint-disable`, any `tools/eslint.config.mjs` or ignore-list change, any `.eslintignore`, any behaviour change, and any deletion of the BOM handling. Acceptance is grep-checkable on the suppressions and the ignore list, requires the five-file diff, and — because `.codex/scripts/*.mjs` are executable pipeline scripts — requires **evidence that each changed script still runs** in a read-only mode (`dag-scan.mjs` exit 0 with `SCAN-JSON`; `prd-phase.mjs context`/`check`; `publish-tickets.mjs` **dry-run**, creating nothing; `deliver-ticket.mjs` usage line) plus a BOM-prefixed parse, rather than lint-green alone. Records **Q-CI-F** as a follow-up, not a fix: `.codex/scripts/` mirrors `.claude/scripts/` and the copies have already drifted (`publish-tickets.mjs` 16839 vs 26040 bytes, `deliver-ticket.mjs` 41353 vs 60692, measured 2026-08-17) while `.claude/**` sits in ESLint's `ignores` so only the Codex copies are linted — the `FND-11`/`FND-12`/`FND-19`/`FND-27` defect class, whose repair is an architectural decision with an owner rather than a lint fix. Carries `blocks: [FND-26]` and an empty `blocked_by`: it is a root, and `FND-26` cannot discharge its standing *"`pnpm lint` green"* item until these eleven are gone. |
