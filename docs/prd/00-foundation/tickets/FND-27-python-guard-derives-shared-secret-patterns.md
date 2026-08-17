---
id: FND-27
title: The Python credential-shape guard derives from the shared patterns and exclusions
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-16
blocked_by: []
blocks: [FND-23]
---

# FND-27 — The Python credential-shape guard derives from the shared patterns and exclusions

Repairs the second of the three CI jobs that are red on `main` @ `5ac25c2`, against PRD §20.3 / §45.3
(the gate must be **correct**, not merely loud) and PRD-02 §1's root cause. No ADR — nothing here
decides a new rule: the rule was decided by `FND-24` (**D-CI5**, **D-CI6**) and this ticket only makes a
second implementation obey it. Same defect class as `FND-11`, `FND-12` and `FND-19` — **a second copy of
a decision that drifts from the first** — and this ticket is the clearest instance of it in the
repository, because the offending code says so in its own docstring: the patterns are
*"transcribed"*.
Parent sub-PRD for this phase: [breakdown-plan-02-ci-repair.md](../../breakdown-plan-02-ci-repair.md)
— that file, not the frozen `00-foundation/README.md`, carries this phase's file-scope allocation (§3)
and decision register (§4); this ticket is an **eighth** phase-2 ticket appended to `00-foundation`
under **D-CI2** (*"this phase appends tickets to `00-foundation`; no module 25 is created"*), continuing
the ids past `FND-26`. Master spec: [PRD](../../../PRD.md).
Depends on: nothing at build time. It **reads** artifacts `FND-24` created
([FND-24 — scoped secret-scan exclusions](FND-24-scoped-secret-scan-exclusions.md), delivered and
merged) and `FND-01` created (`tools/fixtures/secret-patterns.json`), both already on `main`, so its
`blocked_by` is empty. It must land **before**
[FND-23](FND-23-ci-local-entry-point-and-nanoid-override.md) can be green, because `FND-23`'s headline
acceptance is `pnpm ci:local` exiting 0 and `ci:local` derives its command set from `ci.yml`, which
includes `uv run pytest`. Hence `blocks: [FND-23]`.
**Why `builder`:** a bounded rewrite of one function and one constant in one existing test file, to a
contract that already exists in code and is fully specified below. No new mechanism, no new decision, no
product surface.

## Background + basis

### The reported failure — settled, do not re-diagnose

CI job **`Python builds/tests`** on `main` @ `5ac25c2`:

```
pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py:128
  test_no_credential_shaped_identifier_in_this_modules_file_scope
  AssertionError: these names trip .github/workflows/checks/secret-scan.mjs, which scans every
  git-tracked file: pipelines/corpus-builder/tests/chunking/conftest.py: STABLE_SOURCE_KEY
```

### The root cause — a transcription that never learned about exclusions

The offending guard is a **second implementation** of the repository secret scan, written in Python, and
its own docstring is the confession (`test_no_private_keys_committed.py:105`):

> *"The repository-wide scan's own patterns, **transcribed**. `.github/workflows/checks/secret-scan.mjs`
> applies these to EVERY git-tracked file outside `docs/**`."*

