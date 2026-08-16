---
id: FND-25
title: Narrow the DATA-01 root workspace guard to DATA-01's own key
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-16
blocked_by: []
blocks: [FND-23]
---

# FND-25 — Narrow the `DATA-01` root workspace guard to `DATA-01`'s own key

Repairs a guard whose assertion is wider than the property it exists to guard, against PRD §20.3 /
§45.3 (the `pnpm test` gate must be **correct**, not merely loud) and PRD §44.3 (a module owns its
files; a module that borrows one declares the exception). No ADR — nothing here decides a new rule.
The rule is already fixed by the disjoint-file-scope decomposition itself, and this ticket only
removes an assertion that contradicts it. Same defect class as `FND-11`, `FND-12`, `FND-14` and
`FND-19`: a guard that is right about *what* it protects and wrong about *how much* it forbids, so it
fails on legitimate work and has to be repaired rather than deleted or suppressed.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is a **sixth** phase-2 ticket appended to `00-foundation` under
**D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*), continuing the
ids past `FND-24`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing. **This ticket is a root** — it is `blocked_by` nothing and must land **before**
[FND-23](FND-23-ci-local-entry-point-and-nanoid-override.md) can be green, which is why the edge is
recorded as `blocks: [FND-23]` and not the other way round.
**Why `builder`:** a bounded edit to two assertions in one existing test file plus one table row, to a
shape the repo owner has already selected (Deliverable 1). No new subsystem, no new mechanism, no
product surface, no open decision.

## Background + basis

### The guard, and the property it is right to guard

`packages/database/test/migrate/file-scope.test.ts` was written by `DATA-01` (delivered; commits
`9fa9f80`, `bce5039`) and no other ticket declares it. Its first `describe` block,
`'DATA-01 out-of-file-scope exception (root pnpm-workspace.yaml)'`, exists because `DATA-01` could not
satisfy its own deliverable inside its own file-scope: `better-sqlite3` is the workspace's first native
dependency, pnpm 11 defaults `strictDepBuilds` to true, and an install that neither allows nor denies a
package shipping a `binding.gyp` exits `ERR_PNPM_IGNORED_BUILDS`. pnpm reads that policy from the
**workspace root only** — `dependenciesMeta.built` and a `pnpm` block in
`packages/database/package.json` were both measured and neither suppresses it. So `DATA-01` appended
one key, `allowBuilds`, carrying one entry, `better-sqlite3: false`, to a file whose owner is
`00-foundation`/`FND-01`, declared it as open question **M-Q4** in `docs/prd/01-app-data/README.md`, and
wrote this suite to bound the exception and bind it to that declaration.

**Both of those purposes are legitimate and this ticket keeps all of them.** A module that borrows a
file it does not own should be able to prove that what it wrote there is exactly what it declared, and
that the declaration has not since been deleted. Nothing below weakens that.

### The defect — an assertion about *other people's* keys

`file-scope.test.ts:78`, inside `it('adds exactly one key to the root pnpm-workspace.yaml, carrying exactly one entry')`:

```ts
expect(topLevelKeys(workspace)).toEqual(['packages', 'allowBuilds']);
```

`topLevelKeys()` returns **every** top-level key of the document. An exhaustive `toEqual` on that list
does not say *"`DATA-01` added one key"*; it says *"this file has exactly these two keys and no module
may ever add a third"* — including **`00-foundation`, which owns the file**. That is a claim `DATA-01`
had no standing to make, and it is the claim that is failing now.

`FND-23` v1.1 (authorised amendment, merged as `05ccb95`) adds `overrides.nanoid: 3.3.18` to root
`pnpm-workspace.yaml` to close **GHSA-2v37-7h3g-55p8**, because pnpm 11.4.0 no longer reads
`package.json#pnpm.overrides`. That is `00-foundation` writing a `00-foundation` file, inside
`FND-23`'s declared single-key carve-out. It is correct work, complete and green on its own terms on
`ticket/FND-23` @ `fea02b1` — unscoped `corepack pnpm audit --audit-level=high` exits 0,
`corepack pnpm install --frozen-lockfile` is clean, and the diff is confined to `FND-23`'s write-owns —
and it fails another module's suite for a reason that has nothing to do with `FND-23`.

