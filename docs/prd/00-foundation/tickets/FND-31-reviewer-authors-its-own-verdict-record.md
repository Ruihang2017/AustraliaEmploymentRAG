---
id: FND-31
title: Let the Reviewer author its own verdict record in run-milestone.js instead of the deliver step transcribing it
module: 00-foundation
lane: 00-foundation
size: S
agent: builder
status: draft
date: 2026-08-17
blocked_by: []
blocks: []
---

# FND-31 — Let the Reviewer author its own verdict record in `run-milestone.js` instead of the deliver step transcribing it

Repairs a **pipeline-integrity defect** in `.claude/workflows/run-milestone.js`: the deliver step is
instructed to *write* the Reviewer's verdict record, which CLAUDE.md forbids in terms and which
silently downgrades the durable review trail from the Reviewer's own authored record to a one-field
summary relayed through the orchestrator. Against CLAUDE.md's delivery-pipeline rules (*"The Reviewer
authors its own review record … the deliver step merely points `--verdict-file` at it"*, *"Delivery
verifies that file exists and is non-empty and refuses to run if it does not (it never writes it
itself)"*). No ADR — the rule is already written twice in CLAUDE.md and this ticket makes one runner
obey it. **This is an upstream `agent-templates` defect**, not a repo-local one (see Background).
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is a **twelfth** phase-2 ticket appended to `00-foundation`
under **D-CI2**, continuing the ids past `FND-30`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing, and it **blocks nothing**. `blocks: []` is deliberate: this does **not** block CI
green and **must not be scheduled ahead of `FND-29` or `FND-30`**, which do.
**Why `builder`:** a prompt-string change in one scheduler, ported from a **correct reference
implementation already present in the same directory** (`start-all.js`). No new mechanism, no design
decision, no product surface.

> **NOT SCHEDULABLE UNTIL Q-CI-G IS RESOLVED.** `.claude/workflows/run-milestone.js` is a **frozen
> path** with a live guard that names this exact file, and a branch touching it fails `pnpm test` by
> construction. See Open questions before starting. This is not a caveat discovered late; it is the
> first thing to settle.

## Background + basis

### The reported defect — settled, do not re-diagnose

`.claude/workflows/run-milestone.js`, lines ~265–279 on `main` @ `c9e1706`, builds the deliver step's
prompt so that the **delivery agent** writes the verdict record:

```js
const verdictNote = verdict && verdict.checkedNote ? verdict.checkedNote : 'CLEAR (the reviewer returned no note text)'
const verdictFile = '.claude/tmp/' + t.id + '-verdict.md'
...
'First write the following Reviewer CLEAR verdict text VERBATIM to ' + verdictFile + ' (create the .claude/tmp directory if needed):\n' +
'<<<VERDICT\n' + verdictNote + '\nVERDICT\n' +
```

Its Reviewer prompt (lines ~214–223) correspondingly asks only for a schema return value and instructs
the Reviewer to write **nothing**:

```js
'Review per your role definition; run the tests yourself — no test results are provided on purpose. ' +
'Return verdict CLEAR or BOUNCE with findings (a BOUNCE with zero findings is invalid).'
```

CLAUDE.md says the opposite, twice:

> *"The Reviewer authors its own review record at `.claude/tmp/<ticket-id>-verdict.md` — the one and
> only file it may write — and the deliver step merely points `--verdict-file` at it, so the comment on
> the PR/MR is the Reviewer's own words rather than a transcription. Delivery **verifies that file
> exists and is non-empty and refuses to run if it does not** (it never writes it itself)."*

### The root cause, and what it actually costs

Under `concurrency > 1` the Reviewer runs in an **isolated git worktree**, so a verdict record it
authors lands at `.claude/worktrees/<lane>/.claude/tmp/<id>-verdict.md` and the **main** tree — where
the deliver step runs — never sees it. The transcription in `run-milestone.js` is a workaround for that
path problem, and it is a workaround with a real price: the durable review trail is downgraded from the
Reviewer's own authored record to the short `checkedNote` **summary field** relayed through the
orchestrator's schema.

