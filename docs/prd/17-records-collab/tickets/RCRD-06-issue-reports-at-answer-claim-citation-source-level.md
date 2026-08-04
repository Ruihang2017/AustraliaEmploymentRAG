---
id: RCRD-06
title: "Issue reports at answer/claim/citation/source level"
module: 17-records-collab
lane: 17-records-collab
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RCRD-01]
blocks: [RCRD-07]
---

# RCRD-06 — Issue reports at answer/claim/citation/source level

Implements PRD §12.3 and §16.2 — requirement **COR-001**, epic `E24-RECORDS`.
No ADR — the decision is already made in PRD §12.3 (*"Users MUST be able to report incorrect
citations, outdated sources, wrong jurisdiction/date, unsupported claims, missing authority and
privacy issues at answer/claim/citation/source level"*) and §16.2 (*"create/list/get/comment
`/v1/issues`"*); this is build ticket 6 of 9 against it.
Parent sub-PRD: [17-records-collab README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RCRD-01 — Research-record CRUD with ETag / `If-Match`](RCRD-01-research-record-crud-with-etag-if-match.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §12.3 fixes the categories and levels and `DATA-07` fixes the table; this maps HTTP onto them.

## Background + basis

**PRD §12.3 User issues and corrections**, quoted in full because it is the whole basis of this ticket
and the next:

> Users MUST be able to report **incorrect citations, outdated sources, wrong jurisdiction/date,
> unsupported claims, missing authority and privacy issues** at **answer/claim/citation/source**
> level. Confirmed errors MUST create a Correction, preserve the original answer, create or link a
> replacement Answer Snapshot, run impact analysis and notify affected customers when required.

The first sentence is this ticket. The second is `RCRD-07`, which is `blocked_by` this one.

**Requirement COR-001** (PRD §30.2): *"Users can report source/claim/citation/date/jurisdiction/PII
defects in context | Answer/source actions | issue endpoints | App | **Report includes stable target
IDs, not copied full content**."* That evidence line is the sharpest constraint in the ticket: a
report must be a *pointer plus the reporter's own words*, never a copy of the answer, claim, citation
or source text. Copying content would duplicate customer research outside its retention and encryption
model (PRD §37.3) and would make the report itself a second, unversioned copy of evidence.

**PRD §16.2** (Export, usage, audit and issues): *"create/list/get/**comment** `/v1/issues`"*. Note
the comment verb belongs to the issue resource — it is **not** `RCRD-05`'s `/v1/comments`, which
targets records, answers, claims and citations. Two different resources, deliberately.

**PRD §35.6**, the storage contract:

> | `issue_report` / `correction` | tenant target/category/description/status; replacement and impact
> linkage | **original answer preserved** |

These are `DATA-07`'s tables (`packages/database/src/schema/operations.ts`,
`src/repos/operations/**`), not `DATA-06`'s — see the caveat below.

**PRD §13.3 Support**: *"Email and **in-app issue reporting**"*, target response within two business
days. **PRD §32.3** places the affordance: the answer result screen's fixed action row ends with
*"actions: save/rerun/compare/export/watch/**report issue**"*. **PRD §41.1** requires that
*"request/job/**correction IDs** are copyable from errors and support panels"* — so an issue report
must return an id the user can quote.

**PRD §12.4** connects issues to incidents: severity ranges from SEV-1 (*"cross-tenant
exposure/systemic material legal error"*) down to SEV-4. A **privacy issue** report is therefore a
potential security event, which is why this ticket treats the privacy category specially
(Deliverable 6) rather than as one category among six.

**PRD §10.1**: *"The server MUST be the authoritative PII boundary before logging, persistence or
provider calls."* An issue description is free text, so it crosses `RUNT-02`'s `pii-admission` stage
(sub-PRD **D10**) — including, awkwardly but correctly, a report whose subject *is* a PII leak: the
reporter describes the category and location, never re-enters the value. PRD §37.2 says exactly this:
*"If users need to explain a false positive, they can report the detector category and request ID
without the original text."*

**Accepted caveats carried forward:**

- **`issue_report` is a `DATA-07` table and this ticket has no `blocked_by DATA-07` edge**
  (sub-PRD **QR-1**). Breakdown plan §5.18 gives this ticket `blocked_by: [RCRD-01]` and §6.2's
  `DATA-07 --> …` line does not include it. In the global schedule `01-app-data` delivers roughly
  twelve waves earlier, so the repository exists in practice. **If it does not exist when this ticket
  starts, stop and write back** to `docs/prd/breakdown-plan.md` §5.18 + §6.2 and
  `docs/prd/17-records-collab/README.md`; do **not** create the table here (plan **A3**, **R4**,
  PRD §45.2). Inventing the edge in this ticket's frontmatter is equally forbidden — it would falsify
  `dag-scan.mjs`'s input.
- **The category and target-level vocabularies are `FND-03`'s** (sub-PRD **QR-10**). PRD §12.3 names
  six categories and four levels in prose; PRD §35.1 requires the CHECK values to be generated from
  `packages/contracts`. This ticket consumes the enum and raises a writeback if it is absent.
- **Triage, confirmation and correction are `RCRD-07` and `22-internal-admin`/`INTL-08`.** This ticket
  ships the customer-facing report and its read-back only. An issue's `status` transitions beyond the
  initial state are `RCRD-07`'s.

## Goal

Produce `apps/api/src/routes/issues/**`: the `/v1/issues` create/list/get/comment surface covering all
six PRD §12.3 categories at all four target levels, storing **stable target IDs plus the reporter's own
description only**, with PII admission on every free-text write and tenant-scoped target validation.
Completion is mechanically checkable: a 6 × 4 category-by-level matrix proves every combination is
reportable; a content-leak assertion proves that the stored report contains no substring of the
targeted answer, claim, citation or source text; and a cross-tenant matrix proves a foreign target id
is indistinguishable from an absent one.

## Non-goals

- **No table, migration or repository.** `DATA-07` owns `issue_report` and its repository (sub-PRD
  **D1**, **QR-1**, plan **A3**, PRD §45.2, plan **R4**).
- **No corrections, confirmation, impact analysis or notification.** `RCRD-07`, which is `blocked_by`
  this ticket, and `22-internal-admin`/`INTL-08` (the triage console, `blocked_by RCRD-07`).
- **No internal triage console or `/internal/v1` route.** `apps/api/src/routes/internal/**` and
  `apps/admin/**` are `22-internal-admin`.
- **No incident or kill-switch surface.** PRD §12.4's `incident`/`kill_switch` entities are `DATA-07` +
  `22-internal-admin` (`INTL-09`). A privacy-category report *signals*; it does not open an incident
  here.
- **No `/v1/comments`.** `RCRD-05` owns comments on records/answers/claims/citations; this area owns
  the issue-scoped comment verb from PRD §16.2 only.
- **No record CRUD, turns, answers or review actions.** `RCRD-01` … `RCRD-04`.
- **No screens.** `RCRD-08` renders the report affordance in the record context;
  `15-answer-product`/`ASK-07` renders it in the PRD §32.3 answer action row.
- **No PII detection.** `12-evidence-safety` (`EVID-01`) provides the detector; `RUNT-02` runs the
  stage.
- **No permission matrix, OpenAPI, contract or app-manifest edits.** `FND-06`, `FND-04`, `FND-03`,
  `03-app-runtime` (**D16**).
- **No cross-boundary suites.** `tests/**` is `23-assurance`; co-located assertions here per plan R8.

## File-scope (write-owns)

- `apps/api/src/routes/issues/**`
- `apps/api/test/records/issues/**` (sub-PRD **D15**)

Does not touch:

- `apps/api/src/routes/{research-records,research-turns,record-answers,review-actions,comments,corrections}/**`
  — `RCRD-01` … `RCRD-07`; `apps/api/src/routes/internal/**` — `22-internal-admin`.
- `apps/api/src/{server.ts,app.ts,bootstrap,plugins,middleware,errors,sse}/**` — `RUNT-01` …
  `RUNT-03`; `apps/api/package.json`, `apps/api/tsconfig.json` — `03-app-runtime` (**D16**).
- `packages/database/**` — `01-app-data`; `packages/domain/**`, `packages/contracts/**`,
  `schemas/openapi/**` — `00-foundation`; `packages/pii/**` — `12-evidence-safety`.
- `apps/worker/**`, `apps/web/**`, `apps/admin/**`, `infra/**`, `tests/**` — other modules.

**Serial-safety analysis.** First decomposition (plan §1: phase 1, nothing merged, no in-flight
ticket), so nothing has previously written `apps/api/src/routes/issues/**` and nothing contends for
it. Plan **A1** makes the area self-registering under its default prefix `/v1/issues`, disjoint from
every sibling's URL space and from `RCRD-01`–`RCRD-04`'s `/v1/research-records` mounts; `RUNT-01`'s
boot-time collision detector enforces that mechanically. Its concurrent sibling in the schedule is
`RCRD-08` (`apps/web`), a different tree entirely. Per plan **A3** this ticket writes **no** table and
**no** repository — which is exactly why `22-internal-admin` can build a triage console over the same
`issue_report` rows without any file dependency between modules `17` and `22`, and why the missing
`DATA-07` edge (**QR-1**) is a *scheduling* finding rather than a licence to own a table.

## Deliverables

1. **`apps/api/src/routes/issues/index.ts`** — default-exported `FastifyPluginAsync` plus
   `export const area = { admission: 'tenant' } satisfies RouteAreaConfig`; default prefix `/v1/issues`
   (sub-PRD **D2**).
2. **`POST /v1/issues`** — body:
   `{ target_type, target_id, category, description, context?: { request_id?, job_id?, corpus_release_id? } }`.
   - `target_type` is the PRD §12.3 level, from `packages/contracts` (**QR-10**):
     `ANSWER_SNAPSHOT`, `ANSWER_CLAIM`, `CLAIM_CITATION`, `SOURCE` (a corpus document/version/node
     reference).
   - `category` is the PRD §12.3 kind, from `packages/contracts`: incorrect citation, outdated
     source, wrong jurisdiction/date, unsupported claim, missing authority, privacy issue.
   - `description` is the **reporter's own words** and the only free text stored.
   Route flags: `idempotent: true`, `requiresPiiAdmission: true` (sub-PRD **D10**). Responds `201`
   with the issue id — a copyable id per PRD §41.1.
3. **Stable target IDs only, enforced mechanically (COR-001).** The request type has **no** field for
   answer text, claim text, citation quote or source excerpt, and the route rejects
   `400 INVALID_REQUEST` naming the field if one is supplied. A stored report therefore consists of:
   opaque target ids, a category, the reporter's description, and the optional operational context
   ids. This is the ticket's headline guarantee and is asserted as a **content-leak test**
   (Acceptance) rather than trusted to the type alone, because a reporter could paste content into
   `description` — see Deliverable 4.
4. **Description handling.** `description` is customer-authored free text stored as ciphertext through
   `DATA-07`'s repository (PRD §37.3, `DATA-03`'s codec) and is length-bounded by `RUNT-02`'s
   `request-limits` stage. The content-leak assertion targets the **structured** fields: it proves no
   evidence text is *stored in a structured field*, and it separately warns (not fails) if
   `description` contains a long verbatim run from the target — a heuristic that belongs in the test,
   not in the request path, because refusing a description on similarity grounds would block a
   legitimate report. The distinction is stated here so no one turns the warning into a blocking rule.
5. **Target validation, inside the same transaction and inside the tenant.** For
   `ANSWER_SNAPSHOT`/`ANSWER_CLAIM`/`CLAIM_CITATION` the target must resolve in the caller's
   organisation through `DATA-06`'s repositories; for `SOURCE` the target is a corpus id
   (`document_id` / `document_version_id` / `node_version_id`) which is **public** and is validated
   for shape and referential plausibility only — this app never opens `corpus.sqlite` (PRD §18.3,
   §45.2). A tenant-owned target in another organisation returns the byte-identical
   `404 RESOURCE_NOT_FOUND` as an absent one (PRD §16.5). The owning `record_id` is derived, never
   supplied.
6. **The privacy category is a security signal (PRD §12.4).** A report with the privacy category:
   - is accepted through exactly the same path (never blocked, never rate-limited more harshly — a
     user reporting a leak must always get through);
   - emits a distinct **high-priority security audit event** through `RUNT-02`'s audit hook, carrying
     category, target ids, `request_id` and actor — and **no** description text (PRD §22; §35.6);
   - sets no incident state here (`22-internal-admin`/`INTL-09` owns incidents) — it signals so triage
     can classify severity per PRD §12.4.
   PRD §37.2's rule is quoted in a code comment at the write path: *"If users need to explain a false
   positive, they can report the detector category and request ID **without the original text**."*
7. **`GET /v1/issues`** and **`GET /v1/issues/{issueId}`** — list (cursor-paginated per PRD §34.1,
   filterable by `status`, `category`, `target_type`, `record_id`) and read, both tenant-scoped. The
   reporter and other permitted members of the same organisation see the issue and its status; nobody
   sees another organisation's issue, and an absent id and a foreign id are indistinguishable
   (PRD §16.5).
8. **`POST /v1/issues/{issueId}/comments` and `GET /v1/issues/{issueId}/comments`** — the PRD §16.2
   issue-comment verb: a flat, append-ordered discussion between the reporter and (later) the internal
   triager. Flags `requiresPiiAdmission: true`. These are **issue** comments; they are a different
   resource from `RCRD-05`'s `/v1/comments` and share no storage or route path.
9. **Status is read-only on this surface.** An issue is created in its initial state and this area
   exposes **no** status-write path: triage, confirmation and rejection are `RCRD-07` /
   `22-internal-admin`/`INTL-08`. A `status` supplied on create is rejected `400 INVALID_REQUEST`
   naming the field.
10. **Permission and scope declarations.** Creating an issue requires only membership plus the
    record/answer read permission for the target (a Viewer must be able to report a defect they can
    see — PRD §13.3 "in-app issue reporting" is a support channel, not a privileged action).
    Listing and reading are tenant-scoped. Evaluated by `RUNT-02`/`FND-06`; no role name is hard-coded
    (PRD §38.1).
11. **Audit.** Create and comment emit audit records with actor, organisation, issue id, category,
    target type/id, `request_id` and — for the privacy category — the high-priority security marker.
    Never the description text (PRD §22; §35.6 *"no complete research body"*).
12. **Test fixtures** — `apps/api/test/records/issues/fixtures/`: `category-level-matrix.json` (the
    6 categories × 4 target levels with expected outcomes), `targets.json` (valid and foreign ids per
    level) and `leak-canaries.json` (an answer, claim, citation quote and source excerpt each carrying
    a distinctive canary string, used by the content-leak assertion). All synthetic (PRD §45.1 item 6).

## Acceptance checklist (classified)

- [ ] `[fixture]` **PRD §12.3 coverage matrix:** `category-level-matrix.json` replays — all **six**
      categories are reportable at all **four** target levels (24 combinations), each returning `201`
      with a copyable issue id (PRD §12.3; §30.2 **COR-001**; §41.1 *"correction IDs are copyable"*)
- [ ] `[machine]` **COR-001 headline — stable target IDs, not copied content:** the request type has
      no field for answer/claim/citation/source text, and a request supplying one is rejected
      `400 INVALID_REQUEST` naming the field (PRD §30.2 COR-001 evidence)
- [ ] `[machine]` **Content-leak assertion:** create one issue per target level against
      `leak-canaries.json`; assert that **no structured stored field** of the resulting `issue_report`
      row contains any canary substring from the targeted answer, claim, citation quote or source
      excerpt (PRD §30.2 COR-001; §37.3)
- [ ] `[machine]` `category` and `target_type` values come from `packages/contracts`; a value outside
      either enum is rejected `400 INVALID_REQUEST`, and a source scan finds no locally declared
      vocabulary (PRD §35.1; **QR-10**)
- [ ] `[machine]` **Tenant isolation (PRD §21.2 / SEC-001):** creating, listing, reading or commenting
      against another organisation's answer, claim, citation, record or issue id returns responses
      byte-identical to the absent-id case apart from `request_id`, and no row is written; the other
      organisation's issue list is unchanged (PRD §16.5; `UAT-AUTH-03`)
- [ ] `[machine]` A `SOURCE`-level target is validated for shape only and no code path opens
      `corpus.sqlite` — a source scan asserts no corpus database import in this area (PRD §18.3,
      §45.2)
- [ ] `[machine]` `record_id` is derived from the target chain, never accepted from the client; a
      supplied `record_id` or `status` is rejected `400` naming the field (PRD §34.1)
- [ ] `[machine]` **Privacy category is never harder to report:** a privacy-category report succeeds
      under the same admission path and the same rate limits as any other category, and emits a
      distinct high-priority security audit event carrying category and ids but **no** description
      text (PRD §12.4; §22)
- [ ] `[machine]` `requiresPiiAdmission: true` on `POST /v1/issues` and on the issue-comment write:
      with the stub rejecting, a description containing a synthetic PII canary yields
      `422 EMPLOYEE_PII_DETECTED` carrying field/range/category and **not** the value, **no** row is
      written, and the canary is absent from raw database bytes after
      `PRAGMA wal_checkpoint(TRUNCATE)` (PRD §10.1, §37.2, §37.3)
- [ ] `[machine]` The rejection message for a PII-blocked description does not echo the detected value
      and does point the reporter at the §37.2 route — *"report the detector category and request ID
      without the original text"* (PRD §37.2)
- [ ] `[machine]` This area exposes **no** status-write path: `PATCH`/`PUT` on an issue and any
      `status` field on create are unroutable or rejected; triage belongs to `RCRD-07`/`INTL-08`
      (PRD §12.3; plan §5.23)
- [ ] `[machine]` Issue comments are a distinct resource from `/v1/comments`: a source scan asserts no
      shared route path and no shared repository between this area and `RCRD-05`'s (PRD §16.2)
- [ ] `[machine]` Idempotency on `POST`: the same actor/route/key/body returns the original `201` and
      creates one issue; a changed body returns `409 IDEMPOTENCY_CONFLICT` (PRD §34.1)
- [ ] `[machine]` Pagination honours `page_size` 1–100 / default 25; filters by `status`, `category`,
      `target_type` and `record_id` compose and never leak another organisation's rows (PRD §34.1,
      §16.5)
