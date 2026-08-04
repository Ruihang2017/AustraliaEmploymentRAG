---
id: PLTF-03
title: Python SDK
module: 20-developer-platform
lane: 20-developer-platform
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-04, FND-05]
blocks: []
---

# PLTF-03 — Python SDK

Implements PRD §8.10 (API, SDK and widget), carrying requirement **`DEV-001`** ("OpenAPI drives
TypeScript/Python generated cores", epic `E27-DEVELOPER`).
**No ADR for the SDK itself — the decision is already made in PRD §8.10 (*"TypeScript and Python
SDKs MUST share an OpenAPI-generated core and provide streaming, wait/cancel, typed errors and
webhook verification"*); this is build ticket 3 of 9 against it. One ADR *is* required inside this
ticket: the Python code-generator choice is a durable technology trade-off under PRD §45.5 and is
recorded as `docs/adr/NNNN-python-sdk-codegen.md` (sub-PRD **Q-PLTF-3**, breakdown plan **A9**) —
this ticket records that decision, it does not invent a product rule.**
Parent sub-PRD: [20-developer-platform README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-04` — OpenAPI root and generated TypeScript bindings; `FND-05` — Event and webhook
schema root (both [`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
— PRD §8.10 lists the four required capabilities and `FND-04`/`FND-05` have already frozen the
contract they operate on; this packages them for Python, it does not design an API.

## Background + basis

**The requirement.** PRD §8.10, the clauses that bind this ticket:

> - **TypeScript and Python SDKs MUST share an OpenAPI-generated core and provide streaming,
>   wait/cancel, typed errors and webhook verification.**
> - **SDK telemetry MUST NOT contain research content.**
> - Retryable writes MUST support `Idempotency-Key`.
> - Answer and other long-running operations MUST use asynchronous jobs and resumable SSE.

**Requirement `DEV-001`** (PRD §30.2), quoted in full:

> | DEV-001 | OpenAPI drives TypeScript/Python generated cores | `/developer/api` | `/v1` | Contracts | Generated-client diff is clean in CI |

**PRD §20.1**: *"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited."*
**PRD §44.3** names *"independent SDK languages"* a canonical safe parallel work unit — which is only
true because the contract is frozen first.

**Where the core comes from.** There is no Python equivalent of `packages/contracts`, so sub-PRD
**D2** applies: this SDK **generates its own core from `schemas/openapi/openapi.yaml` — `FND-04`'s
file, read in place, never copied into this tree.** The generated output lands under
`sdk/python/src/<pkg>/_generated/**`, every file carrying a do-not-edit banner in `FND-04`'s form,
and a `generated:check` regenerates into a temporary directory and fails on any difference. `FND-04`
already anticipates this in its accepted caveats: *"The Python generated core (`DEV-001`'s other
half) is `20-developer-platform`/`PLTF-03`, generated from this same root."*

**Wire conventions.** PRD §16.1: base path `/v1`; *"Organisation is derived from authenticated
context, not trusted request fields"*; *"Every response includes `request_id`"*; *"Retryable writes
support `Idempotency-Key`"*; *"HTTP status and domain answer status remain separate"*. PRD §34.1:
opaque resource-prefixed ids *"clients never parse them"*; `page_size` 1–100 default 25 with an
opaque `next_cursor`; **idempotency key 16–128 characters, "same actor/route/key/body returns
original result; changed body returns 409"**. PRD §38.2: *"API keys do not use cookies."*
PRD §38.5's rate-limit responses *"include `Retry-After`, limit, remaining and reset metadata without
disclosing other tenants"*.

**Refusals are not errors.** PRD §34.9 closes with:

> Domain answer statuses such as `INSUFFICIENT_EVIDENCE` are valid completed research results and do
> not become HTTP errors.

Sub-PRD **D4** makes that a test in both SDKs.

**The SSE contract (PRD §34.4, as `FND-05` quotes it):**

> Allowed public event types: `job.started`, `stage.changed`, `clarification.required`,
> `answer.section`, `citation.added`, `job.completed`, `job.failed`, `job.cancelled`, `heartbeat`.
> `answer.section` is provisional UI content until `job.completed`; clients MUST remove it on failure
> and MUST not represent it as a validated answer.

**Webhook verification (PRD §34.8, as `FND-05` quotes it):** headers `X-AER-Event-Id`,
`X-AER-Timestamp`, `X-AER-Signature: v1=<lowercase hex HMAC-SHA256>`; signature input
`<timestamp>.<raw_request_body>`; *"Receivers reject a timestamp older than five minutes and
deduplicate event IDs."* `FND-05` deliverable 3 fixes the reason vocabulary — `OK`,
`MALFORMED_HEADER`, `TIMESTAMP_OUT_OF_WINDOW`, `SIGNATURE_MISMATCH` — the ordered-secret-list
rotation support, and the constant-time comparison rule. Python cannot import that TypeScript helper,
so this SDK **implements the same algorithm in Python** and proves equality against `FND-05`'s
**committed expected hex** (deliverable 9). That is the one place in this module where a second
implementation of a security primitive is unavoidable, and it is why the cross-check is mandatory
rather than optional.

**Python's place in the repository.** PRD §20.1 lists `sdk/python` as a top-level tree.
PRD §45.3 makes `uv sync --frozen` and `uv run pytest` stable entry commands, and PRD §20.3 names
*"Rust and Python builds/tests"* as a CI gate. PRD §39.1: *"Python pipeline code never imports
tenant/customer packages"* — this SDK is a customer-facing client and imports nothing from the
monorepo's runtime packages at all.

**Internal administration must not ship.** PRD §8.11: internal administration *"MUST NOT be shipped
in customer SDKs"*. Sub-PRD **D8**.

**Accepted caveats carried forward, documented not enforced here:**

- **No live server exists at build time.** Every test replays recorded responses; the transport is
  injectable.
- **Whether the root `pnpm generated:check` reaches `sdk/python` is open** — sub-PRD **Q-PLTF-2**,
  owner `00-foundation`. This ticket ships working `uv run` entry points regardless and reports what
  `FND-01` actually created; wiring the CI gate is a `FND-01`/`FND-02` docs PR, not a local
  workaround.
- **Only `alert.created` is fully specified** (`FND-05` accepted caveat). Webhook typing is driven by
  `schemas/events/registry.json`, so a new type appears without an SDK edit.
- **Telemetry is opt-in with no default transport** (PRD §20.2).

## Goal

Produce `sdk/python` — a Python SDK whose core is generated from `FND-04`'s
`schemas/openapi/openapi.yaml` and whose ergonomic layer provides exactly the four PRD §8.10
capabilities (streaming, wait/cancel, typed errors, webhook verification) plus credential
authentication, retry-stable idempotency, `Retry-After`-aware retry and cursor pagination, in both a
synchronous and an asynchronous client — with opt-in telemetry that structurally cannot carry
research content, and a public surface provably at parity with `PLTF-02`. Completion is mechanically
checkable: regeneration produces no diff; the webhook verifier reproduces `FND-05`'s committed
expected hex byte for byte; a canary research string appears in no telemetry record; a refusal answer
does not raise; `answer.section` content is discarded on `job.failed`; an automatic retry re-sends the
identical `Idempotency-Key`; no operation with an `/internal/v1` path is exposed; the exported surface
equals `packages/sdk-typescript/parity/surface.json`; and `uv run pytest` passes offline.

## Non-goals

- **No OpenAPI document and no change to it** — `FND-04`, PRD §44.3 serial-owned. This SDK
  **generates from** `schemas/openapi/openapi.yaml` in place. A missing field is a docs PR against
  `FND-04`, never a hand-edited binding and never a hand-written divergent client (PRD §20.1).
- **No event or webhook schema definitions** — `FND-05` owns `schemas/events/**`. This SDK validates
  against them and re-implements only the sign/verify **algorithm**, cross-checked against `FND-05`'s
  fixture (deliverable 9).
- **No TypeScript** — `PLTF-02` (`packages/sdk-typescript/**`). This ticket **reads**
  `packages/sdk-typescript/parity/surface.json` read-only and writes nothing there.
- **No widget, no web screens, no route areas** — `PLTF-05`/`PLTF-06`, `PLTF-01`/`PLTF-07`/`PLTF-08`,
  `PLTF-04`/`PLTF-09`.
- **No `/internal/v1` surface** — PRD §8.11 (sub-PRD **D8**).
- **No pipeline code.** `pipelines/**` is `04`, `05`, `06`–`10`, `21`. This is a customer SDK; PRD
  §39.1's *"Python pipeline code never imports tenant/customer packages"* is respected trivially —
  this package imports nothing from the monorepo.
- **No publishing to PyPI** and no release automation — `18-ops-release`.
- **No documentation site** — `PLTF-01` owns `docs/api/**`; the Python quickstart snippet published
  there is the same string this package's example executes (friction 6 of `PLTF-02`, mirrored here).
- **No root manifest, workspace or CI-workflow edits** — `FND-01`/`FND-02`. Sub-PRD **Q-PLTF-2** is
  the writeback path if the root delegator does not reach this tree.
- **No cross-boundary suites** — `tests/**` is `23-assurance` (breakdown plan §9 **R8**).

## File-scope (write-owns)

- `sdk/python/**` — the whole package tree, including:
  - `pyproject.toml` (module-owned member manifest, breakdown plan §1.1; created empty by `FND-01`
    for every PRD §20.1 member and extended here), `README.md`;
  - `src/<pkg>/_generated/**` — the **generated** core (do-not-edit banner, sub-PRD **D2**);
  - `src/<pkg>/**` — client, auth, retry, idempotency, streaming, wait/cancel, errors, pagination,
    webhooks, telemetry;
  - `tests/**` and `tests/fixtures/**` — recorded responses and event fixtures;
  - `examples/**` — the sample integration;
  - `tools/**` (inside `sdk/python`) — the generation and `generated:check` entry points.
- `docs/adr/NNNN-python-sdk-codegen.md` — a **new** file, claimed by this ticket under breakdown plan
  **A9** (*"`docs/adr/**` is the only shared-additive directory: ownership is per file, claimed by the
  ticket that creates `NNNN-<slug>.md`"*). Take the lowest unused four-digit number at build time;
  the slug `python-sdk-codegen` is reserved to this ticket.

Does not touch:

- `schemas/openapi/**`, `schemas/events/**`, `packages/contracts/**` — `FND-03`/`FND-04`/`FND-05`,
  serial-owned; **read-only** from here (the generator's input is the file in place, never a copy).
- `packages/sdk-typescript/**` — `PLTF-02` (same wave, different language, disjoint tree);
  `parity/surface.json` is read read-only.
- `apps/**`, `services/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`.
- `docs/api/**` — `PLTF-01`; `docs/runbooks/**`, `docs/policies/**`, `docs/release/**` — `18`, `24`;
  every `docs/adr/**` file other than the one this ticket creates.
- Root `pyproject.toml`, `uv.lock`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
  `.github/workflows/**` — `FND-01`, `FND-02`. A dependency added here regenerates `uv.lock` as a
  build artifact; it is never hand-merged (breakdown plan §4.1).

**Serial-safety analysis.** This is the **first** decomposition (breakdown plan §1: phase 1,
`append: false`, `usedIds: []`, `existingFiles: ['.gitkeep']`) — nothing is merged, nothing is in
flight, so no prior ticket has written these paths and none contends for them. `sdk/python/**` is
written by no other ticket in the 236-ticket plan (breakdown plan §4). PRD §44.3 names *"independent
SDK languages"* as a canonical safe parallel work unit, and this module realises that literally: this
ticket writes only `sdk/python/**`; `PLTF-02` writes only `packages/sdk-typescript/**`;
`PLTF-05`/`PLTF-06` write only `apps/widget/**` (split at `react/**`); `PLTF-04`/`PLTF-09` write only
`apps/api/src/routes/{sandbox,usage,audit-events}/**`; `PLTF-01`/`PLTF-07`/`PLTF-08` write only
`apps/web/src/features/{developer,usage}/**`. No two of those share a file, so all six wave-1 tickets
are safe as concurrent lanes (breakdown plan §7: 6 useful lanes). The one cross-ticket coupling —
`parity/surface.json` — is a **read** from a sibling's tree, which breakdown plan §4 leaves
unrestricted; if `PLTF-02` has not landed it, this ticket's parity test skips with a named, loud
message rather than passing silently (deliverable 12). `docs/adr/NNNN-python-sdk-codegen.md` is a new
file under the per-file ownership rule **A9**, so it collides with no other ticket.

## Deliverables

1. **Package skeleton** — `sdk/python/pyproject.toml` extended from `FND-01`'s empty member skeleton:
   package metadata, runtime dependencies, and console entry points `aer-sdk-generate` and
   `aer-sdk-generated-check` (deliverable 3). Declares the test, lint and type-check commands so
   `uv sync --frozen` and `uv run pytest` work exactly as PRD §45.3 specifies. If `FND-01` also
   created a `sdk/python/package.json` making this a pnpm workspace member, add `generate` and
   `generated:check` scripts delegating to the `uv run` entry points so the root delegators reach it;
   if it did not, **report that fact** and follow sub-PRD **Q-PLTF-2**'s writeback rather than editing
   root files. The Python version is settled, not open: breakdown plan §8 **Q12** is **CONFIRMED**
   and `FND-01` owns the pin — **Python `3.14.6`**, committed in `pyproject.toml#requires-python`
   and `uv.lock`. This package is built and tested on exactly that interpreter, in CI and locally
   alike; no newer patch or major may be introduced here, and this `pyproject.toml` neither
   re-declares `requires-python` nor widens it. **`uv` remains the toolchain** — PRD §45.3's
   `uv sync --frozen` and `uv run pytest` stay the entry commands — and `uv`'s own version is not
   one of Q12's four pins (Node, pnpm, Rust, Python): it stays `FND-01`'s to record and is not set
   from here.
2. **`docs/adr/NNNN-python-sdk-codegen.md`** — the generator decision (sub-PRD **Q-PLTF-3**,
   PRD §45.5 *"Architecture decision: durable technology/dependency/deployment trade-off; requires an
   ADR under `docs/adr/` and compatibility/security review"*). It states: the candidates considered,
   the chosen generator and its pinned version, the determinism properties relied on by
   `generated:check`, the mapping from OpenAPI to Python names, what happens on an OpenAPI change,
   and the escape hatch if the generator is abandoned upstream. Status, owner, date.
3. **Generation and check (sub-PRD D2).**
   - `aer-sdk-generate` reads `schemas/openapi/openapi.yaml` **at its repository path**, filters to
     the `/v1` server (sub-PRD **D8**), and writes `src/<pkg>/_generated/**`. Every generated file
     begins with `# GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)`.
   - `aer-sdk-generated-check` regenerates into a temporary directory and fails on **any**
     difference, printing the first differing path and line.
   - Output must be deterministic: sorted members, no timestamps, no absolute paths, no generator
     version string that changes on an unrelated upgrade. Two consecutive runs are byte-identical.
   - **The document is never copied into `sdk/python/`.** A test asserts no `.yaml`/`.json` copy of
     the OpenAPI root exists in this tree (PRD §44.3, breakdown plan §4.1).
4. **`AerClient` and `AsyncAerClient`** — the two entry points, same surface:
   ```python
   AerClient(
       base_url: str,
       auth: ApiKeyAuth | WidgetSessionAuth,
       transport: Transport | None = None,   # injectable — the offline test seam
       retry: RetryOptions | None = None,
       timeout_s: float | None = None,
       telemetry: TelemetryOptions | None = None,   # default: disabled
   )
   ```
   There is **no cookie/session auth class** (PRD §38.2: *"API keys do not use cookies"*) and **no
   `organization_id` parameter** (PRD §34.1: tenant is *"derived from authenticated
   session/key/widget token"*). Both clients are context managers that close their transport.
5. **Typed operations from the generated core.** Every `/v1` operation is a method whose request and
   response models come from `_generated/**`. **No request or response model is hand-written in
   `src/<pkg>/` outside `_generated/`** — a source scan asserts it. `py.typed` is shipped so callers
   get the types.
6. **Idempotency (sub-PRD D5).** For every operation the document marks retryable, an
   `Idempotency-Key` is generated when the caller supplies none (UUIDv7 string, length checked
   against PRD §34.1's 16–128 bound) and **re-sent unchanged on every automatic retry of the same
   logical call**. A caller-supplied key passes through. `409 IDEMPOTENCY_CONFLICT` raises the typed
   error, never a silent re-issue (`ANS-003`: *"Repeated idempotency key creates one job/charge"*).
7. **Retry policy.** Retries only on a transport error and on catalogue-retryable PRD §34.9 codes
   read from the generated error metadata; exponential backoff with full jitter; bounded attempts and
   bounded total elapsed time; on `429` the `Retry-After` header wins (PRD §38.5); cancellation is
   honoured (`asyncio.CancelledError` in the async client, a cancellation token in the sync client).
8. **Typed errors.** `AerApiError` base with `code`, `http_status`, `retryable`, `request_id`,
   `details`; one subclass per PRD §34.9 code, **generated** from the document's error catalogue so
   the set cannot drift. **Sub-PRD D4:** a completed job with a domain answer status such as
   `INSUFFICIENT_EVIDENCE` is a successful return value — a test asserts nothing is raised
   (PRD §34.9 closing sentence, §16.1).
9. **Webhook verification, cross-checked against `FND-05`.**
   `verify_webhook_signature(*, secrets, header, raw_body, now_seconds, tolerance_seconds=300)`
   returns a result object with `ok`, `reason` ∈ `{OK, MALFORMED_HEADER, TIMESTAMP_OUT_OF_WINDOW,
   SIGNATURE_MISMATCH}`, the matched secret index (rotation support) and the parsed
   `X-AER-Event-Id`. Rules, all load-bearing:
   - the HMAC-SHA256 input is exactly `f"{timestamp_seconds}.{raw_body}"` over the **raw bytes as
     received** — the signature is `v1=<lowercase hex>` (PRD §34.8);
   - `raw_body` is typed `bytes`; passing a parsed object is a `TypeError`, and the docstring carries
     `FND-05`'s warning: re-serialisation is the classic signature break;
   - comparison uses `hmac.compare_digest`; `==` on the signature is forbidden and a source scan
     asserts it;
   - no secret, signature or body content appears in any returned message or raised exception
     (PRD §22);
   - **equality with `FND-05` is proven, not assumed**: the test asserts the committed expected hex
     from `packages/contracts/test/events/fixtures/alert-created.*` (read read-only), and fails loudly
     if that file is absent rather than silently skipping.
10. **Streaming.** `client.answer_jobs.stream(job_id, last_event_id=None)` yields typed events for
    the nine PRD §34.4 types, each validated against its `schemas/events/sse/v1/*.json` schema;
    reconnect sends `Last-Event-ID` with the highest id seen; duplicate ids after a resume are
    dropped so no section or completion is delivered twice; **sub-PRD D6:** `answer.section` events
    carry `provisional=True` and the accumulator's `sections` is emptied on `job.failed`; the
    generator/iterator closes its response in a `finally`.
11. **Wait and cancel.** `client.answers.create_and_wait(request, timeout_s=…)` returns the Answer
    Snapshot; on timeout it raises `AerWaitTimeout` **carrying `job_id`** so the caller resumes
    rather than re-submits; `client.answer_jobs.cancel(job_id)` is safe to call twice.
12. **Pagination and parity.** `list(...)` returns an object with `data`, `next_cursor` and an
    iterator over pages and items; `page_size` is validated client-side against PRD §34.1's 1–100
    bound before any request; the cursor is opaque. **Parity (sub-PRD D3):** the suite reads
    `packages/sdk-typescript/parity/surface.json` read-only and asserts every canonical entry has a
    Python counterpart under its declared idiomatic name, and that no public method exists without a
    manifest entry. If the file is absent (`PLTF-02` not yet merged) the test **fails with a named
    message** unless the environment explicitly marks it deferred — it never passes silently.
13. **Telemetry (sub-PRD D7).** `TelemetryOptions(enabled=False, sink=None)` — **disabled by
    default, no built-in transport**. The record is a closed set: `sdk_name`, `sdk_version`,
    `runtime`, `platform`, `operation_id`, `http_method`, `http_status`, `request_id`, `job_id`,
    `duration_ms`, `attempt`, `error_code`. `assert_telemetry_safe(record)` runs on **every** record
    before the sink is called and raises on any key outside the allowlist or any non-primitive value.
    Request bodies, response bodies, headers, query strings and error **messages** are never
    telemetry inputs.
14. **`examples/` — the sample integration** (`E27` exit evidence *"DEV tests and sample
    integration"*, PRD §44.2): create a client with a fake credential; run `POST /v1/search`; create
    an answer job with `create_and_wait`; stream and print stages; cancel a second job; page a list;
    verify a webhook using `FND-05`'s fixture. Runs against the recorded transport with **no
    network**, and is executed by the test suite so it cannot rot.
15. **`tests/fixtures/**` — recorded responses**, built from `schemas/openapi/examples/**` (PRD
    §34.2/§34.3/§34.5) and the PRD §34.8/§34.4 fixtures, plus SSE transcripts for the resume, failure
    and cancel paths. A fixture-drift test asserts each recorded body still validates against the
    current generated models.

Ordering constraint: deliverable 3 before 4–13 (the generated core is the input to every ergonomic
layer); deliverable 2's ADR is committed in the same change as the generator it records.

## Acceptance checklist (classified)

- [ ] `[machine]` **`DEV-001` generated-diff clean (Python half)**: `aer-sdk-generate` followed by
      `aer-sdk-generated-check` exits 0 and leaves `git status --porcelain` empty; a hand-edit to any
      file under `src/<pkg>/_generated/**` is detected; every generated file carries the do-not-edit
      banner (PRD §30.2 `DEV-001`; §20.1; sub-PRD **D2**)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` at the repository root is clean **and** the
      run reports whether it reached `sdk/python`; if it did not, the PR records sub-PRD **Q-PLTF-2**
      as a known gap with the `FND-01`/`FND-02` writeback raised (PRD §20.3 *"Rust and Python
      builds/tests"*; §45.3)
- [ ] `[machine]` The generator is deterministic: two consecutive runs are byte-identical, with no
      timestamp, absolute path or unstable ordering (PRD §20.1)
- [ ] `[machine]` **No copy of the OpenAPI document exists under `sdk/python/`** — the generator reads
      `schemas/openapi/openapi.yaml` in place (PRD §44.3; breakdown plan §4.1)
- [ ] `[machine]` No request or response model is hand-written outside `_generated/**` — source scan
      (PRD §20.1; sub-PRD **D2**)
- [ ] `[machine]` **Idempotency is retry-stable**: with the transport forced to fail twice then
      succeed, all three attempts carry the **identical** `Idempotency-Key` within PRD §34.1's 16–128
      bound; a caller-supplied key passes through; `409` raises the typed error (PRD §8.10, §34.1;
      `ANS-003`)
- [ ] `[machine]` **Retry policy**: only catalogue-retryable codes and transport errors retry;
      `Retry-After` wins on `429`; attempt and elapsed bounds hold; cancellation is honoured in both
      the sync and async clients (PRD §34.9, §38.5)
- [ ] `[machine]` **Typed errors**: one class per PRD §34.9 code with the catalogue's exact status and
      `retryable`, generated from the document (PRD §34.9)
- [ ] `[machine]` **Sub-PRD D4**: a completed job whose answer status is `INSUFFICIENT_EVIDENCE`
      returns successfully and **raises nothing** (PRD §34.9 closing sentence; §16.1)
- [ ] `[fixture]` **Webhook equality with `FND-05`**: the committed PRD §34.8 body + fixed secret +
      committed timestamp produce **exactly** the committed `v1=<hex>`; the test reads
      `packages/contracts/test/events/fixtures/**` and **fails loudly if it is missing** rather than
      skipping (PRD §34.8; `MON-004`; `FND-05` deliverable 6)
- [ ] `[fixture]` **Webhook negative matrix**: a flipped body byte → `SIGNATURE_MISMATCH`; a changed
      timestamp without re-signing → `SIGNATURE_MISMATCH`; a 301-second-old timestamp →
      `TIMESTAMP_OUT_OF_WINDOW`; a malformed header → `MALFORMED_HEADER`; the ordered secret list
      reports which secret matched (PRD §34.8 *"reject a timestamp older than five minutes"*;
      `UAT-MON-02`'s replay half)
- [ ] `[machine]` **Constant-time comparison**: `hmac.compare_digest` is used and a static check
      asserts no `==`/`!=` comparison is applied to a signature value; an equal-length wrong signature
      is rejected (PRD §21.1)
- [ ] `[machine]` `raw_body` is typed `bytes` and a parsed object raises `TypeError`; the docstring
      carries the re-serialisation warning (PRD §34.8; `FND-05` deliverable 3)
- [ ] `[fixture]` **Streaming replay**: the recorded transcript yields the nine PRD §34.4 types in
      order, each validating against its SSE schema; an unknown tenth type is rejected (PRD §34.4)
- [ ] `[fixture]` **Resume without duplication**: a transcript cut after event 5 and resumed sends
      `Last-Event-ID: 5` and delivers no duplicate section or completion (PRD §34.4; `ANS-003`;
      `UAT-ANS-06` client half)
- [ ] `[fixture]` **Sub-PRD D6 provisional sections**: after a `job.failed` transcript, `sections` is
      empty and every `answer.section` carried `provisional=True` (PRD §34.4)
- [ ] `[machine]` `create_and_wait` returns the snapshot; on timeout it raises `AerWaitTimeout`
      carrying `job_id`; `cancel` is safe twice (PRD §16.2, §33.2)
- [ ] `[machine]` **Pagination**: `page_size` outside 1–100 is rejected before any request; default
      25; the cursor is never parsed (PRD §34.1)
- [ ] `[machine]` **SDK telemetry carries no research content (PRD §8.10)**: with telemetry enabled
      and canary question, facts, answer and citation-quote strings flowing through every operation in
      the sample integration, **no** telemetry record contains any canary; `assert_telemetry_safe`
      raises on an out-of-allowlist key; telemetry is **off by default** and opens no socket
      (PRD §8.10 *"SDK telemetry MUST NOT contain research content"*; §22; §41.1; sub-PRD **D7**)
- [ ] `[machine]` **No `/internal/v1`**: no exposed method resolves to an `/internal/v1` path and no
      internal operation model is generated (PRD §8.11; sub-PRD **D8**)
- [ ] `[machine]` **No tenant field, no cookie path**: no `organization_id` parameter exists and no
      `Cookie` header is ever set — source scan (PRD §34.1, §16.1, §38.2)
- [ ] `[machine]` **No credential leaks**: a canary credential appears in no telemetry record, no
      exception message and no `repr()` of the client or its auth object (PRD §22, §21.1)
- [ ] `[machine]` **Parity (sub-PRD D3)**: every entry in `packages/sdk-typescript/parity/surface.json`
      has a Python counterpart and no public method lacks a manifest entry; a missing manifest fails
      loudly rather than skipping (PRD §8.10)
- [ ] `[fixture]` **Sample integration** runs end to end against recorded responses with no network
      and is executed by the suite (`E27` exit evidence, PRD §44.2)
- [ ] `[fixture]` **Fixture drift**: every recorded response still validates against the current
      generated models (PRD §34 preamble)
- [ ] `[machine]` **`uv sync --frozen` then `uv run pytest` green** (standing item for Python,
      PRD §45.3, breakdown plan §1.1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green — unaffected by this tree but
      re-run to prove no regression (standing item, PRD §20.3, §45.3)
- [ ] `[machine]` The ADR `docs/adr/NNNN-python-sdk-codegen.md` exists, states status/owner/date, and
      names the pinned generator and its determinism properties (PRD §45.5; breakdown plan **A9**;
      sub-PRD **Q-PLTF-3**)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT ids (**`DEV-001`**,
      `E27-DEVELOPER`, proposed `UAT-DEV-01` per sub-PRD **Q-PLTF-1**), user-visible change and
      non-goals, schema/API/event compatibility impact (consumer only; fixture-drift test is the
      early warning), tenant/PII/security impact (no tenant field, no cookie path, telemetry
      allowlist, constant-time verification, no credential in any output), source/licence impact
      (generator licence recorded in the ADR), cost/memory/latency impact (client library; retry
      bounds stated), rollback path (revert; nothing consumes it yet), known gaps (**Q-PLTF-2** CI
      wiring)
- [ ] `[human]` Founder review at Gate 2 that the Python and TypeScript SDKs read as one product —
      same concepts, same names, no capability present in one language only (PRD §43.4; sub-PRD
      proposed `UAT-DEV-01`). **Not required to merge**
- No `cargo test --workspace` item — no Rust touched (PRD §45.3)
- No origin-validation criteria — this SDK runs server-side and defines no cross-origin surface;
      exact-origin validation is `PLTF-05`/`PLTF-06` (PRD §8.10)

## Test plan

Reviewer steps, **all offline**: no network, no live API, no running server. Every HTTP interaction
goes through the injected transport (deliverable 4) backed by `tests/fixtures/**`.

1. `uv sync --frozen` at the repository root, on `FND-01`'s pinned Python `3.14.6` (breakdown
   plan §8 **Q12**, CONFIRMED — the same interpreter CI uses); then `uv run pytest sdk/python` (or
   the project's declared invocation, documented in `sdk/python/README.md`).
2. **Read the fixtures against the sources.** Compare each file in `tests/fixtures/http/` with its
   original under `schemas/openapi/examples/**`, and the webhook/SSE fixtures with PRD §34.8/§34.4
   and with `packages/contracts/test/events/fixtures/**`. **A drifted fixture makes every replay
   vacuous** — check this first.
3. **Generation.** Run `uv run aer-sdk-generate` then `uv run aer-sdk-generated-check`;
   `git status --porcelain` must be empty. Run the generator twice and byte-compare. Then hand-edit
   one line under `src/<pkg>/_generated/**`, re-run the check, confirm it fails, restore.
4. **Root delegator.** Run `pnpm generate && pnpm generated:check` and observe whether `sdk/python`
   is included. Record the answer in the PR; it is sub-PRD **Q-PLTF-2**'s evidence either way.
5. **`test_no_document_copy.py`** — assert no OpenAPI copy exists under `sdk/python/`.
6. **`test_idempotency.py`** — force two transport failures then success; capture all three requests;
   assert the `Idempotency-Key` values are **byte-identical**. Confirm the assertion compares the
   captured values rather than merely asserting presence.
7. **`test_retry.py`** — table over the 17 PRD §34.9 codes; `Retry-After: 3` honoured on a fake
   clock; attempt/elapsed bounds; cancellation in both clients.
8. **`test_errors.py`** — one class per catalogue code with exact status and `retryable`; then the
   sub-PRD **D4** case: the `INSUFFICIENT_EVIDENCE` completed-job fixture returns without raising.
9. **`test_webhooks.py`** — the equality test against `FND-05`'s committed hex **first**; confirm it
   asserts the committed value, not `verify(sign(x)) is True` (a self-consistent pair would pass with
   the wrong signing input). Then the four negative cases. Then grep for `==` applied to a signature
   and confirm the static check catches a deliberately reverted one on a scratch branch.
10. **`test_streaming.py`** — full transcript; cut-and-resume transcript asserting `Last-Event-ID: 5`
    and no duplicates; failure transcript asserting `sections` empties and every section carried
    `provisional=True`. Confirm the response is closed in a `finally` by asserting the fake transport
    records a close.
11. **`test_wait_cancel.py`**, **`test_pagination.py`** — deliverables 11 and 12.
12. **`test_telemetry.py`** — enable telemetry with a recording sink; run the sample integration with
    canary strings; assert every canary is absent from every record; then hand
    `assert_telemetry_safe` a record with an extra key and assert it raises; then assert the default
    configuration emits nothing and constructs no transport.
13. **`test_no_internal.py`**, **`test_no_cookie.py`**, **`test_no_tenant_param.py`** — the three
    structural exclusions.
14. **`test_parity.py`** — read `packages/sdk-typescript/parity/surface.json`; assert both
    directions; confirm a missing manifest fails with a named message rather than skipping.
15. **`test_example.py`** — execute `examples/` against the recorded transport; assert completion and
    that stdout contains no credential and no canary.
16. **Read the ADR.** `docs/adr/NNNN-python-sdk-codegen.md` must name the generator, its pinned
    version, the determinism properties `generated:check` relies on, and the exit path if the
    generator is abandoned.
17. **Reviewer focus** (CLAUDE.md: edge cases, concurrency, security-sensitive paths): whether the
    async client can leak a session on cancellation; whether the retry path can regenerate an
    `Idempotency-Key` on any branch (including the `429` and cancellation branches); whether a
    reconnect can replay events already yielded to the consumer; whether `verify_webhook_signature`
    can be called with a `str` body and silently encode it (it must not); whether any exception
    message can carry the secret, the signature or the raw body; whether
    `assert_telemetry_safe` is reachable from every emit site; whether the sync client's timeout and
    the retry elapsed bound can interact to exceed the caller's stated timeout.

## Feedback obligation

**1. General rule.** If implementation falsifies anything in this ticket, update **this ticket file**
first (version note + changelog line in the PR), re-publish with
`.claude/scripts/publish-tickets.mjs --sync`, then change code. Silent divergence is an incomplete
ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The SDK needs an API shape the OpenAPI root does not have.** → **A docs PR against
  `docs/prd/00-foundation/tickets/FND-04-*.md`, never a hand-edited binding and never a divergent
  hand-written client** (PRD §20.1; `FND-04` Feedback obligation item 3: a new ticket in
  `00-foundation` recorded on `docs/prd/breakdown-plan.md`, with this ticket `blocked_by` it). Record
  the gap in `docs/prd/20-developer-platform/README.md` under **Q-PLTF-8**.
- **The chosen generator cannot produce deterministic output**, so `generated:check` is flaky. → That
  falsifies `DEV-001`'s acceptance evidence exactly as `FND-04` friction 4 describes. Fix determinism
  or change generator — and **update `docs/adr/NNNN-python-sdk-codegen.md`'s consequences section
  first**, before touching `src/`. Never loosen the check to a fuzzy comparison.
- **The root `pnpm generated:check` does not reach `sdk/python`.** → sub-PRD **Q-PLTF-2**. Raise one
  docs PR against `docs/prd/00-foundation/tickets/FND-01-*.md` (workspace/scripts) and
  `FND-02-*.md` (the CI gate), record it in `docs/prd/20-developer-platform/README.md`, and ship the
  `uv run` entry points meanwhile. **Never edit `.github/workflows/**` or root manifests from here.**
- **The Python webhook verifier disagrees with `FND-05`'s committed hex.** → Stop. One of the two is
  wrong and it is a **security primitive**. Do not "fix" the Python side to match a locally computed
  value. Raise it against `docs/prd/00-foundation/tickets/FND-05-*.md` (its friction 4 anticipates a
  runtime that cannot produce the signing input) and record it in
  `docs/prd/20-developer-platform/README.md`. Changing the signing input is a breaking change for
  every receiver and requires a new schema version plus a PRD §45.5 architecture decision.
- **A telemetry field that is genuinely useful is outside the allowlist.** → PRD §8.10 is
  unconditional. Update `docs/prd/20-developer-platform/README.md` **D7** with the exact field and
  its justification and escalate as a **product/privacy change** (PRD §45.5, §10.2) before widening
  the allowlist.
- **A capability cannot be expressed idiomatically in both languages** under one parity entry. →
  Amend sub-PRD **D3** in `docs/prd/20-developer-platform/README.md` and both `PLTF-02` and `PLTF-03`
  in one docs PR and `--sync` both. Never let a capability exist in one language only — that
  falsifies PRD §8.10.
- **`schemas/events/**` lacks an event type or SSE payload this SDK must type.** → `FND-05` Feedback
  obligation item 2 is the path: added **there**, with this ticket `blocked_by` the change. Never
  define an event schema inside this package.

**3. Escalation.** *"TypeScript and Python SDKs MUST share an OpenAPI-generated core"* (PRD §8.10)
and `DEV-001`'s evidence *"Generated-client diff is clean in CI"* are release requirements with MUST
force. If no viable Python generator can produce a usable, deterministic core from
`schemas/openapi/openapi.yaml`, that overturns PRD §34's "generated-code source of truth" decision
for half of `DEV-001`. Stop, record it in `docs/adr/NNNN-python-sdk-codegen.md`, write back to
`docs/prd/breakdown-plan.md` §4.1 and `docs/prd/20-developer-platform/README.md`, and escalate to the
human. Never ship a hand-written Python client to work around the document.
