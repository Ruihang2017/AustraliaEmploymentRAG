# Breakdown plan — phase 2, CI gate repair

> Source PRD: [`docs/PRD-02-ci-repair.md`](../PRD-02-ci-repair.md) (Founder, 2026-08-15).
> Master spec: [`docs/PRD.md`](../PRD.md). Phase-1 plan: [`breakdown-plan.md`](breakdown-plan.md) —
> **read-only here**; this document does not amend it and does not replace it.
> Ticket files under `00-foundation/tickets/` are the executable source of truth. Where this plan and
> a ticket disagree, **the ticket wins** (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Phase | 2 (append mode; `prd-phase.mjs context` reported `append: true`, 240 ids in use, 267 frozen files) |
| Module | `00-foundation` (decision **D-CI2**, PRD-02 §6 — no module 25; `nextPrefix` 25 goes unused) |
| Lane | `00-foundation` |
| Tickets | 5 — `FND-20` … `FND-24` |
| Requirements | `DEV-004`, `DEV-005`, `DEV-006`, `DEV-007`, `OPS-004` (PRD-02 §2) |
| Recommended `/start-all` concurrency | **4** (see §5) |
| Version | v1.0 |
| Date | 2026-08-15 |

## 0. Why this file is the sub-PRD of record for phase 2

Normally a module's sub-PRD (`00-foundation/README.md`) carries the module's decision register and
work-breakdown table. **It cannot here.** Every one of the 267 files already under `docs/prd/` is
frozen for this phase: `prd-phase.mjs check docs/prd` is run against git after decomposition and a
single modification or deletion rejects the whole thing. `docs/prd/00-foundation/README.md` and
`docs/prd/breakdown-plan.md` are both in that set.

D-CI2 nevertheless puts this phase's tickets into `00-foundation`, so the module gains five tickets
whose decisions have nowhere to live in the module README. They live **here** instead. Concretely:

- §3 below is this phase's **file-scope allocation**, and it is what `FND-20` … `FND-24` cite where a
  phase-1 ticket would cite `breakdown-plan.md` §4.
- §4 below is this phase's **decision register** (`D-CI1` … `D-CI6`), and it is what the tickets cite
  where a phase-1 ticket would cite the `00-foundation` README's `D*` table.
- Adding ticket **files** under `docs/prd/00-foundation/tickets/` is an *addition* and is expected;
  nothing in this decomposition edits an existing file.

A reader who arrives at `00-foundation/README.md` and finds no mention of `FND-20` … `FND-24` has not
found a gap in the record — the record is here, and each ticket's traceability header says so.

## 1. What this phase is

CI has never been green (PRD-02 §1). Six measured failure classes, and one root cause: the pipeline's
operative definition of "tests green" is `pnpm test` on Windows, which is a strict subset of what CI
runs, so a Builder and a Reviewer can both honestly report green while CI is red. This phase makes
the gate real and makes it consulted. It ships **no product code** (PRD-02 §3 Non-goals).

Mapping from the PRD-02 §1 failure classes to tickets:

| Class | Symptom | Ticket |
|---|---|---|
| 1 | `powershell: not found` (exit 127) on ubuntu | `FND-22` |
| 2 | `neither main nor origin/main exists`; `ambiguous argument 'null...HEAD'` | `FND-21` |
| 3 | 65 credential-shaped identifiers trip the repository's own secret scan | `FND-24` |
| 4 | `nanoid <3.3.18` fails `pnpm audit --audit-level=high` | `FND-23` (override) + `FND-21` (`--prod` scoping) |
| 5 | every PR fails the §45.4 contract — the unfilled template fallback | `FND-20` |
| 6 | merge never consults CI; a failed merge is a `note()`; `testsPassed` unevaluated | `FND-20` |

Two acceptance items in PRD-02 §5 are **not** ticket work and are recorded in §6 as human actions:
required-context configuration (`OPS-004`) and the `CLAUDE.md` test-command declaration.

## 2. Ticket ids — continuing from FND-19, and why the gaps stay gaps

`prd-phase.mjs context` reports 240 ids in use. Within `00-foundation` those are `FND-01` … `FND-12`,
`FND-14` and `FND-19`: **`FND-13` and `FND-15` … `FND-18` are absent and therefore available.**

**Decision: do not reuse them. This phase is `FND-20` … `FND-24`.** Three reasons, each sufficient:

1. **Ids stay monotonic with delivery order**, which is what makes `FND-19`'s "third instance of one
   defect class" style of cross-reference readable at all.
2. **Three of the five gaps are not free.** `git branch -a` shows live local branches
   `ticket/FND-15`, `ticket/FND-16`, `ticket/FND-17` and a **remote** `origin/ticket/FND-16`, plus two
   commits on `main` referring to `FND-16` (`0ae1a03`, `3610f4c`). Publishing a *new* ticket on any of
   those ids would put `deliver-ticket.mjs`'s divergence guard — or the Builder's
   existing-branch stop-and-report — in front of a ticket that has nothing to do with the earlier
   work, on a branch name that already exists remotely.
3. An id that was used and abandoned carries a history a cold reader cannot distinguish from this
   phase's. Silence about a gap is cheaper than a collision inside it.

## 3. File-scope allocation (phase 2)

Every path below is write-owned by **exactly one** ticket; no two rows overlap. This is the phase-2
analogue of `breakdown-plan.md` §4 and is what the tickets cite.

| Ticket | Write-owns |
|---|---|
| `FND-20` | `.claude/scripts/deliver-ticket.mjs` · `tools/tests/frozen-paths.test.mjs` · `tools/tests/deliver-ticket.test.mjs` (new) · `tools/tests/support/**` (new) |
| `FND-21` | `.github/workflows/ci.yml` · `.github/workflows/checks/checkout-depth.test.mjs` (new) |
| `FND-22` | `tools/fixtures/entry-commands.json` · `tools/tests/entry-commands.test.mjs` · `tools/check-workspace.mjs` · `tools/tests/readme.test.mjs` · `README.md` |
| `FND-23` | `package.json` (root) · `pnpm-lock.yaml` · `tools/ci-local.mjs` (new) · `tools/workspace-script.mjs` · `tools/fixtures/script-owners.json` · `tools/tests/scripts.test.mjs` · `tools/tests/ci-local.test.mjs` (new) |
| `FND-24` | `.github/workflows/checks/secret-scan.mjs` · `.github/workflows/checks/workflows.test.mjs` · `.github/workflows/fixtures/secret-scan-exclusions.json` (new) · `tools/fixtures/secret-patterns.json` · `tools/tests/secret-scan.test.mjs` |

**Still frozen for every phase-2 ticket** (`breakdown-plan.md` §4 frozen row, enforced repository-wide
by `tools/tests/frozen-paths.test.mjs`): `docs/PRD.md`, `docs/discovery/**`, `docs/archive/**`, the
two pre-existing `tools/*.ps1`, `templates/**`, `CLAUDE.md`, `.claude/**` *except* the one file
allocated by **D-CI4** below, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/**`,
`.gitattributes`. Product trees (`apps/**`, `packages/**` other than the two test/fixture files named
above, `pipelines/**`, `services/**`) are untouched by this phase — PRD-02 §3 makes product code an
explicit Non-goal with the Founder as owner.

**Two near-collisions, resolved deliberately** — recorded because a Builder who widens either scope
re-creates them:

- `.github/workflows/checks/workflows.test.mjs` is `FND-24`'s **alone**. `FND-21` would naturally have
  added its regression guard there; instead it adds a sibling file
  `.github/workflows/checks/checkout-depth.test.mjs` and its own `ci.yml` step. Verified safe: the
  harness's non-vacuity section (`describe K`) iterates a fixed four-name script list and asserts
  `filesRead.size >= 12`, so a **new** sibling script breaks nothing; and no section of the harness
  asserts an exact step list for any `ci.yml` job.
- `README.md` and `tools/tests/readme.test.mjs` are `FND-22`'s **alone**. `FND-23` documents
  `pnpm ci:local` in `tools/fixtures/script-owners.json` and in the script's own header, never in
  `README.md`. `readme.test.mjs` iterates `script-owners.json#owners` (the *unimplemented* scripts),
  and `ci:local` is implemented, so it needs no README row to stay green.

## 4. Decision register (phase 2)

`D-CI1` and `D-CI2` are the Founder's, transcribed from PRD-02 §6 and **not re-litigated**. `D-CI3`
onward are the Architect's, made during this decomposition, each with its basis.

| # | Decision | Basis |
|---|---|---|
| **D-CI1** | **The blocking dependency gate is scoped to `--prod`**: `pnpm audit --audit-level=high` becomes `pnpm audit --prod --audit-level=high`. The nanoid override is applied anyway, so the advisory is closed either way; the scoping is about what the gate does *next* time. A scheduled non-blocking full-tree audit is **deferred** and is a follow-up, never a deliverable of this phase. | PRD-02 §6 D-CI1 (Founder, 2026-08-15) |
| **D-CI2** | **This phase appends tickets to `00-foundation`; no module 25 is created.** Ids continue from `FND-19`. | PRD-02 §6 D-CI2 (Founder, 2026-08-15) |
| **D-CI3** | **`deliver-ticket.mjs` must *wait* for the required checks to conclude, then merge only if all are green.** DEV-004 as written ("MUST NOT merge a pull request whose required checks are not green") is satisfiable by a script that refuses every merge: the delivery step attempts `gh pr merge` seconds after pushing the branch, when the required contexts are still **pending**, so a refuse-on-not-green rule with no wait turns a red gate into a deadlocked one. The gate is therefore: poll the required-check rollup until every required context has *concluded* (bounded, with a documented timeout), merge if all concluded `SUCCESS`, hard-fail otherwise — and a timeout is a hard failure too, never a merge. **This extends the PRD-02 §2 wording and is flagged as such in §7 Q-CI-C.** | PRD-02 §2 DEV-004; PRD-02 §4 "Ordering"; measured: branch protection over 6 contexts went live 2026-08-15, so every merge from now on races CI |
| **D-CI4** | **`.claude/scripts/deliver-ticket.mjs` is allocated to `FND-20`, as a single-file carve-out of the `.claude/**` frozen row — and the allocation is recorded *here*, because `breakdown-plan.md` §4 cannot be edited.** `tools/tests/frozen-paths.test.mjs` documents the escape hatch as "allocate the path in breakdown plan §4 by a docs PR FIRST, then remove the entry from this list in a separate change". The first half of that route is unavailable this phase (the phase-2 freeze rule), so this table is the docs record and the guard's `FORBIDDEN` entry is **narrowed, not deleted**: `/^\.claude\//` becomes an entry that still matches every `.claude/` path except that one file. The rest of `.claude/**` — `settings.json`, the commands, the workflows, the other scripts — stays frozen, and the guard keeps its bite. | `tools/tests/frozen-paths.test.mjs` header (ESCAPE HATCH); `breakdown-plan.md` §4 frozen row; PRD-02 §4 (".claude/** is pipeline infrastructure") |
| **D-CI5** | **DEV-007 is met by a scoped-exclusion mechanism, not by renaming identifiers — the renaming route is closed by measurement.** The live scan reports **65 findings, 12 distinct identifiers, 26 files, 8 trees** (§4.1 below). Of those, 9 are in files this repository freezes (`CLAUDE.md`, `.claude/**`), 3 sit in `apps/api/src/bootstrap/**` and 7 in `packages/database/src/crypto/**` — **product code**, whose modification PRD-02 §3 declares out of contract with the Founder as owner — and `FIELD_ENCRYPTION_KEY_INVALID` is a §34.9 **error code**, `IDEMPOTENCY_KEY_MIN_LENGTH`/`_MAX_LENGTH` are part of the **published SDK surface** (`packages/sdk-typescript/parity/surface.json`). Renaming any of them is a public-contract change under PRD §16.1/§45.5, which a repair ticket may not make. PRD-02 §4 anticipates exactly this and authorises "designing a scoped-exclusion mechanism as its own deliverable with its own harness assertions". | Measured 2026-08-15 on `main` @ `0b19067` by `node .github/workflows/checks/secret-scan.mjs`; PRD-02 §3 Non-goals; PRD-02 §4; PRD §16.1, §34.9, §45.5 |
| **D-CI6** | **The exclusion record must not itself contain a credential-shaped literal, so exclusions are keyed by `path` + `patternId` + the **SHA-256 digest** of the excluded identifier — never by the identifier's text, and never by a wildcard.** A file listing `CANARY_CREDENTIAL` in plain text would be flagged by the very scan it configures (`scanRepository` reads every git-tracked file, and `excludedPaths` is asserted to hold exactly one entry). Digest-keying also makes the mechanism strictly narrower than an allowlist: a *different* credential-shaped name appearing in an excluded file still fails, because its digest is not listed. | `.github/workflows/checks/secret-scan.mjs` (`scanRepository`, `ALLOWLIST` length asserted 1); `tools/fixtures/secret-patterns.json#excludedPaths` asserted `toEqual` a single path; PRD-02 §4 ("Appending entries is not an option") |
| **D-CI7** | **`FND-20` lands first and everything else in the phase is `blocked_by` it.** PRD-02 §4 Ordering states the consequence plainly: until DEV-004's ticket lands, every phase-2 ticket hits `gh pr merge` while checks are pending and is reported NOT delivered. The edge is therefore real scheduling, not bookkeeping. `FND-20` itself is `blocked_by` only **delivered** phase-1 tickets, so it is unblocked at t=0. | PRD-02 §4 "Ordering"; PRD-02 §2 DEV-004 |

### 4.1 The DEV-007 measurement (settled — do not re-derive)

`node .github/workflows/checks/secret-scan.mjs` on `main` @ `0b19067`, 2026-08-15, Node 24.18.0:
`1550` files inspected, **65 findings** — 33 `key`, 23 `credential`, 9 `token`.

| Identifier | Count | Files | Owner of those files |
|---|---|---|---|
| `CANARY_CREDENTIAL` | 23 | `packages/sdk-typescript/test/**` (7 files) | `20-developer-platform` (delivered) |
| `ASANA_TOKEN` | 9 | `.claude/commands/connect-asana.md`, `.claude/scripts/asana-sync.mjs`, `.gitignore`, `CLAUDE.md` | **frozen** (`.claude/**`, `CLAUDE.md`) + `00-foundation` (`.gitignore`) |
| `IDEMPOTENCY_KEY_MIN_LENGTH` / `_MAX_LENGTH` | 10 | `packages/sdk-typescript/{src/idempotency.ts,src/sdk.ts,parity/surface.json}` | `20-developer-platform` — **published surface** |
| `FIELD_KEY_UNKNOWN` / `FIELD_KEY_RETIRED` / `FIELD_ENCRYPTION_KEY_INVALID` | 13 | `packages/database/src/crypto/**`, `packages/database/test/crypto/**` | `01-app-data` — **§34.9 error codes** |
| `CHILD_FOREIGN_KEY` | 3 | `packages/database/test/tenant/helpers.ts` | `01-app-data` |
| `CRITICAL_KEY_PREFIX` | 3 | `apps/api/src/bootstrap/{config.ts,index.ts}` | `03-app-runtime` — **product code** |
| `AER_API_KEY` | 1 | `packages/sdk-typescript/README.md` | `20-developer-platform` |
| `API_KEY_HEADER` | 1 | `packages/model-gateway/test/providers/architecture.test.ts` | `12-evidence-safety` |
| `STABLE_SOURCE_KEY` | 2 | `pipelines/corpus-builder/tests/chunking/conftest.py` | `04-corpus-contract` |

**PRD-02 §1's location claim is wrong** and is corrected here: the findings are *not* confined to
`pipelines/corpus-builder/tests/**` and `packages/sdk-typescript/test/**` (those two trees hold 22 of
the 65). The count (65) and the per-pattern split (33/23/9) are correct. This is recorded in §7 as
finding **F-CI1**; it does not change any decision, because D-CI5 follows from the *other* 43.

## 5. Work breakdown and DAG

| Ticket | Title | Size | Lane | File-scope (summary) | `blocked_by` | `blocks` |
|---|---|---|---|---|---|---|
| `FND-20` | Gate delivery on required checks and make an unlanded merge a hard failure | M | `00-foundation` | `.claude/scripts/deliver-ticket.mjs` + `tools/tests/{frozen-paths,deliver-ticket}.test.mjs` + `tools/tests/support/**` | `FND-01`, `FND-11` (both delivered) | `FND-21`, `FND-22`, `FND-23`, `FND-24` |
| `FND-21` | Give CI a base ref and scope the dependency gate to `--prod` | S | `00-foundation` | `.github/workflows/ci.yml` + `.github/workflows/checks/checkout-depth.test.mjs` | `FND-02` (delivered), `FND-20` | — |
| `FND-22` | Make every §45.3 entry command executable on ubuntu and Windows | M | `00-foundation` | `tools/fixtures/entry-commands.json`, `tools/tests/{entry-commands,readme}.test.mjs`, `tools/check-workspace.mjs`, `README.md` | `FND-01` (delivered), `FND-20` | — |
| `FND-23` | `pnpm ci:local`, and close the nanoid advisory | M | `00-foundation` | root `package.json`, `pnpm-lock.yaml`, `tools/ci-local.mjs`, `tools/workspace-script.mjs`, `tools/fixtures/script-owners.json`, `tools/tests/{scripts,ci-local}.test.mjs` | `FND-01` (delivered), `FND-20` | — |
| `FND-24` | A scoped, digest-keyed exclusion mechanism for the secret scan | L | `00-foundation` | `.github/workflows/checks/{secret-scan.mjs,workflows.test.mjs}`, `.github/workflows/fixtures/secret-scan-exclusions.json`, `tools/fixtures/secret-patterns.json`, `tools/tests/secret-scan.test.mjs` | `FND-01`, `FND-02` (both delivered), `FND-20` | — |

**DAG shape** — one root, then a four-wide fan-out. Edges to delivered phase-1 tickets are drawn and
honoured but re-run nothing.

```text
FND-01 (delivered) ─┬─> FND-20 ─┬─> FND-21
FND-11 (delivered) ─┘           ├─> FND-22
                                ├─> FND-23
FND-02 (delivered) ─────────────┴─> FND-24
```

**Recommended `/start-all` concurrency: 4.** Wave 2 is `FND-21`, `FND-22`, `FND-23`, `FND-24` — four
tickets with pairwise-disjoint file scopes (§3), so all four can run as parallel lanes. Wave 1 has
width 1 by construction (D-CI7), so the run is serial for exactly one ticket and then four-wide. Note
that concurrency multiplies concurrent token spend, and that `deliver` is serialised regardless.

**No module is fully serial**, and the phase does not need a re-cut on that ground.

## 6. Human actions — the two acceptance items no ticket can discharge

Both are in PRD-02 §5 and neither is a file change a Builder may make. They are listed here so the
phase is not reported closed while they are outstanding.

1. **`OPS-004` — require all 10 contexts on `main`.** The 10 are the nine `ci.yml` jobs
   (`ts-type-unit`, `openapi-compat`, `migration-schema`, `tenant-auth`, `pii-citation`,
   `rust-build-test`, `python-build-test`, `retrieval-eval-smoke`, `supply-chain-scan`) plus
   `pr-contract.yml`'s `pr-contract`. Six are required already; the remaining four —
   `TypeScript type/unit tests`, `Python builds/tests`, `Dependency, secret, container and artifact
   scans`, `PRD 45.4 pull-request contract` — become requirable only **after** `FND-21`, `FND-22`,
   `FND-23` and `FND-24` have all landed and `main` is green. Changing branch protection is a
   repository-settings write with an admin token; it is outside the agents' sanctioned surface.
   **Owner: Founder.** Do it after the phase, not during it — requiring a context that is still red
   deadlocks the tickets that repair it (PRD-02 §1).
2. **`CLAUDE.md` declares the test command** so `/start-all` and `/start-milestone` pass `--test-cmd`.
   `.claude/commands/start-all.md` reads `testCmd` "if CLAUDE.md declares one", and both workflow
   runners forward it to `deliver-ticket.mjs`. `CLAUDE.md` is frozen and is the human's document;
   no ticket edits it. **Owner: Founder.** `FND-20` supplies the forcing function — with `--test-cmd`
   unset the Definition of Done fails — and `FND-23` supplies the command to declare
   (`set PATH=C:\Users\HoraceHou\AppData\Local\node-24.18.0;%PATH% && pnpm ci:local`, in the
   double-quote-free `cmd.exe` form both runners require).

## 7. Findings and open questions

**F-CI1 — PRD-02 §1's location claim for failure class 3 is wrong** (§4.1). The 65 findings span 8
trees, not 2. Corrected here; no decision changes. Recorded so a reader who reproduces the scan and
sees `apps/api` and `packages/database` in the output does not conclude the repository drifted.

**F-CI2 — the merge race PRD-02 does not name** (D-CI3). Branch protection went live 2026-08-15;
`deliver-ticket.mjs` attempts the merge immediately after opening the PR. From now on *every*
delivery races CI, and DEV-004 read literally makes that race a permanent failure. `FND-20` therefore
waits for the rollup rather than only refusing. **This is the one place this decomposition adds
requirement surface the PRD does not state**, and it is flagged rather than buried.

**F-CI3 — `FND-20`'s own delivery may need a human.** It is built and merged by the *old*
`deliver-ticket.mjs`, which will attempt the merge while the six required contexts are pending and
report the ticket NOT delivered. Mitigation, in order of preference: (a) re-run the deliver step once
the checks have concluded — an existing open PR is detected and the merge retried, no second build;
(b) a human merges the PR on the web and a resume run closes and verifies the issue. Neither is a
code change. Recorded because it will otherwise read as `FND-20` failing its own acceptance.

| # | Open question | Owner |
|---|---|---|
| **Q-CI-A** | Exactly which command string does `CLAUDE.md` declare as the DoD test command — `pnpm ci:local` alone, or `pnpm ci:local` plus the `pnpm test` the Reviewer already runs? `FND-23` fixes what `ci:local` *does*; which string the constitution names is the Founder's. | **Founder** |
| **Q-CI-B** | How long may `deliver-ticket.mjs` wait for required checks before a timeout hard-fail (D-CI3)? `FND-20` specifies a default and makes it overridable; the number is an operations judgement about how long a lane may hold a worktree. | **Founder**, via `FND-20`'s Feedback obligation |
| **Q-CI-C** | Should the deferred scheduled full-tree audit (D-CI1's accepted cost) become a phase-3 ticket, and when? Deliberately **not** a deliverable here. | **Founder** |
| **Q-CI-D** | `pwsh` is preinstalled on `ubuntu-latest` today, and `FND-22` depends on that. If a future runner image drops it, the §45.3 PRD-validation command has no ubuntu interpreter and the durable fix moves to the PRD text or to unfreezing `tools/validate-prd.ps1` — both outside any Builder's scope (the same escalation `FND-01`/D18 already raised). | **Architect/Founder** |

**ADR candidates raised, not authored** (`docs/adr/` holds four entries, none of which bears on the CI
gate — checked 2026-08-15):

- *How the delivery script decides a merge is safe* — polling a forge's check rollup versus
  `--auto`-merge versus a human gate. Trigger: the first timeout escalation under D-CI3. Owner:
  **Architect**.
- *How a repository-wide scanner records a justified exception* — digest-keyed scoped exclusions
  (D-CI6) versus per-file suppression comments versus narrowing the patterns. Trigger: the exclusion
  list exceeding roughly 40 entries, or a second scanner needing the same mechanism. Owner:
  **Architect**.

## 8. Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-08-15 | Initial phase-2 decomposition of `docs/PRD-02-ci-repair.md` into five `00-foundation` tickets `FND-20` … `FND-24` (D-CI2). Records the phase-2 file-scope allocation and decision register here rather than in the frozen module README (§0), continues ids past the `FND-13`/`FND-15`–`FND-18` gaps with reasons (§2), and adds four Architect decisions: the merge must *wait* for the check rollup rather than only refuse (D-CI3), `.claude/scripts/deliver-ticket.mjs` is carved out of the frozen row by narrowing the guard rather than deleting its entry (D-CI4), DEV-007 is met by a scoped mechanism because renaming is closed off by measurement (D-CI5), and exclusions are digest-keyed so the record cannot flag itself (D-CI6). Corrects PRD-02 §1's location claim for failure class 3 (F-CI1). |