The measured difference, from `FND-28`: the Reviewer's genuine record was **~10.6 KB** — item-by-item
acceptance checks, verbatim commands with output tails, a disclosed verification gap, and a reasoned
rejection of a Codex-raised BOUNCE claim. `checkedNote` is a summary field. **The comment posted to the
PR is the only durable record of what was actually checked**, and this defect replaces the record with
its abstract, written by a different agent. `FND-28` was ultimately delivered by pointing
`--verdict-file` at the Reviewer's genuine file **in its lane worktree** — which is the behaviour this
ticket makes automatic rather than manual. The defect surfaced because a safety classifier blocked the
delivery step: an agent being told to write an approval it did not author is the shape the classifier
objects to, and it was right to.

### `start-all.js` does NOT carry the same defect — it is the reference implementation

**Checked on 2026-08-17 rather than assumed**, because the two schedulers usually mirror each other.
`.claude/workflows/start-all.js` already implements exactly the required behaviour, and its solution to
the worktree path problem is the one to port:

- **Line ~195–198** — the comment stating the contract:
  `// The Reviewer -- not the delivery step -- authors the review record at this path.`
- **Lines ~243–253** — the Reviewer prompt: *"Then WRITE YOUR OWN REVIEW RECORD to EXACTLY
  `<verdictFile>`"*, plus, when `isolate` is set, the path resolution that solves the worktree problem
  without any transcription:

  > *"resolved against the MAIN repo root, NOT your worktree -- the delivery step reads it from there.
  > Get that root with `git rev-parse --path-format=absolute --git-common-dir` (it prints
  > `<main-repo>/.git`; drop the trailing `/.git`) and write to `<main-repo>/<verdictFile>`."*

  and the standard of content: the verdict, ticket id, the branch and base commit shas actually judged,
  each acceptance item and how it was checked, the test commands really run with real output tails and
  exit codes and `node -v`, every finding, and *"Do not claim a check you did not run"*.
- **Lines ~304–309** — the deliver prompt: *"The independent Reviewer has ALREADY WRITTEN its own review
  record … That file is the reviewer's, not yours: do NOT author it, edit it, reword it, extend it, or
  recreate it if it is absent"*, and *"First VERIFY that `<verdictFile>` exists and is non-empty … If it
  is missing or empty, **STOP immediately**"*, returning `merged/issueClosed/dodPassed = false` with
  `notes = "missing reviewer verdict record at <verdictFile>"`.

So the fix is a **port, not a design**. `run-milestone.js` lags its sibling. The Builder must still
re-check `start-all.js` at build time (deliverable 4) — if it has changed since, the finding is
reported, and if it turns out to carry a variant of the defect **that is a second ticket, not a widened
scope**.

### Two structural blockers the Builder will hit, recorded here so they are not hit blind

1. **`.claude/workflows/run-milestone.js` is a frozen path, and the guard names this exact file.**
   `tools/tests/frozen-paths.test.mjs` carries
   `/^\.claude\/(?!scripts\/deliver-ticket\.mjs$)/` in `FORBIDDEN` — narrowed by **D-CI4** for
   `FND-20`, a **one-file** carve-out — and its `FORBIDDEN_CONTROL` vector list contains, literally:

   ```
   '.claude/workflows/run-milestone.js',   // the D-CI4 carve-out is ONE file: the workflows stay frozen
   ```

   A branch that edits this file therefore **fails `pnpm test`** by construction. That file's own header
   states the escape hatch: *"a ticket that genuinely needs a listed path allocates it to a module's
   write-owns row in breakdown plan §4 by a docs PR FIRST, and only then does the entry leave this list …
   Editing this transcription to escape the rule is the failure mode, not the fix."* `FND-20` took
   exactly this route and had to carry the guard narrowing in the **same branch** as its edit. This is
   **Q-CI-G** and it must be answered before the ticket is scheduled.

