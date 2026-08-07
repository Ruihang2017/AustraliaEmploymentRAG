---
id: FND-03
title: Canonical enums and opaque ID conventions
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-01]
blocks: [FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, DATA-01, RUNT-06, RUNT-07, CRPS-01, EVID-01, EVID-07, GOLD-01]
---

# FND-03 — Canonical enums and opaque ID conventions

Implements PRD §35.1, §34.1, §6.7, §8.4, §8.5, §11.1, §15.5, §17.2 and §44.3 (epic `E02-CONTRACTS`;
the single source every requirement family's controlled values resolve to).
No ADR — the decision is already made in PRD §35.1 (*"Enumerations use checked text values generated
from `packages/contracts`"*) and §44.3 (canonical enums are serial-owned); this is build ticket 3 of 10
against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-01 — Monorepo bootstrap, pinned toolchains, workspace skeleton](FND-01-monorepo-bootstrap-pinned-toolchains-workspace-skeleton.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
the controlled-value lists are already written in the PRD; this transcribes and enforces them, it does
not decide them.

## Background + basis

**PRD §35.1** (storage/type conventions) is the load-bearing sentence:

> - Enumerations use checked text values generated from `packages/contracts`.
> - IDs are `TEXT PRIMARY KEY`; timestamps are UTC ISO text; legal dates are `TEXT` with `YYYY-MM-DD`
>   checks; booleans are `INTEGER CHECK (value IN (0,1))`.

**PRD §34.1** (API common conventions) fixes the ID shape:

> | IDs | Opaque resource-prefixed UUIDv7 strings, for example `ans_...`; clients never parse them |
> | Dates | Australian legal dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC |
> | Money | Integer micro-AUD for internal cost; never floating point |

**PRD §44.3**: *"Serial owners are required for root lockfiles, **canonical enums**, OpenAPI root, app
migration order, corpus schema/manifest, active release/promotion files and production
Compose/deployment configuration."* Breakdown plan §4.1 and §4.2 name this ticket as that serial owner:
*"Canonical enums — `packages/contracts/src/enums/**` — `00-foundation` — `FND-03` — PRD §35.1: SQLite
checked text values are generated from `packages/contracts`."* §4.2 records that the alternative was
sharing them with **everything**.

**PRD §45.2** bounds the package: `packages/contracts` owns *"Enums, schemas, OpenAPI/event/generated
boundaries"* and must not own *"Business orchestration/provider SDKs"*.

**The controlled-value lists, quoted from the PRD.** These are mandatory and must be transcribed
exactly — spelling, underscores and order:

- **§6.7 legal status taxonomy**: `IN_FORCE`, `ENACTED_NOT_IN_FORCE`, `BILL_NOT_ENACTED`,
  `DRAFT_OR_CONSULTATION`, `REPEALED`, `SUPERSEDED`, `STATUS_UNCONFIRMED`.
- **§8.4 answer statuses**: `SUPPORTED`, `CONDITIONAL`, `INSUFFICIENT_EVIDENCE`, `CONFLICTING_SOURCES`,
  `OUT_OF_SCOPE`, `SOURCE_NOT_CURRENT`.
- **§8.5 coverage candidate statuses**: `CONFIRMED_FROM_STATED_FACTS`, `LIKELY`, `POSSIBLE`, `UNLIKELY`,
  `EXCLUDED`, `INSUFFICIENT_EVIDENCE`.
- **§8.7 research-record workflow states**: `DRAFT`, `IN_REVIEW`, `CUSTOMER_REVIEWED`,
  `REVIEW_REQUIRED`, `ARCHIVED`.
- **§11.1 licence assessment states**: `PERMITTED`, `PERMITTED_WITH_ATTRIBUTION`,
  `METADATA_AND_LINK_ONLY`, `UNCLEAR_RESTRICTED`, `PROHIBITED`, `REVIEW_REQUIRED`.
- **§15.5 claim support values**: `DIRECTLY_SUPPORTED`, `SUPPORTED_BY_INFERENCE`, `CONDITIONAL`,
  `CONTRADICTED`, `NOT_SUPPORTED`; **citation roles**: `SUPPORTS`, `QUALIFIES`, `CONTRADICTS`,
  `DEFINES`, `BACKGROUND_ONLY`.
- **§17.2 index tiers**: `TIER_1_FULL_SEMANTIC`, `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`,
  `TIER_3_METADATA_AND_ON_DEMAND`, `EXCLUDED_LICENSING`, `QUARANTINED_QUALITY`.
- **§7 source-group coverage statuses**: `PLANNED_NOT_ACTIVE`, `METADATA_AND_LINK_ACTIVE`,
  `FRESHNESS_LIMITED`, `LICENSING_RESTRICTED`, `SOURCE_UNAVAILABLE`.
- **§16.3 SSO connection states**: `DRAFT`, `TESTING`, `ACTIVE`, `ERROR`, `DISABLED`.
- **§8.1 fixed roles**: Owner, Admin, Researcher, Viewer, Developer.
- **§24.4 funding ledgers**: `FOUNDER_PLATFORM_BUDGET`, `CUSTOMER_PREPAID_OR_BYOK`.
- **§31.3 mandatory async states** (all ten): `IDLE`, `VALIDATING`, `QUEUED`, `RUNNING`,
  `WAITING_FOR_CLARIFICATION`, `CANCELLING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`.
- **§34.9 error codes** (identifiers only — the HTTP/retry mapping is `FND-04`): `INVALID_REQUEST`,
  `INVALID_LEGAL_DATE`, `INVALID_ABN`, `AUTHENTICATION_REQUIRED`, `MFA_REQUIRED`,
  `RECENT_AUTH_REQUIRED`, `RESOURCE_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `CONCURRENT_MODIFICATION`,
  `EPHEMERAL_CONTENT_EXPIRED`, `EMPLOYEE_PII_DETECTED`, `RATE_LIMITED`, `CREDIT_LIMIT_REACHED`,
  `GENERATION_UNAVAILABLE`, `SOURCE_NOT_CURRENT`, `CORPUS_INCOMPATIBLE`, `INTERNAL_ERROR`.
- **§34.4 SSE event types**: `job.started`, `stage.changed`, `clarification.required`, `answer.section`,
  `citation.added`, `job.completed`, `job.failed`, `job.cancelled`, `heartbeat`.
- **§9.1 authority levels** (the eight-step default ordering, as an ordered enum — the *ranking rule*
  that uses it is `FND-10`).
- **§9.2/§9.3 evidence qualifiers**: `TREATMENT_NOT_CONFIRMED`, `MODEL_SUGGESTED`.
- **§16.3 example service scopes**: `search:read`, `answers:create`, `records:read`, `records:write`,
  `coverage:create`, `monitor:read`, `monitor:write`, `exports:create`, `usage:read`. The PRD calls
  these *"Example service scopes"*, so the set is the initial membership and additions are additive
  within `/v1` (PRD §16.1: *"Optional fields may be added within v1; breaking changes require v2"*).
- **§38.1 permission identifiers** — one per action row of the role matrix. The matrix itself (which
  role gets which cell) is `FND-06`; only the identifier vocabulary lives here.
- **§8.8 change types**: amendment, commencement, rate, replacement, appeal, guidance, source-removal
  and freshness events, spelled as the §34.8 payload does (`"change_type": "COMMENCEMENT"`).

**Why this ticket owns identifiers whose sections are not in its breakdown-plan §5.1 "PRD refs" column**
(`Role`, `Permission`, `AuthorityLevel`, `ApiScope`, async states, SSE event types, error codes): its
§5.1 goal is *"One generated source for every controlled value in the product"*, and PRD §35.1 requires
every database enumeration to be generated from `packages/contracts`. Sub-PRD decision **D6** records
this; the rule-level logic that consumes each set stays with its own ticket (`FND-06` … `FND-10`).

**Accepted caveats carried forward:**

- The PRD calls the §16.3 scope list "Example"; pinning it here is an initial membership, not a closed
  product decision. Adding a scope later is additive (§16.1).
- `packages/contracts/package.json` is append-only shared inside this module (sub-PRD D16, breakdown
  plan §1.1): `FND-03`, `FND-04` and `FND-05` each add only their own entries.

## Goal

Produce `packages/contracts/src/enums/**` and `packages/contracts/src/ids/**` such that every controlled
value listed above exists exactly once, as a frozen value list with a derived TypeScript union, a
runtime guard and a machine-readable registry that downstream modules read to generate SQLite `CHECK`
constraints (PRD §35.1) and OpenAPI enum schemas (`FND-04`); and such that opaque resource-prefixed
UUIDv7 identifiers can be minted, validated and type-distinguished per PRD §34.1. Completion is
mechanically checkable: a fixture transcribed from the PRD sections above replays with exact set
equality in both directions, and the package imports nothing outside Node built-ins.

## Non-goals

- **No rules that consume the enums.** The §38.1 role→permission matrix is `FND-06`; the §36.8 refusal
  table is `FND-07`; the §32.6 transition table is `FND-08`; the §24.1/§38.5 budget arithmetic is
  `FND-09`; the §9.1 ranking and §36.2 eligibility predicate are `FND-10`. This ticket ships the
  vocabulary only.
- **No OpenAPI document, response schema or HTTP status mapping** — `FND-04` (sub-PRD D7: the error-code
  *identifiers* are here, their HTTP status and `retryable` flag are there).
- **No event schemas or HMAC helpers** — `FND-05` (`schemas/events/**`,
  `packages/contracts/src/events/**`).
- **No generated OpenAPI bindings** — `packages/contracts/src/generated/**` is `FND-04`'s subtree.
- **No database columns, `CHECK` constraints or migrations** — `01-app-data`/`DATA-01` consumes this
  registry; PRD §45.2 forbids `packages/contracts` from owning schema.
- **No corpus enums that only exist inside the corpus builder** — `04-corpus-contract`/`CRPS-01` owns
  `pipelines/corpus-builder/**`; where a corpus value crosses into the API or the app database it comes
  from here, and `CRPS-01` is `blocked_by` this ticket for exactly that reason.
- **No UI copy or labels.** An enum member is a stable machine value; its human label belongs to the
  screen that renders it (`03-app-runtime`/`RUNT-06`, the product modules) and its legal/policy wording
  to `24-launch`.

## File-scope (write-owns)

Owned by this ticket:

- `packages/contracts/src/enums/**`
- `packages/contracts/src/ids/**`
- `packages/contracts/test/enums/**`, `packages/contracts/test/ids/**` (sub-PRD D14: tests live in the
  owning package under a directory whose leaf matches this ticket's source leaf)
- `packages/contracts/package.json` — **append-only**, own entries only (sub-PRD D16)

Does not touch:

- `packages/contracts/src/{openapi,generated}/**` and `schemas/openapi/**` — `FND-04` (same module,
  same wave-3 batch).
- `packages/contracts/src/events/**` and `schemas/events/**` — `FND-05` (same module, same batch).
- `packages/domain/**` — `FND-06` … `FND-10`.
- `packages/database/**` — `01-app-data`. `pipelines/**` — modules 04, 05, 06–10, 21.
- Root manifests, lockfiles, `tools/**`, `README.md` — `FND-01`. `.github/workflows/**` — `FND-02`.
- `tsconfig.base.json` — `FND-01`; this ticket's package `tsconfig.json` extends it and adds only its
  own `include`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. This ticket runs in
wave 2 alongside `FND-02`, whose scope (`.github/workflows/**`) is disjoint. Its seven module siblings
in wave 3 (`FND-04` … `FND-10`) are all `blocked_by` this ticket, so none can be in flight while it
runs; when they do run, each writes a different leaf subtree
(`src/openapi`, `src/generated`, `src/events`, `src/access`, `src/answers`, `src/workflow`, `src/budget`,
`src/legal`) and only `packages/contracts/package.json` is shared — append-only, conflicts resolved by
re-running the package manager (breakdown plan §1.1). `packages/contracts/src/{enums,ids}/**` is written
by no other ticket in the entire 236-ticket plan (breakdown plan §4.2).

## Deliverables

1. **One module per enum family** under `packages/contracts/src/enums/`, file named kebab-case after the
   family (`legal-status.ts`, `answer-status.ts`, `coverage-candidate-status.ts`,
   `record-workflow-state.ts`, `licence-assessment-state.ts`, `claim-support.ts`, `citation-role.ts`,
   `index-tier.ts`, `source-coverage-status.ts`, `sso-connection-state.ts`, `role.ts`, `permission.ts`,
   `api-scope.ts`, `funding-ledger.ts`, `async-state.ts`, `error-code.ts`, `sse-event-type.ts`,
   `authority-level.ts`, `evidence-qualifier.ts`, `change-type.ts`). Each exports, with these exact
   shapes:
   - `export const <FAMILY>_VALUES = [...] as const` — the members in PRD order;
   - `export type <Family> = (typeof <FAMILY>_VALUES)[number]`;
   - `export const is<Family> = (v: unknown): v is <Family> => …` — a runtime guard;
   - a doc comment naming the PRD section the list is transcribed from.
2. **`packages/contracts/src/enums/registry.ts`** — a frozen machine-readable registry
   `ENUM_REGISTRY: Readonly<Record<string, { prdSection: string; values: readonly string[] }>>`
   covering every family in deliverable 1, plus a `getEnumValues(name)` accessor. This is the artifact
   `DATA-01` reads to generate SQLite `CHECK (col IN (…))` constraints (PRD §35.1) and `FND-04` reads to
   emit OpenAPI enum schemas. Adding a family without registering it must fail a test.
3. **`packages/contracts/src/enums/index.ts`** re-exporting every family and the registry. No other
   module may deep-import a family file; the barrel is the public surface.
4. **`packages/contracts/src/ids/**`**:
   - `RESOURCE_PREFIXES` — a frozen map of resource kind → prefix, seeded from the prefixes the PRD
     shows literally: `ans_` (AnswerSnapshot, §34.5), `rec_` (ResearchRecord, §34.5), `clm_` (AnswerClaim),
     `cit_` (ClaimCitation), `asm_` (AnswerAssumption), `doc_`/`dv_`/`node_`/`nv_` (LegalDocument,
     DocumentVersion, DocumentNode, NodeVersion, §34.2), `cr_` (CorpusRelease), `srx_`
     (search execution), `req_` (request), `job_` (job), `evt_` (event, §34.8), `alt_` (Alert),
     `wat_` (Watchlist), `auth_` (authority). Additional prefixes for entities the PRD names in §15.4
     and §15.6 without showing a literal (Organization, User, Membership, ServiceAccount, ApiCredential,
     Comment, IssueReport, Correction, Export, ComparisonSnapshot, CoverageAssessment, EvaluationCase)
     are chosen here once and registered; they must be short, lower-case and unique.
   - `newId(kind)` → `<prefix>_<uuidv7>` — UUIDv7 per PRD §34.1, time-ordered, monotonic within a
     millisecond, correct version (`7`) and variant nibbles. The clock is injectable so tests are
     deterministic.
   - `isId(kind, value)` / `parseId(value)` — server-side validation only; PRD §34.1 states *"clients
     never parse them"*, so no semantic content beyond the prefix may be exposed.
   - Branded types: `Id<'ans'>` is not assignable to `Id<'rec'>`, enforced at type level.
5. **`packages/contracts/test/enums/prd-enums.fixture.json`** — every family transcribed **verbatim**
   from the PRD sections quoted in Background, with the section number recorded per family. This
   fixture, not the implementation, is the assertion target.
6. **Purity**: `packages/contracts` declares no runtime dependency other than the toolchain — no
   Fastify, React, SQLite driver, provider SDK or cloud library (PRD §39.1, §45.2). Enforced by an
   import-graph test, not by convention.
7. **Stability rule, encoded**: a test asserts that no registered enum member is removed or renamed
   relative to the committed fixture. Renaming a controlled value is a breaking change requiring `/v2`
   (PRD §16.1) and a PRD update (§45.5), not a refactor.

## Acceptance checklist (classified)

- [ ] `[fixture]` Enum replay: for every family in `prd-enums.fixture.json`, the implementation's value
      list equals the fixture's **exactly** — same members, same order, no extras, no omissions —
      asserted in both directions (PRD §6.7, §8.4, §8.5, §8.7, §11.1, §15.5, §16.3, §17.2, §7, §24.4,
      §31.3, §34.4, §34.9, §9.1, §9.2, §9.3, §38.1, §8.1).
- [ ] `[machine]` Every family in `ENUM_REGISTRY` is exported from the barrel and vice versa; a family
      added to the source but not the registry fails (deliverable 2).
- [ ] `[machine]` Every registry entry records a PRD section reference matching `§\d+(\.\d+)?`
      (PRD §30.1: *"A pull request implementing a requirement MUST name its IDs"* — the same traceability
      discipline applied to controlled values).
- [ ] `[machine]` No duplicate member within a family, and no two families silently share a member
      name where the PRD spells them differently. Transcribing the twenty families produces **exactly
      five** cross-family member collisions, every one of them spelled by the PRD itself; the test
      asserts the observed overlap set equals exactly this declared set, so a *sixth* collision (a
      member accidentally re-used across families) fails:
      | Member | Family A | Family B |
      |---|---|---|
      | `INSUFFICIENT_EVIDENCE` | `AnswerStatus` (§8.4) | `CoverageCandidateStatus` (§8.5) |
      | `CONDITIONAL` | `AnswerStatus` (§8.4) | `ClaimSupport` (§15.5) |
      | `SOURCE_NOT_CURRENT` | `AnswerStatus` (§8.4) | `ErrorCode` (§34.9) |
      | `REVIEW_REQUIRED` | `RecordWorkflowState` (§8.7) | `LicenceAssessmentState` (§11.1) |
      | `DRAFT` | `RecordWorkflowState` (§8.7) | `SsoConnectionState` (§16.3) |
      Each colliding pair stays **separate named types**: the two family types are mutually
      non-assignable as wholes and each family's runtime guard rejects the other family's non-shared
      members. (A shared *literal* is necessarily the same literal type in both derived unions; the
      assertion is about the named families, not the literal.)
- [ ] `[machine]` `newId(kind)` produces `<prefix>_<uuid>` where the UUID has version nibble `7` and
      RFC-variant bits, and 10,000 successive ids from a fixed clock are strictly increasing
      lexicographically (PRD §34.1 "Opaque resource-prefixed UUIDv7 strings").
- [ ] `[machine]` `isId('ans', 'rec_…')` is `false`; `isId('ans', 'ans_…')` with a malformed UUID is
      `false`; a value with no prefix is `false` (PRD §34.1).
- [ ] `[machine]` Type-level test: assigning `Id<'ans'>` to `Id<'rec'>` fails to compile (branded types,
      deliverable 4).
- [ ] `[machine]` Import-graph purity: `packages/contracts` imports nothing but Node built-ins;
      no Fastify, React, SQLite driver, provider SDK or cloud library appears in its dependency closure
      (PRD §39.1, §45.2).
- [ ] `[machine]` Stability test: mutating one fixture member name in a scratch run fails the build with
      a message naming the family (PRD §16.1 — breaking changes require `/v2`).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` are unaffected
      by this ticket and are declared not applicable beyond the repo-wide green already proven by
      `FND-01`.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (`E02-CONTRACTS`; underpins
      `DEV-001` via `FND-04`), user-visible change and non-goals, schema/API/event compatibility impact
      (this is the first published controlled-value surface — all additive), tenant/PII/security impact
      (none — no data path), source/licence impact (none), cost/memory/latency impact (none), rollback
      path (revert; nothing consumes it yet), known gaps (families deferred to their owning module).

Absent classes: no `[human]` criteria — this is pure vocabulary with no rendered surface and no
judgement call; the human-visible consequences appear in `03-app-runtime`/`RUNT-06` (async states) and
the product modules. The single `[fixture]` class is the PRD-transcribed enum table; there is no
recorded adapter or evaluation data at this stage (PRD §40.8, §43 arrive with modules 05 and 21).

## Test plan

Reviewer steps, all offline:

1. **Read the fixture against the PRD.** Open `packages/contracts/test/enums/prd-enums.fixture.json`
   beside `docs/PRD.md` §6.7, §8.4, §8.5, §8.7, §11.1, §15.5, §16.3, §17.2, §7, §24.4, §31.3, §34.4,
   §34.9, §9.1, §9.2, §9.3, §38.1, §8.1 and confirm every member matches character for character. A
   paraphrased fixture makes the whole ticket vacuous — this step is the ticket.
2. **Run the suite.** `pnpm --filter @<scope>/contracts test` (the filter name is whatever `FND-01`
   registered). Confirm the enum replay reports one assertion per family, not one aggregate assertion.
3. **Negative test — missing member.** On a scratch branch delete `SUPERSEDED` from
   `legal-status.ts`; re-run; assert failure naming `LegalStatus` and the missing member; discard.
4. **Negative test — extra member.** Add `PENDING` to `answer-status.ts`; re-run; assert failure;
   discard.
5. **Registry completeness.** Add a new family file without registering it; assert the build fails;
   discard.
6. **ID behaviour.** Run the id suite; confirm the monotonic test uses an injected fixed clock (a
   wall-clock test is flaky and does not prove ordering within a millisecond).
7. **Purity.** Run the import-graph test; then inspect `packages/contracts/package.json` and confirm
   `dependencies` is empty or toolchain-only (PRD §45.2).
8. **Append-only manifest.** `git diff packages/contracts/package.json` must show additions only.

Harness: the test framework `FND-01` registered and documented in the root `README.md`; type-level
assertions via the project's chosen type-test utility. Fixture:
`packages/contracts/test/enums/prd-enums.fixture.json`. No network, no mocks.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing code; re-publish
with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **A controlled value the PRD uses is missing from the list above** (a status appearing only in a §34
   payload example or a §35 table, e.g. `correction_state`, `confidence_state`, `derivation`,
   `node_kind`, `relation_type`, `event_type`, `document_type`, `authority_type`, `court_level`,
   `freshness`, `match_reasons`, `sort`, `query_types`, jurisdiction codes). → Add it here **and** to
   `packages/contracts/test/enums/prd-enums.fixture.json` **and** record the addition in
   `docs/prd/00-foundation/README.md` D6, citing the PRD section. Do **not** let the consuming module
   declare its own copy — that is precisely the duplication breakdown plan §4.2 exists to prevent.
2. **A downstream module needs a member the PRD does not contain.** → That is a product change
   (PRD §45.5: *"changes customer behaviour, scope, promise …; requires founder approval and PRD
   update"*). Raise it as a **ticket** change against this file plus an entry in
   `docs/prd/00-foundation/README.md` Open questions with a named owner; never invent the member inside
   the consuming module.
3. **The `Permission` identifier vocabulary does not line up with `FND-06`'s §38.1 matrix rows.** →
   `FND-06` is `blocked_by` this ticket, so it must adapt, not fork. If the matrix genuinely needs a
   different granularity, update **this ticket** and `docs/prd/00-foundation/README.md` D6, then
   re-publish, then let `FND-06` proceed.
4. **UUIDv7 cannot be generated without a runtime dependency**, which would breach the purity rule. →
   Record the dependency and its justification in `docs/prd/00-foundation/README.md` D10/§Scope and
   raise it against `docs/prd/breakdown-plan.md` §4 before adding it; a dependency in
   `packages/contracts` is inherited by every package in the repo.
5. **A resource prefix collides or a chosen prefix is later contradicted by a PRD payload example.** →
   The PRD's literal spelling wins; update `RESOURCE_PREFIXES`, the fixture and any dependent ticket,
   and note it in `docs/prd/00-foundation/README.md`. Prefixes are part of the public API surface
   (§34.1), so a change after `FND-04` publishes the OpenAPI root is a `/v2` matter (§16.1) — escalate
   rather than rename quietly.

**Escalation.** If PRD §35.1's direction is falsified — i.e. it proves impossible to generate database
check constraints from `packages/contracts` and the schema would have to own the enums instead — that
overturns PRD §44.3's serial-owner assignment and breakdown plan §4.2. Stop, raise an ADR under
`docs/adr/` plus a writeback to `docs/prd/breakdown-plan.md` §4.1/§4.2, and escalate to the human.
Never let a second copy of a controlled value exist while the question is open.