### There are **two** broken assertions, not one — verified, do not re-derive

Measured against `git show ticket/FND-23:pnpm-workspace.yaml` @ `fea02b1`, where the `overrides:` block
is appended **after** `allowBuilds:`:

1. **`file-scope.test.ts:78`** — `topLevelKeys(workspace)` returns `['packages', 'allowBuilds', 'overrides']`, so the exhaustive `toEqual(['packages','allowBuilds'])` fails. **No placement avoids this**, because the assertion is about the whole key set.

2. **`file-scope.test.ts:80–84`** — the entry list is computed by slicing from the `allowBuilds:` line **to the end of the file** and filtering every two-space-indented line:

   ```ts
   const entries = workspace
     .split('\n')
     .slice(workspace.split('\n').findIndex((line) => line.startsWith('allowBuilds:')) + 1)
     .filter((line) => /^ {2}\S/.test(line));
   expect(entries).toEqual(['  better-sqlite3: false']);
   ```

   The slice has no upper bound, so **every** two-space-indented line under **every** later top-level
   key joins the list. With `FND-23`'s block present it evaluates to
   `['  better-sqlite3: false', '  nanoid: 3.3.18']` and fails a second time. Placing `overrides:`
   *before* `allowBuilds:` would silence this one and leave defect 1 standing, so key order is not a
   fix and must not be treated as one.

**A third assertion is order-sensitive but currently holds — confirm it, do not assume it.**
`it('leaves the FND-01 workspace globs byte-identical')` computes
`workspace.slice(0, workspace.indexOf('#'))`, i.e. everything before the **first `#` anywhere in the
file**. Today that is the comment block above `allowBuilds:`, and `FND-23`'s comment block sits below
it, so the slice is unchanged and the assertion passes. It is nonetheless fragile: any future comment
placed above `packages:` breaks it. Deliverable 2 permits hardening it, but only in a direction that
keeps it byte-exact about the globs.

The remaining tests in the block were checked against `FND-23`'s branch and are unaffected:
*"adds no dependency-build policy to any other root manifest"* scans the comment-stripped workspace file
for `strictDepBuilds` and six siblings — `overrides` and `nanoid` are none of them; and *"leaves the
root package.json scripts and toolchain pins alone"* asserts the absence of `db:migrate`, no root
`dependencies`, `engines.node === '24.18.0'` and `packageManager === 'pnpm@11.4.0'`, none of which
`FND-23`'s `ci:local` script entry touches.

### The principle this ticket writes down

> **A module may assert that its own out-of-file-scope exception stays narrow. It may not assert that
> the file's owning module never changes the file.**

The first is a module keeping its own promise and is exactly what `M-Q4` was declared for. The second
is a borrower taking a lock on the owner's file, which inverts the ownership the decomposition exists
to establish and would block `FND-01` and every future `00-foundation` ticket from editing a file that
is theirs. Only the second is being removed.

### Why deleting the suite was rejected — settled, do not re-open

The block's own header comment says, of the M-Q4 assertion, *"if 00-foundation has taken the key,
remove the exception and this suite together"*. **That remedy does not apply here, and reading it as
though it does is the trap this section exists to close.** "The key" in that sentence means
**`allowBuilds`** — the specific key `DATA-01` borrowed. `00-foundation` has **not** taken
`allowBuilds`; `FND-23` adds a **different** key, `overrides`, for an unrelated reason. `DATA-01`'s
exception is therefore still live, still undecided (M-Q4 is still open), and still the only thing in
the repository keeping it narrow: `tools/tests/frozen-paths.test.mjs` lists none of these paths, so
deleting this suite would leave an out-of-file-scope edit to a root file with **no** guard and **no**
mechanical link to its declaration. That is strictly worse than the defect being repaired. The repo
owner rejected deletion explicitly on 2026-08-16. Rejected outcomes, recorded so nobody re-derives
them:

