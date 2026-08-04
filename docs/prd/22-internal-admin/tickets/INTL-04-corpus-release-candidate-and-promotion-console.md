---
id: INTL-04
title: Corpus release candidate and promotion console
module: 22-internal-admin
lane: 22-internal-admin
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INTL-01, RLSE-07]
blocks: [INTL-10]
---

# INTL-04 — Corpus release candidate and promotion console

Implements **PRD §8.11 (candidate/active corpus releases), §18.4, §20.4 and §32.8 — requirement
`ADM-002`** (epic `E29-INTERNAL-ADMIN`).
No ADR — the decision is already made in PRD §18.4 (*"Active data MUST never be rebuilt or mutated in
place"*) and PRD §20.4 (*"Founder-authorised promotion requires recent MFA, explicit version/changelog
confirmation, health/space/compatibility checks and forced database recovery point"*); this is build
ticket **4 of 10** against it.
Parent sub-PRD: [22-internal-admin README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`INTL-01`](INTL-01-internal-v1-separation-internal-identity-admin-shell.md);
`RLSE-07` — Corpus promotion and rollback tool ([`18-ops-release`](../../18-ops-release/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
`RLSE-07`'s promotion tool and recorded outcomes, `CRPS-02`'s manifest schema, and `INTL-01`'s internal
boundary — not a new subsystem decision.

## Background + basis

**What a fresh agent needs to know before touching anything.**

`INTL-01` has merged and owns the internal boundary; its "internal boundary contract" is normative
here. This ticket declares `area = internalArea({ areaId: 'releases', capability: 'RELEASES' })`, wraps
its plugin in `internalRoutes()`, records every state-changing operation through
`withDangerousAction()` (audit **before** effect — sub-PRD **D6**), and reads operational state only
through `OperationalSnapshotStore` (sub-PRD **D5**).

`RLSE-07` has merged. `docs/prd/breakdown-plan.md` §5.19 defines it verbatim:

> | RLSE-07 | Corpus promotion and rollback tool | L | `infra/deploy/corpus/**` | RLSE-02, CRPS-07 |
> §18.4, §39.1, §44.3, ADM-002, E33 | **Verify → shadow → atomic pointer; failure leaves active
> unchanged.** |

It is a **separate process** (PRD §39.1: `PROMOTE[corpus promotion tool] --> CORPUS`, fed by
`R2[(R2 public artifacts/releases)]`), it holds the only R2 credential (PRD §39.4), and it owns
`infra/deploy/corpus/**`, which PRD §44.3 and plan §4.1 make **serial-owned**. The `app` process has no
corpus path at all (PRD §39.2: `app` → *"app/ephemeral DB, worker enqueue, export read/sign permission,
search localhost"*). Therefore **this console authorises and observes; it never promotes.** That split
is deliverable 6 and is sub-PRD **M7**.

`CRPS-02` (merged transitively via `RLSE-07 ← CRPS-07 ← CRPS-06 ← CRPS-02`) owns
`schemas/corpus-manifest/v1/release-manifest.schema.json`, whose required members include
`release_id`, `release_kind` (`CANDIDATE | PUBLISHED | SYNTHETIC_FIXTURE`), `parent_release_id`,
`versions`, `compatibility`, `files`, `artifacts`, `counts`,
`coverage` (per source group: `coverage_status`, `freshness_status`, `document_count`,
`earliest_effective_from`, `latest_effective_from`, `last_ingestion_at`),
`quarantine` (`open_count`, `resolved_count`, `by_reason_code`),
`evaluation` (`status`, `report_id`, `ran_at`, `metrics`, `gates: [{name, threshold, observed,
passed}]`), `embedding_profile`, `signature` and `manifest_sha256`. That schema is this console's read
contract; `verify_bundle()` returns the kind so *"promotion tooling (`RLSE-07`) can refuse
`SYNTHETIC_FIXTURE`"*.

**What the PRD fixes, quoted.**

PRD §18.4:

> The manifest MUST include parent release, schema/parser/chunker/embedding/index versions, artifact
> hashes, counts, coverage, quarantine summary, evaluation results, file hashes/sizes, build time and
> app/search compatibility.
>
> Build/sign/upload occurs offline. Production verifies signature, compatibility, disk, hashes,
> read-only database/index integrity and smoke queries. Promotion uses a shadow process where memory
> permits, then an atomic active-pointer switch. **Active data MUST never be rebuilt or mutated in
> place.** Old releases cannot be removed while jobs remain pinned.

PRD §20.4: *"Founder-authorised promotion requires recent MFA, explicit version/changelog
confirmation, health/space/compatibility checks and forced database recovery point. … Application and
corpus releases are independently versioned and declare compatibility ranges."*

PRD §12.2: *"Candidate corpus releases MUST pass completeness, time, identity, citation, licensing,
smoke search, evaluation-subset and manifest checks. **Failed releases MUST NOT modify active
production data.**"*

PRD §32.8: *"Dangerous actions use recent MFA, typed confirmation, scope, reason and expiry/review."*

PRD §35.8 invariant 8: *"Active corpus promotion never mutates an existing release bundle."*

PRD §30.2 `ADM-002`: *"Corpus promotion/rollback requires recent MFA, reason and immutable audit"*,
primary route `/internal/releases`, minimum acceptance evidence **"Promotion failure leaves active
pointer unchanged"**.

PRD §41.2 `UAT-OPS-01`: *"Corrupt candidate corpus fixture → **Promotion blocked; active release/search
unchanged**."*

PRD §42.5, the corpus rows an operator must understand from this screen:
*"Corpus release/source/jurisdiction | Affected research warns/refuses | Mark impact candidates; prior
verified release may be activated"*; *"Ingestion/promotion | Active Search continues | Stop candidate
processing; preserve quarantine/evidence."*

**Accepted caveats carried forward, documented not enforced here.**

- **The console cannot switch the active pointer** and must not try (PRD §39.1/§39.2/§39.4). It
  records an authorised promotion or rollback **request** and displays `RLSE-07`'s recorded outcome.
  How the request reaches the tool is sub-PRD **M7**, owner `18-ops-release`.
- **`ADM-002`'s "Promotion failure leaves active pointer unchanged"** is *proven* by `RLSE-07`. This
  ticket proves the complementary half: the console cannot request a promotion without recent MFA,
  typed confirmation and a reason; the authorisation is audited before any effect; and a refused or
  failed request changes nothing the console owns.
- **Evaluation gate thresholds are `GOLD-03`'s.** This console displays the manifest's `evaluation`
  object; the evaluation-run console is `INTL-06`.
- **Application (not corpus) deploy and rollback** are `RLSE-06`'s and are out of scope.

## Goal

Produce the internal corpus release console: `/internal/v1/releases` endpoints serving the active
release, the candidate releases and their full PRD §18.4 manifests (versions, compatibility, counts,
coverage, quarantine summary, evaluation gates, hashes, signature state), a candidate-versus-active
diff, and the audited promotion/rollback **authorisation** endpoints; plus the
`apps/admin/src/features/releases/**` screens that make the PRD §20.4 preconditions explicit before the
operator can confirm. Completion is mechanically checkable: a manifest whose signature or compatibility
fails verification is shown as **not promotable** with the failing check named; a promotion
authorisation cannot be created without recent MFA, typed confirmation and a reason, and its audit
event is appended before any effect; a `SYNTHETIC_FIXTURE` release can never be authorised; and nothing
in this ticket writes a pointer, a bundle or a corpus file.

## Non-goals

- **No promotion, rollback, verification, shadow process or pointer switch.** `RLSE-07`
  (`infra/deploy/corpus/**`, serial-owned, plan §4.1). This console never executes them.
- **No release build, manifest schema, signing, staging upload or candidate gates.** `CRPS-02`,
  `CRPS-06`, `CRPS-07` (`04-corpus-contract`).
- **No application deploy/rollback, host baseline, backup or restore.** `RLSE-02`, `RLSE-05`,
  `RLSE-06`, `RLSE-09` (`18-ops-release`).
- **No evaluation runner, metrics or gate thresholds.** `GOLD-02`, `GOLD-03`; the console for runs is
  `INTL-06`, which this ticket links to and does not duplicate.
- **No source health, freshness or quarantine queue.** `INTL-02`, `INTL-03`. This console shows the
  manifest's `coverage` and `quarantine` **summaries** and links out.
- **No incident or kill switch.** `INTL-09` (PRD §42.5's corpus-scope switch lives there).
- **No internal boundary code.** `INTL-01`.
- **No table, migration or repository.** `01-app-data` (plan **A3**).

## File-scope (write-owns)

- `apps/api/src/routes/internal/releases/**`
- `apps/api/test/internal/releases/**` (sub-PRD **D11**), including
  `apps/api/test/internal/releases/fixtures/**`
- `apps/admin/src/features/releases/**`
- `apps/admin/test/releases/**` (sub-PRD **D11**)
- `apps/admin/package.json` — **append-only**, dependencies block only (sub-PRD **D10**, plan §1.1)

Does not touch:

- `apps/api/src/routes/internal/core/**`, `apps/admin/src/app/**`, `apps/admin/{index.html,vite.config.ts,tsconfig.json}`
  — `INTL-01`.
- `apps/api/src/routes/internal/{sources,quarantine,licensing,evaluation,cost,issues,incidents}/**` and
  `apps/admin/src/features/{sources,quarantine,licensing,evaluation,cost,issues,incidents,overview}/**`
  — `INTL-02`, `INTL-03`, `INTL-05`…`INTL-10`.
- `infra/**` — `18-ops-release`; `infra/deploy/corpus/**` and `infra/deploy/promote/**` are
  **serial-owned** (plan §4.1) and are never written from here.
- `pipelines/**`, `schemas/corpus-manifest/**` — `04-corpus-contract` and modules `05`–`10`, `21`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` and every other
  `apps/api/src/routes/<area>/**` — `03-app-runtime` and the product modules.
- `packages/**`, `schemas/**` — `00`–`03`, `11`, `12`, `20`. `apps/web/**`, `apps/widget/**`,
  `tests/**`, `docs/runbooks/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, nothing in flight),
so no prior ticket has written these paths. Inside `apps/api/src/routes/internal/**` and
`apps/admin/**` only `INTL-01` (this ticket's `blocked_by`) has written, and it owns
`internal/core/**` and `src/app/**` and completes first. The seven siblings that may run concurrently
(plan §7 wave 2, all blocked only by `INTL-01`) own different `internal/<area>/` and `features/<area>/`
directories, discovered by directory convention (plan **A1**, sub-PRD **D9**), so this console's
arrival changes no file another ticket owns. `RLSE-07` writes only `infra/deploy/corpus/**`, which this
ticket never touches — the relationship is a consumed contract, not a shared path. The single shared
file is `apps/admin/package.json`, restricted to appending distinct dependency entries.

## Deliverables

1. **`apps/api/src/routes/internal/releases/index.ts`** — `export const area = internalArea({ areaId:
   'releases', capability: 'RELEASES' })` and a default export of `internalRoutes(plugin, { areaId:
   'releases', capability: 'RELEASES' })`.
2. **`releases/snapshot.ts`** — reads `OperationalSnapshotStore.read('RELEASE')` (the active-release
   record and the candidate list with their manifests, plus `RLSE-07`'s recorded promotion/rollback
   outcomes), validating every manifest against `CRPS-02`'s
   `schemas/corpus-manifest/v1/release-manifest.schema.json`. A manifest failing validation is
   `UNAVAILABLE / INVALID_SCHEMA` for that release and is displayed as such — never partially parsed
   (`INTL-01` deliverable 7).
3. **`GET /internal/v1/releases`** — the list: the **active** release and every known candidate, each
   with `release_id`, `release_kind`, `parent_release_id`, `created_at`/`build_finished_at`,
   `versions`, `compatibility`, `counts`, `signature` state and a `promotable` verdict (deliverable 5).
   Sorted active-first, then candidates newest-first (PRD §32.8, solo operator).
4. **`GET /internal/v1/releases/{releaseId}`** — the full manifest projection: every PRD §18.4 member,
   with `coverage` rendered per source group, `quarantine` as `open_count`/`resolved_count`/
   `by_reason_code`, and `evaluation` as the gate table (`name`, `threshold`, `observed`, `passed`).
   Plus `GET /internal/v1/releases/{releaseId}/diff?against=<releaseId|active>` — a manifest-level diff
   over counts, coverage statuses, versions, compatibility and gate outcomes, so the operator can see
   what a promotion would change (PRD §20.4 *"explicit version/changelog confirmation"*).
5. **`promotable` is a named-check verdict, never a boolean guess.** `releases/promotability.ts`
   computes `{ promotable: boolean, checks: [{ id, passed, detail }] }` from the manifest and the
   snapshot alone, with one check per precondition the PRD names, each with a stable id:
   `SIGNATURE_PRESENT_AND_VERIFIED` (§18.4), `RELEASE_KIND_NOT_SYNTHETIC` (`CRPS-02` deliverable 4),
   `APP_COMPATIBILITY_IN_RANGE` and `SEARCH_COMPATIBILITY_IN_RANGE` (§18.4, §20.4),
   `NO_OPEN_QUARANTINE` (§35.3 *"cannot enter promoted release while open"*),
   `EVALUATION_GATES_PASSED` (§12.2, §14.2, `EVAL-002`), `NO_MANDATORY_GROUP_MISSING` (§7, §44.4),
   `MANIFEST_HASH_MATCHES` (§18.4). Any check whose input is **absent** is `passed: false` with
   `detail: 'INPUT_UNAVAILABLE'` — never `true` by default. `promotable` is the conjunction. The
   preconditions PRD §20.4 places outside the manifest (host disk/space, health, forced recovery point)
   are listed as **operator preconditions** the screen requires acknowledgement of and are attributed
   to `RLSE-06`/`RLSE-07`; the console does not claim to have checked them.
6. **`POST /internal/v1/releases/{releaseId}/promotion-authorisation`** and
   **`POST /internal/v1/releases/{releaseId}/rollback-authorisation`** — the only writes. Both are
   wrapped in `withDangerousAction({ incident: false, expiry: false })` with
   `capability: 'RELEASES'`, `scope: { type: 'CORPUS_RELEASE', payload: { releaseId, fromReleaseId } }`
   and a required `reason`; the typed confirmation challenge names the exact effect and both release
   ids (for example *"promote `<candidate>` replacing active `<active>`"*, PRD §41.1). Behaviour:
   - refuse with `409` when `promotable` is false, naming the failing check ids (promotion only);
   - refuse when `release_kind === 'SYNTHETIC_FIXTURE'` (`CRPS-02` deliverable 4);
   - refuse when the target of a rollback is not a **previously active, verified** release
     (PRD §42.5 *"prior verified release may be activated"*);
   - on success record an `AuthorisedAction` — audit event first, then the effect — and return
     `{ authorisation_id, audit_event_id, status: 'AUTHORISED', dispatched: boolean }`. `dispatched`
     is `false` when no dispatch binding to `RLSE-07` is configured (sub-PRD **M7**), so the operator
     sees that the tool has not yet run rather than a false success. **The console never reports the
     release as active**; the active pointer changes only when the next snapshot says so.
7. **Outcome display.** `GET /internal/v1/releases/authorisations` lists recent authorisations with
   their recorded outcome from `RLSE-07` (`PENDING`, `SUCCEEDED`, `FAILED` with the tool's failure
   reason) and the resulting active release id. A `FAILED` outcome must render with the active release
   **unchanged** and say so explicitly (PRD §30.2 `ADM-002` evidence; `UAT-OPS-01`).
8. **Nothing here writes corpus state.** An architecture assertion proves this area contains no
   filesystem write, no object-store SDK, no symlink or pointer operation and no `infra/` path
   reference (PRD §18.4 *"Active data MUST never be rebuilt or mutated in place"*; §35.8 invariant 8).
9. **`apps/admin/src/features/releases/feature.tsx`** — an `AdminFeatureModule` with `id: 'releases'`,
   a nav entry and routes `/internal/releases`, `/internal/releases/:releaseId`. Screens:
   - **list** — active release pinned at the top with its id, build time, versions and compatibility;
     candidates below with their `promotable` verdict as text plus badge;
   - **detail** — the manifest projection, the named-check table (each failing check readable in one
     line), the coverage and quarantine summaries with links to `INTL-02`/`INTL-03`, the evaluation gate
     table with a link to `INTL-06`, and the diff against active;
   - **promotion dialog** — `INTL-01`'s `dangerous-action-dialog`: names both release ids and the exact
     effect, requires the typed challenge and a reason, lists the PRD §20.4 operator preconditions
     (version/changelog confirmed, health/space/compatibility checked, **forced database recovery
     point taken**) as explicit acknowledgements, and is disabled while any manifest check fails;
   - **outcome panel** — pending/succeeded/failed with the tool's reason and the current active release,
     using the PRD §31.3 async states.

## Acceptance checklist (classified)

- [ ] `[machine]` The area mounts at `/internal/v1/releases` via `internalArea()`/`internalRoutes()`
      and `assertInternalMounting` passes (`INTL-01` contract items 1–2; PRD §8.11, §16.1)
- [ ] `[machine]` **`ADM-001` negative, every endpoint:** a customer session, a customer service-account
      credential and a widget token each receive a `404 RESOURCE_NOT_FOUND` byte-identical (apart from
      `request_id`) to the unknown-path body on every list, detail, diff, authorisation and outcome
      endpoint; unauthenticated → `401`; internal principal without `RELEASES` → the same `404`
      (PRD §30.2 `ADM-001`; PRD §16.5, §34.9)
- [ ] `[machine]` **`ADM-002` gate:** a promotion authorisation is refused without recent MFA
      (`403 RECENT_AUTH_REQUIRED`), without the exact typed confirmation, or without a reason — each
      asserted with an effect spy proving nothing ran (PRD §20.4, §32.8, §30.2 `ADM-002`)
- [ ] `[machine]` **`ADM-002` audit:** every authorisation appends the `AUTHORISED` audit event
      **before** the effect and an outcome event after; with no audit sink bound the authorisation is
      refused; the audit event carries actor, reason, scope (both release ids) and the request id
      (PRD §12.4, §30.2 `ADM-002` *"immutable audit"*)
- [ ] `[machine]` Every PRD §18.4 manifest member is present in the detail projection — asserted
      against a literal member list taken from `CRPS-02`'s schema (PRD §18.4)
- [ ] `[machine]` **Named checks fail closed:** each of a bad signature, an out-of-range app or search
      compatibility, `open_count > 0`, a failed evaluation gate, a missing mandatory group and a
      mismatching `manifest_sha256` makes `promotable` false and names the failing check id; an
      **absent** input yields `passed: false, detail: 'INPUT_UNAVAILABLE'`, never `true`
      (PRD §12.2, §18.4, §7, §14.2)
- [ ] `[machine]` A `SYNTHETIC_FIXTURE` release can never be authorised for promotion
      (`CRPS-02` deliverable 4; plan **A4**)
- [ ] `[machine]` A rollback authorisation targeting a release that was never active and verified is
      refused (PRD §42.5 *"prior verified release may be activated"*)
- [ ] `[machine]` **Nothing is promoted here:** the response reports `status: 'AUTHORISED'` and
      `dispatched: false` when no dispatch binding is configured, and no endpoint reports the target as
      active; an architecture scan finds no filesystem write, object-store SDK, pointer/symlink
      operation or `infra/` reference in the area (PRD §18.4, §35.8 invariant 8, §39.1)
- [ ] `[machine]` A recorded `FAILED` outcome renders with the active release unchanged and an explicit
      statement to that effect (PRD §30.2 `ADM-002` *"Promotion failure leaves active pointer
      unchanged"*)
- [ ] `[machine]` `assertSnapshotPortOnly()` and `assertNoInternalSurfaceInCustomerArtifacts()` green
      (sub-PRD **D5**, **D7**; PRD §8.11, §18.3, §39.1)
- [ ] `[machine]` PRD §22 canary: no research content, PII text or credential in any response, log line
      or audit event
- [ ] `[machine]` Admin screens implement the PRD §31.3 async states and convey the promotable verdict
      as text plus badge, not colour alone (PRD §41.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-002` and `UAT-OPS-01`, schema/API
      compatibility impact, rollback path and known gaps (sub-PRD **M7**)
- [ ] `[fixture]` The committed release fixtures under `apps/api/test/internal/releases/fixtures/**`
      replay end-to-end: a clean promotable candidate, an **unsigned** one, a **compatibility-mismatch**
      one, one with `quarantine.open_count > 0`, one with a failing evaluation gate, one with a missing
      mandatory group, one `SYNTHETIC_FIXTURE`, one **corrupt** (manifest hash mismatch — the
      `UAT-OPS-01` shape) and one schema-invalid document — each producing its expected verdict, check
      list and screen state, offline with no network and no production credentials
- [ ] `[human]` **`UAT-OPS-01`** rehearsed on a locally started stack: with the corrupt candidate
      fixture loaded, promotion is blocked from this console, the failing check is named, and the active
      release and search are unchanged (PRD §41.2)
- [ ] `[human]` PRD §42 promotion drill: the operator walks the dialog and confirms it names both
      release ids, requires the typed challenge and reason, and lists the PRD §20.4 preconditions
      including the forced database recovery point (PRD §20.4, §32.8; `ADM-002`)
- No further `[human]` criteria — PRD §41.2 contains no `UAT-ADM-*` row (sub-PRD **M4**); the
  end-to-end pointer behaviour is `RLSE-07`'s evidence
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust and no Python
  (PRD §45.3)

## Test plan

Reviewer steps, offline: no network, no R2, no corpus bundle, no production credentials, no promotion
tool execution.

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`; `pnpm test`.
2. Focused: `pnpm test --filter @aer/api`, `pnpm test --filter @aer/admin`. Suites under
   `apps/api/test/internal/releases/` and `apps/admin/test/releases/`.
3. **`boundary.test.ts`** — `internalAreaConformance('releases')` plus the four-row denial matrix from
   `INTL-01` contract item 4 against every endpoint; copy the construction pattern from
   `apps/api/test/internal/core/denial.test.ts`.
4. **`manifest-projection.test.ts`** — `[fixture]` replay of every committed manifest; assert the
   PRD §18.4 member list literally; assert a schema-invalid manifest yields `INVALID_SCHEMA` with no
   partial body.
5. **`promotability.test.ts`** — table-driven over the nine fixtures × the eight named checks; assert
   the failing check id, that `promotable` is the conjunction, and that removing an input flips the
   check to `passed: false, detail: 'INPUT_UNAVAILABLE'` rather than to `true`.
6. **`authorisation.test.ts`** — effect spy. Rejection rows: no capability, unsatisfied MFA, stale
   recent auth, wrong typed confirmation, empty reason, unbound audit sink, `promotable === false`,
   `SYNTHETIC_FIXTURE`, rollback to a never-active release — each asserting `effect.calls === 0`.
   Success row: one pre-effect `AUTHORISED` event, one outcome event, `dispatched === false` with no
   binding, and no response claiming the release is active. Concurrency: two simultaneous
   authorisations for the same release produce two audit events and no inconsistent state.
7. **`no-corpus-write.test.ts`** — architecture scan for filesystem writes, object-store SDKs,
   symlink/pointer operations and `infra/` references in the area; copy the construction pattern from
   `apps/api/test/internal/core/architecture.test.ts` (`INTL-01`).
8. **`releases.screen.test.tsx`** — render list, detail and dialog against each fixture; assert the
   dialog is disabled while a check fails, requires the typed challenge and reason, and lists the PRD
   §20.4 preconditions; assert a `FAILED` outcome renders the unchanged active release explicitly.
9. `git status --porcelain` clean after the run.
10. **Reviewer focus** (CLAUDE.md): whether any check defaults to passing when its input is missing;
    whether a `SYNTHETIC_FIXTURE` can reach authorisation by any route; whether the audit event can be
    skipped under sink failure; whether the console can be read as claiming a promotion happened;
    whether two concurrent authorisations can produce an inconsistent view; whether a customer
    principal reaches any endpoint.

## Feedback obligation

**1. General rule.** If implementation falsifies anything here, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **No dispatch path exists from the console to `RLSE-07`** (sub-PRD **M7**) → this is expected today.
  Ship the authorisation record with `dispatched: false` and record any new fact in
  `docs/prd/22-internal-admin/README.md` **M7**. Do **not** write `infra/deploy/corpus/**` — it is
  serial-owned by `RLSE-07` (plan §4.1, PRD §44.3) — and do not shell out to the tool from `apps/api`.
- **`RLSE-07` records its outcomes somewhere the console cannot read** → amend `RLSE-07`'s ticket and
  `docs/prd/18-ops-release/README.md` in one docs PR to publish an outcome document conforming to the
  snapshot contract, record it in `docs/prd/22-internal-admin/README.md` **M1**/**M7**, then `--sync`
  both. Never poll the corpus directory from `apps/api`.
- **`CRPS-02`'s manifest lacks a member this console must show** (for example a per-check gate result
  or the previously-active release id) → the manifest schema is **serial-owned** (`schemas/corpus-manifest/**`,
  plan §4.1). Raise it against `CRPS-02` and `docs/prd/04-corpus-contract/README.md`; never extend the
  schema from here and never infer the value.
- **A PRD §20.4 precondition (disk, health, forced recovery point) can actually be checked from the
  app** → that is a capability change crossing into `18-ops-release`. Record it in
  `docs/prd/22-internal-admin/README.md` open questions and, if accepted, add the edge in
  `docs/prd/breakdown-plan.md` §5.23/§6.2. Until then the screen requires acknowledgement and does not
  claim to have checked it — a console that claimed otherwise would mislead the operator at exactly the
  moment PRD §20.4 exists to protect.
- **An operator wants to promote despite a failing check** → PRD §12.2 (*"Failed releases MUST NOT
  modify active production data"*) and `EVAL-002` (*"Release is blocked unless every numeric and
  zero-tolerance gate passes"*) forbid an override. Do not add a force flag. Raise it as a **product
  change** (PRD §45.5) in `docs/prd/22-internal-admin/README.md` with the Founder as owner.

**3. Escalation.** `ADM-002` and PRD §18.4's *"Active data MUST never be rebuilt or mutated in place"*
are release requirements. If the console cannot authorise a promotion without also performing it, or a
promotion cannot be audited before it happens, that overturns a team decision spanning this module and
`18-ops-release`: stop, escalate for re-review, and never let this ticket acquire a corpus write path.
**An authorisation flow that would have to skip the audit append or delete data to work overturns
PRD §12.4** — escalate, never implement the shortcut.
