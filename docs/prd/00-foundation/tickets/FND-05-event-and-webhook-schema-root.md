---
id: FND-05
title: Event and webhook schema root
module: 00-foundation
lane: 00-foundation
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [WTCH-05, PLTF-02, PLTF-03]
---

# FND-05 — Event and webhook schema root

Implements PRD §16.1, §34.8 and §8.8, requirement **MON-004** (epic `E02-CONTRACTS`).
No ADR — the decision is already made in PRD §16.1 (*"Webhooks carry their own schema version"*) and
§34.8 (the envelope, headers and signature input); this is build ticket 5 of 10 against it.
Parent sub-PRD: [00-foundation README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](FND-03-canonical-enums-and-opaque-id-conventions.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §34.8 gives the exact headers, signature input and payload; this encodes and enforces them.

## Background + basis

**PRD §34.8, quoted in full** — this is the contract:

> Headers:
>
> ```text
> X-AER-Event-Id: evt_...
> X-AER-Timestamp: 1785726012
> X-AER-Signature: v1=<lowercase hex HMAC-SHA256>
> ```
>
> The signature input is `<timestamp>.<raw_request_body>`. Receivers reject a timestamp older than five
> minutes and deduplicate event IDs.
>
> ```json
> {
>   "schema_version": "1.0",
>   "id": "evt_...",
>   "type": "alert.created",
>   "created_at": "2026-08-03T03:00:12Z",
>   "sandbox": false,
>   "data": {
>     "alert_id": "alt_...",
>     "watchlist_id": "wat_...",
>     "change_type": "COMMENCEMENT",
>     "effective_date": "2026-09-01",
>     "affected_research_record_ids": ["rec_..."]
>   }
> }
> ```
>
> Full questions, facts, answers and source excerpts are excluded by default.

**PRD §8.8**: *"Webhook delivery MUST use HMAC-SHA256 signatures, timestamps, idempotent event IDs,
secret rotation and bounded exponential retry. Payloads MUST avoid complete customer questions/answers
by default."* And on change structure: *"Changes MUST be structured as amendment, commencement, rate,
replacement, appeal, guidance, source-removal or freshness events—not raw HTML diffs."*

**PRD §16.1**: *"Webhooks carry their own schema version."* — the webhook envelope versions independently
of `/v1`, which is why this is a separate root from `FND-04`'s.
**PRD §16.2**: *"Webhook headers MUST include event ID, timestamp and HMAC signature."*

**Requirement MON-004** (PRD §30.2): *"Email/webhook delivery is retryable and idempotent | Monitor
settings | webhook endpoints | App | **Signature/replay/retry/dead-letter tests pass**"*. The signature
and replay halves are provable here, against fixtures; retry and dead-letter are runtime behaviour owned
by `16-monitor-alerts`/`WTCH-05`, which is `blocked_by` this ticket.

**PRD §41.2 `UAT-MON-02`**: *"Replay signed webhook → Receiver/test verifier rejects replay but original
delivery remains successful."* The **verifier** this ticket ships is what that script exercises; the
end-to-end run belongs to `16-monitor-alerts` and `23-assurance`.

**PRD §34.4, the SSE contract** — in scope here per sub-PRD decision **D8** (breakdown plan §5.1 gives
`FND-05` the whole `schemas/events/**` tree with no carve-out, and no other module may write it):

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

PRD §16.2 adds: SSE events *"MUST NOT contain hidden reasoning or raw provider payloads."*

**PRD §20.1**: *"Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited."*
**PRD §22** (observability): logs *"MUST exclude research/evidence content, PII text, credentials,
assertions and provider payloads"* — the same content boundary this ticket makes structural for events.
**PRD §37.5** (model and rendering boundary) and **§10.2** (customer content) are the reasons the payload
denylist below is a schema rule and not a code review item.

**Accepted caveats carried forward:**

- Delivery — retry schedule, dead-letter queue, secret rotation storage, subscription endpoints — is
  `16-monitor-alerts`/`WTCH-05` (`apps/api/src/routes/webhook-subscriptions/**`,
  `apps/worker/src/handlers/notifications/webhook/**`). This ticket ships the *contract and the
  verifier*, which is what the SDKs (`PLTF-02`, `PLTF-03`) embed.
- Only one event type is fully specified in the PRD (`alert.created`, §34.8). Additional types are added
  by their owning module through a writeback here — see Feedback obligation 2.
- `packages/contracts/package.json` is append-only shared within this module (sub-PRD D16).

## Goal

Produce a versioned event schema root at `schemas/events/**` covering both transports — signed webhook
envelopes (PRD §34.8/§8.8) and SSE event payloads (PRD §34.4) — plus TypeScript bindings and an
HMAC-SHA256 sign/verify helper under `packages/contracts/src/events/**` that the worker and both SDKs
use unchanged. Completion is mechanically checkable: the PRD §34.8 example event and headers replay
against the verifier with a fixed secret, a tampered or replayed delivery is rejected, no event schema
can carry customer research content, and generated event bindings are clean under `pnpm generated:check`.

## Non-goals

- **No delivery mechanics** — retry, backoff, dead-letter, subscription CRUD, secret storage and
  rotation are `16-monitor-alerts`/`WTCH-05`. PRD §8.8's "bounded exponential retry" is named there.
- **No SSE transport, replay buffer or `Last-Event-ID` handling** — `03-app-runtime`/`RUNT-03` owns
  `apps/api/src/sse/**`. This ticket owns the payload schemas only.
- **No `/v1` REST contract** — `FND-04` owns `schemas/openapi/**`; PRD §16.1 keeps the two versioned
  separately.
- **No enum member definitions** — `FND-03` owns `ChangeType`, `SseEventType` and the id prefixes
  (`evt_`, `alt_`, `wat_`, `rec_`, `job_`).
- **No email or in-app channel** — PRD §8.8's other two channels are `16-monitor-alerts`
  (`WTCH-04` email, `WTCH-06` digest per breakdown plan §5.16). The transactional email provider is not
  an open choice: breakdown plan §8 **Q14 (CONFIRMED)** selects **Resend** on its free transactional
  tier, behind the existing `EmailTransport` port, owned end to end by `16-monitor-alerts`/`WTCH-04`
  and `WTCH-09`. None of that reaches `schemas/events/**` — this ticket must add no email-shaped schema,
  field, transport or adapter, and the webhook/SSE contract is unaffected by which provider sends mail.
- **No alert content, change matching or fan-out logic** — `16-monitor-alerts` (`WTCH-02`, `WTCH-03`).
- **No signing keys or secrets in the repository** — PRD §20.2. The helper takes a secret as an
  argument; it never reads one from the environment or a file.

## File-scope (write-owns)

Owned by this ticket:

- `schemas/events/**` — webhook and SSE schemas, the type registry and the version directories.
- `packages/contracts/src/events/**` — bindings, sign/verify helper, generated output under
  `packages/contracts/src/events/generated/**` (sub-PRD D9 keeps this disjoint from `FND-04`'s
  `packages/contracts/src/generated/**`).
- `packages/contracts/test/events/**` (sub-PRD D14).
- `packages/contracts/package.json` — **append-only**, own entries only (sub-PRD D16).

Does not touch:

- `packages/contracts/src/{enums,ids}/**` — `FND-03` (merged before this starts; this ticket reads it).
- `packages/contracts/src/{openapi,generated}/**`, `schemas/openapi/**` — `FND-04` (same wave, disjoint
  subtree; note the deliberate `events/generated` vs `generated` split).
- `packages/domain/**` — `FND-06` … `FND-10` (same wave, different package).
- `apps/api/src/sse/**` — `RUNT-03`; `apps/api/src/routes/webhook-subscriptions/**` and
  `apps/worker/src/handlers/notifications/**` — `WTCH-05`; `packages/sdk-typescript/**` and
  `sdk/python/**` — `PLTF-02`/`PLTF-03`.
- Root manifests, lockfiles, `README.md`, `tools/**` — `FND-01`. `.github/workflows/**` — `FND-02`.

**Serial-safety analysis.** First decomposition; nothing merged, nothing in flight. This is one of seven
wave-3 siblings, all `blocked_by FND-03`, with pairwise-disjoint subtrees (see `FND-04`'s analysis).
`schemas/events/**` is written by no other ticket in the 236-ticket plan (breakdown plan §4.1 assigns
the "Event/webhook schema root" serial-owner row to `FND-05`). The only shared file in the batch is
`packages/contracts/package.json`, append-only per breakdown plan §1.1.

## Deliverables

1. **Directory shape**, versioned per PRD §16.1 ("Webhooks carry their own schema version"):
   - `schemas/events/webhook/v1/envelope.json` — the §34.8 envelope: required `schema_version`, `id`
     (`evt_` prefixed, PRD §34.1), `type`, `created_at` (ISO 8601 UTC), `sandbox` (boolean), `data`.
   - `schemas/events/webhook/v1/<type>.json` — one schema per event type, starting with `alert.created`
     exactly as PRD §34.8 specifies (`alert_id`, `watchlist_id`, `change_type`, `effective_date`,
     `affected_research_record_ids`).
   - `schemas/events/sse/v1/<event>.json` — one per PRD §34.4 allowed public event type
     (`job.started`, `stage.changed`, `clarification.required`, `answer.section`, `citation.added`,
     `job.completed`, `job.failed`, `job.cancelled`, `heartbeat`), each carrying `schema_version`,
     `job_id` and `occurred_at` as the §34.4 examples show.
   - `schemas/events/registry.json` — type → current version → schema path, for both transports. A
     schema file not in the registry, or a registry entry with no file, fails a test.
   All schemas are JSON Schema 2020-12 with `additionalProperties: false`.
2. **Payload minimisation, made structural** (PRD §34.8 *"Full questions, facts, answers and source
   excerpts are excluded by default"*; §8.8; §22): a denylist test asserts no event schema declares a
   property whose name matches `question`, `facts`, `answer`, `short_answer`, `claim_text`, `quote`,
   `snippet`, `excerpt`, `content`, `prompt`, `reasoning`, `provider_payload`, or `text`. Events carry
   **identifiers and structured metadata only**.
3. **`packages/contracts/src/events/sign.ts`**:
   - `signWebhook({ secret, timestampSeconds, rawBody }): string` returning `v1=<lowercase hex>` where
     the HMAC-SHA256 input is exactly `${timestampSeconds}.${rawBody}` (PRD §34.8). `rawBody` is the
     **raw bytes as sent**, never a re-serialised object — re-serialisation is the classic signature
     break and must be documented at the call site.
   - `verifyWebhook({ secret, header, rawBody, nowSeconds, toleranceSeconds = 300 }): VerifyResult`
     returning a discriminated result with reasons `OK`, `MALFORMED_HEADER`, `TIMESTAMP_OUT_OF_WINDOW`,
     `SIGNATURE_MISMATCH`. Comparison uses a constant-time comparator (`crypto.timingSafeEqual` or
     equivalent) on equal-length buffers; `===` on the signature is forbidden. No secret, no signature
     and no body content appears in any returned message (PRD §22).
   - Secret rotation support: `verifyWebhook` accepts an ordered list of secrets and returns which one
     matched, so `WTCH-05` can implement PRD §8.8's rotation with an overlap window without changing
     this contract.
   - Idempotency: `isDuplicateEventId` is **not** implemented here (it needs storage); the helper
     returns the parsed `X-AER-Event-Id` so the caller can deduplicate, and the doc comment names
     PRD §34.8's requirement and `WTCH-05` as its owner.
4. **Generated TypeScript types** from the JSON Schemas into
   `packages/contracts/src/events/generated/**`, each file carrying
   `// GENERATED FROM schemas/events/** — DO NOT EDIT (PRD §20.1)`, wired into the package's `generate`
   and `generated:check` scripts (appended to `packages/contracts/package.json`, reachable from the
   root delegators `FND-01` created).
5. **Versioning rule, encoded**: adding an event type or an optional property is additive within `v1`;
   removing a property, renaming one or changing a meaning requires a new version directory
   (`schemas/events/webhook/v2/…`) and a `schema_version` bump. A test compares against a committed
   baseline and fails on a non-additive change (PRD §16.1).
6. **Fixtures** `packages/contracts/test/events/fixtures/`:
   - `alert-created.prd-34-8.json` — the PRD §34.8 body verbatim;
   - `alert-created.headers.txt` — the three PRD §34.8 headers verbatim;
   - `sse-stage-changed.prd-34-4.txt` and `sse-job-completed.prd-34-4.txt` — the §34.4 event frames
     verbatim;
   - a fixed test secret (a literal in the fixture file, never an environment variable) and the
     expected signature computed from it.

## Acceptance checklist (classified)

- [ ] `[fixture]` PRD §34.8 replay: the committed body + fixed secret + committed timestamp produce
      exactly the committed `v1=<hex>` signature, and `verifyWebhook` returns `OK` (PRD §34.8, MON-004).
- [ ] `[fixture]` Tamper replay: flipping one byte of the fixture body yields `SIGNATURE_MISMATCH`;
      changing the timestamp without re-signing yields `SIGNATURE_MISMATCH`; an unchanged delivery
      re-presented with a timestamp 301 seconds old yields `TIMESTAMP_OUT_OF_WINDOW`
      (PRD §34.8 "reject a timestamp older than five minutes"; `UAT-MON-02`'s replay half).
- [ ] `[fixture]` The §34.8 body validates against `schemas/events/webhook/v1/alert.created.json` with
      no property added, renamed or dropped; the §34.4 frames validate against their SSE schemas
      (PRD §34.4, §34.8).
- [ ] `[machine]` Signature input is `<timestamp>.<raw_body>`: a test signs a body containing a
      character whose JSON re-serialisation would differ (e.g. non-ASCII, or key order changed) and
      proves verification uses the raw bytes, not a re-encoded object (PRD §34.8).
- [ ] `[machine]` Constant-time comparison: the implementation uses a timing-safe comparator; a static
      check asserts no `===`/`==` comparison is applied to the signature value, and a unit test proves
      an equal-length wrong signature is rejected (PRD §21.1 security controls).
- [ ] `[machine]` Content denylist: no schema under `schemas/events/**` declares any denylisted property
      name (deliverable 2) — PRD §34.8, §8.8, §22.
- [ ] `[machine]` Every SSE event type in PRD §34.4's allowed list has exactly one schema, and no schema
      exists for a type outside that list (PRD §34.4).
- [ ] `[machine]` Every schema is valid JSON Schema 2020-12 with `additionalProperties: false`, and the
      registry and the file tree agree in both directions (deliverable 1).
- [ ] `[machine]` Every envelope requires `schema_version`; a payload missing it fails validation
      (PRD §16.1 "Webhooks carry their own schema version").
- [ ] `[machine]` Event ids validate as `evt_`-prefixed UUIDv7 via `FND-03`'s `isId` (PRD §34.1, §34.8).
- [ ] `[machine]` Non-additive change detection, negative test: removing a property from an existing
      `v1` schema fails the baseline test; adding an optional property passes (PRD §16.1).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` leaves no diff for
      `packages/contracts/src/events/generated/**`; a hand-edit is detected (PRD §20.1).
- [ ] `[machine]` No secret is read from the environment, a file or the network by the helper — asserted
      by inspecting its imports and signature (PRD §20.2).
- [ ] `[machine]` No email transport, provider client or delivery code appears anywhere in this ticket's
      file-scope — the Q14 provider (Resend) is `WTCH-04`/`WTCH-09`'s, behind the `EmailTransport` port
      (breakdown plan §8 Q14; §5.16).
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. The Python webhook verifier is `PLTF-03`, built against these schemas.
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**MON-004**, `UAT-MON-02` partial,
      `E02-CONTRACTS`), user-visible change and non-goals, schema/API/event compatibility impact
      (initial `v1` publication; baseline in the same commit), **tenant/PII/security impact** (payload
      denylist keeps customer research content out of webhooks — PRD §34.8/§8.8; constant-time
      verification; no secret storage), source/licence impact (none), cost/memory/latency impact (none),
      rollback path (revert; nothing delivers yet), known gaps (retry/dead-letter/rotation storage owned
      by `WTCH-05`; only `alert.created` fully specified by the PRD).

Absent classes: no `[human]` criteria — signature, replay and payload-content behaviour are fully
machine- and fixture-checkable here. `UAT-MON-02`'s end-to-end run (a real delivery plus a replay) is
`16-monitor-alerts`/`23-assurance`, not this ticket.

## Test plan

Reviewer steps, all offline and deterministic (fixed secret, fixed timestamp, injected clock):

1. **Read the fixtures against the PRD.** Compare
   `packages/contracts/test/events/fixtures/alert-created.prd-34-8.json` and `.headers.txt` with
   `docs/PRD.md` §34.8, and the SSE frames with §34.4. Any drift makes the replay vacuous.
2. **Run the suite.** `pnpm --filter @<scope>/contracts test`. Confirm the signature test asserts the
   **committed expected hex**, not merely `verify(sign(x)) === true` — a self-consistent pair would pass
   even with the wrong signing input.
3. **Tamper matrix.** Confirm three separate cases exist: altered body, altered timestamp, stale
   timestamp (301 s). Run them.
4. **Raw-body proof.** Inspect the raw-bytes test: it must sign a body whose re-serialisation differs
   (reordered keys or a non-ASCII character) and verify against the original bytes.
5. **Constant-time check.** Read `sign.ts`; confirm `crypto.timingSafeEqual` (or equivalent) on
   equal-length buffers, with an explicit length guard before it. Confirm the static `===` check exists
   and fails when reverted on a scratch branch.
6. **Denylist negative test.** Add a `question` property to `alert.created.json` on a scratch branch;
   assert the denylist test fails naming the property; discard.
7. **SSE completeness.** Assert the nine PRD §34.4 types each have a schema and no tenth exists.
8. **Generated check.** `pnpm generate && pnpm generated:check`; then hand-edit a generated file and
   confirm it fails; restore.
9. **Append-only manifest.** `git diff packages/contracts/package.json` shows additions only.

Harness: the framework `FND-01` registered; JSON Schema validator and code generator declared in
`packages/contracts/package.json`. Fixtures are the four files in deliverable 6. No network, no live
webhook endpoint.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update this ticket and
`docs/prd/00-foundation/README.md` (version +0.1, changelog line) **before** changing schemas or the
helper; re-publish with `publish-tickets.mjs --sync`. Silent divergence = incomplete.

**Foreseeable frictions, each with its writeback target:**

1. **`RUNT-03` needs SSE payload shapes that differ from these schemas, or wants to own them.** →
   Sub-PRD decision **D8** and open question **Q-F2** are the record. Update
   **`docs/prd/00-foundation/README.md` D8/Q-F2** and, if the ownership genuinely moves, raise it on
   **`docs/prd/breakdown-plan.md` §5.1** — `apps/api/src/sse/**` may not become a second home for
   contract schemas without that plan change.
2. **A new webhook event type is needed** (`alert.updated`, `export.completed`, `correction.published`,
   …). PRD §34.8 specifies only `alert.created`. → Add the type **here**, in this ticket's deliverable 1
   and registry, with the requesting module `blocked_by` the change; record it in
   `docs/prd/00-foundation/README.md`. The requesting module must not define an event schema inside its
   own tree — `schemas/events/**` is serial-owned (PRD §44.3, breakdown plan §4.1).
3. **A useful payload field is on the denylist** (for example a truncated change summary that reads like
   content). → PRD §34.8 and §8.8 are explicit that customer questions/answers/excerpts are excluded by
   default. Update **`docs/prd/00-foundation/README.md`** with the exact field and its justification and
   escalate as a **product/privacy change** (PRD §45.5, §10.2) before relaxing the denylist. The
   denylist is a privacy boundary, not a lint rule.
4. **HMAC-SHA256 with `<timestamp>.<raw_body>` cannot be produced by a target SDK runtime** (e.g. a
   browser or a Python framework that does not expose the raw body). → Record the constraint in
   `docs/prd/00-foundation/README.md` and coordinate with `PLTF-02`/`PLTF-03` through a writeback here.
   Changing the signing input is a breaking change for every receiver — it requires a new schema
   version and a PRD §45.5 architecture decision (`docs/adr/NNNN-webhook-signing.md`), never a quiet
   swap.
5. **Secret rotation needs more than an ordered secret list** (e.g. key ids in the header). → That
   changes the §34.8 header set. Update this ticket **and** raise a PRD change per §45.5 before
   emitting a new header; `WTCH-05` must not invent one.
6. **`WTCH-04`/`WTCH-09` need an event-schema change to deliver alerts by email** (for example an
   identifier the Resend adapter cannot resolve). → Add the field **here**, under deliverable 2's
   denylist rules, with `16-monitor-alerts` `blocked_by` the change; never let a delivery adapter
   define its own payload shape, and never let email delivery become a reason to put customer content
   in an event (PRD §34.8; breakdown plan §8 Q14 keeps customer questions, answers, evidence excerpts
   and Research Record content out of transactional email too).

**Escalation.** If PRD §34.8's envelope or signature scheme proves unimplementable, that overturns
MON-004's acceptance evidence and every receiver's integration contract. Stop, raise an ADR under
`docs/adr/`, write back to `docs/prd/breakdown-plan.md` §4.1, and escalate to the human. Never ship a
second, divergent signing scheme alongside the specified one.