2. **Running this ticket *through* `run-milestone.js` or `start-all.js` will fail on config drift.**
   Both runners instruct every Builder stage to run the pipeline config check as its last action and to
   return `configIntact`; `run-milestone.js:150` turns a `false` into
   `status: 'failed', stage: 'config-drift'` with the message that *"the `.claude/**` tree on disk no
   longer matches origin/`<default>`, so this ticket did not necessarily run the agents, scripts and
   hooks it was supposed to"*. A ticket whose entire deliverable is a `.claude/**` edit trips that check
   **by succeeding**. Consequently this ticket is executed through the **standalone stage commands**
   (`/plan-ticket`, `/build-ticket`, `/review-ticket`, then delivery), **not** inside a
   `/start-milestone` or `/start-all` run. Related and milder: agent definitions and workflow files are
   read once per CLI process, so a runner editing itself mid-flight keeps executing the pre-edit copy —
   which is survivable, but only if nobody assumes otherwise.

### This is an upstream defect and must be reported as one

`run-milestone.js` is installed by the `agent-templates` catalog, not authored here. Per this repo's
standing practice — *"a defect in the installed agent-templates pattern gets an upstream issue, not just
a local patch"* — the finding is reported to **`Ruihang2017/agent-templates` issue #205**, alongside the
two already noted there. The local repair does not discharge the upstream report, and the upstream
report does not discharge the local repair: an unreported local patch is silently reverted by the next
`adopt.mjs` sync.

### Accepted caveats, carried forward

- **This changes no CI outcome and blocks nothing.** `blocks: []`. It is scheduled after the two tickets
  that do block CI green.
- **A missing verdict record becomes a hard stop.** That is the intended behaviour and it will, at some
  point, stop a delivery that would previously have proceeded with a transcribed summary. That is the
  fix working.
- **The local edit is at risk from the next catalog sync** until the upstream issue is resolved.

## Goal

Make `.claude/workflows/run-milestone.js` obey CLAUDE.md: the **Reviewer** authors its own review record
at `.claude/tmp/<ticket-id>-verdict.md` — resolved against the **main** repo root even when it runs in a
lane worktree — and the deliver step **verifies** that file exists and is non-empty and **stops** if it
does not, never authoring, editing, rewording or recreating it, and never receiving verdict text through
the orchestrator's prompt. Completion is mechanically checkable: no verdict text is interpolated into
any prompt string in the file; the Reviewer prompt carries the authorship instruction and the
main-root path resolution; the deliver prompt carries the verify-or-stop instruction; `checkedNote` is
no longer a source of verdict-file content; and the diff is one file (plus whatever **Q-CI-G** allocates).

## Non-goals

- **No agent other than the Reviewer may write the verdict file.** Not the deliver agent, not the
  Builder, not the orchestrator, not the runner itself in Node. Rejected outcome — it is the whole
  defect.
- **No verdict text passed through the orchestrator's prompt.** `checkedNote`, `findings` or any other
  schema field must not be interpolated into the deliver prompt as the content of the record. A
  transcription is not a review even when it is accurate. Rejected outcome.
- **No fallback to a synthesised verdict when the file is missing.** No default text, no
  `'CLEAR (the reviewer returned no note text)'`, no "create it if absent". A missing verdict record is
  a **hard failure** per CLAUDE.md: stop, do not run the delivery command, return
  `merged/issueClosed/dodPassed = false`. Rejected outcome.
- **No change to the delivery command itself.** `deliver-ticket.mjs` is `FND-20`'s (D-CI4) and is
  **read-only here**; the `--verdict-file` flag it already accepts is the whole interface. Its own
  non-empty check is not this ticket's to add or move.
- **No change to `start-all.js`.** It is already correct (Background) and is a separate frozen path. If
  the build-time re-check finds a variant defect there, that is a **second ticket** (deliverable 4), not
  a widened scope. Rejected outcome.
