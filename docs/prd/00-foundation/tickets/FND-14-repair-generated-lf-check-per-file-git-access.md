---
id: FND-14
title: Repair the generated-blob LF check's per-file git access
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-10
blocked_by: [FND-05]
blocks: []
---

# FND-14 — Repair the generated-blob LF check's per-file git access

Implements PRD §20.1 (generated bindings are never hand-edited), requirement **DEV-001**
(epic `E02-CONTRACTS`), and PRD §20.3 / §45.3 (the `pnpm test` gate must be **correct**, not merely
loud) against the suite `FND-05` delivered for its acceptance item 11. No ADR — the property under
test is already decided by PRD §20.1 and sub-PRD **D29** (the committed blob of every generated file
is LF; the working tree carries git's checkout form); this is a repair ticket against the *mechanism*
that reads those blobs, not against the property.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-05 — Event and webhook schema root](FND-05-event-and-webhook-schema-root.md)
— `FND-05` created both files this ticket repairs (commit `eef95de`, *"FND-05: event and webhook
schema root"*) and is already delivered and merged into `main`, so the edge is satisfied at authoring
time and nothing waits on it.
**Why `builder`:** a bounded change to one helper and its single caller, against a property that is
already fixed by PRD §20.1 and sub-PRD D29 — not a new subsystem decision.

## Background + basis

### What exists today

`packages/contracts/test/events/generated.test.ts` is merged into `main`. `FND-05` created it as the
standing expression of its acceptance item 11 (*"a hand-edit is detected, and the same comparison runs
under `pnpm test`"* — sub-PRD **D22/D23/D31**, because the aggregate `generated:check` root name could
not be registered by a member at the time). Its last test is the index-side half:

```ts
it('stores every generated file as LF in the committed blob', () => {
  let checked = 0;
  for (const path of emitted.keys()) {
    const blob = committedBlob(`packages/contracts/${path}`);
    if (blob === null) continue; // first run on a fresh branch, before the commit
    expect(blob.includes(0x0d), `${path} has CRLF in the committed blob`).toBe(false);
    checked += 1;
  }
  expect(checked === 0 || checked === emitted.size).toBe(true);
});
```

**That assertion is correct, load-bearing and is not touched by this ticket.** Under this repository's
documented `core.autocrlf=true` checkout (sub-PRD **D29**) the working tree of a generated file is
CRLF while the committed blob is LF, so the *only* way to state the PRD §20.1 property truthfully is to
read the committed bytes. `committedBlob` in
`packages/contracts/test/events/support/load.ts` is the escape hatch that does it:

```ts
export function committedBlob(relativePath: string): Buffer | null {
  const result = spawnSync('git', ['show', `HEAD:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}
```

One `git` **process per generated file**. `emit()` produces 13 files, so the test spawns 13 processes.

### The defect

The test times out. It is a **timeout, not an assertion failure** — nothing it asserts is false:

```text
packages/contracts test:  ❯ test/events/generated.test.ts (11 tests | 1 failed) 5288ms
packages/contracts test:      × stores every generated file as LF in the committed blob 5145ms

 FAIL  test/events/generated.test.ts > the committed tree matches the emitter (acceptance item 11)
       > stores every generated file as LF in the committed blob
 Error: Test timed out in 5000ms.
 ❯ test/events/generated.test.ts:116:3
