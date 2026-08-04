---
id: PLTF-02
title: TypeScript SDK
module: 20-developer-platform
lane: 20-developer-platform
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-04, FND-05]
blocks: []
---

# PLTF-02 — TypeScript SDK

Implements PRD §8.10 (API, SDK and widget) and §16.1 (platform rules), carrying requirement
**`DEV-001`** ("OpenAPI drives TypeScript/Python generated cores", epic `E27-DEVELOPER`).
**No ADR — the decision is already made in PRD §8.10 (*"TypeScript and Python SDKs MUST share an
OpenAPI-generated core and provide streaming, wait/cancel, typed errors and webhook verification"*)
and PRD §20.1 (generated bindings MUST NOT be hand-edited); this is build ticket 2 of 9 against it.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-04` — OpenAPI root and generated TypeScript bindings; `FND-05` — Event and webhook
schema root (both [`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— PRD §8.10 lists the four required capabilities and `FND-04`/`FND-05` have already frozen the
contract they operate on; this packages them, it does not design an API.

## Background + basis

**The requirement is a five-clause list.** PRD §8.10, quoted in the clauses that bind this ticket:

> - REST API base version: `/v1`.
> - JSON over HTTPS; cursor pagination; stable opaque IDs; request IDs.
> - Retryable writes MUST support `Idempotency-Key`.
> - Answer and other long-running operations MUST use asynchronous jobs and resumable SSE.
> - **TypeScript and Python SDKs MUST share an OpenAPI-generated core and provide streaming,
>   wait/cancel, typed errors and webhook verification.**
> - **SDK telemetry MUST NOT contain research content.**

**Requirement `DEV-001`** (PRD §30.2), quoted in full:

> | DEV-001 | OpenAPI drives TypeScript/Python generated cores | `/developer/api` | `/v1` | Contracts | Generated-client diff is clean in CI |

**PRD §20.1**: *"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited."*

**The generated core already exists and this SDK wraps it.** `FND-04`'s Non-goals say so verbatim:

> **No Python SDK, no TypeScript SDK package** — `20-developer-platform` (`PLTF-02`, `PLTF-03`). This
> ticket produces the generated *core* inside `packages/contracts`, which those SDKs wrap.

and `FND-04` deliverable 6 describes what is there: *"generated TypeScript types plus a minimal typed
client core (request/response types, path/method map, error union). Every file begins with a banner:
`// GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)`."* Sub-PRD **D1** makes
this ticket's rule explicit: **wrap it, never re-declare it, never run a second TypeScript
generator.**

**The wire conventions this SDK must honour.** PRD §16.1: base path `/v1`; *"Organisation is derived
from authenticated context, not trusted request fields"*; *"Every response includes `request_id`"*;
*"Retryable writes support `Idempotency-Key`"*; *"HTTP status and domain answer status remain
separate"*. PRD §34.1: opaque resource-prefixed ids *"clients never parse them"*; `page_size` 1–100
default 25 with an opaque `next_cursor`; **idempotency key 16–128 characters, where "same
actor/route/key/body returns original result; changed body returns 409"**; `ETag` + `If-Match` on
mutable resources.

**The error catalogue is closed, and refusals are not errors.** PRD §34.9 lists 17 codes with HTTP
status and retry semantics, and closes with:

> Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed research results and do
> not become HTTP errors.

Sub-PRD **D4** turns that into a test: the SDK must not throw on a refusal.

**The SSE contract is fixed by `FND-05` from PRD §34.4**, quoted there in full:

> ```text
> id: 12
> event: stage.changed
> data: {"schema_version":"1.0","job_id":"job_...","stage":"VALIDATING_CITATIONS","message":"…","occurred_at":"2026-08-03T03:00:09Z"}
> ```
>
> Allowed public event types: `job.started`, `stage.changed`, `clarification.required`,
> `answer.section`, `citation.added`, `job.completed`, `job.failed`, `job.cancelled`, `heartbeat`.
> `answer.section` is provisional UI content until `job.completed`; clients MUST remove it on failure
> and MUST not represent it as a validated answer.

PRD §16.2 adds that SSE events *"MUST NOT contain hidden reasoning or raw provider payloads"*, and
`RUNT-03` implements `Last-Event-ID` resume server-side (PRD §34.4, `ANS-003` *"Accepted work is
asynchronous, idempotent, cancellable and resumable by SSE"*).

**Webhook verification is `FND-05`'s helper, re-exported — not re-implemented.** `FND-05`
deliverable 3 ships `signWebhook` and:

> `verifyWebhook({ secret, header, rawBody, nowSeconds, toleranceSeconds = 300 }): VerifyResult`
> returning a discriminated result with reasons `OK`, `MALFORMED_HEADER`, `TIMESTAMP_OUT_OF_WINDOW`,
> `SIGNATURE_MISMATCH`. Comparison uses a constant-time comparator … `===` on the signature is
> forbidden.

with the raw-body warning: *"`rawBody` is the **raw bytes as sent**, never a re-serialised object —
re-serialisation is the classic signature break and must be documented at the call site."* PRD §34.8
fixes the headers `X-AER-Event-Id`, `X-AER-Timestamp`, `X-AER-Signature: v1=<lowercase hex
HMAC-SHA256>` and the input `<timestamp>.<raw_request_body>`, with receivers rejecting a timestamp
older than five minutes and deduplicating event IDs.

**Authentication is by credential, never cookie.** PRD §38.2: *"API keys do not use cookies."*
PRD §16.3's example scopes are `search:read`, `answers:create`, `records:read`, `records:write`,
`coverage:create`, `monitor:read`, `monitor:write`, `exports:create`, `usage:read`. PRD §38.5's
rate-limit responses *"include `Retry-After`, limit, remaining and reset metadata without disclosing
other tenants"*.

**Internal administration must not ship.** PRD §8.11: *"Internal administration MUST be separated
under `/internal/v1` … and MUST NOT be shipped in customer SDKs."* Sub-PRD **D8**.

**Accepted caveats carried forward, documented not enforced here:**

- **No live server exists at build time.** `RUNT-01` builds the Fastify server and the product
  modules add handlers; this ticket is `blocked_by` neither. Every test replays recorded responses
  built from `schemas/openapi/examples/**` and `FND-05`'s committed event fixtures — PRD §44.3 names
  *"independent SDK languages"* a safe parallel unit precisely because the contract is frozen first.
- **Only `alert.created` is fully specified.** `FND-05`'s accepted caveat: *"Additional types are
  added by their owning module through a writeback here."* The SDK's webhook typing is generated from
  `schemas/events/registry.json`, so a new type appears without an SDK edit.
- **Telemetry is opt-in and has no default sink.** Nothing is transmitted anywhere by default
  (PRD §20.2: no production credentials or endpoints in the repository).

## Goal

Produce `packages/sdk-typescript` — a published-shape TypeScript SDK that wraps `packages/contracts`'
OpenAPI-generated core and adds exactly the four PRD §8.10 capabilities (streaming, wait/cancel,
typed errors, webhook verification) plus credential authentication, retry-stable idempotency,
`Retry-After`-aware retry and cursor pagination — with opt-in telemetry that structurally cannot
carry research content. Completion is mechanically checkable: no request or response type is declared
in this package; `pnpm generate && pnpm generated:check` is clean; a canary research string appears
in no telemetry record; a refusal answer does not throw; `answer.section` content is discarded on
`job.failed`; an automatic retry re-sends the identical `Idempotency-Key`; no exported operation has
an `/internal/v1` path; and the whole suite runs offline against recorded responses.

## Non-goals

- **No OpenAPI document, no TypeScript type generation** — `FND-04`, PRD §44.3 serial-owned. Sub-PRD
  **D1**: this package **wraps** `packages/contracts/src/generated/**`. If a type is missing, that is
  a docs PR against `FND-04`, never a local declaration (PRD §20.1).
- **No event or webhook schemas and no HMAC implementation** — `FND-05`. This SDK re-exports its
  verifier (deliverable 9); it never computes an HMAC itself.
- **No Python** — `PLTF-03` (`sdk/python/**`). The two are coupled only through sub-PRD **D3**'s
  committed parity manifest, which this ticket creates and both suites read.
- **No widget** — `PLTF-05`/`PLTF-06` (`apps/widget/**`). Sub-PRD **D12**: the widget depends on
  `packages/contracts`, not on this package; adding that edge would be a plan change.
- **No server, route, admission, SSE transport or quota enforcement** — `03-app-runtime` and the
  product modules. This is a client.
- **No `/internal/v1` surface** — PRD §8.11 (sub-PRD **D8**).
- **No credential storage, minting or rotation** — `02-auth-core`/`AUTC-04` and
  `13-identity-surface`/`IDNT-06`. The SDK accepts a credential string from its caller and never
  persists one.
- **No publishing to a registry** and no release automation — `18-ops-release` owns release
  artifacts; this ticket produces a buildable, testable workspace package.
- **No documentation site** — `PLTF-01` owns `docs/api/**`. This ticket owns its own `README.md`
  inside the package, and the quickstart snippet it executes is `PLTF-01`'s published string
  (`PLTF-01` deliverable 5) — see friction 6.
- **No cross-boundary suites** — `tests/**` is `23-assurance`; this ticket carries its own
  co-located assertions (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `packages/sdk-typescript/**` — the whole package tree, including:
  - `package.json`, `tsconfig.json`, build configuration (module-owned member manifest, breakdown
    plan §1.1; created empty by `FND-01` for every PRD §20.1 member and extended here);
  - `src/**` — client, auth, retry, idempotency, streaming, wait/cancel, errors, pagination,
    webhooks, telemetry;
  - `test/**` and `test/fixtures/**` — recorded responses and event fixtures;
  - `examples/**` — the sample integration (`E27` exit evidence, PRD §44.2);
  - `parity/surface.json` — sub-PRD **D3**'s parity manifest, read read-only by `PLTF-03`;
  - `README.md` — package-level readme.

Does not touch:

- `packages/contracts/**`, `schemas/openapi/**`, `schemas/events/**` — `FND-03`/`FND-04`/`FND-05`,
  serial-owned; read-only from here.
- `sdk/python/**` — `PLTF-03` (same wave, different language, disjoint tree).
- `apps/widget/**` — `PLTF-05`/`PLTF-06`; `apps/web/**` — `RUNT-05`, `PLTF-01`, `PLTF-07`, `PLTF-08`
  and the other product modules; `apps/api/**` — `RUNT-01`/`RUNT-02` and the route-owning modules;
  `apps/worker/**`, `apps/admin/**`.
- `docs/api/**` — `PLTF-01`; `docs/runbooks/**`, `docs/policies/**`, `docs/release/**` — `18`, `24`.
- `packages/{domain,database,auth,ui,observability,pii,citations,model-gateway,retrieval-client,jobs}/**`
  — `00`, `01`, `02`, `03`, `11`, `12`.
- Root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`,
  `.github/workflows/**` — `FND-01`, `FND-02`. A dependency added here regenerates the lockfile as a
  build artifact; it is never hand-merged (breakdown plan §4.1).
- `services/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`.

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them.
`packages/sdk-typescript/**` is written by no other ticket in the 236-ticket plan (breakdown plan
§4). PRD §44.3 names *"independent SDK languages"* as a canonical safe parallel work unit, and this
module's four subtrees realise that literally: this ticket writes only `packages/sdk-typescript/**`;
`PLTF-03` writes only `sdk/python/**`; `PLTF-05`/`PLTF-06` write only `apps/widget/**` (split at
`react/**`); `PLTF-04`/`PLTF-09` write only `apps/api/src/routes/{sandbox,usage,audit-events}/**`;
`PLTF-01`/`PLTF-07`/`PLTF-08` write only `apps/web/src/features/{developer,usage}/**`. No two of
those share a file, so all six wave-1 tickets are safe to run as concurrent lanes (breakdown plan §7:
6 useful lanes). This package's manifest is module-owned and written by this ticket alone.

## Deliverables

1. **Package skeleton** — `packages/sdk-typescript/package.json` extended from `FND-01`'s empty
   member skeleton with: a workspace dependency on `packages/contracts` (the generated core,
   sub-PRD **D1**); ESM + CJS build outputs and type declarations; `scripts` for `build`, `test`,
   `lint`, `typecheck`, and `generate` / `generated:check` **delegating to the contracts package's
   generation** so the root `pnpm generate` covers this package without a second generator. The
   repository toolchain is settled, not open: breakdown plan §8 **Q12** is **CONFIRMED** and
   `FND-01` owns the pins — **Node.js `24.18.0`** (Node 24 LTS, not Node 26 while it is still
   Current) and **pnpm `11.4.0`**, committed in `.node-version`, `package.json#packageManager`,
   `package.json#engines.node` and `pnpm-lock.yaml`. The Node floor this package is built and
   tested against is therefore exactly `24.18.0`, and the build/test matrix is that single version:
   CI and local development run the same Node, so there is no second Node row to satisfy and no
   newer patch or major may be introduced here. This manifest consequently re-pins nothing — it
   declares no Node, pnpm or TypeScript version of its own (the TypeScript compiler version is an
   ordinary root dependency pin in `FND-01`'s root `package.json` and `pnpm-lock.yaml`, outside
   Q12's four toolchain pins).
2. **`src/client.ts` — `createAerClient(options)`**, the single entry point:
   ```ts
   export interface AerClientOptions {
     readonly baseUrl: string;                        // e.g. https://api.<host>/v1
     readonly auth: { apiKey: string } | { widgetSession: string };
     readonly fetch?: typeof fetch;                   // injectable — the offline test seam
     readonly retry?: RetryOptions;
     readonly timeoutMs?: number;
     readonly telemetry?: TelemetryOptions;           // default: disabled
     readonly userAgentSuffix?: string;
   }
   ```
   There is **no cookie/session option** — PRD §38.2: *"API keys do not use cookies."* There is no
   `organizationId` option — PRD §34.1: *"Tenant | Never accepted in a request body; derived from
   authenticated session/key/widget token."* `fetch` is injectable so every test runs offline with no
   network.
3. **Typed operations from the generated core.** Every `/v1` operation is exposed as a method whose
   request and response types are **imported** from `packages/contracts/src/generated/**` — this
   package declares none. The method map is derived from the generated path/method map, so an
   operation added to the document appears here without an edit. A source scan asserts no
   `interface`/`type` in `src/**` re-declares a request or response body shape.
4. **Idempotency (sub-PRD D5).** For every operation the document marks retryable, an
   `Idempotency-Key` is generated when the caller supplies none: a UUIDv7 string, length checked
   against PRD §34.1's 16–128 character bound. The key is stored on the in-flight call object and
   **re-sent unchanged on every automatic retry of that call** — the load-bearing property; a fresh
   key per attempt would create two jobs and two charges (`ANS-003`: *"Repeated idempotency key
   creates one job/charge"*). A caller-supplied key passes through unchanged. `409
   IDEMPOTENCY_CONFLICT` surfaces as the typed error, never as a silent re-issue.
5. **Retry policy.** Retries only on (a) a transport error and (b) a PRD §34.9 code whose catalogue
   entry says retryable — read from the generated error metadata, not a local list. Exponential
   backoff with full jitter, a bounded attempt count and a bounded total elapsed time, both
   configurable. On `429` the `Retry-After` header wins over the computed backoff (PRD §38.5). A
   non-idempotent write is never retried without its original `Idempotency-Key`. `AbortSignal` is
   honoured at every await point.
6. **Typed errors.** `AerApiError` base class carrying `code`, `httpStatus`, `retryable`,
   `requestId`, `details` and the raw body; one subclass per PRD §34.9 code, generated from the
   document's error catalogue so the set cannot drift; an `isAerApiError` guard and a discriminating
   `switch` example. **Sub-PRD D4:** a completed job carrying a domain answer status such as
   `INSUFFICIENT_EVIDENCE` is returned as a **successful result** — a test asserts it does not throw
   (PRD §34.9 closing sentence, §16.1).
7. **Streaming.** `client.answerJobs.stream(jobId, { lastEventId?, signal? })` returns an
   `AsyncIterable<AerStreamEvent>` over the nine PRD §34.4 event types, each validated against its
   `schemas/events/sse/v1/*.json` schema before being yielded. Behaviour, fixed:
   - reconnect sends `Last-Event-ID` with the highest id seen, with bounded backoff (PRD §34.4,
     `ANS-003`, `UAT-ANS-06` *"Resume after event 5; no duplicate section/completion"*);
   - duplicate ids after a resume are dropped, so a reconnect never duplicates a section or a
     completion;
   - `heartbeat` is consumed internally and also surfaced, so a caller can detect liveness;
   - **sub-PRD D6:** `answer.section` events are marked `provisional: true`; the accumulator's
     `sections` accessor returns `[]` after `job.failed`, and a documented `assertNotProvisional`
     helper exists for callers that render;
   - the iterator terminates on `job.completed`, `job.failed` or `job.cancelled` and always closes
     its underlying reader in a `finally`.
8. **Wait and cancel.** `client.answers.createAndWait(request, { timeoutMs, signal, onEvent? })` —
   creates the job (with idempotency per deliverable 4), streams to completion, and returns the
   Answer Snapshot; on timeout it throws a typed `AerWaitTimeoutError` **carrying the `job_id`** so
   the caller can resume rather than re-submit. A polling fallback engages when streaming is
   unavailable. `client.answerJobs.cancel(jobId)` maps to `POST /v1/answer-jobs/{job_id}/cancel`
   (PRD §16.2) and is safe to call twice.
9. **Webhook verification (re-export, never re-implement).**
   `verifyWebhookSignature({ secrets, header, rawBody, nowSeconds, toleranceSeconds })` delegates to
   `FND-05`'s `verifyWebhook`, accepting the ordered secret list `FND-05` provides for rotation and
   returning which secret matched. The exported signature takes `rawBody: Uint8Array | string`, and
   the doc comment carries `FND-05`'s warning verbatim: **the raw bytes as sent, never a
   re-serialised object.** A framework note documents how to obtain the raw body. The parsed
   `X-AER-Event-Id` is returned so the caller can deduplicate (`FND-05` deliverable 3: dedupe storage
   is the caller's). Typed event payloads come from `schemas/events/registry.json` via
   `packages/contracts/src/events/generated/**`.
10. **Pagination.** `client.<resource>.list(params)` returns an object with `data`, `next_cursor` and
    an `AsyncIterable` `pages()`/`items()`; `page_size` is validated client-side against PRD §34.1's
    1–100 bound with a clear error before any request; the cursor is treated as opaque and never
    parsed (PRD §34.1: *"clients never parse them"*).
11. **Telemetry (sub-PRD D7).** `TelemetryOptions = { enabled: boolean; sink: (record) => void }`,
    **disabled by default**, with **no built-in transport** — the SDK never opens a socket of its
    own. The record type is a closed set:
    `{ sdk_name, sdk_version, runtime, platform, operation_id, http_method, http_status,
    request_id?, job_id?, duration_ms, attempt, error_code? }`. `assertTelemetrySafe(record)` runs
    on **every** record before the sink is called and throws on any key outside the allowlist or any
    value that is not a primitive of the declared type. A documented rule at the call site: the
    request body, the response body, headers, URLs with query strings and error **messages** are
    never telemetry inputs — only the typed `error_code`.
12. **`/internal/v1` exclusion (sub-PRD D8).** The operation surface is filtered to the `/v1` server;
    a test asserts no exported method resolves to an `/internal/v1` path and no internal operation id
    appears in the public type surface.
13. **`parity/surface.json` (sub-PRD D3)** — the committed manifest of public operation ids and
    ergonomic method names (`stream`, `createAndWait`, `cancel`, `verifyWebhookSignature`,
    `pages`, `items`, …) with a canonical name per entry and the idiomatic name expected in each
    language. This ticket's suite asserts its own exports against it; `PLTF-03` reads the same file.
    Adding a public method without adding it here fails the suite.
14. **`examples/` — the sample integration** (`E27` exit evidence *"DEV tests and sample
    integration"*, PRD §44.2). One runnable script that: creates a client with a fake credential;
    runs `POST /v1/search`; creates an answer job with `createAndWait`; streams and prints stages;
    cancels a second job; lists a paginated resource; and verifies a webhook using `FND-05`'s
    fixture. It runs against the recorded-response transport with **no network**, and it is executed
    by the test suite so it cannot rot.
15. **`test/fixtures/**` — recorded responses**, built from `schemas/openapi/examples/**` (PRD §34.2
    search request/response, §34.3 create-answer-job, §34.5 Answer Snapshot) and `FND-05`'s
    `packages/contracts/test/events/fixtures/**` (the §34.8 body/headers and the §34.4 SSE frames),
    plus SSE transcripts assembled for the resume, failure and cancel paths. A fixture-drift test
    asserts each recorded body still validates against the current generated schema, so a contract
    change breaks the SDK loudly rather than silently.

Ordering constraint: deliverable 3 before 4–10 (the generated surface is the input to every
ergonomic layer), and deliverable 13's manifest is committed in the same change as the exports it
describes.

## Acceptance checklist (classified)

- [ ] `[machine]` **`DEV-001` generated-diff clean**: `pnpm generate && pnpm generated:check` exits 0
      and leaves `git status --porcelain` empty; this package runs no second TypeScript generator, and
      a source scan finds no locally declared `/v1` request or response body type (PRD §30.2
      `DEV-001`; §20.1; sub-PRD **D1**)
- [ ] `[machine]` Every request/response type used publicly is imported from
      `packages/contracts/src/generated/**`; no file in `src/**` carries the do-not-edit banner
      because none is generated here (sub-PRD **D1**)
- [ ] `[machine]` **Idempotency is retry-stable**: with the transport forced to fail twice and then
      succeed, all three attempts carry the **identical** `Idempotency-Key`, and its length is within
      PRD §34.1's 16–128 bound; a caller-supplied key is passed through unchanged; a `409` maps to the
      typed `IdempotencyConflictError` (PRD §8.10, §34.1; `ANS-003`)
- [ ] `[machine]` **Retry policy**: only catalogue-retryable codes and transport errors are retried;
      `429` honours `Retry-After` over the computed backoff; a non-retryable code is not retried; the
      attempt and elapsed bounds hold; `AbortSignal` aborts mid-retry (PRD §34.9, §38.5)
- [ ] `[machine]` **Typed errors**: one error class exists per PRD §34.9 code with the catalogue's
      exact HTTP status and `retryable` value, generated from the document — adding a code to the
      document adds a class without an edit here (PRD §34.9)
- [ ] `[machine]` **Sub-PRD D4**: a completed job whose answer status is `INSUFFICIENT_EVIDENCE`
      returns successfully and **throws nothing** (PRD §34.9 closing sentence; §16.1)
- [ ] `[fixture]` **Streaming replay**: the recorded SSE transcript yields the nine PRD §34.4 event
      types in order, each validating against its `schemas/events/sse/v1/*.json` schema; an unknown
      tenth type is rejected (PRD §34.4; `FND-05` deliverable 1)
- [ ] `[fixture]` **Resume without duplication (`UAT-ANS-06` client half)**: a transcript cut after
      event 5 and resumed replays from event 6 with `Last-Event-ID: 5`, and no section or completion
      is delivered twice (PRD §34.4; `ANS-003`)
- [ ] `[fixture]` **Sub-PRD D6 provisional sections**: after a transcript ending in `job.failed`, the
      accumulated `sections` accessor returns empty and every `answer.section` event was marked
      `provisional: true` (PRD §34.4, quoted by `FND-05`)
- [ ] `[machine]` `createAndWait` returns the snapshot on completion, and on timeout throws
      `AerWaitTimeoutError` **carrying `job_id`**; `cancel` is safe to call twice (PRD §16.2; §33.2)
- [ ] `[fixture]` **Webhook verification**: `FND-05`'s committed body + fixed secret + committed
      timestamp verify `OK` against the committed `v1=<hex>`; a flipped byte yields
      `SIGNATURE_MISMATCH`; a 301-second-old timestamp yields `TIMESTAMP_OUT_OF_WINDOW`; the ordered
      secret list reports which secret matched; the parsed `X-AER-Event-Id` is returned (PRD §34.8;
      `MON-004`; `UAT-MON-02`'s replay half)
- [ ] `[machine]` This package computes **no HMAC of its own** — a source scan finds no `createHmac`,
      no digest call and no signature comparison; verification delegates to `FND-05` (PRD §20.1;
      `FND-05` deliverable 3)
- [ ] `[machine]` **Pagination**: `page_size` outside 1–100 is rejected client-side before any
      request; the default is 25; the cursor is never parsed (PRD §34.1)
- [ ] `[machine]` **SDK telemetry carries no research content (PRD §8.10)**: with telemetry enabled
      and a canary question, canary facts, a canary answer string and a canary citation quote flowing
      through every operation in the sample integration, **no** telemetry record contains any canary;
      `assertTelemetrySafe` throws when handed a record with an out-of-allowlist key; telemetry is
      **off by default** and opens no socket (PRD §8.10 *"SDK telemetry MUST NOT contain research
      content"*; §22; §41.1; sub-PRD **D7**)
- [ ] `[machine]` **No `/internal/v1`**: no exported method resolves to an `/internal/v1` path and no
      internal operation id is present in the public types (PRD §8.11; sub-PRD **D8**)
- [ ] `[machine]` **No tenant field and no cookie path**: the client exposes no `organizationId`
      option and no cookie/session auth variant; a source scan asserts no `Cookie` header is ever set
      (PRD §34.1, §16.1, §38.2)
- [ ] `[machine]` **No credential leaks**: a canary credential string appears in no telemetry record,
      no thrown error message, no `toString`/`inspect` output of the client, and no example output
      (PRD §22; §21.1)
- [ ] `[machine]` **Parity manifest (sub-PRD D3)**: this package's public exports equal
      `parity/surface.json`; a method added without a manifest entry fails (PRD §8.10)
- [ ] `[fixture]` **Sample integration** runs end to end against recorded responses with no network
      and is executed by the suite (`E27` exit evidence *"DEV tests and sample integration"*,
      PRD §44.2)
- [ ] `[fixture]` **Fixture drift**: every recorded response still validates against the current
      generated schema; a contract change fails this test rather than silently passing (PRD §34
      preamble)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`DEV-001`**,
      `E27-DEVELOPER`, proposed `UAT-DEV-01` per sub-PRD **Q-PLTF-1**), user-visible change and
      non-goals, schema/API/event compatibility impact (consumer only; fixture-drift test is the
      early warning), tenant/PII/security impact (no tenant field, no cookie path, telemetry
      allowlist, no credential in any output), source/licence impact (none), cost/memory/latency
      impact (client library; retry bounds stated), rollback path (revert; nothing consumes it yet),
      known gaps (**Q-PLTF-3** is `PLTF-03`'s, not this one; live-server verification is Gate 2)
- [ ] `[human]` Founder review at Gate 2 that the SDK reads as a coherent developer surface alongside
      `PLTF-03` — same concepts, same names, no capability present in one language only
      (PRD §43.4; sub-PRD proposed `UAT-DEV-01`). **Not required to merge**
- No `cargo test --workspace` item — no Rust touched. No `uv run pytest` item — no Python touched
      here; the Python SDK is `PLTF-03` (PRD §45.3)
- No origin-validation criteria — this SDK runs server-side and defines no cross-origin surface;
      exact-origin validation is `PLTF-05`/`PLTF-06` (PRD §8.10)

## Test plan

Reviewer steps, **all offline**: no network, no live API, no running server. Every HTTP interaction
goes through the injected `fetch` seam (deliverable 2) backed by `test/fixtures/**`.

1. `corepack pnpm install --frozen-lockfile` — corepack resolves pnpm `11.4.0` from
   `package.json#packageManager` and the run uses Node `24.18.0` (`FND-01`'s pins, breakdown plan
   §8 **Q12**, CONFIRMED); then `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @<scope>/sdk-typescript`. Suites live under `packages/sdk-typescript/test/`.
   Build them on the construction pattern of `packages/contracts`' own tests (`FND-04` deliverable 8,
   `FND-05` deliverable 6) — fixed clock, fixed random, committed expected values.
3. **Read the fixtures against the sources.** Compare each file in `test/fixtures/http/` with its
   original in `schemas/openapi/examples/**`, and each event fixture with
   `packages/contracts/test/events/fixtures/**`. **A fixture that drifted makes every replay
   vacuous** — check this before trusting any result below.
4. **`generated.test.ts` + generated check.** Run `pnpm generate && pnpm generated:check`;
   `git status --porcelain` must be empty. Then grep `src/**` for a locally declared request or
   response body type and confirm the source scan test catches a deliberately added one on a scratch
   branch.
5. **`idempotency.test.ts`** — force the transport to fail twice then succeed; capture all three
   requests; assert the `Idempotency-Key` header is **byte-identical** across them. Confirm the
   assertion compares the three captured values, not merely "a key was present". Then a
   caller-supplied key; then a `409` response mapping to the typed error.
6. **`retry.test.ts`** — table over the 17 PRD §34.9 codes asserting retry versus no-retry from the
   catalogue metadata; a `429` with `Retry-After: 3` waits ~3 s on a fake clock rather than the
   computed backoff; attempt and elapsed bounds; `AbortSignal` mid-retry.
7. **`errors.test.ts`** — assert one class per catalogue code with the exact status and `retryable`;
   then the sub-PRD **D4** case: replay the `INSUFFICIENT_EVIDENCE` completed-job fixture and assert
   `await` resolves.
8. **`streaming.test.ts`** — replay the full transcript; assert the nine types and their schema
   validation; then the cut-and-resume transcript, asserting `Last-Event-ID: 5` was sent and no
   duplicate section or completion was yielded; then the failure transcript, asserting `sections` is
   empty afterwards and every section event carried `provisional: true`. Confirm the reader is closed
   in a `finally` by asserting the fake transport records a cancel.
9. **`wait-cancel.test.ts`** — `createAndWait` success; timeout carrying `job_id`; double cancel.
10. **`webhooks.test.ts`** — the four `FND-05` cases (valid, tampered body, stale timestamp, ordered
    secret list). Confirm the test asserts the **committed expected hex**, not merely
    `verify(sign(x)) === true`. Then grep `src/**` for `createHmac`/digest calls and confirm none.
11. **`telemetry.test.ts`** — enable telemetry with a recording sink; run the sample integration with
    canary strings for question, facts, answer and citation quote; assert every canary is absent from
    every record. Then hand `assertTelemetrySafe` a record with an extra key and assert it throws.
    Then assert the default configuration emits nothing and constructs no transport.
12. **`no-internal.test.ts`**, **`no-cookie.test.ts`**, **`no-tenant-field.test.ts`** — the three
    structural exclusions.
13. **`parity.test.ts`** — exports versus `parity/surface.json`; add a scratch export and confirm the
    test fails.
14. **`example.test.ts`** — execute `examples/` against the recorded transport; assert it completes
    and that its stdout contains no credential and no canary.
15. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether a
    concurrent `createAndWait` and `cancel` on the same job can double-charge; whether the retry path
    can regenerate an `Idempotency-Key` on any branch (including the `429` path and the abort path);
    whether a reconnect can replay events already delivered to the consumer; whether an error message
    or a thrown object can carry the credential, the raw body or a provider payload; whether
    `assertTelemetrySafe` is reachable from every emit site or only the happy path; whether a
    `page_size` of `0` or `101` can reach the wire.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The SDK needs an API shape the OpenAPI root does not have** — a field, an operation, a parameter,
  an enum member. → **This is a docs PR against `docs/prd/00-foundation/tickets/FND-04-*.md`, never a
  hand-edited binding and never a divergent hand-written client** (PRD §20.1; `FND-04` Feedback
  obligation item 3, which names the path: a new ticket in `00-foundation` recorded on
  `docs/prd/breakdown-plan.md`, with this ticket `blocked_by` it). Record the gap in
  `docs/prd/20-developer-platform/README.md` under **Q-PLTF-8**. Do not add a "temporary" typed
  wrapper around an undocumented endpoint.
- **`packages/contracts`' generated core is not ergonomic enough to wrap** (for example it exposes no
  path/method map, or no error metadata to drive deliverables 5 and 6). → Amend `FND-04`'s
  deliverable 6 and this ticket's deliverable 3 in **one** docs PR and `--sync` both. Never run a
  second TypeScript generator over `schemas/openapi/**` — that produces two cores and falsifies
  PRD §8.10's *"share an OpenAPI-generated core"*.
- **A webhook event type or SSE payload the SDK must type does not exist in `schemas/events/**`.** →
  `FND-05` Feedback obligation item 2 is the path: the type is added **there**, with this ticket
  `blocked_by` the change; record it in `docs/prd/20-developer-platform/README.md`. Never define an
  event schema inside this package.
- **A telemetry field that is genuinely useful is outside the allowlist** (for example a truncated
  query length or a source identifier). → PRD §8.10 is unconditional. Update
  `docs/prd/20-developer-platform/README.md` **D7** with the exact field and its justification and
  escalate as a **product/privacy change** (PRD §45.5, §10.2) before widening the allowlist. The
  allowlist is a privacy boundary, not a lint rule.
- **`FND-05`'s `verifyWebhook` cannot be called from a target runtime** (for example a framework that
  does not expose the raw body). → `FND-05` friction 4 already anticipates this and names the
  writeback: record the constraint in `docs/prd/00-foundation/README.md` and coordinate through a
  `FND-05` writeback. **Never** re-implement HMAC verification in this package to work around it, and
  never accept a re-serialised body as the signing input.
- **The quickstart snippet `PLTF-01` publishes and the snippet this package executes diverge.** →
  They are one string by design (`PLTF-01` deliverable 5). Amend both tickets in one docs PR and
  `--sync` both; do not fork the snippet.
- **The parity manifest cannot express a capability idiomatically in both languages.** → Amend
  sub-PRD **D3** in `docs/prd/20-developer-platform/README.md` and both `PLTF-02` and `PLTF-03` in
  one docs PR. A capability present in one SDK only falsifies PRD §8.10's *"TypeScript and Python
  SDKs MUST … provide streaming, wait/cancel, typed errors and webhook verification"*.

**3. Escalation.** *"TypeScript and Python SDKs MUST share an OpenAPI-generated core"* (PRD §8.10)
and `DEV-001`'s evidence *"Generated-client diff is clean in CI"* are release requirements with MUST
force. If the generated core proves unusable as the SDK's basis — so that the only way to ship is a
hand-written client — that overturns PRD §34's "generated-code source of truth" decision and
`FND-04`'s scope. Stop, raise an ADR under `docs/adr/` (breakdown plan **A9**), write back to
`docs/prd/breakdown-plan.md` §4.1, and escalate to the human. Never ship a hand-written client
alongside the generated one.