- **No change to any other behaviour of `run-milestone.js`:** stage order, bounce cap and the
  `maxBounces` loop, `reviewValid`, `buildBad`, the config-drift check and `configDriftResult`, the
  supervised/autonomous branch, `deliverLock` serialization, the preflight block, exit codes and the
  emitted JSON shape are byte-identical. Only the Reviewer prompt, the deliver prompt and the
  `verdictNote` construction change.
- **No change to `.claude/agents/reviewer.md`** or any other agent definition. The Reviewer's role file
  already grants it exactly one writable file; nothing there needs to move.
- **No relaxation of the frozen-path guard beyond what Q-CI-G allocates**, and **no editing of
  `tools/tests/frozen-paths.test.mjs` to escape the rule** — that file's header names this as *"the
  failure mode, not the fix"*. Rejected outcome.
- **No product code, no CI change, no test weakened.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket — **one file**:

- `.claude/workflows/run-milestone.js` — the Reviewer prompt (~lines 214–223), the deliver prompt
  (~lines 265–285) and the `verdictNote` construction (~line 268). Nothing else in the file.

**Conditional second file, only if Q-CI-G is resolved that way:**

- `tools/tests/frozen-paths.test.mjs` — the `FORBIDDEN` narrowing and its `FORBIDDEN_CONTROL` vector, on
  exactly the footing `FND-20` used. **This is not yet allocated**; it becomes part of the file-scope
  only by a +0.1 amendment to this ticket after the docs decision, and until then editing it is out of
  scope (Non-goals).

Does not touch:

- `.claude/workflows/start-all.js` — already correct, and a separate frozen path (Background).
- `.claude/scripts/deliver-ticket.mjs` — `FND-20`'s D-CI4 carve-out. Read-only here.
- `.claude/agents/**`, `.claude/commands/**`, `.claude/hooks/**`, `.claude/settings.json`, and every
  other `.claude/` path — frozen.
- `.codex/**` — `FND-30`'s this phase; and `.codex/agents/*.toml` are the Codex-side role files, not
  this scheduler.
- `CLAUDE.md` — frozen. It already states the required behaviour; this ticket changes code to match the
  document, never the document to match the code.
- `tools/**` other than the conditional guard file above; `packages/**`, `apps/**`, `pipelines/**`,
  `.github/workflows/**` — other owners.
- `docs/PRD.md`, `docs/adr/**`, `templates/**` — frozen or unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.

**Serial-safety analysis.** `.claude/workflows/run-milestone.js` is written by **no** other ticket in
any phase — it has been frozen since `breakdown-plan.md` §4 was authored, and D-CI4's carve-out is one
file and a different one. `FND-29` and `FND-30`, the other phase-2 tickets in flight, declare
`packages/database/test/tenant/concurrency.test.ts` and the `.codex/scripts` + `context.test.ts` set
respectively; neither contends. If the conditional `tools/tests/frozen-paths.test.mjs` allocation
happens, note that it is `FND-11`'s file, last written by `FND-20` (delivered, merged), and is declared
by no in-flight phase-2 ticket.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. None of them runs `.claude/**`; the only way this diff reaches a CI
job is through `tools/tests/frozen-paths.test.mjs`, which is exactly **Q-CI-G**. **Verify rather than
assume** — acceptance requires all six green on the pull request, by name.

## Deliverables

1. **The Reviewer prompt instructs the Reviewer to author its own record, at a path the deliver step can
   read.** Ported from `start-all.js` (Background): write to **exactly** `.claude/tmp/<id>-verdict.md`;
   when `isolate` is set, resolve that path against the **main** repo root — obtained with
   `git rev-parse --path-format=absolute --git-common-dir`, dropping the trailing `/.git` — and not
   against the lane worktree; and state the content standard, that it is posted verbatim as the PR/MR
   comment, that it must be self-contained and factual (verdict, ticket id, branch and base shas
   actually judged, each acceptance item and how it was checked, the real commands with output tails,
   exit codes and `node -v`, every finding, and an explicit statement of anything skipped or narrowed),
   and that **it is the only file the Reviewer may write**.

