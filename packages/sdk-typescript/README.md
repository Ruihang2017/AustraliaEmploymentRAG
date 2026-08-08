# `@taxrag/sdk-typescript`

The TypeScript SDK. It **wraps** the OpenAPI-generated core in `packages/contracts` and adds exactly
the four capabilities PRD §8.10 requires — streaming, wait/cancel, typed errors and webhook
verification — plus credential authentication, retry-stable idempotency, `Retry-After`-aware retry
and cursor pagination.

Built by ticket `PLTF-02` (`docs/prd/20-developer-platform/tickets/PLTF-02-typescript-sdk.md`),
carrying requirement **`DEV-001`**. Nothing consumes this package yet.

## Entry point

The published entry is the package root:

```ts
import { createAerClient, isAerApiError } from '@taxrag/sdk-typescript';
```

Inside this repository the barrel is `src/sdk.ts`, **not** `src/index.ts`.
`tools/workspace-assertions.mjs#assertEntryFilesEmpty` requires every workspace member's
`src/index.ts` to stay byte-exactly `export {};`, and `tools/tests/skeleton.test.mjs` enforces it on
every branch — so `packages/contracts` publishes `src/events/index.ts` as its barrel and this package
publishes `src/sdk.ts` as its own. The `exports` map points `.` at the built `dist/`, so an installed
consumer never sees this.

## Quickstart

```ts
import { createAerClient, isAerApiError } from '@taxrag/sdk-typescript';

const client = createAerClient({
  baseUrl: 'https://api.example.test/v1',   // must end at the generated /v1 base path
  auth: { apiKey: process.env.AER_API_KEY! }, // never hard-code a credential (PRD §20.2)
});

const results = await client.search({ query: 'annual leave direction section 94', page_size: 25 });

const answer = await client.answers.createAndWait(
  { mode: 'QUICK', question: 'Which official rules should be checked?' },
  { onEvent: (event) => console.log(event.type) },
);
```

A runnable, offline version of the same flow lives in `examples/quickstart.ts`, and the test suite
executes it, so it cannot rot.

## The four PRD §8.10 capabilities

### Streaming (resumable SSE)

```ts
for await (const event of client.answerJobs.stream(jobId, { lastEventId, signal })) {
  // event.type is one of the nine PRD §34.4 public types; event.data is the generated payload
}
```

The iterator reconnects with `Last-Event-ID` set to the highest id it has actually **yielded**, drops
any frame at or below that mark so a resume never re-delivers a section or a completion, surfaces
`heartbeat` for liveness, terminates on `job.completed` / `job.failed` / `job.cancelled`, and closes
its reader in a `finally` on every exit path — including a consumer `break`.

**`answer.section` is provisional UI content until `job.completed`** (PRD §34.4). Every section event
carries `provisional: true`, `createStreamAccumulator().sections` returns `[]` after a failure or a
cancellation, and `assertNotProvisional(accumulator)` throws unless the job completed. Call it before
rendering anything derived from a section.

### Wait and cancel

`client.answers.createAndWait(request, { waitTimeoutMs, signal, onEvent })` creates the job, streams
it to completion and returns the Answer Snapshot. On timeout it throws `AerWaitTimeoutError`
**carrying `jobId`** — resume the stream with that id; do not re-submit, which would create a second
job and a second charge. A `202` clarification response is **returned, not thrown** (PRD §34.3), so
narrow it with `isClarificationRequired(result)`.

`client.answerJobs.cancel(jobId)` sends no `Idempotency-Key` (the document marks `cancelAnswerJob`
`x-retryable-write: false`) and is safe to call twice.

### Typed errors

One class per PRD §34.9 code, **built from the generated catalogue** so the set cannot drift:

```ts
try { await client.search({ query }); }
catch (error) {
  if (!isAerApiError(error)) throw error;
  switch (error.code) {
    case 'RATE_LIMITED':          /* error.retryAfterMs is already parsed and clamped */ break;
    case 'IDEMPOTENCY_CONFLICT':  /* the body changed for this key */ break;
    case 'INSUFFICIENT_EVIDENCE': /* unreachable: a refusal is not an error — see below */ break;
    default: break;
  }
}
```

`error instanceof errorClasses.IDEMPOTENCY_CONFLICT` works too, and `error.name` is
`IdempotencyConflictError`. `httpStatus` and `retryable` come from the catalogue, never from the wire.

**A refusal is not an error.** PRD §34.9: *"Domain answer statuses such as `INSUFFICIENT_EVIDENCE`
are valid completed research results and do not become HTTP errors."* `createAndWait` resolves with
the snapshot and you read `snapshot.status`.

### Webhook verification

```ts
const result = verifyWebhookSignature({
  secrets: [currentSecret, previousSecret],  // ordered; result.secretIndex says which matched
  header: request.headers,
  rawBody,                                   // see the warning below
  nowSeconds: Math.floor(Date.now() / 1000),
});
if (!result.ok) return reject(result.reason);
if (await alreadySeen(result.eventId)) return accept();  // PRD §34.8 dedupe is the receiver's
```