- **Deleting the suite or the `describe` block** — discards the narrowness guarantee `DATA-01` still
  needs. Rejected.
- **`.skip` / `.todo` / commenting the assertion out** — same effect, less honestly. Rejected.
- **Reordering `pnpm-workspace.yaml` so `overrides:` precedes `allowBuilds:`** — silences defect 2 and
  leaves defect 1; and it edits a file this ticket does not own. Rejected.
- **Changing `FND-23`** to drop or relocate the override — `package.json#pnpm.overrides` is ignored by
  pnpm 11.4.0 (`FND-23` v1.1), so this re-opens GHSA-2v37-7h3g-55p8. Rejected.
- **Widening `DATA-01`'s exception to cover `overrides`** — the key is `00-foundation`'s, not
  `DATA-01`'s. It has no business in `DATA-01`'s declaration. Rejected.

### This ticket is itself a cross-module edit, and says so

`packages/database/**` is `01-app-data`'s write-owns tree and `docs/prd/01-app-data/README.md` is that
module's sub-PRD. A `00-foundation` ticket writing both is an out-of-file-scope edit of exactly the
kind M-Q4 exists to declare, and it is declared here rather than performed quietly:

- the assertion being narrowed constrains a **`00-foundation`-owned file** (`pnpm-workspace.yaml`), so
  the module whose work it blocks is the one repairing it;
- the edit is **test-only** — no `packages/database` source, schema, migration or repository is
  touched, and no other suite in that package is opened;
- the M-Q4 row and the guard must stay true of each other, so they land in **one commit**. The usual
  convention (`docs/prd/**` changes by a separate docs PR before the ticket executes) is deliberately
  departed from for that reason, with the Architect's sign-off recorded in the changelog.

The alternative route — a `DATA-01` ticket edit plus `publish-tickets.mjs --sync`, re-running a
delivered ticket to change two lines of its test — was considered and not taken: it re-opens a
delivered ticket to repair an assertion that is wrong about `00-foundation`'s file, and it puts the fix
behind a re-run of a nine-file migration ticket.

## Goal

Make `packages/database/test/migrate/file-scope.test.ts` assert exactly what `DATA-01` has standing to
assert — that `DATA-01`'s own borrowed key is present and stays narrow — and nothing about keys other
modules own, so that `FND-23`'s authorised `overrides.nanoid` key stops failing it while every property
`DATA-01` legitimately guards keeps failing when violated. Completion is mechanically checkable: the
suite is green with a third top-level key present in `pnpm-workspace.yaml`, and each of the four
positive controls in the acceptance checklist still turns it red.

## Non-goals

- **No change to `pnpm-workspace.yaml`.** It is `FND-01`'s, with `DATA-01`'s `allowBuilds` carve-out and
  `FND-23`'s `overrides.nanoid` carve-out. This ticket changes the **guard**, never the guarded file —
  not to reorder keys, not to move the comment blocks, not to "help" `FND-23`. Rejected outcome.
- **No deletion, `.skip`, `.todo`, or removal of the `describe` block or of any test in it.** Rejected
  outcome; see *"Why deleting the suite was rejected"*.
- **No relaxation of any other assertion in the block.** The single-entry check, the
  `set this to true or false` stub check, the byte-identical `packages:` globs check, the
  M-Q4-declaration check, the other-root-manifest check and the `tools/**` check all keep their current
  strength. Only the exhaustive top-level-key claim and the unbounded entry slice change.
- **No resolution of M-Q4 itself.** Who should own `allowBuilds` long-term is still `00-foundation`'s
  and the Architect's; this ticket updates the row's *facts*, it does not close the question.
- **No change to any migration, schema, repository or other test in `packages/database`**, and no
  product code anywhere. PRD-02 §3.
- **No change to `FND-23`'s branch, its deliverables or its file-scope.** The `blocked_by` edge and the
  v1.2 changelog row in `FND-23` are the Architect's docs change, already made; this ticket does not
  re-edit that file.