2. **The deliver prompt verifies and stops; it never authors.** Ported from `start-all.js`: the record
   is the Reviewer's and must not be authored, edited, reworded, extended or recreated; **first verify**
   it exists and is non-empty; if missing or empty, **stop immediately** — do not run the delivery
   command, do not create the file, return `merged/issueClosed/dodPassed = false` with
   `notes = "missing reviewer verdict record at <verdictFile>"`. The body-composition step reads the
   record and may quote it, and **never changes it**.

3. **The transcription is gone at the source.** The `verdictNote` construction and the `<<<VERDICT …
   VERDICT` block are removed, not merely bypassed, so no future edit can re-enable them by accident. If
   `checkedNote` is still used elsewhere for **logging or the returned status only** — `run-milestone.js`
   returns it in the `awaiting-human-merge` result — that use may stay; what may not is `checkedNote`
   reaching the verdict file. State in the PR which uses survive and why.

4. **A checked, written report on `start-all.js`.** Re-read `.claude/workflows/start-all.js` at build
   time and report in the PR whether it carries this defect, a variant, or none — with the line numbers
   read. The Architect's finding as of 2026-08-17 is that it is **correct and is the reference
   implementation**; the Builder confirms or corrects that. **If it does carry a defect, open a second
   ticket — do not widen this one** (Non-goals).

5. **The upstream report.** An issue on `Ruihang2017/agent-templates` (or a comment on **issue #205**,
   alongside the two defects already noted there) describing the defect, the root cause (worktree path
   resolution), the `start-all.js` reference implementation, and the local repair. Its URL is recorded
   in the PR. **The local patch does not discharge the upstream report** — an unreported local patch is
   silently reverted by the next catalog sync.

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md).

- [ ] `[machine]` **Q-CI-G is resolved and its resolution is recorded in this ticket before any code is
      written.** The Changelog carries the +0.1 entry naming the route taken (docs allocation, or
      upstream-only). Starting the build without it produces a branch that cannot pass `pnpm test`
      (Background). This item is checked first because it is the one that decides whether the rest can
      be met at all.
- [ ] `[machine]` **No agent other than the Reviewer can write the verdict file.**
      `git diff main...HEAD` shows the deliver prompt contains **no** instruction to write, create or
      recreate `<verdictFile>`, and `grep -n "VERDICT" .claude/workflows/run-milestone.js` shows the
      `<<<VERDICT … VERDICT` block is **gone**. Both pasted into the PR (deliverables 2–3).
- [ ] `[machine]` **No verdict text passes through the orchestrator's prompt.** `verdictNote` no longer
      exists as a source of file content, and no schema field (`checkedNote`, `findings`) is
      interpolated into the deliver prompt as the record's text. Any surviving `checkedNote` use is
      named in the PR with its purpose (deliverable 3).
- [ ] `[machine]` **A missing record is a hard failure, with no fallback.** The deliver prompt's
      stop-path is present verbatim in the diff, and there is **no** default string, no
      `'CLEAR (the reviewer returned no note text)'` and no create-if-absent anywhere in the file.
      `grep -n "no note text" .claude/workflows/run-milestone.js` returns nothing; pasted into the PR.
- [ ] `[machine]` **The worktree path problem is solved rather than worked around.** The Reviewer prompt
      carries the `git rev-parse --path-format=absolute --git-common-dir` main-root resolution under
      `isolate`, so the record lands where the deliver step reads it under `concurrency > 1`
      (deliverable 1). Quote the resulting prompt fragment in the PR.
- [ ] `[machine]` **The two prompts match `start-all.js`'s contract.** Paste the two prompt strings from
      each file side by side. Differences are permitted (the files are not identical schedulers) but
      each difference is named and justified in the PR; an *unexplained* divergence between the two
      runners is how this defect arose in the first place.
