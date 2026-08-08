# 00-foundation — sub-PRD

> Parent decomposition: [`docs/prd/breakdown-plan.md`](../breakdown-plan.md) §3, §4, §5.1, §6.2, §7, §8.
> Master spec: [`docs/PRD.md`](../../PRD.md) — AustraliaEmploymentRAG MVP v1.0, revision 2.0, 3 August 2026.
> Ticket files under `tickets/` are the executable source of truth. Where this README and a ticket
> disagree, **the ticket wins** (CLAUDE.md, issue #53); where a ticket and the breakdown plan disagree,
> the ticket wins but the divergence must be written back to the plan.

| Field | Value |
|---|---|
| Module | `00-foundation` |
| Lane | `00-foundation` |
| Ticket prefix | `FND` |
| Tickets | 11 (`FND-01` … `FND-11`) |
| Epics | `E01-REPO`, `E02-CONTRACTS`, `E03-DOMAIN` (PRD §44.2) |
| Depends on | nothing — this is the root module of the whole PRD DAG |
| Version | v0.7 |

## Problem

The repository is empty of product code. PRD §20.1 requires a specific monorepo layout, requires that
"contracts and framework-independent domain rules are centralised", and names the artifacts that
"require serialised ownership during multi-agent work": *"Lockfiles, canonical enums, OpenAPI roots,
migration sequence, corpus manifest schema and production deployment files"*. PRD §44.3 repeats the
list and adds the reason: those artifacts sit on the critical path
(`contracts/domain → app + corpus schemas → …`) and every other module reads them.

Until they exist, **nothing else in the 237-ticket plan can start**: 24 of the 25 modules are
transitively blocked on this one. Concretely, four things are missing and have exactly one safe owner:

1. **Toolchain pins and a runnable workspace.** PRD §45.3 lists fourteen entry commands and states
   *"Exact Node/pnpm/Python/Rust versions belong in committed tool-version files and lockfiles selected
   in E01, not in human memory. CI and local development use the same pinned versions."* The versions
   themselves are settled — breakdown plan §8 **Q12 (CONFIRMED)** fixes Node.js `24.18.0`, pnpm
   `11.4.0`, Rust `1.97.1` and Python `3.14.6` — but no file in the repository records them yet, so
   `FND-01` commits the pin files and proves a clean bootstrap against them (decision **D17**).
2. **CI gates.** PRD §20.3 lists nine gate classes that must run before anything merges, plus the
   release-candidate extras. Without them the pipeline's "tests green" claim is unverifiable.
3. **Canonical contracts.** PRD §35.1: *"Enumerations use checked text values generated from
   `packages/contracts`."* PRD §34 preamble: *"The OpenAPI file at `schemas/openapi/openapi.yaml` will
   be the generated-code source of truth."* PRD §16.1: *"Webhooks carry their own schema version."*
   A second copy of any of these is a silent product-behaviour fork.
4. **Framework-free domain rules.** PRD §45.2 gives `packages/domain` *"Pure permissions, state
   transitions, evidence/budget rules"* and forbids it *"Framework, database or network code"*;
   PRD §39.1 adds *"`packages/domain` imports no Fastify, React, SQLite driver, provider SDK or
   Cloudflare/AWS library."* PRD §45.2 also forbids `apps/api` from owning *"Duplicated business
   rules"* — so the rules must exist before the surfaces that would otherwise re-derive them.

## Scope

In scope for this module, and nowhere else in the repository (breakdown plan §4 write-owns row):

- Root manifests and lockfiles: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`,
  `.node-version`, `tsconfig.base.json`, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`,
  `pyproject.toml`, `uv.lock`, `.editorconfig`, `README.md`, `.gitignore`.
- `tools/**` — **except** the two pre-existing PowerShell scripts, which the plan freezes.
- `.github/workflows/**`.
- `packages/contracts/**` — canonical enums, opaque ID conventions, OpenAPI root bindings, event
  schema bindings, generated output.
- `packages/domain/**` — access, answers, workflow, budget, legal rule families.
- `schemas/openapi/**` and `schemas/events/**`.

## Non-goals

Each exclusion names its owner, so no `FND-*` ticket "helpfully" absorbs it:

- **No database schema, migrations, repositories or encryption** — `01-app-data` owns
  `packages/database/**` (breakdown plan §4; PRD §45.2 gives `packages/database` exactly that scope).
  `FND-03`'s enum registry is *consumed* by `DATA-01` to generate SQLite check constraints (PRD §35.1);
  `00-foundation` never writes a migration. The SQLite access layer itself is settled by breakdown plan
  §8 **Q13 (CONFIRMED)** — Kysely-style repositories over `better-sqlite3`, Drizzle not used, raw `.sql`
  the only migration authoring format — and is `DATA-01`'s to implement, not this module's to choose.
- **No HTTP server, route, middleware or SSE transport** — `03-app-runtime` (`RUNT-01` … `RUNT-03`)
  and the product modules own `apps/api/**`. `FND-04` publishes the contract; it does not serve it.
- **No corpus schema, corpus manifest or chunker** — `04-corpus-contract` (`CRPS-01`, `CRPS-02`),
  serial-owned per PRD §44.3 and breakdown plan §4.1.
- **No retrieval implementation** — `11-retrieval-engine`. `FND-10` supplies the §36.2 eligibility
  predicate and §36.3 feature order as pure code; `RETR-*` executes them against real indexes.
- **No PII detection, evidence packs, citation validation or model gateway** — `12-evidence-safety`.
  `FND-07` decides answer status from validated inputs; it does not validate citations.
- **No UI components, screens or accessibility work** — `03-app-runtime` (`RUNT-05`, `RUNT-06`) and the
  product modules. `packages/ui` is explicitly module 03's (breakdown plan §4.2, decision A6).
- **No notification delivery of any kind** — `16-monitor-alerts` owns the email, in-app and webhook
  channels. `FND-05` ships the webhook/SSE *contract* only; the transactional email provider is
  breakdown plan §8 **Q14 (CONFIRMED)** — Resend on its free transactional tier — owned by `WTCH-04`
  and `WTCH-09`.
- **No evaluation cases, gold data or runner** — `21-evaluation-600`. Breakdown plan §9 R9 and PRD
  §45.1 item 6 forbid exposing blind gold to ordinary coding agents; no `FND-*` ticket may read
  `evals/gold/**`.
- **No cross-boundary test suites** — `tests/{integration,tenant-isolation,security,e2e}` belong to
  `23-assurance` (breakdown plan §1.1 "Tests"). Every `FND-*` ticket's tests live inside the package
  it owns.
- **No infrastructure, deployment or Compose files** — `18-ops-release` (production, PRD §39.2) and
  `03-app-runtime`/`RUNT-09` (local/CI Compose). Breakdown plan §2.1 decision A7.
- **No ADR is authored here by default.** `docs/adr/` is empty; per breakdown plan §1.1 every ticket in
  this module cites the PRD directly and uses the no-ADR form, and where a breakdown plan §8 register
  entry settles a choice the ticket cites that entry (D17 for Q12) instead of deciding locally. If a
  ticket genuinely needs an ADR, ADRs are shared-additive per-file (decision A9) and the ticket claims
  `docs/adr/NNNN-<slug>.md`; the triggers are the escalation paths named in each ticket's Feedback
  obligation and the open questions below.

## Decisions

Every decision names its basis: a PRD section, a breakdown-plan section, or a §2.1 ADR candidate.
None of these are new product rules; where a rule had to be *chosen* rather than transcribed, it is
flagged and appears in Open questions as well.

| # | Decision | Basis |
|---|---|---|
| D1 | `FND-01` is the single wave-1 ticket for the entire PRD and owns every version pin (Node, pnpm, Rust toolchain, Python) plus all three lockfiles. It **commits** the versions fixed by D17; it does not select them. Any later ticket adding a dependency regenerates the lockfile as a build artifact and never hand-merges it. | PRD §45.3 ("selected in E01"); PRD §44.3 serial owners; breakdown plan §4.1 and §7 (whole-PRD wave 1 has width 1); D17 |
| D2 | `FND-01` also creates the **empty workspace-member skeleton** — one manifest (`package.json` / `Cargo.toml` / `pyproject.toml`), one `tsconfig.json` where applicable and one empty entry file per PRD §20.1 member — after which each member's manifest belongs to the owning module, append-only within that module. | Breakdown plan §1.1 "Package manifests"; extended to the entry file because `pnpm typecheck`, `cargo test --workspace` and `uv run pytest` cannot run on a manifest alone (interpretation — see Open questions Q-F1) |
| D3 | Root `package.json` scripts are **recursive delegators** (`pnpm -r --if-present run <name>`), and `pnpm-workspace.yaml` uses **globs**, not an enumerated member list. A later module therefore never edits a root file to register itself. | PRD §44.3 (root lockfiles/manifests are serial-owned — the fewer writers the better); breakdown plan §2 (the cut is file ownership) |
| D4 | The nine PRD §20.3 gate classes each become a **separately named, always-running CI job**, vacuously green where the subject code does not exist yet. A gate is never commented out, skipped or added later. | PRD §20.3; PRD §44.2 E01 exit evidence "Clean bootstrap/build/test" |
| D5 | Release-candidate-only checks (integration, restore, evaluation, compatibility, rollback) live in a **separate workflow** that does not trigger on `pull_request`. | PRD §20.3 ("Release candidates *additionally* run …") |
| D6 | **Enum members live in `packages/contracts` (`FND-03`); the rules that consume them live in `packages/domain`.** `FND-03` therefore owns `Role`, `Permission`, `AuthorityLevel`, `ApiScope`, ledger kinds and the async-state set even though those sections are not in its §5.1 "PRD refs" column — its stated goal is *one generated source for every controlled value in the product*. | PRD §35.1; PRD §44.3; breakdown plan §4.2 ("Canonical enums — sole owner `00` (`FND-03`), would have been shared with everything") |
| D6a | **Cross-family member collisions are declared, not forbidden.** Transcribing the twenty `FND-03` families from the PRD produces exactly five members that legitimately appear in two families: `INSUFFICIENT_EVIDENCE` (§8.4 / §8.5), `CONDITIONAL` (§8.4 / §15.5), `SOURCE_NOT_CURRENT` (§8.4 / §34.9), `REVIEW_REQUIRED` (§8.7 / §11.1) and `DRAFT` (§8.7 / §16.3). The enum tests assert the observed overlap set equals exactly that declared set — so a *sixth*, accidental collision fails — and that each colliding pair remains two separate named types whose guards reject the other family's non-shared members. A shared string literal is the same literal type in both derived unions by construction; branding every member to prevent that would break the generated SQLite `CHECK` / OpenAPI enum surface this registry exists to serve, so the separation asserted is between the named families, not the literal. | PRD §8.4, §8.5, §8.7, §11.1, §15.5, §16.3, §34.9 (each collision is the PRD's own spelling); PRD §35.1; `FND-03` acceptance item 4 as amended under its Feedback obligation |
| D7 | The §34.9 error-code **identifiers** are enums (`FND-03`); their **HTTP status / retryable mapping and response schema** are the OpenAPI root (`FND-04`). `FND-04` is `blocked_by FND-03`, so the ordering holds. | PRD §34.9; PRD §16.1 uniform error shape; breakdown plan §5.1 (`FND-03` refs §34.1, `FND-04` refs §34.1–34.9) |
| D8 | `schemas/events/**` covers **both** transports: signed webhook envelopes (PRD §34.8) and the SSE event payloads (PRD §34.4). `FND-05`'s §5.1 file-scope is the whole tree and no other module may write it; `RUNT-03` and `WTCH-05` are consumers. | Breakdown plan §5.1 (`FND-05` file-scope `schemas/events/**`, no carve-out); PRD §16.1; PRD §20.1 (`schemas` = "Versioned contract roots") — interpretation, see Q-F2 |
| D9 | Generated output is segregated by owner: `packages/contracts/src/generated/**` is `FND-04`'s (OpenAPI); event bindings generate into `packages/contracts/src/events/generated/**` (`FND-05`). Both carry a do-not-edit banner and are covered by `pnpm generated:check`. | PRD §20.1 ("Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited"); DEV-001 |
| D10 | `packages/domain` is split into **five sibling leaf subtrees** (`access`, `answers`, `workflow`, `budget`, `legal`) that never import one another. Where two families need the same concept, the shared type is an enum in `packages/contracts` and the coupling is **structural**, not an import. | PRD §39.1 dependency rule; breakdown plan §7 (this module's seven-lane wave 3 exists only because the five subtrees are disjoint) |
| D11 | `FND-07` (answer status) must compare authority levels but must **not** own the hierarchy — it declares a structural port `AuthorityComparator` typed over `AuthorityLevel` (contracts); `FND-10` exports a matching function. Neither imports the other; `12-evidence-safety`/`EVID-05` wires them. | PRD §9.1 (cited by both tickets); D10; breakdown plan §5.1 (FND-10's title carries "authority hierarchy") |
| D12 | Effective intervals are **closed and inclusive** — `[effective_from, effective_to]`, `effective_to: null` meaning open-ended — and adjacent versions must satisfy `next.effective_from > prev.effective_to`. | PRD §35.2 `document_version` constraint *"non-overlap validation where versions represent consolidated effect"*; PRD §34.2 example payload. **Cross-module semantic** shared with `CRPS-01` — see Q-F4 |
| D13 | Where two conditions in the PRD §36.8 refusal table hold simultaneously, the **more restrictive** status wins; a status more permissive than any triggered condition is never selected. | PRD §2 ("visible uncertainty and refusal when evidence is insufficient"); PRD §9.4 ("remaining unsupported claims MUST be removed and the answer downgraded/refused") — chosen precedence, see Q-F3 |
| D14 | Unit and integration tests live inside the owning package, in a directory whose **leaf segment matches the ticket's own source leaf** (`packages/contracts/test/enums/**` for `FND-03`, `packages/domain/test/legal/**` for `FND-10`, …), keeping sibling test scopes disjoint. | Breakdown plan §1.1 "Tests"; the `DATA-02` row in plan §5.1 uses exactly this shape (`packages/database/test/architecture/**`) |
| D15 | Money is **integer micro-AUD** (`bigint`) everywhere in `packages/domain/src/budget/**`; floating-point money is a test failure, not a review comment. | PRD §34.1 ("Integer micro-AUD for internal cost; never floating point"); PRD §42.6 |
| D16 | Within this module, `packages/contracts/package.json` and `packages/domain/package.json` are **append-only shared**: a ticket adds only its own script/dependency entries and never reorders or removes another ticket's. Conflicts resolve by re-running the package manager. | Breakdown plan §1.1 "Package manifests" (the same rule PRD §44.3 imposes on root lockfiles) |
| D17 | **The exact toolchain versions are Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1` and Python `3.14.6`.** This module *implements* that decision; it does not make it. Committed pin files, at minimum: `.node-version`, `package.json#packageManager`, `package.json#engines.node`, `rust-toolchain.toml`, `pyproject.toml#requires-python` and the corresponding lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`). Binding rules: Node **24 LTS**, not Node 26 while it is still Current; no silent upgrade to a newer patch or major during implementation; CI and local development use the same exact versions (`FND-02` reads the pin files and states no version literal of its own); if `FND-01`'s clean bootstrap proves an accepted version incompatible with a mandatory dependency, the evidence is recorded through `FND-01`'s feedback obligation — this README and the ticket — **before** any version is changed. Developer preference is not a reason to reopen it. | Breakdown plan §8 **Q12 (CONFIRMED)**, owner `00-foundation`, resolving ticket `FND-01`; PRD §45.3 ("committed tool-version files … CI and local development use the same pinned versions"); PRD §18.2 ("Active LTS Node.js pinned to an exact version") |
| D18 | **PRD §45.3 entry command 2 is invoked with an explicit `-Path docs/PRD.md`.** As §45.3 spells it, `powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1` exits **1**: the script defaults `-Path` to `(Split-Path $PSScriptRoot -Parent)/PRD.md` — repo-root `PRD.md` — while this repository's PRD lives at `docs/PRD.md`. With `-Path docs/PRD.md` it exits 0 (`Result : PASS`). The script is **frozen** (breakdown plan §4) and `docs/PRD.md` is frozen, so the argument is the only resolution inside `FND-01`'s file-scope, and it is spec, not a workaround: the §45.3 string stays verbatim in the root README and in the entry-command fixture, the difference is recorded as a `deviation` field on that one fixture entry, and **no fixture entry may carry a failure waiver** (`known_failing` and equivalents are forbidden and asserted absent) — a command that cannot exit 0 is a red acceptance item and an escalation, never a green annotation. **Escalation raised, non-blocking:** the durable fix is either the frozen script's default path (breakdown plan §4 must unfreeze it) or the PRD §45.3 text; both sit outside this module and belong to the Architect/founder. | `FND-01` v1.1 (Background caveat, deliverables 8 and 10, acceptance item 2) under its Feedback obligation 5; PRD §45.3 (normative command list); breakdown plan §4 (frozen `tools/*.ps1`) |
| D19 | **The delegator script names `FND-02`'s CI gates invoke are fixed, and a later ticket adopts the name rather than inventing one.** `ci.yml` runs `pnpm -r --if-present run <name>` for `test:openapi-compat` (`FND-04`), `test:migrations` (`DATA-01`), `test:tenant` (`DATA-02`), `test:pii-citation` (`EVID-01`), `scan:container` and `scan:licence` (`RLSE-*`); `release-candidate.yml` runs `pnpm test:integration` (`ASSR-*`) plus `rc:restore`, `rc:evaluation`, `rc:compatibility`, `rc:rollback` and `release:artifact` (`RLSE-01` … `RLSE-04`). Until the owning ticket registers its script in a workspace member's `package.json`, `pnpm -r --if-present` matches nothing and exits 0 — a vacuously **passing** gate, never a skipped one (D4). A ticket that registers a *different* name leaves its gate vacuous forever, which is why the names are written down here and not only in the workflow. | `FND-02` deliverable 3 and Feedback obligation 5; `FND-01` deliverable 2 (the delegator); breakdown plan §1.1 "Tests"; PRD §20.3 |
| D20 | **Two `FND-02` implementation allocations, both the same class of unallocated-path gap as Q-F6, both recorded rather than resolved unilaterally.** (a) The `setup` composite action lives at **`.github/workflows/actions/setup/action.yml`** — breakdown plan §4 allocates `.github/workflows/**` and says nothing about `.github/actions/**`, and GitHub reads workflows only from the top level of `.github/workflows/`, so a subdirectory is safe and stays inside the allocated path. The check scripts and the gate fixture live under `.github/workflows/checks/**` and `.github/workflows/fixtures/**` for the same reason (the ticket itself places the fixture there). (b) The CI **secret scan** applies all eight `tools/fixtures/secret-patterns.json` patterns to every git-tracked file **except** that under `docs/**` it applies only the value-shaped `private-key-block` pattern: seven of the eight match credential-shaped *variable names*, and the planning corpus necessarily writes those names down (`RESEND_API_KEY`, `AER_TEST_SECRET`, `FIELD_ENCRYPTION_KEY_INVALID` are error codes and configuration prose in frozen or other-module-owned files). Naming a variable is not holding a credential; an inlined private key in prose still fails. The harness asserts the narrowing is one non-wildcard prefix and that the value-shaped scan really does read `docs/**`. If the Architect prefers `.github/actions/**` or a different scan scope, both are one-file moves. | `FND-02` File-scope (`.github/workflows/**`); breakdown plan §4 (unallocated `.github/actions/**`, same gap as **Q-F6**); PRD §20.2, §20.3 ("secret … scans") |
| D13a | **Refines D13 — the §36.8 table is not total over `FND-07`'s signal record, and the gap is closed by one *named derived* condition, never by an unnamed default.** Exactly one of the 64 signal combinations fires no §36.8 row: `allMaterialClaimsSupported = false` with every restrictive signal absent (`sufficientApplicableEvidence = true`, `materialFactUnknown = false`). `decideAnswerStatus` must still return an `AnswerStatus`. The derived condition **`MATERIAL_CLAIMS_UNSUPPORTED`** fires when `allMaterialClaimsSupported === false` and no row above `SUPPORTED` has fired, and resolves to **`INSUFFICIENT_EVIDENCE`**. It is derived, not transcribed: the fixture's `prd_36_8` section keeps exactly the nine PRD rows, the derived condition lives in a separate `derived_conditions` section, and it appears in the returned fired-conditions list like every other condition, so the choice is visible rather than silent. Same product ambiguity as **Q-F3**, one layer down — owner **Founder**, falsifiable by the `21-evaluation-600` refusal cases. | PRD §9.4 (*"remaining unsupported claims MUST be removed and the answer downgraded/refused"*); ANS-005, PRD §30.2 (*"unsupported definitive claim count is zero"*); D13; `FND-07` Feedback obligation, General rule |
| D21 | **A claim is `definitive` iff it is material, its asserted short answer is `Yes` or `No`, and it is not asserted subject to a condition or assumption.** `Likely`, `Depends` and `insufficient evidence` are non-definitive. `FND-07`'s `isDefinitiveClaim` is the single implementation; **`EVID-05` and `21-evaluation-600` measure ANS-005's "unsupported definitive claim count is zero" against it and must be notified before it changes**, otherwise the release-register metric silently changes denominator in three places. The PRD grades assertiveness in exactly one place — §8.4's short-answer vocabulary — so the definition is derived from it rather than coined. | PRD §8.4 (short-answer vocabulary; item 3 "Conditions and assumptions"); PRD §15.5; ANS-005 (PRD §30.2); `FND-07` deliverable 7 |

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| One "contracts" ticket covering enums + OpenAPI + events | Collapses the module's seven-wide wave 3 into a serial chain and contradicts breakdown plan §4.1, which gives canonical enums, the OpenAPI root and the event root three distinct serial-owner rows. |
| One `packages/domain` ticket | Five unrelated rule families (access, answers, workflow, budget, legal) in one write-set; the §7 lane profile for this module (max useful lanes 7) is a direct consequence of the split. It would also make every downstream module wait on all five. |
| Fold CI into `FND-01` | `.github/workflows/**` is a separate write-set with a different blast radius, and `FND-01` is already the single wave-1 blocker for 236 tickets. Breakdown plan §5.1 assigns them separately; `RLSE-01` depends on `FND-02` alone, not on the bootstrap. |
| Let `01-app-data` own the enums (generate contracts from the schema) | PRD §35.1 fixes the direction: *"Enumerations use checked text values generated from `packages/contracts`."* PRD §44.3 puts canonical enums under a serial owner in the foundation. Inverting it would make every product module's controlled values depend on migration order. |
| Hand-write the TypeScript client instead of generating it | DEV-001's acceptance evidence is literally *"Generated-client diff is clean in CI"*, and PRD §20.1 forbids hand-editing generated bindings. |
| An enumerated `pnpm-workspace.yaml` member list | Every later module would have to edit a root file that `00-foundation` owns forever — a guaranteed serial bottleneck under parallel lanes (breakdown plan §9 R7 is the same failure mode for lockfiles). |
| Put SSE payload schemas in `apps/api/src/sse/**` | `RUNT-03`'s file-scope is the transport, not the contract; the schema would then be invisible to the SDKs (`PLTF-02`/`PLTF-03`) and to `23-assurance`. See D8. |
| Give `FND-07` the authority hierarchy because it cites §9.1 | Would duplicate `FND-10`'s titled scope and create an import between two concurrently-running wave-3 tickets. Resolved by D11's structural port. |
| Let `FND-01` pick "the latest Active LTS" at bootstrap time | Breakdown plan §8 Q12 already fixed the four versions, and a floating "latest LTS" reintroduces exactly the drift PRD §45.3 forbids ("not in human memory"). `FND-01` commits D17's values; a bootstrap failure is evidence to write back, not licence to choose. |

## Open questions

Each has a named owner, and every one of them is module-local (`Q-F*`) — identified while authoring
these tickets, not inherited from the breakdown plan.

**No breakdown plan §8 register entry is open for this module.** §8 **Q12** (exact toolchain versions)
is CONFIRMED and recorded above as decision **D17**. The §8 entries this module's tickets cite inbound
are settled or deliberately unfixed elsewhere: **Q13** (SQLite access layer — Kysely-style repositories
over `better-sqlite3`, Drizzle not used, raw `.sql` the only migration authoring format) is CONFIRMED
and owned by `01-app-data`/`DATA-01`; **Q14** (transactional email provider — Resend, free
transactional tier) is CONFIRMED and owned by `16-monitor-alerts`/`WTCH-04` and `WTCH-09`; **Q1**
(hosted model per profile, cited by `FND-09`) and **Q4** (retrieval constants, cited by `FND-10`) are
**benchmark-selected** — resolved from measured evidence through `GOLD-15` and `RETR-10`/`GOLD-15`
respectively — and neither blocks any `FND-*` ticket.

| # | Question | Owner | Resolved by | Blocks | Writeback target |
|---|---|---|---|---|---|
| Q-F1 | Does the "empty workspace-member skeleton" (breakdown plan §1.1) include one entry file per member, or manifests only? `FND-01` needs entry files for `pnpm typecheck` / `cargo test --workspace` / `uv run pytest` to exit 0. | Builder of `FND-01`; escalates to the Architect if a member needs more than an empty entry file | `FND-01` | Nothing — D2 records the working answer | `docs/prd/breakdown-plan.md` §1.1 "Package manifests" row **and** this README, before writing anything beyond an empty entry file |
| Q-F2 | Are SSE event payload schemas (PRD §34.4) part of `schemas/events/**`? `FND-05`'s file-scope has no carve-out and no other module may write the tree (D8). | Builder of `FND-05`, confirmed by the Builder of `RUNT-03` when it consumes them | `FND-05`; re-checked at `RUNT-03` | Nothing | This README (D8) and `docs/prd/breakdown-plan.md` §5.1 if `RUNT-03` needs a different split |
| Q-F3 | Precedence when two PRD §36.8 refusal-table conditions hold at once — the PRD states the conditions but not their order. D13 chooses "most restrictive wins". **Extended by D13a (v0.7):** the table is also not *total* over `FND-07`'s signal record — exactly one of the 64 combinations fires no row — and D13a's derived `MATERIAL_CLAIMS_UNSUPPORTED → INSUFFICIENT_EVIDENCE` closes that gap. Same ambiguity, same owner. | **Founder** (a `PRODUCT_AMBIGUITY` classification under PRD §43.4; PRD §45.5 "Product change") | Recorded by `FND-07`; falsifiable by the `21-evaluation-600` refusal cases | Nothing — D13 is buildable today | `docs/prd/00-foundation/README.md` (D13) first, then the ticket; a change in customer-visible refusal behaviour also needs a PRD update per §45.5 |
| Q-F4 | Is `effective_to` inclusive (D12)? The predicate lives in `FND-10`; the columns live in `CRPS-01` (`04-corpus-contract`), and the two run concurrently. | Builder of `FND-10` records it; Builder of `CRPS-01` must match | `FND-10`, confirmed at `CRPS-01` | Boundary-date correctness for `RETR-*`, `UAT-SRCH-03` | `docs/prd/breakdown-plan.md` §4.2 (a contested *semantic*, not a contested path) plus this README, before either side changes convention |
| Q-F5 | Per-mode permitted legal-status sets (`CURRENT_LAW` / `HISTORICAL` / `FUTURE_OR_PROPOSED`). PRD §6.7 and §36.2 give the invariants (default = in force at the requested date; future never relabelled current; `STATUS_UNCONFIRMED` never definitive) but not the exact sets. | **Founder** (product ambiguity, PRD §45.5); drafted by the Builder of `FND-10` | `FND-10` records the initial table; validated by `21-evaluation-600` | Nothing — the invariants are hard and buildable | This README + the `FND-10` ticket; a customer-visible change needs founder approval per PRD §45.5 |
| Q-F6 | No module owns `.github/PULL_REQUEST_TEMPLATE.md` or `.github/ISSUE_TEMPLATE/**` (breakdown plan §4 allocates only `.github/workflows/**`), yet PRD §45.4 requires every PR to state requirement and UAT IDs and the current template has no such section. **Still open** — the §8 decision register does not allocate these paths. | Builder of `FND-02` raises it; the **Architect** decides the allocation | `FND-02` — its PR-contract job must work against the template as it stands | Nothing; the gate degrades to a tolerant check | `docs/prd/breakdown-plan.md` §4 (add the path to a module's write-owns row) — `FND-02` must **not** edit the template unilaterally |
| Q-F7 | ~~Does `FND-01` need a root file outside plan §4's enumerated list (e.g. a root `conftest.py` so `uv run pytest` exits 0 on an empty tree)?~~ **Answered by `FND-01` (v0.3, 2026-08-07): one file — `.gitignore`, not `conftest.py`.** The pytest exit-code-5 problem is solved inside the already-owned `tools/**` by `tools/pytest_exit_zero_when_empty.py`, loaded from root `pyproject.toml` (`[tool.pytest.ini_options] pythonpath = ["."]`, `addopts = "-p tools.pytest_exit_zero_when_empty"`), so no root `conftest.py` exists. `.gitignore` is required because the first bootstrap creates `node_modules/`, `target/`, `.venv/`, `.pytest_cache/` and `__pycache__/`. Written back to breakdown plan §4 and to this README's Scope in the same PR. | Builder of `FND-01` | `FND-01` | Nothing | Done — `docs/prd/breakdown-plan.md` §4 `00-foundation` row + this README's Scope section |

## Work breakdown

`lane` = `00-foundation` and `agent` = `builder` for all eleven tickets (breakdown plan §1.1). File-scopes
below are write-owns and are disjoint between every pair of tickets that can run concurrently.

| Ticket | Title | Size | Lane | File-scope (write-owns) | Depends on (`blocked_by`) |
|---|---|:---:|---|---|---|
| [`FND-01`](tickets/FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md) | Monorepo bootstrap, pinned toolchains, workspace skeleton | L | `00-foundation` | root manifests + lockfiles, `tools/**` (excl. the two frozen `.ps1`), `README.md`, the empty PRD §20.1 member skeleton | — |
| [`FND-02`](tickets/FND-02-ci-gate-pipeline.md) | CI gate pipeline | M | `00-foundation` | `.github/workflows/**` | `FND-01` |
| [`FND-03`](tickets/FND-03-canonical-enums-and-opaque-id-conventions.md) | Canonical enums and opaque ID conventions | M | `00-foundation` | `packages/contracts/src/{enums,ids}/**`, `packages/contracts/test/{enums,ids}/**` | `FND-01` |
| [`FND-04`](tickets/FND-04-openapi-root-and-generated-typescript-bindings.md) | OpenAPI root and generated TypeScript bindings | L | `00-foundation` | `schemas/openapi/**`, `packages/contracts/src/{openapi,generated}/**`, `packages/contracts/test/{openapi,generated}/**` | `FND-03` |
| [`FND-05`](tickets/FND-05-event-and-webhook-schema-root.md) | Event and webhook schema root | M | `00-foundation` | `schemas/events/**`, `packages/contracts/src/events/**`, `packages/contracts/test/events/**` | `FND-03` |
| [`FND-06`](tickets/FND-06-domain-role-permission-matrix-and-resource-membership.md) | Domain: role/permission matrix and resource membership | M | `00-foundation` | `packages/domain/src/access/**`, `packages/domain/test/access/**` | `FND-03` |
| [`FND-07`](tickets/FND-07-domain-answer-status-claim-support-citation-role-refusal-table.md) | Domain: answer status, claim support, citation role, refusal table | M | `00-foundation` | `packages/domain/src/answers/**`, `packages/domain/test/answers/**` | `FND-03` |
| [`FND-08`](tickets/FND-08-domain-record-workflow-state-machine-and-etag-rules.md) | Domain: record workflow state machine and ETag rules | M | `00-foundation` | `packages/domain/src/workflow/**`, `packages/domain/test/workflow/**` | `FND-03` |
| [`FND-09`](tickets/FND-09-domain-budget-quota-and-funding-ledger-rules.md) | Domain: budget, quota and funding-ledger rules | M | `00-foundation` | `packages/domain/src/budget/**`, `packages/domain/test/budget/**` | `FND-03` |
| [`FND-10`](tickets/FND-10-domain-temporal-applicability-and-authority-hierarchy.md) | Domain: temporal applicability and authority hierarchy | M | `00-foundation` | `packages/domain/src/legal/**`, `packages/domain/test/legal/**` | `FND-03` |
| [`FND-11`](tickets/FND-11-repair-repo-wide-frozen-path-guard.md) | Repair the repo-wide frozen-path guard | S | `00-foundation` | `tools/tests/frozen-paths.test.mjs` | `FND-01` |

### Lane shape

Breakdown plan §7: 11 tickets · min waves **3** · max useful lanes **7** · peak lanes **7** · **not
fully serial**.

```text
wave 1   FND-01
wave 2   FND-02 │ FND-03 │ FND-11
wave 3   FND-04 │ FND-05 │ FND-06 │ FND-07 │ FND-08 │ FND-09 │ FND-10
```

The serialisation that does exist is intrinsic: nothing can be typechecked before the toolchain is
pinned (`FND-01`), and no controlled value can be referenced before it is declared once (`FND-03`,
serial-owned per PRD §44.3).

### Outbound edges (breakdown plan §6.2)

Every ticket's `blocks` list is the exact inverse of the plan's ticket DAG, including cross-module
dependents:

| Ticket | Blocks |
|---|---|
| `FND-01` | `FND-02`, `FND-03`, `LNCH-01` |
| `FND-02` | `RLSE-01` |
| `FND-03` | `FND-04`, `FND-05`, `FND-06`, `FND-07`, `FND-08`, `FND-09`, `FND-10`, `DATA-01`, `RUNT-06`, `RUNT-07`, `CRPS-01`, `EVID-01`, `EVID-07`, `GOLD-01` |
| `FND-04` | `RUNT-01`, `RUNT-05`, `RETR-09`, `PLTF-01`, `PLTF-02`, `PLTF-03` |
| `FND-05` | `WTCH-05`, `PLTF-02`, `PLTF-03` |
| `FND-06` | `DATA-02`, `RUNT-02` |
| `FND-07` | `EVID-04` |
| `FND-08` | `WTCH-03`, `RCRD-04` |
| `FND-09` | `RUNT-02`, `EVID-08` |
| `FND-10` | `EVID-05` |
| `FND-11` | — |

## Acceptance — what makes this module done

The module is done when all eleven tickets are delivered and the following hold. Every item names the PRD
requirement ID or epic exit evidence it discharges.

1. **`E01-REPO` exit evidence — "Clean bootstrap/build/test" (PRD §44.2).** All fourteen PRD §45.3 entry
   commands exist and exit 0 from a clean clone running the **D17** pins — Node.js `24.18.0`, pnpm
   `11.4.0`, Rust `1.97.1`, Python `3.14.6` — and `corepack pnpm install --frozen-lockfile` leaves the
   lockfile unchanged. (`FND-01`)
2. **PRD §20.3 gates run on every PR.** Each of the nine gate classes is a named, always-running CI job;
   the release-candidate extras run in their own workflow and not on `pull_request`; and CI resolves the
   same D17 versions from the pin files rather than restating them (PRD §45.3). (`FND-02`)
3. **`E02-CONTRACTS` exit evidence — "No generated diff; schema tests" (PRD §44.2).**
   `pnpm generate && pnpm generated:check` produces no diff, and every enum set, endpoint and event
   schema matches a fixture transcribed from the PRD. (`FND-03`, `FND-04`, `FND-05`)
4. **`DEV-001` — "OpenAPI drives TypeScript/Python generated cores"; acceptance evidence "Generated-client
   diff is clean in CI".** Discharged for the TypeScript core here; the Python core is
   `20-developer-platform`/`PLTF-03` against this same root. (`FND-04`, gated by `FND-02`)
5. **`E03-DOMAIN` exit evidence — "Unit/property tests" (PRD §44.2).** Every rule family ships property
   tests, not only examples, and `packages/domain` imports nothing but `packages/contracts` and Node
   built-ins (PRD §39.1, §45.2). (`FND-06` … `FND-10`)
6. **`AUTH-003` — "Owner, Admin, Researcher, Viewer and Developer permissions are enforced … Permission
   matrix in §38 passes"** is decidable in pure code, and **`SEC-001`**'s cross-tenant rule is a domain
   invariant before any repository exists. (`FND-06`; enforcement at the boundary is `DATA-02`/`RUNT-02`)
7. **`ANS-005` — "Every material claim has validated source evidence or is removed/downgraded"** has its
   status/support/refusal decision in code rather than in a prompt. (`FND-07`; the validator itself is
   `EVID-05`)
8. **`REC-004` — "Workflow transitions enforce actor, ETag and audit"**: only the PRD §32.6 transitions
   are representable, and a stale ETag can never apply one. (`FND-08`; the 409 mapping is `RCRD-04`)
9. **`OPS-003` — "Founder-funded monthly spend stops at A$50 and search remains usable … 90% warning and
   100% hard-stop tests pass"** is arithmetic in `packages/domain`, in integer micro-AUD. (`FND-09`; the
   circuit breaker is `EVID-08`)
10. **PRD §36.2's eligibility predicate and §36.3's feature order exist as pure, tested code**, including
    the §9.1 rule that guidance never outranks legislation or an operative instrument. No requirement ID
    of its own — it is the shared predicate behind `SRCH-002`, `SRCH-005` and `ANS-005`, owned downstream
    by modules 11, 12 and 14. (`FND-10`)
11. **PRD §45.4 PR contract** items are stated on every merged PR in this module: requirement/UAT IDs,
    user-visible change and non-goals, schema/API/event compatibility impact, tenant/PII/security impact,
    source/licence impact, tests run, cost/memory/latency impact, rollback path, known gaps.
12. **No writes outside the breakdown plan §4 `00-foundation` row**, and no `FND-*` ticket has read
    `evals/gold/**` (PRD §45.1 item 6; breakdown plan §9 R9).

## Changelog

| Version | Date | Change |
|---|---|---|
| v0.1 | 2026-08-03 | Initial decomposition of `00-foundation` from `docs/prd/breakdown-plan.md` §5.1 — 10 tickets, `FND-01` … `FND-10`. |
| v0.2 | 2026-08-03 | Aligned with the breakdown plan §8 decision register. **Q12 CONFIRMED** and transcribed as decision **D17** (Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`, the pin-file set and the no-silent-upgrade rules); Q12 removed from Open questions; `FND-01` now commits the pins instead of choosing them and `FND-02` resolves the same versions from those files. Inherited §8 references updated: **Q13 CONFIRMED** (Kysely-style repositories over `better-sqlite3`, Drizzle not used, raw `.sql` migrations — `DATA-01`) in Non-goals and `FND-01`; **Q14 CONFIRMED** (Resend, free transactional tier — `WTCH-04`/`WTCH-09`) in Non-goals and `FND-05`; **Q1** and **Q4** relabelled **benchmark-selected** with their resolving tickets (`GOLD-15`, `RETR-10`) in `FND-09` and `FND-10`. `Q-F1`…`Q-F7` unchanged and still open — `Q-F6` (unallocated `.github/PULL_REQUEST_TEMPLATE.md` / `ISSUE_TEMPLATE/**`) is **not** settled by the register. Plan-size figures refreshed after the same round added `WTCH-09` to `16-monitor-alerts` (the plan is now **236** tickets and module 16 has **9**): the Problem section now reads 236-ticket plan, and the *Fold CI into `FND-01`* rejected-alternative row now reads 235 tickets, matching the 235 transitive dependents of `FND-01` in the ticket DAG. The 24-of-25-modules figure is unchanged — `16-monitor-alerts` was already transitively blocked on `FND-01`. |
| v0.3 | 2026-08-07 | `FND-01` implementation writeback (ticket Feedback obligation 2). **Q-F7 answered:** exactly one root file outside breakdown plan §4's enumerated list was needed — `.gitignore` (the first bootstrap creates `node_modules/`, `target/`, `.venv/`, `.pytest_cache/`, `__pycache__/`) — added to the Scope list above and to breakdown plan §4 (plan v0.3) in the same PR. A root `conftest.py` was **not** needed: `uv run pytest` exits 0 on the empty tree via `tools/pytest_exit_zero_when_empty.py`, inside the already-owned `tools/**`. **Q-F1 needed no widening** — every PRD §20.1 member is satisfied by D2's bounded set (manifest + `tsconfig.json` where applicable + one empty entry file). **D17 pins verified installable and clean-bootstrapped as written** (Node.js `24.18.0`, pnpm `11.4.0`, Rust `1.97.1`, Python `3.14.6`); no evidence arose to trigger `FND-01`'s Feedback obligation 3, and no pin was changed. |
| v0.4 | 2026-08-07 | `FND-01` v1.1 writeback (ticket Feedback obligation 5, review bounce). New decision **D18**: PRD §45.3 entry command 2 is invoked as `… -File tools/validate-prd.ps1 -Path docs/PRD.md`, because the frozen script resolves its default `-Path` to repo-root `PRD.md` while the PRD lives at `docs/PRD.md`. The §45.3 string stays verbatim in the root README and in the entry-command fixture; the difference is a recorded `deviation`, and **failure-waiver fields on fixture entries are forbidden and asserted absent**, so acceptance item 2 ("all fourteen exit 0") is green on evidence rather than masked. The durable fix (the frozen script's default or the PRD §45.3 text) is escalated to the Architect/founder and does not block `FND-01`. |
| v0.6 | 2026-08-08 | `FND-03` implementation writeback (ticket Feedback obligation, General rule) — done **before** code, as the rule requires. `FND-03` acceptance item 4 asserted that `INSUFFICIENT_EVIDENCE` (§8.4 / §8.5) is *"the only intentional overlap"*; transcribing the twenty families from the PRD falsifies that — there are **five** cross-family collisions, all spelled by the PRD itself (`CONDITIONAL` §8.4/§15.5, `SOURCE_NOT_CURRENT` §8.4/§34.9, `REVIEW_REQUIRED` §8.7/§11.1 and `DRAFT` §8.7/§16.3 as well). The acceptance item now asserts the observed overlap set equals exactly that declared five-row set (a sixth, accidental collision still fails), and clarifies that "separate types" means the two **named families** are mutually non-assignable with guards that reject the other family's non-shared members — not that a shared literal can be made two distinct literal types. Recorded as new decision **D6a** (refines D6). Also carried in the same PR: the stale `Version` field (v0.3, behind the v0.5 changelog) is corrected to match this row. |
| v0.5 | 2026-08-08 | `FND-11` added — repairs `tools/tests/frozen-paths.test.mjs`, which encoded `FND-01`'s own file-scope as a repository-wide invariant (forbidding `FND-02`'s allocated `.github/workflows/**` writes and failing every non-`FND-01` branch's non-vacuity check), blocking every later ticket branch (the last `/start-all` run delivered 1 of 235 tickets). Module now **11** tickets (`FND-01` … `FND-11`); whole-PRD plan now **237** tickets. Lane shape unchanged per breakdown plan §7 (3 min waves / 7 max useful lanes / 7 peak lanes) — `FND-11` is `blocked_by FND-01` only and joins wave 2 alongside `FND-02`/`FND-03`. Work-breakdown table, wave diagram and outbound-edges table (`FND-11` blocks nothing) updated to match; ticket-count references in the Problem section (237-ticket plan) and the *Fold CI into `FND-01`* rejected-alternative row (236 tickets) refreshed for the same reason. |
| v0.6 | 2026-08-08 | `FND-02` implementation writeback (ticket Feedback obligation 5, plus the two allocation gaps it hit). New decision **D19**: the delegator script names the nine PRD §20.3 gate jobs invoke are fixed and recorded here — `test:openapi-compat`, `test:migrations`, `test:tenant`, `test:pii-citation`, `scan:container`, `scan:licence`, `test:integration`, `rc:restore`, `rc:evaluation`, `rc:compatibility`, `rc:rollback`, `release:artifact` — so `FND-04`, `DATA-01`, `DATA-02`, `EVID-01`, `ASSR-*` and `RLSE-01` … `RLSE-04` adopt the name their gate already calls instead of inventing one and leaving the gate vacuous forever (raised on breakdown plan §1.1 "Tests"). New decision **D20**: (a) the `setup` composite action, the check scripts and the gate fixture all live **inside** the allocated `.github/workflows/**` tree (`actions/setup/action.yml`, `checks/**`, `fixtures/**`) because breakdown plan §4 allocates `.github/actions/**` to no module — the same unallocated-path gap as **Q-F6**, recorded for the Architect rather than resolved by writing outside the file-scope; (b) the CI secret scan applies the seven *name*-shaped `secret-patterns.json` patterns to every git-tracked file outside `docs/**` and only the *value*-shaped `private-key-block` pattern inside it, because the planning corpus legitimately writes credential-shaped variable names down. **Q-F6 unchanged and still open** — the PR-contract job is the tolerant check the ticket specifies and `.github/PULL_REQUEST_TEMPLATE.md` was not edited. No pin file was touched (ticket Non-goal 1, D17). |
| v0.7 | 2026-08-08 | `FND-07` implementation writeback (ticket Feedback obligation, General rule) — done **before** code. Two spec holes found while planning, both recorded rather than silently implemented. New decision **D13a** (refines **D13**): the PRD §36.8 table is not total over `FND-07`'s six-boolean signal record — exactly one of the 64 combinations fires no row while `decideAnswerStatus` must still return an `AnswerStatus` — closed by one **named derived** condition `MATERIAL_CLAIMS_UNSUPPORTED → INSUFFICIENT_EVIDENCE`, listed in the returned fired-conditions like any other and kept out of the fixture's verbatim `prd_36_8` section; an unnamed default branch is forbidden. Same product ambiguity as **Q-F3**, owner **Founder**, falsifiable by `21-evaluation-600` (Q-F3 updated to say so). New decision **D21**: the `definitive claim` definition ANS-005's zero-unsupported-claim metric is measured against — material, short answer `Yes`/`No`, not conditional — because none existed anywhere and choosing one silently fixes the denominator of a release-register metric in `EVID-05` and `21-evaluation-600`. The `FND-07` ticket carries both (deliverable 2 totality clause, deliverable 7 definition, the property-test acceptance item restated) plus two text corrections: deliverable 2's return type is `AnswerDecision` (its own prose and acceptance item already required status **and** fired conditions), and the third non-status row's outcome type is named `RefusalOutcome` (deliverable 1 named only two types for three rows). |