- **No change to `tools/**`, `.github/workflows/**`, `.claude/**`, `CLAUDE.md` or root manifests** —
  `FND-01`, `FND-21`, `FND-22`, `FND-23`, `FND-24`, or frozen.

## File-scope (write-owns)

Owned by this ticket — **two files, and nothing else**:

- `packages/database/test/migrate/file-scope.test.ts` — the two assertions, the non-vacuity control,
  and the header comment that misdescribes the remedy. Test file only; a cross-module edit, declared
  above.
- `docs/prd/01-app-data/README.md` — **the `| M-Q4 |` row of the Open questions table only.** No other
  row, table, section or line of that file.

Does not touch:

- `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `.npmrc` — `FND-01`, with `FND-23`'s
  single-key carve-out. **Read-only here**, including for the acceptance experiment, which restores it.
- `packages/database/src/**`, `packages/database/migrations/**`,
  `packages/database/test/**` other than `migrate/file-scope.test.ts`,
  `packages/database/{package.json,tsconfig.json}`, `packages/jobs/**` — `01-app-data`.
- `docs/prd/01-app-data/README.md` other than the `| M-Q4 |` row, and every ticket file under
  `docs/prd/01-app-data/tickets/**` — `01-app-data` and the Architect.
- `docs/prd/00-foundation/tickets/FND-23-*.md` and every other phase-2 ticket file — the Architect's.
- `tools/**`, `.github/workflows/**` — `FND-01`, `FND-21`, `FND-22`, `FND-23`, `FND-24`.
- `docs/PRD.md`, `docs/adr/**`, `.claude/**`, `CLAUDE.md`, `templates/**` — frozen or unallocated.
- every other product tree — PRD-02 §3.

**Serial-safety analysis.** `packages/database/test/migrate/file-scope.test.ts` was last written by
`DATA-01` (delivered and merged; `9fa9f80`, `bce5039`) and is declared in **no** ticket's file-scope
anywhere under `docs/prd/**` — verified by search. `docs/prd/01-app-data/README.md`'s M-Q4 row is
touched by no in-flight ticket. `FND-23` is `blocked_by` this ticket, so the two never run
concurrently; `FND-21`, `FND-22`, `FND-24` declare neither path.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. The second and third run `packages/database`'s suites, so this ticket
**does** write an input to two required contexts — the only phase-2 ticket that does. **Verify rather
than assume**: acceptance item 9 requires both to be green on the pull request, by name.

## Deliverables

1. **The top-level-key assertion is narrowed to `DATA-01`'s own key.** In
   `it('adds exactly one key to the root pnpm-workspace.yaml, carrying exactly one entry')`, replace the
   exhaustive claim with a containment claim, carrying the reason inline:

   ```ts
   expect(topLevelKeys(workspace)).toContain('allowBuilds');
   // DATA-01 asserts only ITS key stays narrow; other
   // modules' keys are theirs to declare, not ours to forbid.
   ```

   The test's title says *"adds exactly one key"* of `DATA-01`; it stays accurate under the narrowed
   assertion because the entry check below is what bounds `DATA-01`'s contribution.

2. **The entry computation is bounded by the next top-level key.** `entries` must be the two-space
   indented lines that belong to the `allowBuilds:` block **and stop at the next top-level key** (or end
   of file), so that a later block's entries cannot join the list. Extract it as a small named pure
   function beside `topLevelKeys` — for example `entriesUnder(yaml, key)` — so the suite can drive it
   with synthetic text. `expect(entries).toEqual(['  better-sqlite3: false'])` is unchanged and must
   stay exact. The byte-identical-globs test may additionally be hardened against comment placement (it
   currently slices at the first `#` anywhere in the file), provided it still compares the four glob
   lines byte-for-byte, in order.

3. **The non-vacuity control is strengthened for the weaker assertion.** `toContain` can pass for
   reasons `toEqual` could not, so
   `it('is not vacuous — the YAML key reader sees an appended block')` must additionally assert, on
   synthetic text: a three-key document yields all three keys in order; a document **without**
   `allowBuilds` does **not** contain it (so the new assertion can fail); and `entriesUnder` on a
   three-key document returns only the target block's entries, not the following block's. Without these
   the narrowing is a claim rather than a property.

4. **The header comment stops prescribing the wrong remedy.** The block's doc comment currently reads
   *"if 00-foundation has taken the key, remove the exception and this suite together"*. Make explicit
   that **"the key" means `allowBuilds`**, that another module adding a *different* top-level key is not
   that condition and does not retire this suite, and record the principle from Background: a module may
   assert its own exception stays narrow, and may not assert that the file's owner never changes the
   file. Name `FND-23`'s `overrides` key as the concrete instance, and `FND-25` as the ticket that
   narrowed it. The comment's measurement paragraphs (the `ERR_PNPM_IGNORED_BUILDS` derivation and the
   two candidate versions) are correct and stay.

5. **The M-Q4 row states the current facts.** Update the `| M-Q4 |` row of the Open questions table in
   `docs/prd/01-app-data/README.md` so it remains an accurate declaration rather than a stale one. It
   must, in substance: keep the question, its owner (**`00-foundation`**, with the Architect) and its
   resolution path **open and unchanged**; keep the literal strings `pnpm-workspace.yaml` and
   `00-foundation` (the suite asserts both are present in the row); and record that the file now also
   carries a **`00-foundation`-owned** key — `overrides.nanoid`, added by `FND-23` under its own
   single-key carve-out — so the file is no longer single-tenant, and that `FND-25` consequently
   narrowed the guard to `DATA-01`'s key alone. It must **not** claim M-Q4 is resolved: `allowBuilds`
   is still where `DATA-01` put it.

6. **Nothing else in either file changes.** No other assertion, title, import or helper in
   `file-scope.test.ts`; no other row or line of the sub-PRD. The other two `describe` blocks in the
   file (`'DATA-01 tsconfig stays on the repo convention'`, `'better-sqlite3 pin (breakdown plan §8 Q12)'`)
   are untouched.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression.

- [ ] `[machine]` **The reported defect is gone — demonstrated against the real key, not a synthetic
      one.** With `git show ticket/FND-23:pnpm-workspace.yaml` written over the working-tree
      `pnpm-workspace.yaml` (**uncommitted**), `pnpm --filter @taxrag/database test` runs
      `test/migrate/file-scope.test.ts` green, including both repaired assertions. Then restore the file
      (`git checkout -- pnpm-workspace.yaml`) and confirm `git status --porcelain` shows only this
      ticket's two files. Both outputs pasted into the PR. On `main`'s `file-scope.test.ts` the same
      experiment fails at line 78 **and** at the `entries` assertion — paste that too, so the PR shows
      two defects repaired, not one.
- [ ] `[machine]` **Positive control 1 — a second `allowBuilds` entry still fails.** Add a second entry
      (for example `  esbuild: false`) under `allowBuilds:` in the working tree, run the suite, record
      that it fails naming the entry list; restore and confirm `git status --porcelain` is clean of it.
      This is the narrowness guarantee `DATA-01` needs and it must survive.
- [ ] `[machine]` **Positive control 2 — the pnpm stub still fails.** Replace the value with pnpm's
      `set this to true or false` stub text, run, record the failure, restore.
- [ ] `[machine]` **Positive control 3 — the `packages:` globs are still byte-guarded.** Reorder or edit
      one glob line, run, record the failure, restore. Do this for both a reorder and an edit.
- [ ] `[machine]` **Positive control 4 — the declaration is still bound to the code.** Remove the
      `| M-Q4 |` row from `docs/prd/01-app-data/README.md` in the working tree, run, record that
      *"is declared as an open escalation in the sub-PRD"* fails; restore. An out-of-file-scope edit that
      is no longer declared anywhere must still be impossible to hold quietly.
- [ ] `[machine]` **The weakened assertion cannot pass vacuously.** The three synthetic controls from
      deliverable 3 are present and green, and removing the `toContain` line from the suite makes at
      least one of them meaningless — state which, and why, in the PR (deliverable 3).
- [ ] `[machine]` **The narrowing is exactly the two assertions.** `git diff main...HEAD --
      packages/database/test/migrate/file-scope.test.ts` shows changes only to the top-level-key
      assertion, the `entries` computation and its extracted helper, the non-vacuity control, and
      comments. No test removed, renamed, skipped or emptied; `git diff` contains no `.skip`, `.todo`,
      `it.only` or deleted `it(`.
- [ ] `[machine]` **The diff is two files.** `git diff --name-only main...HEAD` lists exactly
      `packages/database/test/migrate/file-scope.test.ts` and `docs/prd/01-app-data/README.md`, and the
      second diff is confined to the `| M-Q4 |` row (File-scope).
- [ ] `[machine]` **The branch is mergeable under the live protection**, and in particular the two
      contexts this ticket writes an input to — `Migration and tenant-schema validation` and
      `Tenant isolation, auth and permission tests` — are green. All six names and conclusions pasted
      into the PR (File-scope).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a guard repair under
      PRD §20.3/§45.3; unblocks `FND-23`/DEV-005 and D-CI1), user-visible change (**none** — test code),
      schema/API/event compatibility (**none**), tenant/PII/security impact (**none** — no product code,
      no credential, no scanner touched), source/licence impact (**none** — no dependency added), cost
      impact (**none**), rollback path (revert the commit — which re-blocks `FND-23` and therefore
      re-opens GHSA-2v37-7h3g-55p8, so the rollback note must say so), known gaps (M-Q4 remains open;
      this ticket is itself a declared cross-module edit).

**Absent classes.** No `[fixture]` criteria — the synthetic YAML strings in the suite are test inputs,
not PRD §40.8 adapter fixtures or §14/§43 evaluation replays. No `[human]` criteria — test-only change
with a mechanical acceptance surface and no customer-visible behaviour; no PRD §41.2 `UAT-*` script
applies. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: Vitest, via `pnpm --filter @taxrag/database test` for the file itself and
`pnpm test` for the workspace.

1. **Read the diff for a widening first.** Any test deleted, renamed into vacuity, `.skip`ped, emptied,
   or an assertion turned from a value comparison into a truthiness check is a **rejected outcome**
   (Non-goals), not a style comment. The only two assertions that may weaken are the exhaustive
   top-level-key claim and the unbounded entry slice, and only in the shapes deliverable 1 and 2 spell
   out.
2. **Confirm the narrowing is real, not cosmetic.** Drive `topLevelKeys` and `entriesUnder` directly
   with synthetic three-key documents, including one where the third key precedes `allowBuilds:` and one
   where it follows, and confirm the entry list is the `allowBuilds` block's in both.
3. **Re-run the four positive controls** from the acceptance checklist yourself, in the working tree,
   restoring after each. A suite that only goes green proves nothing; what has to be proved is that it
   still bites on the four things `DATA-01` needs it to bite on.
4. **Re-run the real-key experiment** (acceptance item 1) with `ticket/FND-23`'s `pnpm-workspace.yaml`,
   and confirm the working tree is restored afterwards.
5. **Read the M-Q4 row.** It must still be an *open* question with `00-foundation` as owner, must still
   contain `pnpm-workspace.yaml` and `00-foundation` literally, and must now say the file also carries a
   `00-foundation`-owned `overrides` key. A row rewritten into a resolution is a defect: nobody has
   decided who owns `allowBuilds`.
6. **Confirm nothing else moved.** `git diff --name-only main...HEAD` is two files; no `pnpm-workspace.yaml`,
   no migration, no `packages/database/src`, no other suite.
7. **Suite and gates.** `pnpm test`, `pnpm lint`, `pnpm typecheck` green on the branch; `pnpm test`
   re-run on `main` after the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **A third assertion in the block turns out to fail with `FND-23`'s file present** — beyond the two
   named in Background. → Do **not** widen it on sight. Record which assertion, its exact failure, and
   whether it is guarding `DATA-01`'s key or someone else's, in **this ticket** (+0.1, `--sync`). The
   test applies unchanged: narrow it to `DATA-01`'s own property if it over-reaches, leave it alone if it
   does not.
2. **The narrowed assertion cannot be made non-vacuous** — `toContain('allowBuilds')` passes on
   documents it should reject and no synthetic control distinguishes them. → Then containment is the
   wrong shape and the right one is an assertion over `DATA-01`'s key alone (for example asserting the
   `allowBuilds` block's parsed content while ignoring sibling keys entirely). Record the limitation
   here **before** changing shape, and keep the owner-selected form in the changelog so the deviation is
   visible.
3. **The M-Q4 row cannot be updated without touching another row or the table header.** → Stop. That is
   the Architect's file beyond the one row; record what is needed and raise it, rather than widening the
   edit.
4. **Someone proposes deleting the suite, or editing `pnpm-workspace.yaml` to make the guard pass.** →
   Rejected, with reasons already recorded in Background (*"Why deleting the suite was rejected"*), by
   the repo owner on 2026-08-16. Do not re-open it; if the argument is genuinely new, raise it with the
   **Architect** as a change to *this ticket*.
5. **`FND-23` has landed by the time this runs**, or its branch has moved past `fea02b1`. → The
   `blocks` edge exists precisely so that does not happen; if it has, re-derive the two failing
   assertions against the actual `main` content of `pnpm-workspace.yaml` before changing anything, and
   record the delta here. Never assume the measured defect is still the live one.

**Escalation.** If the two properties cannot both hold — `DATA-01`'s exception provably narrow, and
`00-foundation` free to edit its own file — without either deleting the guard or freezing the file, then
the *placement* of `DATA-01`'s exception is what needs a decision (M-Q4 itself), not this ticket. Stop,
escalate to the human, and raise it with the **Architect**. **Never** resolve it by deleting the suite,
skipping a test, or editing `pnpm-workspace.yaml` from here: the guard is the only mechanical link
between an out-of-file-scope edit and its declaration, and a guard that has been deleted discharges
nothing.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-16 | Initial ticket. Repairs a guard whose assertion exceeds its standing: `packages/database/test/migrate/file-scope.test.ts:78` asserts the **whole** top-level key set of root `pnpm-workspace.yaml` (`toEqual(['packages','allowBuilds'])`), which forbids not only a second `DATA-01` key but any key from **`00-foundation`, the module that owns the file** — and so fails `FND-23` v1.1's authorised `overrides.nanoid` entry (GHSA-2v37-7h3g-55p8, merged as `05ccb95`). Records that there are **two** broken assertions, not one: the same test computes the `allowBuilds` entry list by slicing to the end of the file, so with `overrides:` appended after `allowBuilds:` on `ticket/FND-23` @ `fea02b1` it evaluates to `['  better-sqlite3: false', '  nanoid: 3.3.18']` and fails independently — key order is therefore not a fix. Fixes the shape to `toContain('allowBuilds')` plus a bounded entry computation, per the repo owner's selection on 2026-08-16, and writes the governing principle into the suite's header comment: *a module may assert that its own out-of-file-scope exception stays narrow; it may not assert that the file's owning module never changes the file.* Deletion of the suite was proposed and **rejected** — the block's own "remove the exception and this suite together" remedy is conditioned on `00-foundation` taking **`allowBuilds`**, which has not happened, and `tools/tests/frozen-paths.test.mjs` covers none of these paths, so deleting it would leave `DATA-01`'s live exception with no guard and no link to its M-Q4 declaration. Requires four positive controls (second entry, pnpm stub, glob reorder/edit, missing M-Q4 row) so the repair is proved to have kept what it was meant to keep. Carries `blocks: [FND-23]` and an empty `blocked_by`: it is a root and must land first. Declares itself a cross-module edit (`packages/database/**` and `docs/prd/01-app-data/README.md` are `01-app-data`'s), test-and-one-row only, landed in one commit so the guard and its declaration cannot drift; the Architect signed off the departure from the "`docs/prd/**` by a separate docs PR" convention for that reason. |