- [ ] `[machine]` **Nothing else in the runner changed.** `git diff main...HEAD` touches only the
      Reviewer prompt, the deliver prompt and the `verdictNote` construction. Stage order, the bounce
      loop and cap, `reviewValid`, `buildBad`, the config-drift path, the supervised/autonomous branch,
      `deliverLock` and every returned status shape are byte-identical (Non-goals). State this in the
      PR.
- [ ] `[machine]` **The runner still runs.** `node --check .claude/workflows/run-milestone.js` exits 0,
      and the file is loaded/parsed by whatever entry point the repo uses for it without error. A
      prompt-string edit that breaks a template literal is the realistic failure mode here.
- [ ] `[machine]` **`start-all.js` was checked and reported.** The PR states, with line numbers read,
      whether it carries the defect; if it does, the second ticket's id or issue number is recorded and
      **this branch does not touch it** (deliverable 4).
- [ ] `[machine]` **The upstream report exists.** The `Ruihang2017/agent-templates` issue or comment URL
      is in the PR (deliverable 5).
- [ ] `[machine]` **The diff is one file** — `.claude/workflows/run-milestone.js` — plus
      `tools/tests/frozen-paths.test.mjs` **only if** Q-CI-G allocated it, in which case the narrowing
      and its control vector are both present and the guard still bites on every other `.claude/` path
      (re-run `FND-20`'s control vectors).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count in the PR; `pnpm lint` and `pnpm typecheck` green. Note that `pnpm lint` is green
      only after `FND-30` lands and `pnpm test` is reliably green only after `FND-29` lands; if this
      ticket runs before either, say so explicitly rather than reporting their failures as this
      ticket's.
- [ ] `[human]` **The next real delivery posts the Reviewer's own record.** On the first ticket
      delivered through `run-milestone.js` after this lands, a human confirms the PR/MR comment is the
      Reviewer's full authored record — item-by-item checks, real command output — and not a summary
      paragraph. **This is the only item that proves the fix in production**, because every machine item
      above checks the prompt rather than the artifact it produces. Recorded as a follow-up observation
      on the PR, not as a blocker to merging it.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a pipeline-integrity
      repair against CLAUDE.md's delivery rules), user-visible change (**none** — pipeline tooling),
      schema/API/event compatibility (**none**), tenant/PII/security impact (**none** in the product;
      state that the *review trail* is strengthened — the PR comment becomes the Reviewer's own record
      and a missing record now stops delivery), source/licence impact (**none**), cost impact (**none**),
      rollback path (revert the commit — which restores the transcription and the downgraded trail, so
      the rollback note must say so), known gaps (the local patch is at risk from the next
      `agent-templates` sync until the upstream issue is resolved — **state the issue URL**).

**Absent classes.** No `[fixture]` criteria — nothing here is a PRD §40.8 adapter fixture or a §14/§43
evaluation replay. No Rust or Python surface. The one `[human]` item is present deliberately: the
machine items check prompt text, and only a real delivery shows the record that text produces.

## Test plan

Reviewer steps. All offline; no network beyond the upstream issue link. **Step 0 in every shell:**
confirm `node -v` prints `v24.18.0`.

1. **Check Q-CI-G's resolution is recorded in the ticket before reading the diff.** A branch that edits
   a frozen path without the recorded allocation is a BOUNCE regardless of how good the code is — that
   is the whole point of the frozen-path guard, and `tools/tests/frozen-paths.test.mjs`'s own header
   calls editing the transcription to escape the rule *"the failure mode, not the fix."*
2. **Grep for the transcription before anything else.** `VERDICT`, `verdictNote`, `no note text` — all
   gone from the file. If any survives, the defect survives.
3. **Read the deliver prompt for a fallback.** Any default text, any create-if-absent, any "if it is
   missing, write …" is a **rejected outcome** (Non-goals).
4. **Read the Reviewer prompt for the main-root resolution.** Without it the fix is inert under
   `concurrency > 1` — the record lands in the lane worktree and the deliver step stops — which would
   turn a downgraded trail into a blocked delivery. Both are wrong; only the resolved path is right.
5. **Diff the two runners' prompts yourself.** Every difference from `start-all.js` must be explained in
   the PR. Confirm independently that `start-all.js` is unchanged by this branch.
6. **Confirm nothing else moved.** `node --check` passes; stage order, bounce cap, config-drift path and
   returned shapes are byte-identical; `git diff --name-only main...HEAD` is the allocated file set and
   nothing more.
7. **Gates.** `pnpm test`, `pnpm lint`, `pnpm typecheck` on the branch, with `FND-29`/`FND-30`-attributable
   failures identified as such rather than attributed here; `pnpm test` re-run on `main` after the merge.

## Open questions

| ID | Question | Status | Decides |
|---|---|---|---|
| **Q-CI-G** | `.claude/workflows/run-milestone.js` is a **frozen path** — `tools/tests/frozen-paths.test.mjs` forbids `/^\.claude\/(?!scripts\/deliver-ticket\.mjs$)/` and names this exact file in its `FORBIDDEN_CONTROL` vectors — so a branch editing it fails `pnpm test` by construction. Does phase 2 allocate this file (a **D-CI8**, mirroring D-CI4's one-file carve-out for `FND-20`) via a docs PR to `breakdown-plan-02-ci-repair.md` §3/§4, with `tools/tests/frozen-paths.test.mjs` added to this ticket's file-scope for the narrowing and its control vector — or is the repair made **upstream only**, in `agent-templates`, and picked up here by the next sync? | **OPEN — BLOCKS THE START OF THIS TICKET.** `FND-20` is the precedent for the first route and shows it works, including its requirement that the guard narrowing and the edit ride in the **same branch**. The second route is cheaper and slower and leaves this repo running the defect until a sync happens. | **The repo owner, with the Architect.** Route: docs PR amending phase-2 §3/§4 + this ticket at +0.1, then `publish-tickets.mjs --sync`, then build. |
| **Q-CI-H** | Should this ticket be executed through the standalone stage commands rather than a `/start-milestone` or `/start-all` run, given that both runners fail a ticket whose Builder reports `configIntact = false` and a `.claude/**` edit **is** config drift by their definition (`run-milestone.js:150`)? | **OPEN, but with a clear recommendation: yes.** Standalone `/plan-ticket` → `/build-ticket` → `/review-ticket` → deliver. Recorded so the operator does not discover it as a mid-run `stage: config-drift` failure. | **The repo owner**, at scheduling time. No ticket change needed if the recommendation is accepted. |

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Never patch spec into a plan, into code, or by hand-editing the issue
(CLAUDE.md, issue #53).

1. **Q-CI-G is answered "upstream only".** → Then this ticket's local deliverables 1–3 are **withdrawn**
   and only deliverables 4–5 (the `start-all.js` check and the upstream report) remain. Record that at
   +0.1 and close the ticket honestly as a report rather than delivering a no-op branch.
2. **`start-all.js` turns out to carry a variant of the defect.** → Report it, open a **second ticket**,
   and **do not touch it here** (Non-goals). Two frozen-path files in one branch doubles the Q-CI-G
   problem and mixes a verified port with an unverified one.
3. **The main-root path resolution does not work on this machine** — `git rev-parse
   --path-format=absolute --git-common-dir` returns something unexpected under a lane worktree on
   Windows. → Record the actual output here (+0.1) and raise it with the **Architect**. Do **not** fall
   back to transcription, and do **not** have the deliver step copy the file from the worktree: an agent
   moving the record is one step from an agent writing it. If the path cannot be resolved, the honest
   outcome is that delivery **stops** — which is CLAUDE.md's specified behaviour, not a regression.
4. **Somebody proposes keeping a "safety net" fallback** — synthesise a short verdict when the file is
   missing, "so a run is not lost". → Rejected. CLAUDE.md is explicit that a missing record refuses the
   run, and a synthesised approval is precisely the artifact a safety classifier blocked on `FND-28`.
   Raise it with the **Architect** if the argument is genuinely new.
5. **The Reviewer writes a record but the delivery still reports it missing.** → Read the path before
   changing anything: under `concurrency > 1` this is the worktree bug this ticket exists to fix, and
   the correct response is to fix the resolution, not to add a copy step or a fallback. Record what the
   two paths actually were.

**Escalation.** If the Reviewer's authored record cannot be made to reach the deliver step without
another agent writing, moving or retyping it, then what needs a decision is how review records survive
lane isolation at all — not this ticket. Stop, escalate to the human, and raise it with the
**Architect** and upstream on **`Ruihang2017/agent-templates` #205**. **Never** resolve it by having the
deliver step author the record, by relaying verdict text through a prompt, or by synthesising a verdict
when the file is absent: the PR comment is the only durable record of what was checked, and a record
written by someone other than the checker is not one.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-17 | Initial ticket. Repairs a **pipeline-integrity defect** in `.claude/workflows/run-milestone.js` (~lines 265–279 on `main` @ `c9e1706`): the deliver step's prompt tells the **delivery agent** to *"write the following Reviewer CLEAR verdict text VERBATIM"* from `verdict.checkedNote`, with the fallback string `'CLEAR (the reviewer returned no note text)'`, while its Reviewer prompt instructs the Reviewer to write nothing. CLAUDE.md says the opposite twice — the Reviewer authors its own record at `.claude/tmp/<id>-verdict.md` as *"the one and only file it may write"*, and delivery *"verifies that file exists and is non-empty and refuses to run if it does not (it never writes it itself)"*. Records the **root cause**: under `concurrency > 1` the Reviewer runs in an isolated worktree, so its record lands at `.claude/worktrees/<lane>/.claude/tmp/<id>-verdict.md` and the main tree never sees it; the transcription is a workaround for that path problem which downgrades the durable review trail from the Reviewer's authored record — **~10.6 KB for `FND-28`**, item-by-item acceptance checks, verbatim commands with output tails, a disclosed verification gap and a reasoned rejection of a Codex-raised BOUNCE claim — to the `checkedNote` summary field relayed through the orchestrator. `FND-28` was ultimately delivered by pointing `--verdict-file` at the Reviewer's genuine file in its lane worktree, which is the behaviour this ticket makes automatic; the defect surfaced when a safety classifier blocked the deliver step for being told to write an approval it did not author. Records that **`start-all.js` does NOT carry the defect** — checked on 2026-08-17, not assumed: it already instructs the Reviewer to *"WRITE YOUR OWN REVIEW RECORD"*, resolves the path against the main repo root with `git rev-parse --path-format=absolute --git-common-dir` under `isolate`, and tells the deliver step the file *"is the reviewer's, not yours"* with a verify-or-stop path — so the fix is a **port from a reference implementation in the same directory**, and the Builder re-checks it at build time and opens a **second ticket** rather than widening scope if that changes. Makes rejected outcomes explicit: any agent other than the Reviewer writing the file, verdict text passed through the orchestrator's prompt, and any synthesised-verdict fallback when the file is missing. Records two structural blockers found while planning: **(Q-CI-G, blocking)** `.claude/workflows/run-milestone.js` is a **frozen path** whose guard, `tools/tests/frozen-paths.test.mjs`, lists this exact file as a `FORBIDDEN_CONTROL` vector, so a branch editing it fails `pnpm test` by construction and needs either a D-CI4-style docs allocation (the `FND-20` precedent, guard narrowing in the same branch) or an upstream-only repair; and **(Q-CI-H)** both runners fail a Builder that reports `configIntact = false`, which a `.claude/**` edit is by their own definition, so this ticket is executed through the standalone stage commands rather than inside a `/start-milestone` or `/start-all` run. Records that this is an **upstream `agent-templates` defect** to be reported on **issue #205** alongside the two already noted there, because an unreported local patch is silently reverted by the next catalog sync. Carries `blocks: []` and an empty `blocked_by` deliberately: it does **not** block CI green and must not be scheduled ahead of `FND-29` or `FND-30`. |