> **`rawBody` is the bytes as sent.** Pass the **raw** request body — the exact bytes read off the
> socket. Never `JSON.stringify` a parsed object and sign that: key order, unicode escaping and
> whitespace all differ from the sender's bytes, so the signature will not match, and the failure
> looks like an attack rather than a bug. In a Node HTTP framework this means capturing the body
> before the JSON body parser runs. This is the classic webhook integration defect.

Framework notes are in the doc comment on `verifyWebhookSignature` (Fastify, Express, Web `Request`,
Lambda). **This package computes no HMAC of its own** — verification delegates to `FND-05`'s
constant-time implementation in `packages/contracts/src/events/sign.ts`, and a test scans this
package's sources to prove it.

## Idempotency, retry and pagination

- **Idempotency** — for every operation the document marks a retryable write, a UUIDv7 key is
  generated when the caller supplies none, validated against PRD §34.1's 16–128 character bound, and
  **re-sent unchanged on every automatic retry of that call**. The key is resolved once, before the
  attempt loop; no branch — `429`, transport failure, abort — can mint a second one.
- **Retry** — only a transport error, or a code the generated catalogue marks retryable. Exponential
  backoff with full jitter, bounded by `maxAttempts` and `maxElapsedMs`. On `429` a `Retry-After`
  (delta-seconds or HTTP-date) wins over the computed backoff and is clamped to `maxRetryAfterMs`.
  `AbortSignal` is honoured at every await point, including during a backoff sleep.
- **Pagination** — `client.list(operationId, { page_size, cursor })` returns a paginator with
  `page()`, `pages()` and `items()`. `page_size` is validated against PRD §34.1's 1–100 bound
  **before any request**; the default is 25. The cursor is opaque and is never parsed. A page exposes
  `data` (the ergonomic accessor), `next_cursor` and `raw` (the wire envelope).

## Telemetry

**Off by default, and there is no built-in transport** — this SDK never opens a socket of its own.

```ts
createAerClient({ …, telemetry: { enabled: true, sink: (record) => myMetrics.record(record) } });
```

A record is a closed set of twelve primitive fields: `sdk_name`, `sdk_version`, `runtime`,
`platform`, `operation_id`, `http_method`, `http_status`, `request_id?`, `job_id?`, `duration_ms`,
`attempt`, `error_code?`. `assertTelemetrySafe` runs on **every** record at the single `emit()` choke
point and throws on any key outside the allowlist or any value of the wrong type.

**The rule at the call site:** the request body, the response body, headers, URLs with query strings
and error **messages** are never telemetry inputs — only the typed `error_code`. PRD §8.10 is
unconditional: *"SDK telemetry MUST NOT contain research content."* The allowlist is a privacy
boundary, not a lint rule; widening it is a product/privacy change (PRD §45.5, §10.2) recorded in
`docs/prd/20-developer-platform/README.md` **D7** — never a local edit.

The credential is held in a closure and is not a property of the client: `JSON.stringify(client)`,
`String(client)` and `util.inspect(client)` all return a redacted view, and no error carries it.

## What this package deliberately does not do

- **No `/internal/v1`.** PRD §8.11: internal administration *"MUST NOT be shipped in customer SDKs"*.
  The operation surface is filtered to the `/v1` server and a test asserts no exported method resolves
  to an `/internal` path.
- **No cookie authentication.** PRD §38.2: *"API keys do not use cookies."* There is no cookie or
  session variant of `auth`.
- **No tenant field.** PRD §34.1: the organisation is derived from the authenticated credential and is
  *"never accepted in a request body"*. There is no `organizationId` option.
- **No request or response type of its own.** Every body type is imported from
  `packages/contracts/src/generated/**` (sub-PRD **D1**, PRD §20.1). If a type is missing, that is a
  docs PR against `FND-04` — never a local declaration.
- **No second code generator.** `pnpm generate` / `pnpm generated:check` here delegate to the
  contracts package's generator, so `DEV-001`'s *"generated-client diff is clean in CI"* has one
  source of truth.
- **No credential storage, minting or rotation**, no registry publishing, no documentation site
  (`PLTF-01` owns `docs/api/**`).

## Import boundary

`src/internal/contracts.ts` is the **only** file in this package permitted to name a path outside it.
It re-exports the generated core, `FND-05`'s webhook verifier and the UUIDv7 generator; a test
asserts no other file under `src/**` reaches outside.

The import is a relative deep import rather than a `@taxrag/contracts` workspace dependency because
pnpm links a workspace member only through the `workspace:` protocol and
`tools/tests/skeleton.test.mjs` rejects `workspace:*` as an unpinned specifier. Every merged consumer
of `packages/contracts` — `apps/api`, `packages/domain`, `packages/database` — does the same. This is
recorded as a deviation from the ticket's deliverable 1 wording; when a `00-foundation` repair makes
the dependency expressible, switching over is a one-file change.

## Scripts

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc -p tsconfig.json --noEmit` over `src`, `test` and `examples` |
| `pnpm test` | the offline suite — no network, no server, injected `fetch` everywhere |
| `pnpm lint` | eslint with the repository configuration |
| `pnpm build` | ESM + declarations into `dist/esm`, CommonJS into `dist/cjs` |
| `pnpm generate` / `pnpm generated:check` | delegate to `packages/contracts`' generator |

The toolchain is `FND-01`'s and is not re-pinned here: Node `24.18.0`, pnpm `11.4.0`.
