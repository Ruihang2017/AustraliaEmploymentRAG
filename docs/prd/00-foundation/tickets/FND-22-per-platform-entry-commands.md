---
id: FND-22
title: Make every PRD 45.3 entry command executable on ubuntu and Windows
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-15
blocked_by: [FND-01, FND-20]
blocks: []
---

# FND-22 — Make every PRD 45.3 entry command executable on ubuntu and Windows

Implements PRD-02 requirement **DEV-006** (failure class 1), against PRD §45.3 (the fourteen target
local commands, normative) and `FND-01` v1.1 / sub-PRD decision **D18** (the one authorised
deviation). No ADR — §45.3's command list is normative and D18 already fixes how a deviation is
recorded; this ticket generalises that recorded-deviation mechanism from one axis (an appended
argument) to two (an appended argument **and** a platform-specific interpreter), which is a schema
change with a recorded basis, not a new decision about what the commands are.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
(created `tools/fixtures/entry-commands.json`, `tools/check-workspace.mjs`, `tools/tests/entry-commands.test.mjs`,
`tools/tests/readme.test.mjs` and `README.md`; delivered and merged) and
[FND-20 — Gate delivery on required checks](FND-20-gate-delivery-on-required-checks.md) (phase-2
**D-CI7**: until it lands, every ticket in this phase is reported NOT delivered).
**Why `builder`:** a bounded schema change to one committed fixture and its two consumers, against a
rule already fixed by PRD §45.3 and D18 — no new subsystem, no product surface.

## Background + basis

### The measured defect

`docs/PRD-02-ci-repair.md` §1:

> | 1 | `/bin/sh: 1: powershell: not found` (exit 127) on ubuntu | `tools/fixtures/entry-commands.json:19,21` — ubuntu runners carry `pwsh`, not `powershell` |

PRD §45.3 entry command 2 is, verbatim:

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1
```

Two places execute it, both on every CI run:

1. `tools/tests/entry-commands.test.mjs` — *"runs the PRD validation entry command for real and exits 0
   (acceptance item 2)"* — `spawnSync(entry.run ?? entry.command, { shell: true })`, asserting
   `status === 0` and `stdout` containing `PASS`. This test runs inside `pnpm test`, i.e. inside the
   `TypeScript type/unit tests` job, **on `ubuntu-latest`**.
2. `tools/check-workspace.mjs`'s `runEntryCommands()` sweep, same invocation shape.

`powershell` is the Windows PowerShell 5.1 executable and does not exist on a Linux runner; PowerShell
7 is present there as **`pwsh`**. So the command exits 127 on ubuntu and 0 on the developer's Windows
machine — the exact "local green and CI green have no causal relationship" shape PRD-02 §1 names as
the root cause of the whole class.

### Why this is a schema change, not a fixture edit — settled, do not re-derive

`docs/PRD-02-ci-repair.md` §4:

> **The entry-command deviation is schema-bound.** `tools/tests/entry-commands.test.mjs` asserts
> exactly one authorised deviation (FND-01 v1.1 / D18) and that
> `run === command + ' ' + deviation.argument`. Per-platform execution is a schema change with a
> recorded basis, not a fixture edit. `command` must remain the verbatim §45.3 string.

The three constraints that close off every cheap fix, verified against `main` @ `0b19067`:

- **`command` is asserted byte-identical to the PRD.** `entry-commands.test.mjs` re-reads
  `docs/PRD.md`, extracts the `### 45.3 Target local commands` fenced block, asserts it has fourteen
  lines and that `fixture.commands.map(e => e.command)` equals them exactly. Editing `command` to say
  `pwsh` fails that test, and `docs/PRD.md` is **frozen** (`breakdown-plan.md` §4).
- **`run` is asserted to be `command + ' ' + deviation.argument`**, for exactly one deviating entry,
  with `deviation.reason` mentioning `docs/PRD.md`, `deviation.authorisedBy` mentioning both
  `FND-01 v1.1` and `D18`, and `deviation.durableFix` non-empty. A `run` that swaps the interpreter
  fails that equality.
