---
id: RETR-09
title: "`packages/retrieval-client` typed client"
module: 11-retrieval-engine
lane: 11-retrieval-engine
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RETR-01, FND-04]
blocks: [EVID-04, FIND-01, FIND-02]
---

# RETR-09 — `packages/retrieval-client` typed client

Implements PRD §39.1, §39.4, §16.2, §34.2, §34.9 — requirement IDs `SRCH-001`, `SRCH-003`, `SRCH-005`
(the transport half), `DEV-001` (generated contracts are the source of truth); epic `E17-INDEX`.
No ADR — the decision is already made in PRD §39.1 (`app`/`worker` reach search over localhost and
nothing else reads the corpus) and PRD §20.1 (`packages/retrieval-client` exists as a workspace
member); this is build ticket 9 of 10 against it.
Parent sub-PRD: [11-retrieval-engine README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [RETR-01 — search-rs skeleton](RETR-01-search-rs-skeleton-read-only-bundle-release-pinning-localhost-api.md), [FND-04 — OpenAPI root and generated TypeScript bindings](../../00-foundation/tickets/FND-04-openapi-root-and-generated-typescript-bindings.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(`RETR-01`'s frozen internal wire contract and `FND-04`'s generated enums and result types) — not a
new subsystem decision.

## Background + basis

**This package is the only door.** PRD §39.1's dependency arrows put `app` and `worker` on one side
and `SEARCH → CORPUS/TANTIVY/VECTOR` on the other, with the rule *"search-rs → corpus bundle only"*.
PRD §39.4's network matrix allows exactly two callers of `127.0.0.1:7700`: `app` for
*"Search/document retrieval with pinned release"* and `worker` for *"Evidence retrieval only"*. PRD
§20.1 lists `packages/retrieval-client` as a workspace member, and sub-PRD decision **D1** makes it
the single implementation of that hop: no other package opens a socket to the search port, and no
other package opens `corpus.sqlite`.

**It is typed from two sources, and they meet here.** `RETR-01` deliverable 6 freezes the **internal**
wire contract — every endpoint, request and response shape, plus a committed JSON Schema
(`services/search-rs/src/service/contract/search-api.v1.schema.json`) and example fixtures — precisely
so this ticket can be built at wave 2 while `RETR-08` lands at wave 5 (sub-PRD **D8**). `FND-04`
supplies the **public** side: generated TypeScript bindings in `packages/contracts/src/generated/**`,
the PRD §34.2 search result shape, the PRD §34.9 error catalogue and the `FND-03` canonical enums.
This client speaks the internal contract and returns values whose enums and identifiers are the same
ones `FIND-01` will serialise into the public `/v1` response — so that a `legal_status` or
`document_type` value cannot mean two things in one request.

**What must be impossible by construction.** PRD §18.5 step 4: *"Search receives only sanitized query,
hard filters and pinned release."* PRD §34.1 (via `FND-04` deliverable 1): *"Tenant | Never accepted in
a request body; derived from authenticated session/key/widget token."* Sub-PRD **D11** therefore
requires the client's request type to have **no** field for an organisation id, a user id, an actor,
free-form customer facts, an answer draft or a credential — the search process is tenant-agnostic and
must stay that way, and a type that cannot express a tenant cannot leak one.

**Pinning is mandatory at the call site.** `RETR-01` deliverable 5 refuses any request without a
loaded `corpus_release_id`. The client must make `corpusReleaseId` a **required** parameter with no
default, so that `ASK-02`'s pinned-release guarantee (`ANS-004`: *"Each answer uses one pinned corpus
release"*) cannot be lost in a convenience wrapper.

**Errors are a contract, not strings.** PRD §16.1 fixes the uniform error shape
(`{error: {code, message, request_id, details, retryable}}`) and PRD §34.9 enumerates the 17 codes with
their HTTP status and retry semantics. Relevant to this hop: `CORPUS_INCOMPATIBLE` (503, no retry,
operator action), `SOURCE_NOT_CURRENT` (503, no automatic retry), `INTERNAL_ERROR` (500, one safe
retry), `RATE_LIMITED` (429, honour `Retry-After`). PRD §34.9 also states: *"Domain answer statuses
such as `INSUFFICIENT_EVIDENCE` are valid completed research results and do not become HTTP errors"* —
so an empty or insufficient result set is a **success** at this layer.

**Degradation must survive the hop.** Sub-PRD **D10** and PRD §13.2 require degraded status to be
surfaced, not swallowed: when search reports `degraded: true` with named stages, the client returns
that state to its caller so `FIND-01` can populate `warnings` (PRD §34.2) and `RUNT-08` can reflect it
in `/v1/system-status` (PRD §42.1).

**Search must not be charged as generation.** PRD §16.2: *"Search is read-only despite POST and MUST
not consume generation credits."* This client performs no accounting, holds no credential and cannot
reach a provider — the charging decision is `apps/api`'s, and this ticket simply gives it nothing to
charge.

**Carried caveat (accepted, documented not enforced):** `RETR-02`…`RETR-08` land after this ticket, so
the endpoints they fill will initially answer `STAGE_NOT_AVAILABLE` (`RETR-01` deliverable 6). The
client types them anyway and maps that state to a typed, documented result — a client that pretends an
unimplemented stage is an empty result would hide the module's own build order from its consumers.

## Goal

Produce `packages/retrieval-client/**`: a typed, dependency-light TypeScript client for the frozen
internal search API, exporting one `RetrievalClient` with a method per endpoint, request types that
cannot express tenant identity or unsanitized customer content, a required pinned release on every
call, deadline and bounded-retry policy per PRD §13.2 and §34.9, typed error and degraded results, and
a contract test that replays `RETR-01`'s committed example fixtures against the committed JSON Schema.
Completion is mechanically checkable: `pnpm test` and `pnpm typecheck` are green, the contract test
replays every committed example, a type-level test proves the request type has no tenant field, and a
mock-server test proves retry, deadline and error mapping behaviour offline.

## Non-goals

- **No `/v1/search` route, no §34.2 response mapping, no HTTP surface for customers** —
  `14-search-product` (`FIND-01`, `FIND-02`, both `blocked_by` this ticket). This client is consumed
  by that route; it is not that route.
- **No evidence pack, delimitation, validator or licence limits** — `12-evidence-safety` (`EVID-04`,
  which is `blocked_by` this ticket, `EVID-05`, `EVID-06`).
- **No tenant scoping, permissions, quota, rate limiting, idempotency or admission** —
  `03-app-runtime` (`RUNT-02`) and `01-app-data` (`DATA-02`). PRD §21.2 puts tenant isolation in the
  repository layer; this client never sees a tenant.
- **No PII detection** — `12-evidence-safety` (`EVID-01`). The query is sanitized before it reaches
  this client (PRD §18.5 step 4).
- **No process management** — the client does not start, stop, health-poll on a timer or supervise
  `search-rs`; systemd does (PRD §39.2, `RLSE-02`). It exposes a one-shot readiness call for
  `RUNT-08` to use.
- **No changes to the internal wire contract** — `RETR-01` owns
  `services/search-rs/src/service/contract/**` (sub-PRD D8). A needed field is a docs PR against that
  ticket and this one.
- **No changes to `packages/contracts` or `schemas/openapi/**`** — `00-foundation` (`FND-03`,
  `FND-04`), PRD §44.3 serial-owned. This package **consumes** the generated bindings; PRD §20.1
  forbids hand-editing generated output.
- **No SDK, no public client** — `20-developer-platform` (`PLTF-02`, `PLTF-03`).

## File-scope (write-owns)

- `packages/retrieval-client/**` — the client, its types, its error mapping, its test suite, its
  `package.json` and `tsconfig.json` (created empty by `FND-01`; this ticket is the only ticket in this
  module that writes them), and its `README.md`.

Does not touch:

- `services/search-rs/**` — `RETR-01` … `RETR-08`, `RETR-10`. This ticket **reads**
  `services/search-rs/src/service/contract/search-api.v1.schema.json` and
  `contract/examples/*.json` for its contract test and never writes them.
- `packages/contracts/**`, `schemas/openapi/**` — `00-foundation` (`FND-03`, `FND-04`), PRD §44.3
  serial-owned; consumed, never written. `packages/domain/**` — `00-foundation`.
- `packages/citations/**`, `packages/pii/**`, `packages/model-gateway/**` — `12-evidence-safety`.
  `packages/database/**` — `01-app-data`. `packages/ui/**`, `packages/observability/**` —
  `03-app-runtime`.
- `apps/**` — `03-app-runtime` and the product modules. `pipelines/**` — `04-corpus-contract` and the
  source modules. `infra/**`, `tests/**`, `evals/**` — other modules per breakdown plan §4.
  `docs/PRD.md` — frozen.
- Root `package.json`, `pnpm-lock.yaml`, `tsconfig.base.json` — `FND-01` (PRD §44.3 serial-owned root
  lockfiles). A new dependency regenerates `pnpm-lock.yaml` as a build artifact; conflicts resolve by
  re-running the package manager, never by hand-merge (breakdown plan §1.1).

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/retrieval-client/**` is written by no other ticket in the plan; the only
prior writer is `FND-01`, which creates the workspace member with a `package.json`, a `tsconfig.json`
and one empty entry file (`FND-01` deliverable 7). This is the module's only TypeScript ticket, so its
whole tree is disjoint from every sibling's `services/search-rs/**` scope — it shares neither
`Cargo.toml` nor `src/lib.rs` with them and can run concurrently with any of them. Both declared
blockers are merged first: `RETR-01` (this module's wave 1) and `FND-04` (`00-foundation` wave 3).

## Deliverables

1. **`src/client.ts::RetrievalClient`** — constructed with
   `createRetrievalClient({ baseUrl, timeouts, retries, logger })`, where `baseUrl` **must** be a
   loopback origin (`http://127.0.0.1:<port>`); a non-loopback origin throws at construction. Basis:
   PRD §39.4 (*"Search exposes no public port"*) — a client that can be pointed at a remote host is a
   tunnel around the process boundary. One method per endpoint frozen in `RETR-01` deliverable 6:
   `ready()`, `release()`, `retrieve()`, `evidence()`, `getNodeVersion()`, `listVersionNodes()`,
   `documentTimeline()`, `nodeTimeline()`, `documentRelations()`, `nodeRelations()`.
2. **Request types that cannot carry tenant or customer identity.** Every request interface is
   `readonly`, exactly-typed and closed (no index signature, no `unknown` passthrough). The retrieve
   request carries only: `corpusReleaseId` (**required**, no default), the sanitized `query`, the
   PRD §36.1 classification members (`queryTypes`, `exactIdentifiers`, `requestedLegalAsAt`,
   `jurisdictions`, `documentTypes`, `legalStatuses`, `authorityIds`, `abns`, `topics`), `mode`
   (`CURRENT_LAW | HISTORICAL | FUTURE_OR_PROPOSED`), paging and an optional `requestId`. There is
   **no** `organizationId`, `userId`, `actor`, `tenant`, `facts`, `answerDraft`, `apiKey` or
   `authorization` field, and the client sets no credential header. A **type-level test** asserts that
   adding such a property to a request object fails to compile. Basis: PRD §18.5 step 4, §34.1, §21.2;
   sub-PRD D11.
3. **Enum and identifier reuse.** `legalStatus`, `documentType`, `jurisdiction`, `authorityRole`,
   `licenceAssessmentState`, `indexTier` and the opaque ID types are imported from
   `packages/contracts` (`FND-03`/`FND-04` generated bindings) — never redeclared as string unions in
   this package. A test asserts every enum-typed field's type is the contracts type, so a member added
   in `FND-03` propagates rather than drifting. Basis: PRD §35.1, §20.1 (*"Generated OpenAPI/SDK/event/
   manifest bindings MUST NOT be hand-edited"*), `DEV-001`.
4. **Result types that keep degradation visible.** Every method returns
   `{ data, corpusReleaseId, retrievalProfileId, requestId, degraded: boolean, warnings: Warning[],
   stageStates: Record<StageName, 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_IMPLEMENTED'> }`. A
   degraded response is a **success** carrying its warnings, never a thrown error, and
   `STAGE_NOT_AVAILABLE` maps to `'NOT_IMPLEMENTED'` with the stage named (the carried caveat above).
   Basis: PRD §13.2 (*"surface delay/degraded status"*), §34.2 `warnings`, §42.1; sub-PRD D10.
5. **`src/errors.ts` — typed errors mapped to the PRD §34.9 catalogue**, so `FIND-01` re-emits a code
   rather than inventing one:

   | Search-side condition | Client error | PRD §34.9 code the API surfaces | Retry |
   |---|---|---|---|
   | Release not loaded / compatibility mismatch | `CorpusIncompatibleError` | `CORPUS_INCOMPATIBLE` (503) | No |
   | Stage unavailable or bundle capability missing | *(not an error — `degraded: true`)* | success with `warnings` | — |
   | Invalid request rejected by search | `InvalidRetrievalRequestError` | `INVALID_REQUEST` (400) | No |
   | Invalid legal date | `InvalidLegalDateError` | `INVALID_LEGAL_DATE` (400) | No |
   | Invalid ABN (checksum) | `InvalidAbnError` | `INVALID_ABN` (400) | No |
   | Deadline exceeded | `RetrievalTimeoutError` | `INTERNAL_ERROR` (500) with one safe retry, or a degraded search response — the choice is `FIND-01`'s | One |
   | Connection refused / process down | `SearchUnavailableError` | `INTERNAL_ERROR` (500) | One |
   | Unexpected 5xx | `SearchInternalError` | `INTERNAL_ERROR` (500) | One |

   Every error carries `requestId`, the endpoint, the elapsed time and a `retryable` flag mirroring
   PRD §34.9's Retry column. **No error message ever contains query text, node text or a snippet**
   (PRD §22).
6. **Deadlines and bounded retries.** Per-endpoint deadlines default to PRD §13.2's objectives —
   **2 s** for `retrieve`/`evidence`, **1 s** for node/timeline/relation reads — configurable but
   capped. Retries: at most **one** retry, only for a connection failure or a 5xx, only on the
   **idempotent** read endpoints, with jittered backoff bounded by the remaining deadline. A retry
   never extends the caller's deadline. Basis: PRD §13.2; §34.9 (*"One safe retry"*); PRD §16.2
   (search is read-only, so every endpoint here is idempotent — but the rule is stated so a future
   non-idempotent endpoint does not inherit it).
7. **Single-door enforcement.** An architecture test (runnable in this package and re-usable by
   `23-assurance`) asserting that **no workspace package other than `packages/retrieval-client`**
   references the search port, constructs a URL to it, or imports a SQLite driver pointed at
   `corpus.sqlite`. Basis: PRD §39.1, §39.4, §45.2; sub-PRD D1. The check is a source scan over the
   workspace, skipping with a named message for packages that do not yet exist.
8. **Contract test against `RETR-01`'s committed artifacts.** The package's test suite loads
   `services/search-rs/src/service/contract/search-api.v1.schema.json` and every file in
   `contract/examples/`, validates each example against the schema, and asserts the client's parsers
   accept every response example and its serialisers produce request payloads that validate. A schema
   change on the Rust side that this client has not adopted therefore fails **here**, at build time,
   rather than at runtime in `apps/api`. Basis: sub-PRD D8; PRD §45.4 (*"Changes to an immutable/public
   contract include regenerated bindings and compatibility tests"*).
9. **A mock search server for consumers.** `src/testing/mockSearch.ts` — an in-process fake serving the
   committed examples, with switches for degraded stages, `STAGE_NOT_AVAILABLE`, release mismatch,
   timeout and connection failure. Exported from a `./testing` subpath so `FIND-01`, `FIND-02`,
   `EVID-04` and `ASK-02` can test against the contract without running the Rust process — and so no
   downstream module invents its own stub with different semantics.
10. **Observability without content.** An optional injected logger receives only
    `{ endpoint, requestId, corpusReleaseId, status, latencyMs, degraded, errorCode }`; the client
    never logs a query, a snippet or a response body, and there is no verbose mode that does. Basis:
    PRD §22 (*"Logs MUST exclude research/evidence content"*; *"Full-content debug logs … disabled by
    default"*).
11. **Dependency discipline.** Runtime dependencies limited to `packages/contracts` and Node built-ins
    (`fetch`/`undici` as provided by the pinned Node version, `FND-01` deliverable 3). No HTTP
    framework, no retry library, no logger implementation, no schema library at runtime — schema
    validation is a **test-time** dependency only, so the production path stays small inside the
    PRD §39.2 `app` 320 MiB and `worker` 384 MiB budgets.
12. **`README.md`** — one page: the single-door rule, how to construct the client, the required pinned
    release, the degraded-vs-error distinction, the error mapping table, and how to use the mock server
    in a consumer's tests.

## Acceptance checklist (classified)

- [ ] `[machine]` **No tenant surface**: a type-level test proves the request types cannot express
      `organizationId`, `userId`, `actor`, `tenant`, `facts` or a credential, and a runtime test proves
      the client sends no authorization header. (PRD §18.5 step 4, §34.1, §21.2; sub-PRD D11)
- [ ] `[machine]` **Pinned release required**: omitting `corpusReleaseId` is a compile error; passing an
      unloaded release id yields `CorpusIncompatibleError` mapped to `CORPUS_INCOMPATIBLE`. (PRD §18.5
      step 4; §34.9; `ANS-004`)
- [ ] `[machine]` Loopback only: constructing the client with a non-loopback `baseUrl` throws.
      (PRD §39.4)
- [ ] `[fixture]` **Contract replay**: every example under
      `services/search-rs/src/service/contract/examples/` validates against the committed schema and is
      accepted by the client's parsers; every request the client serialises validates against the
      schema. (Sub-PRD D8; PRD §45.4)
- [ ] `[machine]` Enum reuse: every enum-typed field resolves to the `packages/contracts` type
      (`FND-03`/`FND-04` generated), asserted by a type test — no string union is redeclared in this
      package. (PRD §35.1, §20.1; `DEV-001`)
- [ ] `[machine]` Degraded is success: a response with `degraded: true` and named stages returns
      normally with `warnings` populated and `stageStates` set; `STAGE_NOT_AVAILABLE` maps to
      `'NOT_IMPLEMENTED'` — neither throws. (PRD §13.2, §34.2; sub-PRD D10)
- [ ] `[machine]` Error mapping: one test per row of deliverable 5's table, asserting the error class,
      the `retryable` flag and the PRD §34.9 code the API will surface. (PRD §34.9, §16.1)
- [ ] `[machine]` Retry policy: a connection failure and a 500 each cause **at most one** retry; a 400
      causes none; a retry never exceeds the caller's remaining deadline; a deadline breach yields
      `RetrievalTimeoutError` rather than hanging. (PRD §13.2; §34.9)
- [ ] `[machine]` **Single door**: the architecture test finds no workspace package other than
      `packages/retrieval-client` referencing the search port or opening `corpus.sqlite`; it skips with
      a named message for packages that do not exist yet, never passing silently. (PRD §39.1, §39.4,
      §45.2; sub-PRD D1)
- [ ] `[machine]` Logging: a canary token in a query never appears in any logger call — asserted by
      injecting a capturing logger. (PRD §22)
- [ ] `[machine]` Dependency discipline: the package's runtime dependency list contains only
      `packages/contracts`; schema-validation and mock-server dependencies are dev-only. (PRD §39.2
      process budgets; deliverable 11)
- [ ] `[machine]` **PRD §13.2 budget contribution**: client overhead per call (serialise, transport,
      parse, excluding server time) p95 ≤ **15 ms** over 200 calls against the mock server — the
      transport share of the §13.2 search p95 ≤ 2 s and source-node p95 ≤ 1 s objectives that `FIND-06`
      measures end to end over HTTP. Default deadlines equal those objectives. Numbers, method and
      machine recorded in the PR. (PRD §13.2, §39.2)
- [ ] `[machine]` `pnpm test` green, `pnpm typecheck` green, `pnpm lint` green (PRD §45.3).
- [ ] `[machine]` `cargo test --workspace` green — this ticket writes no Rust, but it binds to
      `RETR-01`'s committed contract schema and examples, and running the Rust suite proves those
      artifacts are unchanged and consistent. (PRD §45.3; sub-PRD D8)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean — this package consumes generated
      bindings and must not cause a generated diff. (PRD §20.1, §45.3; `DEV-001`)
- [ ] `[machine]` PR states requirement IDs `SRCH-001`, `SRCH-003`, `SRCH-005`, `DEV-001`;
      schema/API compatibility impact (the internal contract version this client pins, and its
      consumers `FIND-01`, `FIND-02`, `EVID-04`); tenant/PII/security impact ("the client cannot express
      a tenant; no credential is held"); latency impact (measured above); rollback path; known gaps
      including the stages that answer `STAGE_NOT_AVAILABLE` until `RETR-02`…`RETR-08` land.
      (PRD §45.4)
- [ ] No `[human]` criteria — this is a typed transport verified mechanically. Its human-visible payoff
      (`UAT-SRCH-01`) is exercised by `14-search-product` at Gate 2.
- [ ] `uv run pytest` not applicable — this ticket touches no Python.

## Test plan

All steps run offline; no network beyond loopback to an in-process mock, and no running Rust process
is required.

1. `pnpm --filter @aer/retrieval-client test`, then `pnpm test`, `pnpm typecheck`, `pnpm lint` and
   `pnpm generate && pnpm generated:check` from the repository root. Harness: the repository's
   TypeScript test runner as configured by `FND-01`. Construction pattern to copy: `FND-04`'s
   `packages/contracts/test/generated/**` — validate against committed schema artifacts rather than
   against a live service.
2. Contract replay: `test/contract.test.ts` enumerates
   `services/search-rs/src/service/contract/examples/*.json`, validates each against
   `search-api.v1.schema.json` with a dev-only JSON Schema validator, and round-trips each through the
   client's parsers. Fail with the example's filename named.
3. Type-level tests: `test/types.test-d.ts` (or the repository's equivalent) asserting the absent
   tenant/credential fields, the required `corpusReleaseId`, and the `packages/contracts` enum
   identities.
4. Mock-server matrix: `test/behaviour.test.ts` drives `mockSearch` through degraded stages,
   `STAGE_NOT_AVAILABLE`, release mismatch, 400/500 responses, connection refusal and a slow response
   exceeding the deadline; asserts the result or error class, the retry count and the elapsed bound for
   each.
5. Single door: `test/architecture.test.ts` scans the workspace source for the search port, a
   `corpus.sqlite` path or a direct socket to the search origin outside this package, skipping absent
   packages with a named message.
6. Logging canary: inject a capturing logger, issue a request with a unique token in the query, and
   assert the token appears in no logger call and no error message.
7. Overhead: `test/overhead.test.ts` measures p95 client overhead over 200 mock calls and prints it for
   the PR.
8. Suite green: `pnpm test` and `cargo test --workspace` from the repository root.
9. Reviewer focus: confirm no request type can carry tenant or customer identity even through an
   optional or index-signature field; confirm `corpusReleaseId` is genuinely required at the type level;
   confirm a degraded response is not thrown; confirm retries are capped at one and bounded by the
   deadline; confirm the mock server is exported so downstream modules do not invent divergent stubs;
   confirm nothing in the package validates JSON Schema at runtime.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/11-retrieval-engine/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A later stage (`RETR-02` … `RETR-08`) needs a wire field this client does not type* → that is a
     change to `RETR-01`'s frozen contract (sub-PRD **D8**). Raise one docs PR amending **`RETR-01` and
     this ticket** together, `--sync`, then implement both sides. Never let a stage ticket edit
     `packages/retrieval-client/**`, and never let this client accept an untyped passthrough field to
     avoid the docs PR — an `unknown` escape hatch defeats the whole contract test.
   - *`FND-04`'s generated bindings lack an enum or type this client needs* → `packages/contracts` is
     `00-foundation`'s and PRD §44.3 serial-owned. Raise the ticket change against `FND-03`/`FND-04`,
     record it in `docs/prd/11-retrieval-engine/README.md`, and take the `blocked_by` edge in
     `docs/prd/breakdown-plan.md` §5.12 and §6.2 if it must be sequenced. Never hand-write a local copy
     of a generated enum (PRD §20.1).
   - *`FIND-02` needs pagination or streaming the frozen contract cannot express* (sub-PRD
     **Q-RETR-6**) → record it in `docs/prd/11-retrieval-engine/README.md` and amend `RETR-01` plus this
     ticket in one docs PR. `FIND-02` is `blocked_by` this ticket, so a late shape change is a
     critical-path event, not a detail.
   - *A consumer wants to call search directly "just for a health check"* → refuse, and point at
     `ready()`. Sub-PRD **D1** and PRD §39.1 make this package the single door; a second caller means
     two retry policies, two error mappings and two places to leak a tenant. If a genuine second caller
     is unavoidable, that is a writeback to `docs/prd/11-retrieval-engine/README.md` **and**
     `docs/prd/breakdown-plan.md` §4.2 before any code.
   - *Retrying is tempting for a slow search response* → PRD §34.9 allows *one* safe retry for
     `INTERNAL_ERROR` only, and PRD §13.2 wants degraded status surfaced rather than latency hidden.
     Record any pressure to retry more in `docs/prd/11-retrieval-engine/README.md`; a retry storm
     against a 768 MiB single search process is an availability defect, not a resilience feature.
3. **Falsified protocol.** If the single-door rule turns out to be unworkable — for example if
   `apps/worker` genuinely needs corpus access this client cannot mediate — then PRD §39.1's dependency
   rule and PRD §45.2's repository map are contradicted, and the module boundary is in question. Stop,
   escalate for re-review, and write back to `docs/prd/breakdown-plan.md` §4/§4.2 plus this sub-PRD
   before adding a second path to the corpus. A second door is how tenant data and corpus data end up
   in the same process, which PRD §18.3 exists to prevent.
