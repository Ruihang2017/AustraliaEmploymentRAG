---
id: FND-04
title: OpenAPI root and generated TypeScript bindings
module: 00-foundation
lane: 00-foundation
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [RUNT-01, RUNT-05, RETR-09, PLTF-01, PLTF-02, PLTF-03]
---

# FND-04 — OpenAPI root and generated TypeScript bindings

Implements PRD §16.1–§16.5 and §34.1–§34.9, requirement **DEV-001** (epic `E02-CONTRACTS`).
No ADR — the decision is already made in PRD §34 (*"The OpenAPI file at `schemas/openapi/openapi.yaml`
will be the generated-code source of truth"*) and §44.3 (the OpenAPI root is serial-owned); this is
build ticket 4 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §16 lists the endpoints and PRD §34 gives the normative payload shapes; this transcribes them into a
machine-checkable document, it does not design an API.

## Background + basis

**PRD §34 preamble** is the load-bearing sentence:

> The OpenAPI file at `schemas/openapi/openapi.yaml` will be the generated-code source of truth. The
> examples below are normative payload shapes; property names and enum meanings cannot drift from them
> without PRD/API change control.

**PRD §20.1**: *"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited."*
**PRD §44.3** names the OpenAPI root a serial-owned artifact; breakdown plan §4.1 assigns it here:
*"`schemas/openapi/openapi.yaml` + `packages/contracts/src/generated/**` — `00-foundation` — `FND-04` —
PRD §34 'the generated-code source of truth'; DEV-001 requires a clean generated-client diff in CI."*

**Requirement DEV-001** (PRD §30.2), quoted in full:

> | DEV-001 | OpenAPI drives TypeScript/Python generated cores | `/developer/api` | `/v1` | Contracts |
> | Generated-client diff is clean in CI |

**PRD §16.1 platform rules** — every one is a constraint on this document:

> - Base path `/v1`; internal administration `/internal/v1`.
> - JSON/HTTPS, stable opaque IDs, ISO 8601 UTC timestamps and cursor pagination.
> - Legal dates use explicit Australian calendar dates.
> - Organisation is derived from authenticated context, not trusted request fields.
> - Every response includes `request_id`.
> - Retryable writes support `Idempotency-Key`.
> - HTTP status and domain answer status remain separate.
> - Optional fields may be added within v1; breaking changes require v2.
> - Webhooks carry their own schema version.

with the uniform error shape:

```json
{ "error": { "code": "INSUFFICIENT_EVIDENCE", "message": "…", "request_id": "req_...", "details": {}, "retryable": false } }
```

**PRD §34.1 common conventions** (the table that fixes ID, date, money, pagination, idempotency,
versioning, concurrency and tenant handling — reproduced in `FND-03`'s background for IDs; the rows this
ticket must encode are pagination `page_size` 1–100 default 25 with an opaque `next_cursor`; idempotency
key 16–128 characters where *"same actor/route/key/body returns original result; changed body returns
409"*; `ETag` + `If-Match` on mutable resources; and *"Tenant | Never accepted in a request body; derived
from authenticated session/key/widget token"*).

**PRD §16.2** lists every endpoint the document must declare — search and authorities (9), answers (6),
compare and coverage (4), research and collaboration (5 groups), monitor and delivery (3 groups),
export/usage/audit/issues/system-status (6 groups) — plus the rules *"Search is read-only despite POST
and MUST not consume generation credits"*, *"Editable resources MUST use ETag/version + `If-Match`;
conflicts return `409 CONCURRENT_MODIFICATION`"* and *"Webhook headers MUST include event ID, timestamp
and HMAC signature"*.

**PRD §16.3** adds the authentication/machine-access endpoints and the SSO state list; **§16.4** the
BYOK rules (*"Keys are displayed only on entry, decrypted only inside the Model Gateway and excluded
from logs/exports/support. Arbitrary base URLs are prohibited."*); **§16.5** the authorisation order
(*"authenticate → resolve organisation → verify membership/service account → evaluate permission →
perform tenant-scoped lookup. Other-tenant and absent opaque IDs return the same not-found response."*).

**PRD §34.9** is the error catalogue: 17 codes with HTTP status, retry semantics and user action, closing
with *"Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed research results and
do not become HTTP errors."* Sub-PRD decision **D7**: the code *identifiers* are `FND-03`'s enum; the
HTTP status, `retryable` flag and response schema are this ticket's.

**PRD §34.2/§34.3/§34.5/§34.6/§34.7/§34.8** contain normative JSON payloads. They are copied verbatim
into fixtures and validated against the schemas — the mechanism by which "cannot drift" becomes
enforceable rather than aspirational.

**Accepted caveats carried forward:**

- Not one route is implemented yet. This ticket publishes the contract; `03-app-runtime`/`RUNT-01`
  builds the server that serves it and the product modules add handlers. That is deliberate: PRD §44.3
  names *"Web screens against frozen contracts"* and *"independent SDK languages"* as the safe parallel
  units, which only works if the contract is frozen first.
- The Python generated core (DEV-001's other half) is `20-developer-platform`/`PLTF-03`, generated from
  this same root.
- `packages/contracts/package.json` is append-only shared within this module (sub-PRD D16).
- **Added in v1.1 (sub-PRD v0.8).** PRD §34.3 names `409 CLARIFICATION_ROUND_CLOSED`, which the §34.9
  catalogue does not list and `FND-03`'s `ERROR_CODE_VALUES` therefore does not contain. Acceptance
  item 4 forbids an extra code and acceptance item 5 pins the `ErrorCode` schema to the registry, so
  `POST /v1/answer-jobs/{job_id}/clarifications` is declared **without** a stale-round `409`. The gap
  is recorded as sub-PRD **Q-F8** and escalated to the founder as a PRD §34.3-vs-§34.9 inconsistency;
  it is not resolved by inventing an eighteenth member.
- **Added in v1.1.** PRD §34.5's Answer Snapshot carries `schema_version` but **no `request_id`**, and
  §34.3's clarification block carries neither, so deliverable 1's common-envelope rule cannot be
  applied universally without adding a property to a normative §34 shape — which acceptance item 3
  forbids. Sub-PRD **D27** records the exemption mechanism (`x-envelope-exempt` + a reason citing the
  overriding PRD block, asserted by the convention scan).
- **Added in v1.2 (sub-PRD v0.8, decision D29) — review bounce.** Acceptance item 6's
  `git status --porcelain` half **failed as literally tested** under this repository's documented
  `core.autocrlf=true`: git checks the generated files out as CRLF, an always-LF `generate` rewrote
  them, and git reported them modified even though `git hash-object` matched the committed blob.
  `.gitattributes` — the repository-wide fix — is unallocated by breakdown plan §4 and `FORBIDDEN` in
  `tools/tests/frozen-paths.test.mjs`, so `generate` reproduces git's own checkout transformation
  instead (LF on CI, CRLF on a `core.autocrlf=true` checkout) while `emit()` stays pure LF, the index
  stays LF and `generated:check` is not loosened (Feedback obligation 4).
  `packages/contracts/test/generated/working-tree.test.ts` is the regression guard. The durable fix —
  allocating `.gitattributes` and setting `* text=auto eol=lf` — is escalated to the Architect.

## Goal

Produce `schemas/openapi/openapi.yaml` declaring every PRD §16.2/§16.3 endpoint with the PRD §34
payload shapes, error catalogue and common conventions; a loader/validator under
`packages/contracts/src/openapi/**`; generated TypeScript types and a typed client core under
`packages/contracts/src/generated/**` carrying a do-not-edit banner; and a compatibility baseline so
PRD §20.3's "API/OpenAPI compatibility" gate detects breaking changes. Completion is mechanically
checkable: `pnpm generate && pnpm generated:check` exits 0 with no working-tree diff (DEV-001), every
§16.2 endpoint replays against a committed fixture, and every §34 example validates against its schema.

## Non-goals

- **No route, handler, server or middleware code** — `03-app-runtime`/`RUNT-01` (`apps/api/src/{server.ts,app.ts,bootstrap,errors}/**`),
  `RUNT-02` (admission chain), and the product modules for `routes/<area>/**`.
- **No SSE transport** — `RUNT-03` owns `apps/api/src/sse/**`; the SSE *event payload schemas* are
  `FND-05` (sub-PRD D8), not this document. This document declares
  `GET /v1/answer-jobs/{job_id}/events` as an endpoint with a `text/event-stream` response.
- **No event or webhook schemas** — `FND-05` owns `schemas/events/**`; PRD §16.1 keeps webhook schema
  versioning separate from `/v1`.
- **No enum member definitions** — `FND-03`. This document `$ref`s enum schemas generated from
  `ENUM_REGISTRY`; it never re-lists members.
- **No Python SDK, no TypeScript SDK package** — `20-developer-platform` (`PLTF-02`, `PLTF-03`). This
  ticket produces the generated *core* inside `packages/contracts`, which those SDKs wrap.
- **No `/internal/v1` operation bodies** — `22-internal-admin` owns `apps/api/src/routes/internal/**`.
  PRD §16.1 requires the base path to exist in the contract; the internal operations themselves are
  declared by their owning module when they are built (see Feedback obligation 3).
- **No API reference site or portal** — `20-developer-platform`/`PLTF-01` (`docs/api/**`,
  `apps/web/src/features/developer/api/**`).

## File-scope (write-owns)

Owned by this ticket:

- `schemas/openapi/**` — the document, its `examples/**` fixtures and the compatibility baseline.
- `packages/contracts/src/openapi/**` — loader, validator, compatibility checker.
- `packages/contracts/src/generated/**` — generated types and client core (machine-written).
- `packages/contracts/test/{openapi,generated}/**` (sub-PRD D14).
- `packages/contracts/package.json` — **append-only**, own entries only (sub-PRD D16).
- `tools/tests/skeleton.test.mjs`, `tools/tests/scripts.test.mjs`, `tools/fixtures/script-owners.json`
  — **added in v1.1 (sub-PRD v0.8, decision D22)**, the minimum needed to repair `FND-01`'s two
  remaining bootstrap-time invariants. Both encode *the state of the repository at bootstrap* as a
  permanent, repository-wide invariant that `tools/vitest.config.mjs` runs on every later branch:
  *"declares no dependency beyond the toolchain in any member manifest"* contradicts this ticket's own
  Harness paragraph, and *"`generate` … prints exactly one owner-naming line"* (asserting
  `membersProviding('generate')` is empty) contradicts deliverable 7. It is the same defect class
  `FND-11` was created to repair, it blocks every remaining ticket that adds a dependency or implements
  a delegated script, and it cannot be worked around inside the original file-scope without making
  DEV-001's evidence vacuous. The repair replaces each assertion with a **stronger** one (D22) — it
  never deletes, skips or weakens a check. `FND-05` shares these three files this wave and **rebases
  onto this repair rather than re-doing it**.
- `packages/contracts/test/enums/package-purity.test.ts` — **added in v1.1 (sub-PRD D22c)**, the same
  defect one ticket later: `FND-03` asserted *"declares no dependency of any kind"*, which this
  ticket's Harness cannot satisfy. Repaired to PRD §39.1/§45.2's durable rule — this package pushes
  no dependency onto its consumers — **plus two new, stronger assertions** covering the `.mjs` build
  tooling the file's `.ts`-only import scan would otherwise have missed entirely.

Does not touch:

- `packages/contracts/src/{enums,ids}/**` — `FND-03` (merged before this starts; this ticket *reads*
  `ENUM_REGISTRY`).
- `packages/contracts/src/events/**`, `schemas/events/**` — `FND-05` (same wave, disjoint subtree).
- `packages/domain/**` — `FND-06` … `FND-10` (same wave, different package).
- `apps/**`, `services/**`, `packages/sdk-typescript/**`, `sdk/python/**`, `docs/api/**` — modules 03,
  11, 20.
- Root manifests, `README.md`, and all of `tools/**` **except** the three files named above — `FND-01`.
  `.github/workflows/**` — `FND-02` (this ticket supplies the script the `openapi-compat` job calls,
  named `test:openapi-compat` by sub-PRD D19; it does not edit the workflow).
- Lockfiles are **regenerated, never hand-edited** — `pnpm-lock.yaml` is a build artifact of the
  dependency this ticket's Harness requires (sub-PRD D1: *"Any later ticket adding a dependency
  regenerates the lockfile as a build artifact and never hand-merges it."*).

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. This ticket is one
of seven wave-3 siblings, all `blocked_by FND-03`. Their scopes are disjoint by construction:
`FND-04` → `src/openapi` + `src/generated` + `schemas/openapi`; `FND-05` → `src/events` +
`schemas/events`; `FND-06` … `FND-10` → five separate `packages/domain/src/*` leaves. The only shared
file across the batch is `packages/contracts/package.json`, which breakdown plan §1.1 makes append-only
with conflicts resolved by re-running the package manager. `schemas/openapi/**` and
`packages/contracts/src/generated/**` are written by no other ticket in the plan (breakdown plan §4.1).

## Deliverables

1. **`schemas/openapi/openapi.yaml`** — OpenAPI 3.1, `info.version` `1.0`, one server entry per base
   path (`/v1`, `/internal/v1`), and:
   - **Security schemes**: session cookie (Web), bearer API credential (service accounts, PRD §16.3),
     widget session token (PRD §38.4). No scheme accepts an organisation identifier — PRD §34.1:
     *"Tenant | Never accepted in a request body; derived from authenticated session/key/widget token."*
   - **Every PRD §16.2 endpoint** — search and authorities, answers, compare and coverage, research and
     collaboration, monitor and delivery, export/usage/audit/issues/`system-status` — plus the PRD §16.3
     authentication and machine-access endpoints.
   - **Reusable parameters**: `page_size` (integer, 1–100, default 25), `cursor` (opaque string),
     `Idempotency-Key` header (16–128 characters), `If-Match` header; `ETag` as a documented response
     header on every mutable resource (PRD §34.1, §16.2).
   - **Common response envelope**: every response schema carries `schema_version` and `request_id`
     (PRD §16.1, §34.2, §34.5).
   - **Enum schemas `$ref`'d, never inlined** — generated from `FND-03`'s `ENUM_REGISTRY` so a member
     can only be added in one place (PRD §35.1, sub-PRD D6).
   - `POST /v1/search` documented as read-only and non-charging (PRD §16.2: *"Search is read-only
     despite POST and MUST not consume generation credits"*).
2. **Error catalogue** — `components/responses` covering all 17 PRD §34.9 codes with their exact HTTP
   status and `retryable` value, and the uniform PRD §16.1 error shape as the single error schema. A
   documented operation must reference the responses its §34.9 rows imply; `409 CONCURRENT_MODIFICATION`
   on every `If-Match` operation (PRD §16.2) and `410 EPHEMERAL_CONTENT_EXPIRED` on ephemeral reads
   (PRD §10.4).
3. **`schemas/openapi/examples/**`** — the PRD §34.2 (search request + response), §34.3 (create answer
   job), §34.5 (Answer Snapshot), §34.6 (coverage/compare requests), §34.7 (record write contract) JSON
   blocks copied **verbatim**, each named for its section, each wired into the schema as an
   `examples` entry and validated in the test suite.
4. **`packages/contracts/src/openapi/**`**:
   - `loadOpenApiDocument()` — reads and parses the YAML, validates it against the OpenAPI 3.1
     meta-schema, and fails loudly on any `$ref` that does not resolve;
   - `assertEnumsMatchRegistry()` — every enum schema in the document equals the corresponding
     `ENUM_REGISTRY` entry (sub-PRD D6/D7);
   - `checkCompatibility(baseline, candidate)` — flags a removed path, removed property, removed enum
     member, narrowed type or newly-required request property as **breaking** (PRD §16.1: *"Optional
     fields may be added within v1; breaking changes require v2"*).
5. **`schemas/openapi/baseline/v1.yaml`** — the frozen compatibility baseline the check diffs against,
   plus a documented procedure for advancing it (a baseline advance is an explicit, reviewed commit,
   never an automatic side effect of `pnpm generate`).
6. **`packages/contracts/src/generated/**`** — generated TypeScript types plus a minimal typed client
   core (request/response types, path/method map, error union). Every file begins with a banner:
   `// GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)`.
7. **Scripts, appended to `packages/contracts/package.json`**: `generate` (regenerates
   `src/generated/**` from the YAML) and `generated:check` (regenerates into a temporary directory and
   fails on any difference). Both are reachable from the root `pnpm generate` / `pnpm generated:check`
   delegators `FND-01` created; no root file is edited.
8. **Endpoint fixture** `packages/contracts/test/openapi/prd-16-2-endpoints.json` — the PRD §16.2 and
   §16.3 endpoint lists transcribed verbatim, used by the acceptance replay.

Ordering constraint: deliverable 1 before 6 (generation input before output); deliverable 5's baseline
is captured **from** deliverable 1 in the same commit, so the first `checkCompatibility` run is a
tautology by design and every subsequent one is meaningful.

## Acceptance checklist (classified)

- [ ] `[machine]` `schemas/openapi/openapi.yaml` validates against the OpenAPI 3.1 meta-schema and every
      `$ref` resolves (PRD §34 preamble).
- [ ] `[fixture]` Endpoint replay: every path/method in `prd-16-2-endpoints.json` appears exactly once
      in the document, and the document declares no endpoint absent from the fixture (PRD §16.2, §16.3).
- [ ] `[fixture]` Every PRD §34 normative example under `schemas/openapi/examples/**` validates against
      its declared schema, with no property renamed, added or dropped relative to the PRD text
      (PRD §34: *"property names and enum meanings cannot drift"*).
- [ ] `[fixture]` Error-catalogue replay: all 17 PRD §34.9 codes are declared with the exact HTTP status
      and `retryable` value from the table, and no extra code exists (PRD §34.9, sub-PRD D7).
- [ ] `[machine]` Enum drift: every enum schema equals its `ENUM_REGISTRY` entry; a member added to the
      YAML but not the registry fails (PRD §35.1, `FND-03`).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` exits 0 and leaves `git status --porcelain`
      empty — **DEV-001's acceptance evidence, "Generated-client diff is clean in CI"** (PRD §30.2).
- [ ] `[machine]` Every file under `packages/contracts/src/generated/**` carries the do-not-edit banner;
      a hand-edited generated file is detected by `generated:check` (PRD §20.1).
- [ ] `[machine]` Breaking-change detection, negative test: a scratch copy of the document with one
      response property removed is reported **breaking** by `checkCompatibility`; a copy with one
      *optional* property added is reported compatible (PRD §16.1).
- [ ] `[machine]` No operation accepts an organisation/tenant identifier in a path, query or body
      parameter — asserted by scanning every operation's parameters and request schemas
      (PRD §34.1, §16.5).
- [ ] `[machine]` Every mutable-resource operation declares `ETag` on its response and `If-Match` on its
      write, and lists `409 CONCURRENT_MODIFICATION` (PRD §16.2, §34.1).
- [ ] `[machine]` Every write operation documented as retryable declares the `Idempotency-Key` header
      with the 16–128 character constraint (PRD §16.1, §34.1).
- [ ] `[machine]` Pagination parameters are declared once and reused: `page_size` 1–100 default 25,
      opaque `next_cursor` (PRD §34.1).
- [ ] `[machine]` `POST /v1/search` is documented as read-only and non-charging (PRD §16.2).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable beyond the repo-wide green from `FND-01`. The Python *generated core* is
      `PLTF-03`, not this ticket.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**DEV-001**, `E02-CONTRACTS`),
      user-visible change and non-goals, **schema/API/event compatibility impact** (initial `/v1`
      publication; baseline established in the same commit), tenant/PII/security impact (tenant is never
      a request field — §34.1/§16.5; BYOK keys never appear in a response — §16.4), source/licence
      impact (none), cost/memory/latency impact (none — no runtime path), rollback path (revert;
      nothing serves it yet), known gaps (unimplemented operations and the `/internal/v1` surface owned
      by `22-internal-admin`). **Amended in v1.1 (sub-PRD D28): source/licence impact is one vendored
      Apache-2.0 schema document** (`schemas/openapi/meta/oas-3.1-schema-2022-10-07.json`, required by
      the Harness's "the meta-schema must be vendored or pinned so validation runs offline"), plus the
      three pinned `devDependencies` the Harness requires — **not "none"**.

Absent classes: no `[human]` criteria — the contract is machine-verifiable end to end; its human-facing
surface is the developer portal (`PLTF-01`, `/developer/api`, PRD §32.8) and the DEV-001 UAT evidence is
generated-diff cleanliness, already `[machine]` above.

## Test plan

Reviewer steps, all offline:

1. **Meta-schema validation.** `pnpm --filter @<scope>/contracts test` → the OpenAPI validity test must
   report the document as valid 3.1 with all `$ref`s resolved.
2. **Endpoint fixture, read against the PRD.** Open
   `packages/contracts/test/openapi/prd-16-2-endpoints.json` beside `docs/PRD.md` §16.2 and §16.3 and
   confirm every path matches character for character, including `{document_id}`-style parameter names.
3. **Example replay, read against the PRD.** Open each file in `schemas/openapi/examples/` beside its
   PRD §34 block. Any renamed property is a failure of the ticket, not a style choice.
4. **Generated-diff check (DEV-001).** Run `pnpm generate && pnpm generated:check`; then
   `git status --porcelain` must be empty. Now hand-edit one line inside
   `packages/contracts/src/generated/**`, re-run `pnpm generated:check`, and confirm it fails; restore.
5. **Compatibility negative tests.** Copy `openapi.yaml` to a scratch file; remove one response property
   → `checkCompatibility` reports breaking. Restore, add one optional response property → reports
   compatible. Remove one enum member → breaking.
6. **Enum drift test.** Add a member to an enum schema in the YAML without touching `ENUM_REGISTRY`;
   assert failure naming the enum; restore.
7. **Tenant-leak scan.** Run the parameter scan; confirm it inspects path, query, header and request
   body schemas, not only path parameters.
8. **Append-only manifest.** `git diff packages/contracts/package.json` shows additions only.

Harness: the framework `FND-01` registered (named in the root `README.md`); OpenAPI validation and code
generation tools declared in `packages/contracts/package.json`. Fixtures:
`packages/contracts/test/openapi/prd-16-2-endpoints.json` and `schemas/openapi/examples/**`. No network:
the meta-schema must be vendored or pinned so validation runs offline.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing the document or
the generator; re-publish with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **A PRD §34 normative example cannot be expressed in OpenAPI 3.1 without changing a property name or
   shape.** → PRD §34 says those shapes *"cannot drift … without PRD/API change control"*. Update
   **`docs/prd/00-foundation/README.md`** with the conflict and escalate for a **PRD change** (§45.5
   "Product change" where it alters customer-visible payloads). Never rename a property to satisfy a
   tool.
2. **An endpoint in PRD §16.2 has no defined request/response body anywhere in §34.** → Declare it with
   the minimum the PRD states, record the gap in `docs/prd/00-foundation/README.md` Open questions with
   the owning product module named (e.g. `/v1/comparisons` → `15-answer-product`/`ASK-11`), and let the
   owning module extend the document through **its own** ticket — which requires a writeback here first,
   because `schemas/openapi/**` stays serial-owned by `00-foundation` (PRD §44.3, breakdown plan §4.1).
3. **Later modules need to add operations to the OpenAPI root.** They cannot: breakdown plan §4 gives no
   other module write access to `schemas/openapi/**`. → The correct path is a **new ticket in
   `00-foundation`** (an append to §5.1) recorded on `docs/prd/breakdown-plan.md`, with the requesting
   ticket `blocked_by` it — the same rule breakdown plan §9 R4 states for `packages/database`. Record
   the pattern in `docs/prd/00-foundation/README.md` when the first such request arrives.
4. **The generator emits unstable output** (ordering, timestamps, absolute paths) so `generated:check`
   is flaky. → That falsifies DEV-001's acceptance evidence. Fix determinism in the generator; if it
   cannot be made deterministic, that is an architecture decision — create
   **`docs/adr/NNNN-openapi-codegen.md`** (PRD §45.5, breakdown plan §2.1 A9) and escalate. Never
   loosen `generated:check` to a fuzzy comparison.
5. **The compatibility checker's breaking-change definition disagrees with PRD §16.1** in a real case
   (e.g. tightening a `format`). → Record the rule in `docs/prd/00-foundation/README.md` and update
   this ticket's deliverable 4 before changing the checker; the definition of "breaking" is a contract
   with every SDK consumer (`PLTF-02`, `PLTF-03`), not a local heuristic.

**Escalation.** If OpenAPI 3.1 proves unable to carry the `/v1` contract as PRD §34 specifies — for
example the SSE endpoint or the widget token scheme cannot be represented — that overturns PRD §34's
"generated-code source of truth" decision and DEV-001's mechanism. Stop, raise an ADR under
`docs/adr/`, write back to `docs/prd/breakdown-plan.md` §4.1, and escalate to the human. Never hand-write
a parallel client to work around the document.