- **A failure waiver is forbidden and asserted absent** at any nesting depth
  (`known_failing`, `expectedFailure`, `allow_failure`, `xfail`, …). `FND-01` v1.0 shipped exactly that
  mask and was bounced for it; `readme.test.mjs` carries the same guard (*"claims no green entry
  command that the fixture records as failing"*). **A command that cannot exit 0 on a supported
  platform is a red acceptance item, not an annotation** — PRD-02 §2 DEV-006 says so in the same words.

So the resolution must (a) keep `command` verbatim, (b) keep `run` exactly `command + ' ' +
deviation.argument`, and (c) add a *second*, separately-recorded axis for the interpreter. That is the
schema change deliverable 1 specifies.

### Why `run` must survive unchanged — a cross-file constraint that is easy to miss

`tools/tests/readme.test.mjs` asserts *"shows `tools/validate-prd.ps1` both as PRD 45.3 spells it and
as it is actually invoked"*:

```js
expect(text).toContain(entry.command);
expect(text, 'README does not show the -Path docs/PRD.md invocation').toContain(entry.run);
```

If `run` is replaced by a per-platform map, `entry.run` becomes `undefined` and that assertion throws.
Keeping `run` as the **default (Windows) invocation** and layering platform overrides beside it keeps
`README.md` and this assertion valid, and keeps the diff honest: the normative string and the
documented invocation are unchanged; what is added is one recorded platform substitution.

### Is `pwsh` actually there?

`pwsh` (PowerShell 7) is preinstalled on GitHub's `ubuntu-latest` images, and
`tools/validate-prd.ps1` is portable to it as written — it uses `param`, `Join-Path`,
`Split-Path $PSScriptRoot`, `Get-Content -Raw -Encoding UTF8`, `Select-String -LiteralPath` and
`[regex]`, with no Windows-only cmdlet, no COM, no registry access and no backslash path literal. The
script is **frozen** (`breakdown-plan.md` §4, "the two pre-existing `tools/*.ps1`") and this ticket
does not touch it. **This assumption is load-bearing and must be verified by running it, not asserted**
— acceptance item 2. If a future runner image drops `pwsh`, the durable fix moves to the PRD §45.3
text or to unfreezing the script; both are outside any Builder's scope, and both are already the
standing escalation D18 raised. Recorded as **Q-CI-D** (phase-2 plan §7), owner Architect/Founder.

### Accepted caveats, carried forward

- **Only entry 2 needs a platform substitution.** The other thirteen commands are `corepack`, `pnpm`,
  `cargo` and `uv` invocations that resolve identically on both platforms. The schema must therefore
  make a substitution *exceptional and declared*, exactly as D18 made the argument exceptional and
  declared — not a per-platform table every entry carries.
- **`FND-01`'s D18 deviation stays exactly as it is.** The `-Path docs/PRD.md` argument, its reason,
  its `authorisedBy` and its `durableFix` are untouched; the two escalations D18 raised remain open and
  are not resolved here.
- **This ticket does not make the `ts-type-unit` context green by itself.** That job also runs
  `node --test .github/workflows/checks/workflows.test.mjs`, which is red on the pre-existing 65
  secret-scan findings (`FND-24`'s), and its `pnpm test` step also needs `FND-21`'s base ref. All three
  are wave-2 siblings; none is `blocked_by` another.

## Goal

Make all fourteen PRD §45.3 entry commands exit 0 on **both** `ubuntu-latest` and this repository's
Windows workstation, by generalising the fixture's recorded-deviation schema to carry a declared,
justified per-platform interpreter substitution for the one command that needs one, and by teaching
both consumers — the test that executes it and `tools/check-workspace.mjs`'s sweep — to select the
right invocation for the platform they are running on. The verbatim §45.3 string stays verbatim, the
single authorised argument deviation stays exactly one, no failure waiver appears anywhere, and
`README.md` continues to show both the normative string and the invocation actually used. Completion is
mechanically checkable: `pnpm test` is green on ubuntu in CI **and** on Windows locally, with the same
fixture.

## Non-goals

- **No change to `docs/PRD.md` §45.3, and no change to any `command` value.** Frozen
  (`breakdown-plan.md` §4); the fourteen strings stay byte-identical and the transcription test's
  fourteen-line assertion still passes.
- **No change to `tools/validate-prd.ps1`.** Frozen (`breakdown-plan.md` §4, "the two pre-existing
  `tools/*.ps1`"). If it turns out not to run under `pwsh`, that is an escalation (Feedback
  obligation 1), not licence to edit it.
- **No failure waiver, in any spelling, at any nesting depth.** `known_failing`, `expected_failure`,
  `allow_failure`, `xfail`, `skip`, a `platforms: { linux: null }` "not supported here" marker, or a
  consumer that skips an entry when its interpreter is missing — all are **rejected outcomes**, not
  shortcuts. This is the exact mask `FND-01` v1.0 was bounced for; PRD-02 §2 DEV-006 restates it.
- **No fifteenth command, and none removed.** PRD §45.3 is normative: a command is never deleted from
  the list, only implemented (`tools/fixtures/script-owners.json` says so). `pnpm ci:local` is
  `FND-23`'s and is **not** a §45.3 entry command.
- **No change to root `package.json`, `tools/workspace-script.mjs`,
  `tools/fixtures/script-owners.json` or `tools/tests/scripts.test.mjs`** — `FND-23`'s (phase-2 plan
  §3).
- **No change to `.github/workflows/**`** — `FND-21`'s (`ci.yml`) and `FND-24`'s (`checks/**`). In
  particular, **do not** add a `pwsh`-install step or a `shell:` key to a workflow to work around a
  missing interpreter; that would be both a scope violation and a platform assumption moved rather than
  removed.
- **No change to the other four `tools/fixtures/*.json`, to `tools/workspace-assertions.mjs`, or to any
  `tools/tests/*.test.mjs` other than the two in File-scope** — `FND-01`'s, and `FND-20`'s/`FND-24`'s
  this phase.
- **No product code.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket:

- `tools/fixtures/entry-commands.json` — the schema change and the one platform record.
- `tools/tests/entry-commands.test.mjs` — the assertions that pin the new schema.
- `tools/check-workspace.mjs` — the sweep's invocation selection.
- `tools/tests/readme.test.mjs` — only if the README rows below require it; see deliverable 5.
- `README.md` — the §4 entry-command table's row for command 2.

Does not touch:

- `tools/validate-prd.ps1`, `tools/export-visible-transcript.ps1`, `docs/PRD.md`, `docs/discovery/**`,
  `docs/archive/**`, `templates/**`, `CLAUDE.md`, `.claude/**` (other than `FND-20`'s carve-out),
  `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`, `.gitattributes` — frozen or
  unallocated (`breakdown-plan.md` §4; Q-F6).
- `.github/workflows/**` — `FND-02`, `FND-21`, `FND-24`.
- `.claude/scripts/deliver-ticket.mjs`, `tools/tests/frozen-paths.test.mjs`,
  `tools/tests/deliver-ticket.test.mjs`, `tools/tests/support/**` — `FND-20`.
- root `package.json`, `pnpm-lock.yaml`, `tools/{ci-local,workspace-script}.mjs`,
  `tools/fixtures/script-owners.json`, `tools/tests/{scripts,ci-local}.test.mjs` — `FND-23`.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` — `FND-24`.
- `tools/workspace-assertions.mjs`, `tools/tests/{layout,line-endings,pins,skeleton}.test.mjs`,
  `tools/fixtures/{prd-20-1-layout,toolchain-pins}.json`, `tools/vitest.config.mjs` — `FND-01`;
  read-only here.
- every product tree — other modules; PRD-02 §3.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.

**Frozen-path note.** `tools/**` is **not** frozen: `breakdown-plan.md` §4 allocates it to
`00-foundation`, and only the two pre-existing `tools/*.ps1` inside it are frozen. Writing the four
`tools/**` paths above and `README.md` is inside this module's allocation and passes
`tools/tests/frozen-paths.test.mjs` (which lists `README.md` and `tools/check-workspace.mjs` among its
`ALLOWED_CONTROL` vectors, with `00-foundation` named as owner).

**Serial-safety analysis.** `tools/fixtures/entry-commands.json`, `tools/tests/entry-commands.test.mjs`,
`tools/check-workspace.mjs`, `tools/tests/readme.test.mjs` and `README.md` were last written by
`FND-01` (delivered, merged; `check-workspace.mjs` unchanged since). No other phase-2 ticket declares
any of them (phase-2 plan §3), and the near-collision with `FND-23` over `README.md` is resolved
explicitly there: `FND-23` documents `pnpm ci:local` in `script-owners.json` and the script header, not
in `README.md`. `tools/tests/secret-scan.test.mjs` asserts this fixture's **path** appears in the
scanned inventory — that assertion is `FND-24`'s file and is unaffected by a content change here.

**Merge safety under the protection that is already live.** None of the six required contexts runs
`pnpm test`, `pnpm lint` or the workspace sweep: they are `API/OpenAPI compatibility`,
`Migration and tenant-schema validation`, `Tenant isolation, auth and permission tests`,
`PII and citation validation suites`, `Rust builds/tests` and `Retrieval/evaluation smoke set`. This
ticket writes only `tools/**` and `README.md` and cannot turn any of them red. **Verify rather than
assume** — acceptance item 9.

## Deliverables

1. **A per-platform interpreter substitution in `tools/fixtures/entry-commands.json`, declared and
   justified, on exactly one entry.** Beside the existing `command` / `run` / `deviation` keys of entry
   2, add a `platforms` object keyed by `process.platform` values, each value carrying at minimum:

   | Field | Meaning |
   |---|---|
   | `interpreter` | the replacement for the **leading token** of `command` — and only the leading token |
   | `run` | the full invocation for that platform: `interpreter` + the rest of `command` + `' ' + deviation.argument` |
   | `reason` | why the normative token cannot execute there, in one sentence, naming the observed failure (`/bin/sh: 1: powershell: not found`, exit 127) |
   | `authorisedBy` | `FND-22` and PRD-02 §2 **DEV-006** |
   | `durableFix` | the standing escalation: PRD §45.3's text, or unfreezing `tools/validate-prd.ps1` — both outside a Builder's scope (D18, phase-2 plan **Q-CI-D**) |

   The only entry that carries `platforms` is command 2, and the only platform recorded is the Linux
   one (`linux`, with `interpreter: "pwsh"`). Every other entry, and the Windows default, is unchanged.
   The file's top-level `$comment` array gains a paragraph stating the two-axis rule in substance: the
   `command` string is always verbatim PRD §45.3; `run` is always `command + ' ' + deviation.argument`;
   a `platforms` entry may substitute **only the leading interpreter token** and must carry a reason, an
   authorisation and a durable fix; and **no entry may carry a failure waiver on any platform** — a
   command that cannot exit 0 on a supported platform is a red acceptance item and an escalation.

2. **One resolver, used by both consumers.** Export a single pure function from
   `tools/check-workspace.mjs` — `resolveInvocation(entry, platform)` — that returns
   `entry.platforms?.[platform]?.run ?? entry.run ?? entry.command`, and use it in `runEntryCommands()`
   in place of the current `entry.run ?? entry.command`. `tools/tests/entry-commands.test.mjs` imports
   the same function for its real-execution test. **Two copies of this selection rule is the defect
   this ticket is repairing, one level up**; one function, imported twice.

3. **The schema assertions in `tools/tests/entry-commands.test.mjs`**, all of which must be able to
   fail. Keep every existing test, and add:

   - **exactly one entry carries `platforms`**, and it is the `validate-prd.ps1` entry — the same
     "exactly one authorised deviation" discipline D18 established, applied to the new axis;
   - **the substitution is leading-token-only**: for every platform record, `p.run` equals
     `p.interpreter + command.slice(command.indexOf(' ')) + ' ' + deviation.argument`, so a platform
     record cannot smuggle in extra arguments or a different script path;
   - **`run` is untouched**: the existing `run === command + ' ' + deviation.argument` assertion stays,
     unmodified, and applies to the Windows default;
   - **every platform record carries a non-empty `reason`, `authorisedBy` (containing `FND-22` and
     `DEV-006`) and `durableFix`**;
   - **the waiver ban extends to platform records**: the existing waiver-field loop and the raw-text
     scan cover `platforms` too (the raw-text scan already does, by construction — assert it
     deliberately rather than relying on it);
   - **the real-execution test runs the invocation for the *current* platform** via
     `resolveInvocation(entry, process.platform)`, still asserting exit 0 and `PASS` in stdout. This is
     the assertion that was failing on ubuntu and is the ticket's primary acceptance evidence.

4. **`tools/check-workspace.mjs`'s report names the platform substitution.** Where the sweep already
   prints `^ deviates from the verbatim PRD 45.3 string: <argument>` and the authorisation, it must
   also print the interpreter substitution and its authorisation when one applied — so a human reading
   the sweep output on either platform sees exactly what ran and under whose authority.

5. **`README.md` shows the ubuntu invocation too.** The §4 entry-command table's row for command 2
   already shows the normative string and the `-Path docs/PRD.md` invocation; it gains the `pwsh` form
   with a one-line reason. **`entry.command` and `entry.run` must both still appear verbatim in the
   README** so `tools/tests/readme.test.mjs`'s existing assertions stay green *unmodified*; that file
   is in this ticket's scope only so a needed assertion (for example, that the platform form is shown
   too) can be added deliberately, not so an existing one can be relaxed. Relaxing or deleting an
   existing README assertion is a **rejected outcome**.

6. **No other change.** The other thirteen entries, the `owner` keys, the `description` strings, the
   `deviation` block's four fields and the file's existing two-space formatting are otherwise
   untouched.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md). A red suite under Node 22.11.0 is
an environment fault, not a regression.

- [ ] `[machine]` **The reported defect is gone, on the platform that had it.** On this ticket's pull
      request, the `TypeScript type/unit tests` job's `pnpm test` step shows
      *"runs the PRD validation entry command for real and exits 0"* **green on ubuntu**, and the log
      contains no `powershell: not found` and no `exit 127`. Before and after logs are quoted in the PR.
- [ ] `[machine]` **The frozen script really runs under `pwsh` on Linux** — demonstrated, not assumed.
      The CI log shows the validator's `Result : PASS` line from the ubuntu run (Background, "Is `pwsh`
      actually there?").
- [ ] `[machine]` **Windows is unregressed.** Locally on this workstation, `pnpm test` is green and
      `node tools/check-workspace.mjs` runs command 2 via the **Windows** default (`powershell … -Path
      docs/PRD.md`), exiting 0. The sweep's printed invocation is pasted into the PR for both platforms.
- [ ] `[machine]` **The normative strings are untouched.** `git diff main...HEAD -- docs/PRD.md` is
      empty; the fourteen `command` values are byte-identical to `main`; the transcription test's
      fourteen-line assertion passes (Non-goals).
- [ ] `[machine]` **Exactly one deviation and exactly one platform record.** The assertions in
      deliverable 3 pass, and `deviating.map(e => e.command)` still equals the single
      `validate-prd.ps1` string (Background).
- [ ] `[machine]` **No waiver, anywhere.** The waiver-field loop and the raw-text scan pass, including
      over the new `platforms` object; `README.md` still contains no `known failing` (deliverable 3;
      `readme.test.mjs`).
- [ ] `[machine]` **The substitution is leading-token-only — demonstrated.** Temporarily change the
      platform record's `run` to append an extra argument and confirm the suite **fails**; restore.
      Then temporarily point `interpreter` at a non-existent binary and confirm the real-execution test
      **fails** on that platform. Both failure messages are quoted in the PR. Without these, a platform
      record could silently run something else entirely.
- [ ] `[machine]` **One resolver, not two.** `tools/check-workspace.mjs` exports
      `resolveInvocation` and `tools/tests/entry-commands.test.mjs` imports it; neither file contains a
      second `entry.run ?? entry.command` expression (deliverable 2).
- [ ] `[machine]` **The branch is mergeable under the live protection.** All six currently-required
      contexts are green on this pull request; names and conclusions pasted into the PR (File-scope).
- [ ] `[machine]` **Scope.** `git diff --name-only main...HEAD` lists only the File-scope paths, and
      `tools/validate-prd.ps1` is absent from the diff.
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green; `node
      tools/check-workspace.mjs --no-sweep` exits 0.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`DEV-006`), user-visible change
      (**none** — repository tooling), non-goals, schema/API/event compatibility (**none** — the changed
      schema is a repository fixture, not a product contract), tenant/PII/security impact (**none** — no
      credential is read; `validate-prd.ps1` reads one markdown file), source/licence impact (**none** —
      no dependency added; `pwsh` is preinstalled on the runner), cost/latency impact (none), rollback
      path (revert the commit — which restores exit 127 on ubuntu and re-breaks the `TypeScript
      type/unit tests` context, so the rollback note must say so), known gaps (the three Accepted
      caveats, plus Q-CI-D: the `pwsh` availability assumption).

**Absent classes.** No `[fixture]` criteria in the plan's sense — this ticket *edits* a committed
fixture, but the plan's `[fixture]` class is PRD §40.8 adapter fixtures and PRD §14/§43 evaluation
replays. No `[human]` criteria — repository tooling with a fully mechanical acceptance surface and no
customer-visible behaviour; no PRD §41.2 `UAT-*` script applies. No Rust or Python surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0`. Harness: Vitest via `pnpm test` (`vitest run --config tools/vitest.config.mjs`), the
framework `FND-01` registered. The construction pattern to copy is the fixture's own existing
`deviation` block — basis prose beside the data — and `entry-commands.test.mjs`'s three
regression-guard tests, which exist specifically to stop a mask coming back.

1. **Read the fixture for a waiver wearing a new name.** A `platforms` record with no `reason`, a
   `supported: false`, a `null` run, an entry the consumers skip, or any wildcard/`*` platform key is a
   **rejected outcome** (Non-goals), not a style comment.
2. **Read the classification, not just the membership.** Confirm the platform record substitutes only
   the leading token and that the rest of the invocation — including `-File tools/validate-prd.ps1` and
   the D18 `-Path docs/PRD.md` argument — is byte-identical to the Windows form.
3. **Baseline both ways, on both platforms.** On `main`, run the entry-command test on ubuntu (or in a
   Linux container) and observe exit 127; on the ticket branch, observe exit 0 and `PASS`. On Windows,
   confirm `main` and the branch both pass, so the change is additive rather than a swap.
4. **Negative test — the platform record is live.** Temporarily delete the `platforms` object and
   re-run on Linux: the real-execution test must fail with `powershell: not found`. Restore. Then point
   `interpreter` at `pwsh-does-not-exist` and confirm the failure names it. This proves the record is
   what makes the suite green, not some other edit.
5. **Negative test — the leading-token rule is enforced.** Append an argument to the platform `run` and
   confirm the schema assertion fails (deliverable 3, second bullet).
6. **Confirm the PRD side is untouched.** `git diff main...HEAD -- docs/PRD.md` empty; the fourteen
   `command` strings unchanged; `tools/validate-prd.ps1` absent from the diff.
7. **Read the README rows.** Both the normative string and both invocations appear, with the reason for
   each. No existing `readme.test.mjs` assertion has been relaxed or deleted — compare it against
   `main` line by line.
8. **Suite and gates.** `pnpm test` (exit 0, pass count recorded), `pnpm lint`, `pnpm typecheck`,
   `node tools/check-workspace.mjs --no-sweep` green on this branch; the full sweep run at least once
   on Windows; `pnpm test` re-run on `main` after the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Where the falsified item is a phase-2 decision, the writeback target is
`docs/prd/breakdown-plan-02-ci-repair.md` §4 as well, by a docs PR. Never patch spec into a plan, into
code, or by hand-editing the issue (CLAUDE.md, issue #53).

1. **`pwsh` is absent from the runner, or `tools/validate-prd.ps1` does not run under it** (a cmdlet,
   an encoding, a path-separator or a CRLF problem). → Do **not** edit the frozen script, do **not** add
   a `pwsh`-install step to a workflow (`.github/workflows/**` is not this ticket's scope), and do
   **not** annotate the entry as unsupported. Record the exact error here (+0.1, `--sync`), and
   escalate: this is **Q-CI-D** (phase-2 plan §7), owner **Architect/Founder**, whose resolutions are
   the PRD §45.3 text or unfreezing the script — the same two durable fixes D18 already named. A
   command that cannot exit 0 on a supported platform is a red acceptance item, and this ticket stops
   rather than shipping a mask.
2. **A second command turns out to be platform-dependent** — for example `corepack` or `uv` behaves
   differently on the runner. → Establish what it is first (which platform, which exit code, which
   message), record it here (+0.1), and only then add a second `platforms` record, with its own reason
   and authorisation. Also update deliverable 3's "exactly one entry carries `platforms`" assertion in
   the same change, deliberately — that count is a guard, and silently bumping it is how a declared
   exception becomes an undeclared table.
3. **`README.md` must change more than one row**, or an existing `readme.test.mjs` assertion genuinely
   cannot hold. → Stop. Both files are in this ticket's scope, but `README.md`'s entry-command table is
   `FND-01`'s deliverable 8 and its assertions were written to stop a specific regression. Record what
   cannot hold and why here (+0.1) before changing it, and never *delete* an assertion to make a row
   fit.
4. **The resolver cannot be shared** — for example importing `tools/check-workspace.mjs` from a test
   executes its top-level `process.exit(main())`. → That is real: the file runs `main()` at import.
   Record it, and move `resolveInvocation` to a location both consumers can import without side
   effects. `tools/workspace-assertions.mjs` is `FND-01`'s and is **outside this ticket's scope**, so
   the resolver goes in a **new** `tools/entry-command-resolver.mjs` inside this ticket's allocation
   rather than widening the scope; state the choice in the ticket before making it. Two copies of the
   rule remains a rejected outcome either way.
5. **`pnpm test` is still red after the change.** → First re-check `node -v` (CLAUDE.md: the single
   largest source of wasted work in this repo), then check `apps/*/node_modules/<pkg>` for a symlink
   into `.claude/worktrees/` or `.worktrees/` (the lane-worktree poisoning signature; the repair is to
   delete that package's `node_modules` and reinstall — `pnpm install --force` does not fix it). Only
   if both are clean is it a real second defect: on **ubuntu** the remaining red is expected and is not
   this ticket's — `FND-21` (base ref) and `FND-24` (secret scan) own the other two failures in the
   same job.

**Escalation.** If the fourteen §45.3 commands cannot all be made to exit 0 on both platforms without
either editing a frozen file or admitting a waiver, then **PRD §45.3's command list itself carries a
platform assumption** and needs a specification change, not a fixture change. Stop, escalate to the
human, and raise it with the **Architect/Founder** — the same escalation D18 left open, now with a
second piece of evidence. **Never** resolve it by adding a failure annotation, by skipping the entry on
one platform, or by making the executing test conditional on `process.platform`: the whole point of
DEV-006 is that a command that cannot run is visible.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial ticket. Repairs PRD-02 failure class 1: PRD §45.3 entry command 2 begins with `powershell`, which exists only on Windows, so the fixture's real-execution test and `tools/check-workspace.mjs`'s sweep exit 127 on `ubuntu-latest` while passing on the developer's machine — the root-cause shape PRD-02 §1 names. Establishes that this is schema-bound, not a fixture edit: `command` is asserted byte-identical to the frozen PRD, `run` is asserted to equal `command + ' ' + deviation.argument`, failure waivers are forbidden at any nesting depth (the mask `FND-01` v1.0 was bounced for), and `tools/tests/readme.test.mjs` asserts `entry.run` appears verbatim in `README.md` — so the repair adds a **second, separately declared axis** (a leading-token-only interpreter substitution, exactly one record, with reason/authorisation/durable-fix) rather than changing either existing axis. Carries forward D18's two open escalations and adds Q-CI-D, the `pwsh`-availability assumption. |