What it transcribes is a single combined regex, `_CREDENTIAL_SHAPED`, standing in for six of the eight
patterns in `tools/fixtures/secret-patterns.json`. What it does **not** know about is the exclusion
mechanism `FND-24` built at `.github/workflows/fixtures/secret-scan-exclusions.json`. So when `FND-24`
established that `STABLE_SOURCE_KEY` (`pipelines/corpus-builder/tests/chunking/conftest.py`,
`04-corpus-contract`'s, pattern `key`) is a fixture identifier and not a credential, and recorded that
as an exclusion, `secret-scan.mjs` went green — and this Python copy stayed red, because **it cannot see
the decision**. One decision, two implementations, one of which was never told.

That is `FND-11`/`FND-12`/`FND-19` exactly, and the repair is theirs: **derive from the shared source**.

### The two cheap fixes, and why both are rejected — settled, do not re-open

The repo owner decided both on 2026-08-16:

- **Adding `STABLE_SOURCE_KEY` to the Python copy** (an allowlist, a `# noqa`-style skip, a second
  transcription) — leaves the defect exactly as it is. The next exclusion `FND-24`'s mechanism records
  will red this job again, and the one after that, forever. Rejected.
- **Deleting the Python test** — the fast local feedback it gives is worth keeping. A Python developer
  running `uv run pytest` learns in seconds that a constant they just named will fail CI, instead of
  three minutes into a CI run on a pushed branch. That value is real and this ticket keeps all of it.
  **Only the duplication goes.** Rejected.

### The contract the Python side must honour — read this, do not infer it

`.github/workflows/checks/secret-scan.mjs` on `main` @ `5ac25c2` is the authority. Its shape, verified
by reading it:

**Patterns** come from `tools/fixtures/secret-patterns.json#patterns` — the scanner imports them and
says so in its header (*"The patterns are FND-01's, imported … and never copied: a second copy is a
second thing to forget to update."*). Eight entries, each `{ id, regex, why }`. Seven match
credential-shaped **names**; `private-key-block` matches a **value**.

**Exclusions** come from `.github/workflows/fixtures/secret-scan-exclusions.json`. The scanner's
`loadExclusions()` and `isExcluded()` fix the contract precisely:

| Element | Contract |
|---|---|
| top-level `exclusions` | must be an **array**, or the loader throws |
| top-level `count` | must **equal** `exclusions.length`, or the loader throws |
| every entry | seven fields, each a **non-empty string**: `path`, `patternId`, `identifierSha256`, `basis`, `owner`, `ticket`, `date` |
| any field containing `*` or `?` | **throws** — *"a wildcard would blind the scan"* |
| `patternId` | must be one of the eight fixture pattern ids, or throws |
| `identifierSha256` | must match `^[0-9a-f]{64}$`, or throws |
| duplicate `path`+`patternId`+`identifierSha256` triple | **throws** |
| the match rule (`isExcluded`) | a finding is dropped **only when all three** of exact `path` (the forward-slash repository-relative path `git ls-files` produced), exact `patternId`, and `identifierSha256 == sha256(matched text)` agree. No prefix, no glob, no regex, **no path normalisation** — the scanner's own comment says normalising *"would be the first step towards a prefix match"* |
| a malformed or missing file | **throws, loudly, naming the offending entry**; the constant is loaded eagerly *"so a broken configuration must be loud, never a silently empty exclusion list"* |

The current live file declares `"count": 33` and holds 33 entries, of which the one this ticket's job
needs is:

```json
{ "path": "pipelines/corpus-builder/tests/chunking/conftest.py", "patternId": "key",
  "identifierSha256": "4b3b01c0d2f59eb14e34b77f8a70871a27daa010c18ae4209e7575b32965c30a", ... }
```

— the SHA-256 of `STABLE_SOURCE_KEY`, digested as UTF-8 and rendered lowercase hex, which is exactly
`digestOf()` in the scanner.

### What is measurably in scope for the Python guard — verified, do not re-derive

The guard scans two roots: `pipelines/corpus-builder` and `schemas/corpus-manifest`. Applying **all
eight** fixture patterns across those two trees (file suffixes `.py`, `.json`, `.md`, `.gitattributes`
and extensionless, as the guard's current filter selects) on `main` @ `5ac25c2` yields exactly **one**
identifier, in **two** occurrences:

| Identifier | Pattern | Path | Excluded by `FND-24`? |
|---|---|---|---|
| `STABLE_SOURCE_KEY` | `key` | `pipelines/corpus-builder/tests/chunking/conftest.py` (lines 41, 58) | **yes** |

Nothing matches `token`, `secret`, `aws`, `password`, `credential`, `dsn` or `private-key-block` in
those roots. So widening the guard from one transcribed regex to the eight shared patterns adds **no new
offender**, and the exclusion accounts for the only one. State this measurement again in the pull
request from the branch's own run rather than quoting it — Feedback obligation 1 covers the case where
it has moved.

### Two constants of the scanner are **not** data, and this ticket does not transcribe them either

`ALLOWLIST` (`['GITHUB_TOKEN']`), `PROSE_TREES` (`['docs/']`) and `VALUE_PATTERN_IDS`
(`['private-key-block']`) are exported JavaScript constants in `secret-scan.mjs`, not fixture entries,
so the Python side cannot read them without doing the very thing this ticket removes. It does not have
to: neither of the guard's two scan roots is under `docs/`, and the measurement above shows no
`GITHUB_TOKEN` in them. **The correct handling of a divergence is to notice it, not to copy it** —
Feedback obligation 3 records the ADR candidate (promoting those three constants into the fixture so
both implementations read one source) rather than resolving it here.

### Accepted caveats, carried forward

- **This remains two implementations of one scan.** The repair removes the *duplicated decision data*,
  not the second implementation. The Python guard will still differ from `secret-scan.mjs` in what it
  enumerates (two directory trees by `rglob`, versus `git ls-files` over the whole repository) and in
  the three constants above. That is the accepted cost of keeping fast local Python feedback; what is no
  longer accepted is a second copy of the patterns or a blindness to the exclusions.
- **`rglob` sees untracked files; `git ls-files` does not.** The guard's existing `_SKIP_DIRS`
  (`__pycache__`, `.pytest_cache`, `node_modules`, `.venv`, `target`) is what keeps that from being
  noisy, and it is unchanged. A build artifact that trips the guard and not CI is a `_SKIP_DIRS`
  question, not a licence to relax the patterns.
- **Reading a JSON fixture from a test is a coupling.** It is the intended one: the fixture is the
  shared source of truth, and a test that fails when the fixture is malformed is doing its job.

## Goal

Make `pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py`'s credential-shape
guard **read** the repository's shared secret-scan patterns and the repository's shared secret-scan
exclusions, instead of carrying its own transcription of the first and no knowledge of the second, so
that one exclusion decision governs both implementations and the `Python builds/tests` job stops going
red on a name `FND-24` has already justified. Completion is mechanically checkable: `uv run pytest`
exits 0 for that module; the positive control still catches a genuinely credential-shaped name; and
deleting the `STABLE_SOURCE_KEY` entry from the exclusions fixture makes the guard fail again by name.

## Non-goals

- **No change to `.github/workflows/checks/secret-scan.mjs`.** `FND-24`'s. This ticket **reads** its
  fixture; it does not touch the scanner, its `ALLOWLIST`, its `PROSE_TREES`, its `VALUE_PATTERN_IDS` or
  its filter stages.
- **No change to `.github/workflows/fixtures/secret-scan-exclusions.json`.** `FND-24`'s. **No entry is
  added, removed, edited or reordered, and `count` is not touched** — including for the
  `STABLE_SOURCE_KEY` entry this ticket depends on, which already exists. If this ticket appears to need
  a new exclusion, that is Feedback obligation 1, not an edit.
- **No change to `tools/fixtures/secret-patterns.json`** — `FND-01`'s, read-only here. No pattern added,
  removed, loosened or narrowed.
- **No change to `pipelines/corpus-builder/tests/chunking/conftest.py`, and specifically no rename of
  `STABLE_SOURCE_KEY`.** That is `CRPS-03`'s file and the name is legitimate — `FND-24` established it
  as *"a chunking test fixture constant naming the deterministic identifier of a corpus source record"*
  and **D-CI5** closed the renaming route for this class. Rejected outcome.
- **No deletion of the Python guard, and no `.skip`, `xfail`, `pytest.mark.skipif`, `# noqa`, bare
  `pass`, or emptied assertion.** The owner rejected deletion explicitly on 2026-08-16. Rejected
  outcomes.
- **No local allowlist, skip-list or "known names" set in the Python file.** That is the transcription
  defect wearing a different hat: a second place where an exclusion decision would live. The **only**
  admissible source of an exception is `FND-24`'s fixture. Rejected outcome.
- **No change to the other seven tests in the file** — the private-key-block scan, the seed-member scan,
  the key-filename scan, the development-key assertions and the two positive controls keep their current
  strength and their current names.
- **No change to any other Python file, to `pyproject.toml`, `uv.lock`, or to
  `tools/pytest_exit_zero_when_empty.py`.**
- **No new third-party dependency.** `json`, `re`, `hashlib` and `pathlib` are in the standard library;
  the digest is `hashlib.sha256(identifier.encode("utf-8")).hexdigest()`.
- **No product code.** PRD-02 §3.

## File-scope (write-owns)

Owned by this ticket — **one file, and nothing else**:

- `pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py` — the `_CREDENTIAL_SHAPED`
  transcription, the credential-shape test that uses it, and the new derivation helpers and their
  controls. Test file only.

Does not touch:

- `.github/workflows/checks/secret-scan.mjs`, `.github/workflows/fixtures/secret-scan-exclusions.json`,
  `.github/workflows/checks/workflows.test.mjs` — `FND-24`'s. **Read-only here**, including for the
  acceptance experiment, which restores what it perturbs.
- `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` — `FND-01`'s and `FND-24`'s.
  Read-only here.
- `pipelines/corpus-builder/tests/chunking/conftest.py` — `04-corpus-contract`/`CRPS-03`'s.
- every other file under `pipelines/**` and `schemas/**`, including `manifest_fixtures`,
  `manifest/signing` and every other suite in `tests/manifest/**` — `04-corpus-contract`'s.
- `pyproject.toml`, `uv.lock`, `tools/pytest_exit_zero_when_empty.py`, `.github/workflows/ci.yml` —
  `FND-01`'s and `FND-21`'s.
- `tools/vitest.config.mjs` — `FND-26`'s this phase.
- `packages/database/test/migrate/file-scope.test.ts` — `FND-28`'s this phase.
- `docs/PRD.md`, `docs/adr/**`, `.claude/**`, `CLAUDE.md`, `templates/**` — frozen or unallocated.
- `docs/prd/**` — the Architect's; changed by a docs PR before this ticket executes.
- every other product tree — PRD-02 §3.

**Cross-module declaration.** `pipelines/corpus-builder/**` is `04-corpus-contract`'s write-owns tree,
so a `00-foundation` ticket writing a file there is an out-of-file-scope edit, and it is declared here
rather than performed quietly: the edit is **test-only**, confined to **one** file, opens no other suite
in the module, changes no fixture, no signing code and no manifest schema, and exists solely because the
duplicated data being removed is `00-foundation`'s (`FND-01`'s patterns and `FND-24`'s exclusions). The
alternative — a `CRPS` ticket for the owning module — was considered and not taken: the knowledge being
encoded is entirely `00-foundation`'s, the guard is red on `main` now, and re-running a delivered
corpus-contract ticket to change one test file puts a CI repair behind unrelated work.

**Serial-safety analysis.** `pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py`
was last written by the delivered `CRPS` manifest ticket and is declared in **no** other ticket's
file-scope under `docs/prd/**` — verified by search. `FND-26` and `FND-28`, the other two phase-2
tickets in flight, declare `tools/vitest.config.mjs` and
`packages/database/test/migrate/file-scope.test.ts` respectively and neither declares any Python path,
so all three may run as parallel lanes. `FND-23` is `blocked_by` this ticket.

**Merge safety under the protection that is already live.** The six required contexts are
`API/OpenAPI compatibility`, `Migration and tenant-schema validation`, `Tenant isolation, auth and
permission tests`, `PII and citation validation suites`, `Rust builds/tests` and
`Retrieval/evaluation smoke set`. This ticket writes a Python test under `pipelines/**`, which runs in
`python-build-test` — **not** one of the six. **Verify rather than assume** — acceptance item 9.

## Deliverables

1. **The transcribed regex is gone, replaced by a read of the shared patterns.** Delete
   `_CREDENTIAL_SHAPED` and load `tools/fixtures/secret-patterns.json#patterns` instead, compiling each
   entry's `regex` with `re` and **keeping its `id`**, because the pattern id is half the exclusion key
   and a scan that reports only "matched something" cannot be matched against an exclusion. Resolve the
   fixture through `REPO_ROOT` (already imported from `manifest_fixtures`). The docstring must be
   rewritten to say the patterns are **read from the shared fixture, never copied**, and to name the
   defect class it is leaving behind (`FND-11`/`FND-12`/`FND-19`) so nobody re-transcribes them.

2. **The guard reads the shared exclusions and applies them by the same three-part key.** Load
   `.github/workflows/fixtures/secret-scan-exclusions.json` and drop a finding **only when all three**
   of the following match one entry, by exact equality — no prefix, no glob, no case folding, no path
   normalisation beyond producing the forward-slash repository-relative path that `git ls-files` would
   produce for that file:

   - `path` — the finding's repository-relative path, forward slashes, exactly as the fixture spells it;
   - `patternId` — the id of the pattern that fired;
   - `identifierSha256` — `hashlib.sha256(matched_text.encode("utf-8")).hexdigest()`, lowercase hex.

   Two identifiers matching in a file with one exclusion for a *different* digest must still fail. The
   filter must be a small **named pure function** taking a finding and the loaded entries, so the
   controls in deliverable 4 can drive it directly with synthetic findings.

3. **A missing or malformed fixture fails loudly and never silently passes.** This is the trap: a
   guard that treats an unreadable exclusions file as "no exclusions" merely goes red for a new reason,
   and one that treats it as "everything excluded" goes green while guarding nothing — the worse of the
   two, and the one to make impossible. The loader must **raise** (or fail the test with a message that
   names the file and the problem) on each of:

   - the file missing, unreadable, or not valid JSON;
   - `exclusions` absent or not a list;
   - `count` absent or unequal to `len(exclusions)`;
   - any entry missing one of the seven fields, or holding an empty string in one;
   - any field containing `*` or `?`;
   - `patternId` not one of the fixture's eight ids;
   - `identifierSha256` not matching `^[0-9a-f]{64}$`.

   These are the same seven conditions `loadExclusions()` enforces in `secret-scan.mjs` (Background), and
   the Python side must reject the same documents — a configuration one implementation accepts and the
   other rejects is the drift this ticket exists to end. The error message must name the file and the
   offending entry index, as the scanner's does.

4. **Controls, so the repair cannot be vacuous.** Add, beside the existing tests:

   - **the exclusions are actually loaded** — the loaded list is non-empty and its length equals the
     fixture's declared `count`;
   - **the patterns are actually loaded** — eight patterns, ids matching the fixture's, and a scan of a
     synthetic string assembled at runtime is reported **with the right pattern id** (not merely
     "matched");
   - **narrowness, three negative controls driven directly against the filter function**: (a) the right
     digest and pattern at a **different** path is **not** excluded; (b) a **different** digest at an
     excluded path with the same pattern is **not** excluded; (c) the right path and digest with a
     **different** pattern id is **not** excluded;
   - **the malformed-fixture cases** from deliverable 3, driven against synthetic documents in memory —
     never by writing to the real fixture.

   Every synthetic credential-shaped string in these controls is **assembled at runtime from parts**,
   exactly as the file's existing controls do (`"SIGNING" + "_KEY" + "_PATH"`), because this file is
   itself scanned by `secret-scan.mjs` over the whole git-tracked tree. **No new identifier introduced
   by this ticket may itself be credential-shaped** — no constant named `*_KEY`, `*_TOKEN`, `*_SECRET`,
   `*_CREDENTIAL(S)` or `*_PASSWORD` — or the repair adds a finding of its own.

5. **The existing positive control survives unchanged in substance.**
   `test_the_credential_shape_control_still_matches_a_real_offender` must still assert that a genuinely
   credential-shaped name (`"SIGNING" + "_KEY" + "_PATH"`) **is** matched and that a non-credential-shaped
   near-miss (`"SIGNING" + "_KEYFILE"`) is **not**, now against the shared patterns rather than the
   deleted transcription. **A repair that makes this guard vacuous is the failure mode of this ticket**,
   and the demonstration required is in acceptance item 3: removing an exclusion must make the guard fail
   again, by name.

6. **Nothing else in the file changes.** The seven other tests keep their names, their assertions and
   their strength; `_HEADER`, `_SEED_MEMBER`, `_SKIP_DIRS`, `_files()`, `_text()`, `SCAN_ROOTS` and
   `ALLOWED_DIR` are unchanged except where deliverable 1 or 2 strictly requires it, and the
   private-key-block scan keeps its existing self-exclusion (`path != Path(__file__).resolve()`).

## Acceptance checklist (classified)

**Before any run**, confirm `node -v` prints `v24.18.0` (CLAUDE.md) in any shell that also runs the Node
side of the acceptance. A red suite under Node 22.11.0 is an environment fault, not a regression.

- [ ] `[machine]` **The reported defect is gone.** `uv run pytest` exits 0 for
      `pipelines/corpus-builder`, including
      `test_no_credential_shaped_identifier_in_this_modules_file_scope`, where on `main` @ `5ac25c2` it
      fails naming `pipelines/corpus-builder/tests/chunking/conftest.py: STABLE_SOURCE_KEY`. Both
      outputs pasted into the PR.
- [ ] `[machine]` **The `Python builds/tests` CI job is green on the pull request**, and its conclusion
      is pasted into the PR. A local pytest pass with a red CI job is the failure mode PRD-02 §1 names
      as this phase's root cause.
- [ ] `[machine]` **The positive control is still live — demonstrated against the real fixture, not a
      synthetic one.** Remove the `pipelines/corpus-builder/tests/chunking/conftest.py` entry from
      `.github/workflows/fixtures/secret-scan-exclusions.json` in the working tree (decrementing
      `count`), re-run `uv run pytest`, and record that
      `test_no_credential_shaped_identifier_in_this_modules_file_scope` **fails again naming
      `STABLE_SOURCE_KEY`**; then restore the file and confirm `git status --porcelain` shows only this
      ticket's one file. **This is the item that proves the repair is not vacuous** — a guard that goes
      green because it stopped looking is the failure mode here, and only this experiment distinguishes
      the two.
- [ ] `[machine]` **`test_the_credential_shape_control_still_matches_a_real_offender` is unchanged in
      substance and green** — the credential-shaped name still matches, the near-miss still does not
      (deliverable 5).
- [ ] `[machine]` **The three narrowness controls hold**, each driven directly against the filter
      function: same digest at a different path, different digest at an excluded path, and a different
      pattern id at the excluded path and digest are each **not** excluded (deliverable 4). Their
      assertions are quoted in the PR.
- [ ] `[machine]` **A broken fixture is loud.** Each of the seven malformed cases in deliverable 3 fails
      the guard with a message naming the file and the entry; demonstrated on synthetic documents in
      memory, with the real fixture never written. State in the PR that no case is handled by treating
      the exclusion list as empty **or** as universal.
- [ ] `[machine]` **Nothing is transcribed any more.** `git diff main...HEAD` shows `_CREDENTIAL_SHAPED`
      deleted, no regex literal for a credential shape anywhere in the file, and no local allowlist,
      skip-list or "known names" set (Non-goals). The docstring names the shared fixture.
- [ ] `[machine]` **The repair introduced no finding of its own.**
      `node .github/workflows/checks/secret-scan.mjs` exits 0 on this branch, so no identifier or literal
      added by this ticket is itself credential-shaped (deliverable 4).
- [ ] `[machine]` **The diff is one file.** `git diff --name-only main...HEAD` lists exactly
      `pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py`. In particular the
      exclusions fixture, the patterns fixture, `secret-scan.mjs` and `conftest.py` are **unchanged**
      (File-scope; Non-goals).
- [ ] `[machine]` **The branch is mergeable under the live protection.** All six currently-required
      contexts are green on this pull request; names and conclusions pasted into the PR (File-scope).
- [ ] `[machine]` **Full suite green — the standing item** (PRD §20.3, §45.3). `pnpm test` exits 0 with
      the pass count stated in the PR; `pnpm lint` and `pnpm typecheck` green; `uv run pytest` green.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**none** — a guard repair under
      PRD §20.3/§45.3, downstream of `DEV-007`; unblocks `FND-23`/DEV-005), user-visible change
      (**none** — test code), schema/API/event compatibility (**none**), tenant/PII/security impact
      (**the Python guard's coverage now equals the shared patterns minus the shared exclusions and
      nothing else** — state that no exclusion was added, that no name was renamed, and that a new
      credential-shaped name in the two scan roots still fails), source/licence impact (**none** — no
      dependency added; `hashlib` and `json` are standard library), cost impact (**none**), rollback path
      (revert the commit — which re-reds `Python builds/tests` and re-blocks `FND-23`, so the rollback
      note must say so), known gaps (the three Accepted caveats, and Feedback obligation 3's ADR
      candidate).

**Absent classes.** No `[fixture]` criteria in the plan's sense — the exclusions and patterns files are
scanner configuration, not PRD §40.8 adapter fixtures or §14/§43 evaluation replays, and this ticket
writes neither. No `[human]` criteria — CI tooling with a mechanical acceptance surface and no
customer-visible behaviour; no PRD §41.2 `UAT-*` script applies. No Rust surface.

## Test plan

Reviewer steps. All offline; no network. **Step 0 in every shell:** confirm `node -v` prints
`v24.18.0` before any Node-side command. Harness: `uv run pytest` for the guard, and
`node .github/workflows/checks/secret-scan.mjs` for the cross-check. The construction pattern to copy
is the file's own — every real assertion paired with a runtime-assembled control, so nothing passes
vacuously.

1. **Read the diff for a blinding first.** A local allowlist, a skip-list, an `xfail`, a `# noqa`, a
   narrowed suffix filter, a shrunk `SCAN_ROOTS`, a widened `_SKIP_DIRS`, an emptied assertion, or an
   exclusion filter keyed on only one or two of the three parts is a **rejected outcome** (Non-goals),
   not a style comment. So is any surviving regex literal for a credential shape.
2. **Confirm it derives.** The file must open `tools/fixtures/secret-patterns.json` and
   `.github/workflows/fixtures/secret-scan-exclusions.json` and use what it finds. Prove it: change a
   pattern's `regex` in the working tree to something that cannot match, re-run, confirm the guard's
   behaviour changes, restore. A guard that ignores an edited fixture has not derived anything.
3. **Re-run the non-vacuity experiment yourself** (acceptance item 3) — remove the `conftest.py`
   exclusion entry, confirm the guard fails **by name**, restore, confirm the tree is clean. A guard
   that stays green through that is guarding nothing, and going green is not the property being tested.
4. **Drive the filter directly.** Feed it synthetic findings for the three narrowness controls and
   confirm each is reported, not excluded. Then feed it the real `STABLE_SOURCE_KEY` finding and confirm
   it is excluded — and that changing one character of the path, the pattern id or the digest un-excludes
   it.
5. **Break the fixture seven ways** (deliverable 3), in memory, and confirm each fails loudly with the
   file and entry named. Confirm specifically that a missing file does **not** degrade to an empty
   exclusion list and does **not** degrade to a universal one.
6. **Cross-check the two implementations agree.** On the branch,
   `node .github/workflows/checks/secret-scan.mjs` exits 0 and `uv run pytest` exits 0. Confirm the
   Python guard's finding set over its two scan roots is the same set `secret-scan.mjs` produces for
   those paths.
7. **Confirm nothing else moved.** `git diff --name-only main...HEAD` is one file; the exclusions
   fixture, the patterns fixture, the scanner and `conftest.py` are untouched.
8. **Suite and gates.** `uv run pytest`, `pnpm test`, `pnpm lint`, `pnpm typecheck` green on the branch;
   `uv run pytest` and the scanner re-run on `main` after the merge.

## Feedback obligation

**General rule.** If implementation falsifies anything here, update **this ticket** first — version
+0.1 with a changelog line — then change code, then re-publish the issue
(`publish-tickets.mjs --sync`). Where the falsified item is a phase-2 decision, the writeback target is
`docs/prd/breakdown-plan-02-ci-repair.md` §4 as well, by a docs PR. Never patch spec into a plan, into
code, or by hand-editing the issue (CLAUDE.md, issue #53).

1. **Deriving surfaces a finding the transcription missed** — the eight shared patterns match something
   in the two scan roots beyond `STABLE_SOURCE_KEY`, contradicting the Background measurement. → Do
   **not** add an exclusion, and do **not** narrow the patterns or the scan roots to make it go away.
   Establish what the identifier is and who owns the file, exactly as `FND-24`'s Background table does,
   record it here (+0.1, `--sync`), and raise it: a new exclusion is an edit to **`FND-24`'s fixture**,
   which is outside this ticket's file-scope, so it is a docs-and-ticket decision with the **Architect**.
   If it is a *real* credential, the outcome is removal, rotation and immediate escalation — never an
   exclusion.
2. **A fixture pattern's regex is not valid Python `re` syntax**, or means something different there
   than in JavaScript. → Record the exact pattern and the divergence here **before** working around it.
   Do **not** hand-translate it into a Python-flavoured copy — that reintroduces the transcription this
   ticket removes, one level down. The correct outcomes are, in order: a `re`-compatible reading of the
   same source, or an escalation to the **Architect** about the fixture's regex dialect.
3. **The three JavaScript-only constants matter after all** — something in the scan roots is caught by
   the Python guard and allowlisted or prose-narrowed by `secret-scan.mjs`, so the two disagree. → Do
   **not** transcribe `ALLOWLIST`, `PROSE_TREES` or `VALUE_PATTERN_IDS` into Python. Record the case
   here (+0.1). **ADR candidate (raised here, not authored here — this ticket writes nothing under
   `docs/adr/`):** *whether a scanner's allowlist, prose narrowing and value-pattern set belong in the
   shared fixture rather than in one implementation's source*. Owner: **Architect**; trigger: the first
   real divergence, or a third implementation of the scan.
4. **The Python guard cannot produce the same repository-relative path spelling the fixture uses** —
   Windows separators, symlinks, or a scan root outside the repository. → Record it here before
   normalising anything, and keep the match **exact**: the scanner's own comment warns that path
   normalisation *"would be the first step towards a prefix match"*. Producing the forward-slash
   repo-relative form is fine; case folding, resolving symlinks or matching prefixes is not.
5. **Someone proposes adding `STABLE_SOURCE_KEY` to the Python file, or deleting the guard.** →
   Rejected, by the repo owner on 2026-08-16, with reasons in Background. The first leaves the defect
   live for every future exclusion; the second discards fast local feedback that is worth keeping. Do
   not re-open it; if the argument is genuinely new, raise it with the **Architect** as a change to
   *this ticket*.

**Escalation.** If the Python guard cannot be made to agree with `secret-scan.mjs` without either
copying data or blinding itself, then the right shape is **one scan with one implementation** — and
which one survives, and what replaces the fast local Python feedback, is a design decision, not this
ticket's. Stop, escalate to the human, and raise it with the **Architect**. **Never** resolve it by
adding a local allowlist, deleting the guard, marking it `xfail`, or narrowing the patterns: a guard
that has been blinded discharges nothing, and this phase exists because a gate that reports green while
CI is red is worse than no gate.

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-16 | Initial ticket. Repairs the second of the three CI jobs red on `main` @ `5ac25c2`: `pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py:128` fails on `pipelines/corpus-builder/tests/chunking/conftest.py: STABLE_SOURCE_KEY`. Root cause recorded from the guard's own docstring — the repository scan's patterns are *"transcribed"* into `_CREDENTIAL_SHAPED`, and the copy **never learned that `FND-24` built an exclusion mechanism** at `.github/workflows/fixtures/secret-scan-exclusions.json`; `FND-24` excluded the name, `secret-scan.mjs` went green, and the Python copy stayed red because it cannot see the decision. That is the `FND-11`/`FND-12`/`FND-19` transcription defect class and the repair is theirs: **derive from the shared source**. Both cheap fixes are recorded as rejected by the repo owner on 2026-08-16 — adding the name to the Python copy leaves the defect live for every future exclusion, and deleting the test discards fast local Python feedback that is worth keeping; only the duplication goes. Transcribes `FND-24`'s contract from `secret-scan.mjs` verbatim so the Python side matches it exactly: exclusions keyed on the exact repository-relative path **and** the exact pattern id **and** the lowercase-hex SHA-256 of the matched identifier, with the seven-field/`count`/no-wildcard/valid-pattern-id/valid-digest/no-duplicate validations, and with a missing or malformed fixture required to **fail loudly** — never to degrade to an empty exclusion list, and above all never to a universal one. Requires the existing positive control to survive and requires the non-vacuity demonstration that only this experiment can give: removing the `conftest.py` exclusion from the real fixture must make the guard fail again **by name**. Records the measurement that widening from one transcribed regex to the eight shared patterns adds **no new offender** in the two scan roots, and declares itself a cross-module, test-only edit of one `04-corpus-contract` file. Carries `blocks: [FND-23]` and an empty `blocked_by`: `FND-24`'s artifacts are already on `main`, and `FND-23`'s `pnpm ci:local` cannot exit 0 while `uv run pytest` is red. |