```

`packages/contracts` declares no vitest config, so the applicable limit is vitest's default
`testTimeout` of 5000 ms.

### Measurement (settled — reproduced on `main`, Node 24.18.0, 2026-08-10)

All figures from this machine (20 logical CPUs), with `C:\Users\HoraceHou\AppData\Local\node-24.18.0`
prepended to `PATH`.

| Observation | Command | Result |
|---|---|---|
| The package alone passes | `node ../../node_modules/vitest/vitest.mjs run` in `packages/contracts` | `Test Files 26 passed (26)`, `Tests 492 passed (492)`, `Duration 3.91s` — **green** |
| The whole workspace fails | `node tools/workspace-script.mjs test` (8 projects in parallel) | exactly one failure: the test above, `5145ms`, `Error: Test timed out in 5000ms.` |
| 13 × `git show HEAD:<path>`, machine idle | measured directly | **610–646 ms** (~47 ms per spawn) |
| 1 × `git cat-file --batch` over the same 13 paths, idle | measured directly | **70 ms** |
| 13 × `git show`, under 20 concurrent CPU-burning processes | measured directly | **2102 ms** |
| 1 × `git cat-file --batch`, same load | measured directly | **200 ms** |

**Cause, confirmed rather than assumed.** The test body does nothing but call `committedBlob` 13 times
and run `Buffer.includes(0x0d)` on ~1.3 KB each; the emitter itself runs at module scope (`const
emitted = emit();`, line 22) and is therefore outside this test's budget. The cost is process spawning,
it is paid 13 times, and on Windows it degrades sharply under CPU contention: measured 610 ms idle
→ 2102 ms under a 20-way burn, and 5145 ms under the real 8-project parallel run, which loads the
machine far harder than the synthetic burn (each project runs its own vitest worker pool). Batching the
same reads into **one** process costs 70 ms idle / 200 ms loaded — a ~10× reduction under load and,
more importantly, a cost that no longer scales with the number of generated files.

**It is not the Node-version fault.** CLAUDE.md's `node:internal/modules/esm/get_format` signature
(11 failures across `packages/database` and `apps/api` under Node 22.11.0) is a different failure. Every
figure above was taken with `node -v` printing `v24.18.0`, and the rest of the workspace is green.

### Why it matters more than one red test

`deliver-ticket.mjs` re-runs the full suite on the **merged default branch** as the last
Definition-of-Done gate. This test therefore makes `dodPassed` false on **every** future delivery,
independent of the delivered ticket's own correctness — it already did so once, on `FND-06`. A DoD gate
that is red for reasons unrelated to the work under test trains every reader to ignore it, which is
strictly worse than having no gate. That is the reason this repair is a ticket rather than a footnote.

### The protocol the repair uses — verified, not assumed

`git cat-file --batch` reads one revision expression per line on stdin and answers, in request order,
either

```text
<oid> SP blob SP <size> LF <size bytes of content> LF
```

or, for an object that does not exist,

```text
<request> SP missing LF
```

and exits **0** in both cases. Verified on this repository, mixed present/missing, in both orders:

```text
$ printf 'HEAD:.../generated/zz-nope.ts\nHEAD:.../generated/registry.ts\n' | git cat-file --batch | od -c
0000000  H E A D : ... z z - n o p e . t s  SP  m i s s i n g  \n
0000100  d 1 7 8 7 0 f 6 a c 3 6 0 4 2 1 ...   (blob, size, LF, contents)
```

This is a **strict improvement in fidelity** over the current code, not merely a speed-up: `git show`
collapses *"the object is not committed yet"* and *"the git invocation failed"* into the same `null`,
and the test's `if (blob === null) continue` then turns a broken git into a silent pass
(`checked === 0`). `--batch` separates them — a missing object is an in-band `missing` line at exit 0,
while a failed invocation is a non-zero exit or a short/unparseable stream.

### Accepted caveats carried forward, not re-litigated

- **The check still shells out to git.** Reading the committed bytes is the point (sub-PRD D29); there
  is no in-process alternative without a git object-store implementation. This repair reduces 13
  spawns to 1; it does not remove the dependency on the `git` executable, and does not try to.
- **The same per-file pattern exists in two sibling files and is deliberately left alone.**
  `packages/contracts/test/generated/working-tree.test.ts` (`FND-04`'s, sub-PRD **D29**) spawns
  `git show` once per **OpenAPI** generated file (5 files ≈ 250 ms idle), and
  `tools/tests/line-endings.test.mjs` (`FND-01`'s) does the same over the root files and the
  `tools/` tree. Neither is failing today. They are the same latent defect class and are recorded as a
  **Non-goal** with a named owner rather than swept into a repair that every future delivery is
  waiting on. See Feedback obligation 3.
- **Third instance of the class `FND-11` and `FND-12` repaired**, in a weaker sense: those were guards
  that asserted the wrong thing; this one asserts the right thing by a mechanism whose cost the author
  could not observe from a single-package run. The transferable lesson is the same and belongs in the
  anti-regression comment: *a test that spawns one process per item is measured in the parallel
  workspace run, never in the package run.*

## Goal

Make `packages/contracts/test/events/generated.test.ts`'s LF check read the committed blobs of all
generated files in **one** git process instead of one per file, and give that single test an explicit
per-test timeout, so the full parallel `pnpm test` is green on the default branch and
`deliver-ticket.mjs`'s Definition-of-Done gate stops reporting a failure unrelated to the ticket under
test. **The property under test is unchanged**: every generated file's committed blob still contains no
CR, the failure message still names the offending path, and the check still fails when a generated file
is committed with CRLF — demonstrated on a real commit, not asserted.

## Non-goals

- **No change to what the test checks.** The rule stays *"every generated file is stored LF in the
  committed blob"*, over **every** path in `emitted.keys()`, reading **committed** bytes (never the
  working tree, never the index, never `git ls-files --eol`, never a normalising read). Narrowing the
  path set, sampling, comparing normalised text, or checking only the first file are **rejected
  outcomes**.
- **No weakening to make it pass.** `.skip`, `.todo`, `.concurrent`, `.fails`, deleting the test,
  wrapping the assertion in a conditional, allow-listing a path, or making the failure non-fatal are
  out of scope and are **rejected outcomes, not shortcuts**.
- **No raising of the global timeout.** No `vitest.config.*` is added to `packages/contracts`, no
  `testTimeout` is set at project, file, `describe` or suite level, no `--testTimeout` is added to the
  package's `test` script, and no root config is touched. The explicit timeout in deliverable 3 applies
  to **this one `it` and no other**.
- **No moving the git access out of the test body to dodge the clock.** Hoisting the reads to module
  scope, to `beforeAll`, or into a lazily-memoised module-level value would make the timeout stop
  measuring the work — hiding the cost rather than removing it. **Rejected outcome.**
- **No change to `packages/contracts/test/generated/working-tree.test.ts`** (`FND-04`'s, sub-PRD D29)
  and **no change to `tools/**`** — including `tools/tests/line-endings.test.mjs`. `tools/**` and
  `.claude/**` are outside this ticket entirely. A latent instance of the same defect class in another
  file is another ticket (Feedback obligation 3).
- **No change to `packages/contracts/src/**`** — not to the emitter, not to `codegen/check.mjs`, not to
  any generated file. Nothing under `src/` is read differently, written, or regenerated by this ticket.
- **No change to `packages/contracts/package.json`** (append-only shared within this module, sub-PRD
  **D16**) — no dependency, script or field is added, removed or reordered. No new import beyond
  Node built-ins already used by `support/load.ts`.
- **No change to `.gitattributes`** and no repository-wide line-ending fix. It is unallocated by
  breakdown plan §4 and `FORBIDDEN` in `tools/tests/frozen-paths.test.mjs`; the standing escalation to
  allocate it (sub-PRD v0.8, D29) is the **Architect's** and is not resolved here.
- **No change to any other test in the file**, to any `describe`/`it` name, or to any other export of
  `support/load.ts`.
- **No change to the PRD, the breakdown plan or the sub-PRD's decisions.** This ticket transcribes
  PRD §20.1 and sub-PRD D29; it does not amend them.

## File-scope (write-owns)

Owned by this ticket:

- `packages/contracts/test/events/support/load.ts` — the batched reader (deliverable 1) and the
  anti-regression comment (deliverable 4).
- `packages/contracts/test/events/generated.test.ts` — the caller, the explicit timeout and the two
  controls (deliverables 2, 3, 5).

**These two files, and nothing else.** Both are `FND-05`'s, both live in the same directory, and the
split is forced rather than chosen: the git access lives in `support/load.ts` and the assertion lives in
`generated.test.ts`. Implementing the batch inside the test file instead would leave two
committed-blob readers in one package — the *"exactly one implementation"* rule `FND-12` deliverable 4
established for precisely this reason.

Does not touch:

- `packages/contracts/src/**` (emitter, codegen, generated files, OpenAPI) — `FND-04` and `FND-05`
  (same module, delivered).
- `packages/contracts/test/generated/**` (including `working-tree.test.ts`),
  `packages/contracts/test/openapi/**` — `FND-04` (same module, delivered).
- `packages/contracts/test/enums/**`, `packages/contracts/test/ids/**` — `FND-03`, with `FND-12`'s
  repair merged on top.
- The other `packages/contracts/test/events/*.test.ts` suites (`baseline`, `denylist`, `fixtures`,
  `hmac`, `schemas`, `sign`) and the other `test/events/support/*.ts` modules (`baseline.ts`,
  `denylist.ts`, `validator.ts`), and `packages/contracts/test/events/fixtures/**` — `FND-05`
  (same module, delivered).
- `packages/contracts/package.json` — append-only shared within this module (sub-PRD **D16**); this
  ticket appends nothing.
- `packages/domain/**` — `FND-06` … `FND-10`.
- `tools/**` (all of it), root manifests and lockfiles, `README.md`, `.gitignore` — `FND-01`, with
  `FND-04`'s D22 and `FND-11`'s repairs merged on top. **Frozen for this ticket.**
- `.github/workflows/**` — `FND-02`.
- Every other module's write-owns tree in breakdown plan §4.
- `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, the two pre-existing `tools/*.ps1`,
  `templates/**`, `CLAUDE.md`, `.claude/**` — frozen (breakdown plan §4).
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — unallocated
  (breakdown plan §4; sub-PRD **Q-F6** and the `.gitattributes` decision in `FND-11`).
- `docs/prd/**` — this ticket, the sub-PRD and the breakdown plan are changed by a **docs PR before**
  this ticket executes (CLAUDE.md: the ticket is the executable source of truth; spec changes go
  through the ticket, never through code). The scratch branch in the Test plan is **local only**: never
  pushed, deleted after use.

**Serial-safety analysis.** Both files were last written by `FND-05` (commit `eef95de`), which is merged
into `main`. Checked at authoring time: of the 19 non-`main` `ticket/*` and `archive/*` branches in this
clone, only the abandoned `ticket/FND-05-prior-attempt` touches
`packages/contracts/test/events/**` — no live ticket writes either file, so this lane runs concurrently
with everything currently in flight without contention. `support/load.ts` is imported by six sibling
event suites, so the change to it must be **additive plus one internal re-expression**: no existing
export is renamed, removed, or given a different signature or return type (deliverable 1).

**Sequencing note (operational, not a DAG edge).** `blocks` is deliberately empty and no in-flight
ticket's `blocked_by` is edited — `/start-all` cannot honor a dependency added to an already-started
ticket, and rewriting an in-flight ticket file re-publishes its issue and re-triggers the drift path
(CLAUDE.md; issue #112). The operational consequence must nevertheless be stated: **until this ticket
lands on `main`, every delivery's `/verify-delivery` reports `dodPassed: false`** on a failure that has
nothing to do with the ticket delivered. Running it early is a human scheduling decision, recorded here
so it is not rediscovered once per delivery.

## Deliverables

Internal organisation inside the two files is the Builder's choice; the boundary and the load-bearing
mechanics below are not.

1. **A batched committed-blob reader in `packages/contracts/test/events/support/load.ts`.**

   A new export — name suggested, not mandated: `committedBlobs(relativePaths: readonly string[]):
   Map<string, Buffer | null>` — that returns the committed bytes of every requested repo-relative path,
   keyed by that same path string, with `null` for a path that is not committed at `HEAD`. Mechanics
   that are **not** free:

   - **Exactly one child process for the whole request**, regardless of the number of paths:
     `spawnSync('git', ['cat-file', '--batch'], { cwd: REPO_ROOT, encoding: 'buffer', input: … })`
     with one `HEAD:<path>` request per line. An empty input list returns an empty map **without**
     spawning git.
   - **Parse over `Buffer` bytes, never over a decoded string.** For each response, read the header line
     up to the first `0x0A`; on `<oid> SP blob SP <size>` take exactly `<size>` bytes of content and
     then skip the single trailing `0x0A`; on `<request> SP missing` record `null`. Slicing content by
     `<size>` (not by scanning for a newline) is what makes the reader correct for a blob containing
     newlines, which every generated file does.
   - **Fail loudly, never silently short.** A non-zero exit status, a `type` other than `blob`, a
     truncated stream, an unparseable header, or a response count different from the request count
     **throws** with a message naming the offending request and git's `stderr`. This is the property the
     current `git show` code cannot express: *"git failed"* must not be indistinguishable from
     *"nothing is committed"*, because the caller's `checked === 0` branch treats the latter as a pass.
   - **Reject a path that would corrupt the request protocol**: any requested path containing `\n` or
     `\r` throws, naming the path. (No generated path does today; the emitter controls them. The guard
     is one line and removes a whole class of silent mis-pairing.)
   - `maxBuffer` at least `64 * 1024 * 1024` — the aggregate is now one stream, not 13.

   **`committedBlob(relativePath)` keeps its exact current name, signature and semantics** and is
   re-expressed as a single-path call into the batched reader, so the package contains **one**
   implementation of committed-blob reading. It is not deleted; six sibling suites import from this
   module and a future caller may want the singular form.

2. **The LF check calls the batched reader once.** In
   `packages/contracts/test/events/generated.test.ts`, the loop body's per-path `committedBlob` call is
   replaced by a single `committedBlobs([...emitted.keys()].map((p) => \`packages/contracts/${p}\`))`
   **inside the test body**, followed by the same iteration over `emitted.keys()`. Everything else about
   the test is preserved **verbatim in substance**:

   - the `describe` name `the committed tree matches the emitter (acceptance item 11)` and the `it` name
     `stores every generated file as LF in the committed blob` — **unchanged strings**;
   - the per-path assertion `expect(blob.includes(0x0d), \`${path} has CRLF in the committed blob\`)
     .toBe(false)` — unchanged, including the message;
   - `if (blob === null) continue;` for the not-yet-committed case, and the closing
     `expect(checked === 0 || checked === emitted.size).toBe(true)` — unchanged;
   - the path set is still exactly `emitted.keys()`.

3. **An explicit per-test timeout on this one test**, as `it`'s third argument: **30 000 ms**. Rationale,
   which belongs in the comment beside it: the test performs a **process spawn**, whose latency is
   governed by machine load rather than by the work it does, so vitest's generic 5 s default is the
   wrong instrument; 30 s is ~150× the measured single-spawn cost under a 20-way CPU burn (200 ms) and
   still fails fast if the spawn ever hangs. It applies to this `it` only — see the Non-goals for the
   four ways of setting a timeout that are forbidden.

4. **An anti-regression comment**, at the batched reader in `support/load.ts` and referenced from the
   test. It must state, in substance:
   - the rule: committed blobs are read in **one** git process; a reader that spawns one process per
     file is a defect in this repository, not a style preference;
   - the measurement, so a future reader does not have to rediscover it: 13 × `git show` cost 610 ms
     idle and 2102 ms under CPU contention, and timed the LF check out at 5145 ms against vitest's
     5000 ms default during the 8-project parallel `pnpm test`, while the package run alone was green
     in 3.91 s — **`FND-14`**;
   - the transferable lesson: **a test that spawns a process per item is measured in the parallel
     workspace run, never in the single-package run**;
   - that the property being read — LF in the committed blob, PRD §20.1 / sub-PRD **D29** — is
     unchanged, and that batching must never become sampling.

5. **Two controls, both permanent, both cheap.**
   - **Protocol control (one spawn).** A single `committedBlobs` call over a mixed list — at least one
     path known to be committed (a generated file) and one fabricated path that cannot exist (e.g.
     `packages/contracts/src/events/generated/zz-does-not-exist.ts`) — returns a non-`null` `Buffer` for
     the first and `null` for the second, in one call, with a result size equal to the request size.
     This exercises both branches of the response parser and its request/response pairing. Order the
     list so the missing path is **not** last, so a parser that mis-pairs after a `missing` line fails.
   - **CR-detection control (no spawn).** The predicate the real loop uses to decide "has CR" reports
     `true` for a synthetic `Buffer` containing `0x0d` and `false` for one that does not. It must be the
     **same** code the real scan runs — a hand-copied second implementation inside the control is a
     rejected outcome (`FND-12` deliverable 4's rule). Extracting a tiny pure helper is the obvious way
     and is permitted; the mechanism is free, the identity is not.

6. **No other change to either file's public behaviour.** `generated.test.ts` remains a vitest suite
   under `packages/contracts/test/events/`, collected by the package's `test` script;
   `support/load.ts` remains a non-test module (vitest collects only `*.test.*`) with every existing
   export intact; neither requires network access.

Ordering constraint: deliverables 1–3 land together with deliverable 4 — a batched reader without the
comment that records why is one careless "simplification" away from the same defect, which is exactly
what this ticket exists to prevent.

## Acceptance checklist (classified)

Every `[machine]` item is reproducible offline. In this environment each command runs with
`C:\Users\HoraceHou\AppData\Local\node-24.18.0` prepended to `PATH` and `node -v` confirmed to print
`v24.18.0` **before** the command — a red suite under Node 22.11.0 is an environment fault, not a
result (CLAUDE.md).

- [ ] `[machine]` **The failure is gone under the parallel run — the point of the ticket.**
      `corepack pnpm test` (the full 8-project workspace suite) is **green** on this ticket's branch,
      and the reported duration of `stores every generated file as LF in the committed blob` is
      recorded in the PR. Baseline to beat: `5145ms` / `Error: Test timed out in 5000ms.` on `main`
      (Background — Measurement).
- [ ] `[machine]` **One process, not thirteen.** The LF check causes exactly **one** `git` child
      process. Demonstrated by the Builder, and the evidence recorded in the PR (e.g. an instrumented
      count of `spawnSync` invocations during the test, or a `--trace` style count); *"it is faster
      now"* is not evidence of this item (deliverable 1).
- [ ] `[machine]` **The assertion still fails on a real CRLF commit — demonstrated, not asserted.** On
      a scratch branch off this ticket's branch, one generated file is committed with CRLF bytes and
      the suite is run: `stores every generated file as LF in the committed blob` **fails**, and the
      message **names that exact path**. In this repository the probe needs no file editing — the
      working tree of a generated file is already CRLF under `core.autocrlf=true` (verified:
      `git -c core.autocrlf=false hash-object packages/contracts/src/events/generated/registry.ts`
      yields `9cfb10b…`, against the committed `d17870f…`), so
      `git -c core.autocrlf=false add <one generated file>` followed by a commit stores CRLF. The PR
      records the failing output verbatim. The scratch branch is never pushed and is deleted
      afterwards (PRD §20.1; sub-PRD D29).
- [ ] `[machine]` **Byte-identity with the mechanism it replaces.** For all 13 paths,
      `committedBlobs` returns bytes byte-identical to `git show HEAD:<path>` — a **one-off**
      measurement recorded in the PR, deliberately **not** added as a standing test, since re-running
      13 `git show` calls in the suite would reinstate the defect (deliverable 1).
- [ ] `[machine]` **Fail-loud, not fail-open.** With git forced to fail (for example a `cwd` that is
      not a repository, or a deliberately corrupted request), `committedBlobs` **throws** naming the
      offending request; it does not return an all-`null` map. Demonstrated by the Builder and
      recorded; not left as a permanent test if doing so requires touching anything outside the
      file-scope (deliverable 1).
- [ ] `[machine]` **Both controls pass and are live.** The protocol control returns
      `Buffer`/`null` for the committed/fabricated paths in one call with matching cardinality; the
      CR-detection control reports `true` for a synthetic CR `Buffer`. Temporarily inverting each
      control's expectation makes the suite fail (deliverable 5).
- [ ] `[machine]` **No weakening.** Neither file contains `.skip`, `.todo`, `.fails`, `.concurrent`, a
      path allow-list, a sampled or truncated path set, or a normalising read in the LF path;
      `packages/contracts` still has **no** `vitest.config.*`; no `testTimeout` appears at project,
      file, `describe` or suite level; the package's `test` script is still exactly `vitest run`; the
      `describe`/`it` names, the assertion message, the `null` skip and the
      `checked === 0 || checked === emitted.size` closing assertion are all unchanged; the LF check's
      git access is **inside** the test body, not at module scope or in `beforeAll` (Non-goals;
      deliverables 2, 3).
- [ ] `[machine]` **`support/load.ts`'s existing surface is intact.** Every export present on `main`
      is still exported with the same name, signature and semantics — `committedBlob` in particular —
      and the six sibling event suites (`baseline`, `denylist`, `fixtures`, `hmac`, `schemas`, `sign`)
      are green and unedited (deliverable 1; Serial-safety analysis).
- [ ] `[machine]` **Anti-regression comment present**, naming `FND-14`, the one-process rule, the
      measured numbers, the parallel-run lesson and PRD §20.1 / sub-PRD D29 (deliverable 4).
- [ ] `[machine]` **The diff is two files.** `git diff --name-only main...HEAD` on this ticket's branch
      lists exactly `packages/contracts/test/events/support/load.ts` and
      `packages/contracts/test/events/generated.test.ts`. In particular
      `packages/contracts/package.json`, `packages/contracts/src/**`,
      `packages/contracts/test/generated/working-tree.test.ts`, `tools/**` and `.gitattributes` are
      absent from it (File-scope).
- [ ] `[machine]` **Green on the merge result, not only on the branch.** After the branch is merged
      locally onto `main` in a scratch worktree, `corepack pnpm test` is green — the exact gate
      `deliver-ticket.mjs` runs, and the condition this ticket exists to restore.
- [ ] `[machine]` `corepack pnpm lint` and `corepack pnpm typecheck` green (PRD §20.3).
- [ ] `[machine]` `packages/contracts` alone stays green: `26` test files and `492`+ tests pass
      (Background — Measurement; the new controls may raise the test count, never lower it).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**DEV-001**, `E02-CONTRACTS`;
      guarding `FND-05`'s acceptance item 11 under **MON-004**), user-visible change (**none** — a
      test-only repair) and non-goals, schema/API/event compatibility impact (**none** — no schema,
      document or generated artifact changes), tenant/PII/security impact (**none** — the code reads
      committed git blobs and no data path; the one new input-validation rule is the `\n`/`\r` path
      rejection in deliverable 1), source/licence impact (**none** — no dependency added),
      cost/memory/latency impact (CI and local test time **decrease**; the single `cat-file` stream is
      bounded by `maxBuffer`), rollback path (revert the two-file commit — which restores the defect
      and re-reds every future delivery's DoD gate, so the rollback note must say so), known gaps (the
      two accepted caveats in Background: this still shells out to git, and the same per-file pattern
      survives in `test/generated/working-tree.test.ts` and `tools/tests/line-endings.test.mjs`).

**Absent classes.** No `[fixture]` criteria: nothing recorded is replayed — the controls are a synthetic
`Buffer` and a fabricated path string, and the plan's `[fixture]` class (PRD §40.8 adapter fixtures,
PRD §14/§43 evaluation replays) does not exist before modules `05` and `21`. No `[human]` criteria: the
change is test infrastructure with a fully mechanical acceptance surface, produces no customer-visible
behaviour, and no PRD §41.2 `UAT-*` script applies — nothing is carried to the Gate 2 smoke test.

## Test plan

Reviewer steps. All steps are offline; no network, no mocks, no recorded fixtures. Every shell prepends
`C:\Users\HoraceHou\AppData\Local\node-24.18.0` to `PATH` and confirms `node -v` prints `v24.18.0`
first — a failure observed under Node 22.11.0 is an environment fault and proves nothing (CLAUDE.md).
Harness: vitest 4.1.10, the framework `FND-01` registered — `corepack pnpm test` for the workspace
suite and `node ../../node_modules/vitest/vitest.mjs run` inside `packages/contracts` for the package
suite. Step 4 creates one local scratch branch; it is never pushed and is deleted afterwards.

1. **Read the assertion, not the plumbing.** Open the LF check and confirm, line by line, that the
   `describe`/`it` names, the assertion message, the `null` skip, the closing
   `checked === 0 || checked === emitted.size` and the `emitted.keys()` path set are the same strings
   and the same logic as on `main`. Any change to *what* is asserted is a defect against the Goal, not
   an improvement.
2. **Hunt for the shortcut.** Grep both files for `skip`, `todo`, `fails`, `concurrent`, `timeout`,
   `slice`, `filter`, `beforeAll`. `timeout` may appear only as deliverable 3's per-`it` argument and
   in comments; a `describe`-level or suite-level timeout, a `vitest.config.*` in the package, or a
   `--testTimeout` in the package script is a rejected outcome (Non-goals). Confirm the git call sits
   in the test body, not at module scope.
3. **Count the processes.** Instrument or trace one run of the LF check and confirm exactly one `git`
   child process. Then confirm the reader is genuinely batched by reading it: one `spawnSync`, request
   lines built from the whole path list, response parsed by declared byte size.
4. **The CRLF probe — the binding demonstration.** From this ticket's branch,
   `git switch -c zz-probe-crlf`, then
   `git -c core.autocrlf=false add packages/contracts/src/events/generated/registry.ts` and commit.
   (No editing is needed: under `core.autocrlf=true` the working-tree file is already CRLF, and
   `git ls-files --eol` reports `i/lf w/crlf` for it.) Run the package suite: the LF check must
   **fail**, naming `src/events/generated/registry.ts`. Note that the sibling
   `reports no difference in either direction` test still passes, because `diskImage()` normalises —
   which is precisely why this check has to read the committed blob. Then `git switch -` and
   `git branch -D zz-probe-crlf`; confirm `git status --porcelain` is clean and
   `git rev-parse HEAD:packages/contracts/src/events/generated/registry.ts` is back to `d17870f…`.
5. **Negative test — the parser's two branches.** Temporarily point the protocol control's "committed"
   path at a fabricated path and re-run: it must fail. Temporarily point its "missing" path at a real
   committed file and re-run: it must fail. Restore.
6. **Negative test — fail-loud.** Force git to fail for one run (e.g. temporarily set the reader's
   `cwd` to a non-repository directory) and confirm the reader **throws** rather than returning an
   all-`null` map that the caller would read as a pass. Restore.
7. **Sibling suites and the package.** Run `packages/contracts` alone: `26` files, `492`+ tests, green,
   in roughly the `main` duration (~3.9 s). The six other event suites must be untouched in the diff.
8. **The real gate.** Run the full `corepack pnpm test` at least twice, once while the machine is
   otherwise loaded, and record the LF check's duration both times. Then merge the branch onto `main`
   in a scratch worktree and run it once more — this is the exact command `deliver-ticket.mjs` runs and
   the only run that proves the ticket's purpose.
9. **Scope and green.** `git diff --name-only main...HEAD` lists exactly two files; `corepack pnpm
   lint` and `corepack pnpm typecheck` are green.

## Feedback obligation

**General rule.** If implementation falsifies anything in this ticket, update **this ticket** (and
`docs/prd/00-foundation/README.md` where the decision is recorded) **first** — version +0.1 with a
changelog line — then change code, then re-publish the issue from the ticket
(`publish-tickets.mjs --sync`). Silent divergence is an incomplete ticket. Spec is never patched into an
implementation plan, into code, or by hand-editing the issue (CLAUDE.md, issue #53).

**Foreseeable frictions, each with its writeback target:**

1. **Batching is not enough — the single-spawn version still times out at 30 s.** That would mean the
   cost is not process spawning, falsifying the Background measurement. Do **not** raise the timeout
   again and do **not** reduce the path set. Record the new measurement (command, load, observed
   duration) in **this ticket** and in **`docs/prd/00-foundation/README.md`**, and stop: a check whose
   cost is not understood cannot be given a number that means anything.
2. **`git cat-file --batch` behaves differently than Background records** — a different `missing` line
   shape, a different header, or `HEAD:<path>` unsupported on some git build. Record the exact observed
   bytes in this ticket, then adapt the parser **within** deliverable 1's constraints (one process,
   size-delimited content, fail loudly). Falling back to per-file `git show` is a **rejected outcome**;
   if no single-process form works, that is escalation territory, not a quiet revert.
3. **The same per-file pattern is found failing in another file** — most plausibly
   `packages/contracts/test/generated/working-tree.test.ts` (5 spawns, `FND-04`'s) or
   `tools/tests/line-endings.test.mjs` (`FND-01`'s, and `tools/**` is outside this file-scope). → Do
   **not** widen this repair. Record the measurement (file, test name, observed duration, run mode) in
   this ticket and in **`docs/prd/00-foundation/README.md`**, and raise it with the **Architect** as a
   separate `00-foundation` ticket. Every future delivery is waiting on this one; widening its blast
   radius costs more than the second repair does.
4. **The repair cannot be contained in these two files** — for example the reader must move somewhere
   `packages/domain` can also use it, or a `vitest.config.*` turns out to be genuinely required. → Both
   are outside this File-scope. Update **this ticket's File-scope and deliverables** (version +0.1,
   changelog line, `--sync`) **before** touching them, and state the serial-safety consequence
   explicitly: `support/load.ts` is imported by six sibling suites in the same package.
5. **A generated path is found containing a character that breaks the request protocol.** → The
   deliverable-1 guard fires and the reader throws, which is correct. Record the path in this ticket
   and raise the emitter's naming rule with the **Architect** (`packages/contracts/src/events/codegen/**`
   is `FND-05`'s); do not work around it by escaping paths into the batch protocol, which
   `git cat-file --batch` does not define.

**Escalation.** If the LF property cannot be checked within a per-test budget that survives the parallel
workspace run without either weakening the assertion or reading something other than the committed
blob, then the *placement* of the check is what is wrong, not this ticket: the index-side guarantee
would belong in a CI job or a pre-merge script rather than inside a package's unit suite. Stop, escalate
to the human, and raise it with the **Architect**. **ADR candidate (raised here, not authored here —
this ticket writes nothing under `docs/adr/`):** *where the committed-line-ending guarantee is enforced,
and whether `.gitattributes` should be allocated and set to `* text=auto eol=lf`* — the standing
escalation from sub-PRD v0.8 / **D29**, which would remove the need for every generated-file test in the
repository to read committed blobs at all. Owner: **Architect**; natural trigger: the next module that
commits generated files, or a second timeout of this class. **Never** resolve any of this by deleting,
skipping, sampling or narrowing the LF assertion so the suite goes green — the delivery gate this
repair restores is only worth restoring if it still means something.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-10 | Initial ticket. Repairs the committed-blob reader behind `packages/contracts/test/events/generated.test.ts`'s LF check, which spawns one `git show` process per generated file (13) via `committedBlob` in `test/events/support/load.ts`. Measured on `main` at Node 24.18.0: 610 ms idle, 2102 ms under a 20-way CPU burn, and `5145ms` — `Error: Test timed out in 5000ms.` — as the single failure of the 8-project parallel `pnpm test`, while `packages/contracts` alone is green (26 files, 492 tests, 3.91 s). One `git cat-file --batch` covers the same 13 paths in 70 ms idle / 200 ms loaded. Because `deliver-ticket.mjs` re-runs the full suite on the merged default branch as its Definition-of-Done gate, this timeout makes `dodPassed` false on every future delivery regardless of the delivered ticket's correctness (already observed on `FND-06`). The assertion itself is unchanged: every generated file's committed blob still contains no CR, and the Builder must demonstrate the check still fails on a real CRLF commit. |