- [ ] `[machine]` **Audit:** every write emits an audit record with ids/categories only — a canary
      description appears in no audit record and no log line (PRD §22; §35.6)
- [ ] `[machine]` A Viewer with read access to the target can create an issue (in-app issue reporting
      is a support channel, PRD §13.3), and the permission is evaluated by `RUNT-02`/`FND-06` with no
      role-name literal in this area (PRD §38.1; §45.2)
- [ ] `[machine]` `CUSTOMER_REVIEWED` is not mentioned in any string this area ships; if a future
      string does, it matches `RCRD-01`'s `customer-reviewed-copy.json` and never implies
      product-owner or legal verification (PRD §8.7; sub-PRD **D6**)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:integration` green
      (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean; `/v1/issues` and its comment paths are
      declared in `FND-04`'s OpenAPI (PRD §20.1; **QR-5**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**COR-001**, `UAT-AUTH-03`,
      `E24-RECORDS`), user-visible change and non-goals, schema/API/event compatibility (additive
      `/v1` paths; no event), tenant/PII/security/retention impact (description encrypted, PII
      admission on both writes, privacy-category security event), source/licence impact (none — no
      source text is copied, which is itself the COR-001 guarantee), cost/memory/latency impact (none
      — no generation credit), rollback path (revert; `RCRD-07` consumes this area), known gaps
      (**QR-1** missing `DATA-07` edge, **QR-10** category enum)
- [ ] No `[human]` criteria in this ticket — the report affordance and its `[human]` acceptance sit on
      the answer result screen (`15-answer-product`/`ASK-07`) and the record detail (`RCRD-08`)
      (PRD §32.3, §41.1)
- [ ] No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected (PRD §45.3)

## Test plan

Reviewer steps. Everything offline: no network, no model provider, no corpus database.

1. **Check the plan-edge caveat first.** Confirm `DATA-07`'s `issue_report` repository exists on the
   default branch. If it does not, the correct outcome is a **bounce with a writeback**, not a locally
   created table — sub-PRD **QR-1**, plan **R4**.
2. `pnpm typecheck && pnpm lint`; `pnpm test --filter <apps/api>`; suites under
   `apps/api/test/records/issues/`.
3. **Harness.** Fastify `inject()` per `apps/api/test/route-area-conformance.ts` (`RUNT-01`);
   `withTempDatabase` (`DATA-01`) with `DATA-04` tenancy, `RCRD-01`'s record factory and `DATA-06`'s
   `writeAnswerSnapshot` seeding, in **two** organisations, so every target level exists on both sides
   of the tenant boundary. Source-level targets are synthetic opaque corpus ids.
4. **`matrix.test.ts`** — replay `fixtures/category-level-matrix.json`: all 24 combinations return
   `201` with an id; assert the id is opaque and unparsed by the client code path (sub-PRD **D17**).
5. **`no-content-copy.test.ts`** — the load-bearing COR-001 test. Seed answers/claims/citations/source
   references whose text carries the `leak-canaries.json` canaries. Create one issue per level. Read
   the stored row back through the repository and assert **no structured field** contains any canary.
   Then attempt to supply `answer_text`, `claim_text`, `quote` and `source_excerpt` on create and
   assert each is rejected `400` naming the field.
6. **`tenant-isolation.test.ts`** — the full matrix: create/list/get/comment against organisation B's
   answer id, claim id, citation id, record id and issue id. Assert byte-identical `404`s and that B's
   issue list is unchanged (direct repository read before and after).
7. **`privacy-category.test.ts`** — create a privacy-category report; assert it succeeds under the same
   limits, that a high-priority security audit event is emitted with category and ids, and that the
   description text appears nowhere in it. Assert no incident row is created here.
8. **`pii.test.ts`** — with the stub rejecting, submit a description containing a synthetic TFN canary;
   assert `422 EMPLOYEE_PII_DETECTED`, that the response carries field/range/category and not the
   value, that the message points at PRD §37.2's category-and-request-id route, that no row exists, and
   that the canary is absent from raw database bytes after `PRAGMA wal_checkpoint(TRUNCATE)`.
9. **`no-status-write.test.ts`** — method × path matrix asserting `PATCH`/`PUT` on an issue are
   unroutable and that `status` on create is rejected.
10. **`comments.test.ts`** — create and list issue comments; assert ordering, pagination and that the
    route path and repository are distinct from `RCRD-05`'s (a source scan).
11. **`pagination-filters.test.ts`** — 200 issues across categories, levels and two records; walk the
    cursor; assert completeness and no cross-tenant leakage under any filter combination.
12. **`audit.test.ts`** — canary description; assert absence from every audit record and log line.
13. **`no-corpus-access.test.ts`** — source scan over this area asserting no import that opens
    `corpus.sqlite` and no retrieval-client call (PRD §18.3, §45.2).
14. **Contract check** — `pnpm generate && pnpm generated:check`.
15. **Source review** — grep the diff for a locally declared category or level list, any role-name
    string, any crypto call, and any unscoped `packages/database` import; all must be absent.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** and
`docs/prd/17-records-collab/README.md` (version +0.1 + changelog line) **before** changing code, then
`publish-tickets.mjs --sync`. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`DATA-07`'s `issue_report` repository does not exist or lacks a needed field** (sub-PRD **QR-1**).
  → **Stop.** Do not create the table, the migration or a repository here — plan **A3**, plan **R4**
  and PRD §45.2/§44.3 all forbid it, and doing so would reintroduce the ownership split A3 exists to
  remove. Write back to `docs/prd/breakdown-plan.md` §5.18 + §6.2 (adding the `DATA-07 → RCRD-06`
  edge), `docs/prd/01-app-data/README.md` and `docs/prd/17-records-collab/README.md` **QR-1**, then
  re-publish and proceed.
- **`FND-03` does not export the issue category or target-level enum** (**QR-10**). → PRD §35.1
  requires generated CHECK values. Raise the `00-foundation` docs PR, record it in this README's
  open questions, and do not declare a local vocabulary. If a category the PRD does not name is
  wanted, that is a **product change** with the **Founder** as owner (PRD §45.5).
- **A reporter genuinely needs to attach the offending text** (for example a citation quote that does
  not match its offsets). → COR-001's evidence forbids copied content. The correct mechanism is the
  **target ids plus the operational context ids** (`request_id`, `job_id`, `corpus_release_id`), which
  let triage reconstruct the exact evidence from immutable storage. If that proves insufficient,
  record it in `docs/prd/17-records-collab/README.md` open questions with the Founder as owner and
  coordinate with `RCRD-07`/`INTL-08`; never widen the request type unilaterally.
- **The similarity heuristic starts blocking legitimate reports.** → It must not block: Deliverable 4
  makes it a *test-side warning*, not a request-path rule. If someone proposes promoting it to a
  rejection, that is a support-channel regression (PRD §13.3) — raise it in this README rather than
  shipping it.
- **A privacy report should open an incident automatically.** → Incidents are `22-internal-admin`
  (`INTL-09`) and PRD §12.4 requires an actor, reason, scope and review time for every kill switch and
  incident action. Record the requirement in `docs/prd/17-records-collab/README.md` and
  `docs/prd/22-internal-admin/README.md` and add the plan edge; do not create incident state here.
- **`RCRD-07` needs a field on the issue this ticket does not store** (for example a triage note or a
  severity). → Add it **here**, in this area and `DATA-07`'s repository via an `01-app-data` writeback
  — not in `RCRD-07`'s area, which owns corrections. Record the shape in this README.

**3. Escalation.** If the *"stable target IDs, not copied full content"* guarantee proves
unimplementable — for instance because triage genuinely cannot reconstruct the evidence from ids — that
overturns requirement **COR-001**'s minimum acceptance evidence and PRD §37.3's retention matrix, both
customer-facing commitments. Stop, escalate for re-review through the PRD §45.5 product-change path,
and write back to `docs/prd/17-records-collab/README.md` before any code changes. Separately, anything
that would require **mutating the answer, claim or citation being reported** in order to record a
report overturns PRD §8.7 and PRD §35.8 invariant 5 — a report points at immutable evidence and never
alters it. Escalate; never soften immutability inside this ticket.
