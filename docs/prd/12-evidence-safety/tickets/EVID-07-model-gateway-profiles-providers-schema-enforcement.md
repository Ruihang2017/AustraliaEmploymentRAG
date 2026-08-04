---
id: EVID-07
title: "Model gateway: profiles, providers, schema enforcement"
module: 12-evidence-safety
lane: 12-evidence-safety
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03, DATA-02]
blocks: [EVID-08, ASK-02, GOLD-15]
---

# EVID-07 — Model gateway: profiles, providers, schema enforcement

Implements PRD §14.4, §17.3, §36.5, §37.5 and §21.1 — requirement **ANS-007** (contributes to
**ANS-004**, **SEC-003**); epic `E20-MODEL-GATEWAY`.
No ADR — the decision is already made in PRD §14.4 (the six profiles and the promotion requirement),
PRD §17.3 (the local/hosted split and *"No unvalidated fallback"*) and PRD §37.5 (the gateway's
no-tool boundary); this is build ticket 7 of 10 against it.
Parent sub-PRD: [12-evidence-safety README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [FND-03 — Canonical enums and opaque ID conventions](../../00-foundation/tickets/FND-03-canonical-enums-and-opaque-id-conventions.md), [DATA-02 — TenantContext repository layer](../../01-app-data/tickets/DATA-02-tenantcontext-repository-layer-unscoped-import-architecture-test.md) (mirrors `blocked_by`)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract —
PRD §14.4 lists the profiles and PRD §37.5 states the boundary; this makes them a callable gateway with
no tool surface.

## Background + basis

**PRD §37.5 model and rendering boundary, quoted verbatim** — the boundary this package *is*:

> **The model gateway exposes no shell, Web, database, email, webhook or arbitrary tool. It receives
> only sanitized task facts and selected evidence. Returned JSON is schema-validated;** all links and
> source metadata are constructed from system records. Markdown is rendered through an allowlist and
> HTML is sanitised. **Generated text never directly triggers an email, webhook, corpus promotion,
> record transition, credential use or external action.**

**PRD §14.4 model-profile promotion, quoted verbatim:**

> Profiles:
>
> - `QUERY_EMBEDDING`
> - `LOCAL_RERANK`
> - `QUICK_SYNTHESIS`
> - `DEEP_SYNTHESIS`
> - `STRUCTURED_REPAIR`
> - `EVALUATION_JUDGE`
>
> A candidate MUST pass security/cost compatibility, development, frozen validation, blind testing and
> full non-regression before promotion. **Every fallback requires independent approval.** …
>
> **Exact models, tokenizer settings, hot vector count, release-size/concurrency limits and provider
> token/time ceilings are benchmark-selected configuration—not permanent requirements.**

**PRD §17.3 local/hosted split, quoted verbatim:**

> - Offline/local: document embeddings, bulk evaluation and large rebuilds.
> - **Online local: query embedding, identifier/date/jurisdiction classification, PII pre-screening and
>   small-set reranking.**
> - Hosted validated model: Quick legal synthesis.
> - Hosted stronger validated model: Deep synthesis and complex conflict coordination.
> - Hosted reranker: only for approved complex paths when local ranking is insufficient.
>
> **No unvalidated fallback is permitted during provider failure or budget exhaustion.**

**PRD §36.5** fixes the output schema (the seven claim kinds and the object shape); **PRD §36.7** fixes
the call budget — Quick: *"1 + optional repair"*, Deep: *"Up to 3 total + optional repair"*, with hard
elapsed limits of 60 s and 180 s. **PRD §9.4:** *"Hidden chain-of-thought MUST NOT be requested, stored
or displayed."*

**PRD §10.2 customer-content use:** *"Provider configurations MUST use no-training and zero or approved
minimal retention."* **PRD §37.3:** *"Provider raw payload | Not in ordinary product DB/log | … |
Never | Never."* **PRD §35.6** gives the one row this gateway writes: `model_execution` — *"`id`,
`job_id`, `profile`, actual provider/model/version, input/output token counts, latency,
cost_micro_aud, schema status, retention mode | **raw prompt/response excluded from ordinary
logs/support**"*.

**PRD §42.5 scoped kill switches**, the row that binds here: *"Model profile/provider → New affected
generation returns unavailable | Cancel safely at stage boundary; settle actual cost only"*.

**Requirements.** `ANS-007` (PRD §30.2): *"Budget/provider/source failure never selects an unvalidated
model | Job/result | model gateway | App | **Failure matrix produces explicit unavailable/status
response**"*. `ANS-004`: *"Snapshot contains release, profile and **actual model version**"*.
`UAT-ANS-08`: *"Hosted budget hits hard stop → Search remains available; Answer reports explicit
generation unavailability."*

**Why `DATA-02` is a blocker.** The gateway writes `model_execution` rows. PRD §21.2 requires all tenant
access to be `TenantContext`-scoped and `SEC-001`'s evidence is a static test forbidding an unscoped
repository import; PRD §45.2 forbids `apps/worker` (and by the same rule this package) to hold
*"Direct unscoped tenant SQL"*. The gateway therefore persists **through** `DATA-02`'s repository
interface and never opens a connection.

**Sub-PRD decisions carried forward:** **D13** (no tool surface, enforced by an architecture test),
**D14** (no chain-of-thought type exists), **D15** (every provider call is replayable offline),
**D16** (no unvalidated fallback), **D17** (a hosted call is impossible without a held reservation —
the token type is introduced here and minted by `EVID-08`).

**Accepted caveats carried forward:**

- **The exact model per profile is benchmark-selected** — breakdown plan §8 **Q1**, resolved by
  `GOLD-15` (which is `blocked_by` this ticket) by comparing accuracy, zero-tolerance failures,
  latency, provider availability and cost through the evaluation pipeline. `GOLD-15` records the
  promotion report; the Founder approves production promotion **after** seeing it and does not pick a
  model on preference beforehand (PRD §14.4). This ticket builds against the profile abstraction and
  ships a **deterministic stub provider**, so nothing here waits on a model decision.
- **Which providers meet PRD §10.2's no-training/minimal-retention terms is a Founder decision** —
  sub-PRD **Q-EVID-4**. This ticket encodes the requirement as a per-profile precondition that an
  unconfigured provider fails; it does not choose a vendor.
- **`QUERY_EMBEDDING` and `LOCAL_RERANK` are local** (PRD §17.3) and execute inside the search boundary
  (`11-retrieval-engine`/`RETR-07`). They appear in the registry because PRD §14.4's promotion process
  covers all six, but calling them through this gateway is a typed error.
- **Budget arithmetic and the circuit breaker are `EVID-08`.** This ticket defines the
  `HeldReservation` token and refuses to call without one; `EVID-08` mints it.

## Goal

Produce `packages/model-gateway/src/{profiles,providers,schema}/**`: the six PRD §14.4 profiles as
versioned frozen data with promotion state and per-profile ceilings; a provider adapter interface with
an allowlisted base URL, a recorded-cassette transport and a deterministic stub; strict PRD §36.5
request/response schema enforcement that rejects any reasoning field; explicit unavailability with no
fallback; and `model_execution` metadata recorded through `DATA-02`'s TenantContext repository with no
raw payload. Completion is mechanically checkable: an architecture test proves the package has no
shell/web/database/email/webhook/tool surface, the whole suite runs with **no network and no provider
key**, and the failure matrix produces an explicit unavailable response in every cell.

## Non-goals

- **No budget reservation, settlement, circuit breaker or ledger** — `EVID-08`
  (`packages/model-gateway/src/budget/**`, `blocked_by` this ticket). This ticket defines the
  `HeldReservation` token type and requires it; it never mints one.
- **No BYOK credential storage, decryption or funding routing** — `EVID-09`
  (`packages/model-gateway/src/byok/**`).
- **No evidence pack, validator, licence limits or rendering** — `EVID-04`, `EVID-05`, `EVID-06`,
  `EVID-10` (`packages/citations/**`). The gateway carries a pack; it never builds or validates one.
- **No PII detection** — `EVID-01`…`EVID-03`. Facts arrive sanitized (PRD §18.5 step 1); this ticket
  asserts it.
- **No local query embedding or rerank runtime** — `11-retrieval-engine` (`RETR-07`), inside the search
  boundary per PRD §17.3. That runtime is settled, not open: breakdown plan §8 **Q11** confirms
  Microsoft ONNX Runtime, CPU-only, through an exactly pinned `ort` crate, and `RETR-07` implements it.
  This package is the **hosted-provider** boundary only — it loads no local model, holds no ONNX or
  tokenizer artefact, and never becomes a second execution path for a local profile (deliverable 1).
- **No workflow orchestration, retry policy, cancellation, SSE, Quick/Deep stage sequencing** —
  `15-answer-product` (`ASK-02`, `ASK-05`, `ASK-10`). This ticket enforces the §36.7 *ceilings*; the
  workflow decides the *sequence*.
- **No table, migration or repository implementation** — `01-app-data` (`DATA-05` owns
  `model_execution`'s schema; `DATA-02` owns the TenantContext layer).
- **No model selection, promotion decision, evaluation or non-regression report** —
  `21-evaluation-600` (`GOLD-15`, `blocked_by` this ticket), which measures the candidates and records
  the promotion report the **Founder** approves production promotion against (PRD §14.4).
- **No cost console or kill-switch UI** — `22-internal-admin` (`INTL-07`, `INTL-09`). Kill-switch state
  is an input here.

## File-scope (write-owns)

Owned by this ticket:

- `packages/model-gateway/src/profiles/**`
- `packages/model-gateway/src/providers/**`
- `packages/model-gateway/src/schema/**`
- `packages/model-gateway/test/{profiles,providers,schema}/**` (sub-PRD **D21**)
- `packages/model-gateway/package.json`, `packages/model-gateway/tsconfig.json`,
  `packages/model-gateway/src/index.ts` — **append-only**, own entries only

Does not touch:

- `packages/model-gateway/src/budget/**` — `EVID-08`; `src/byok/**` — `EVID-09`.
- `packages/pii/**` — `EVID-01`…`EVID-03`; `packages/citations/**` — `EVID-04`…`EVID-06`, `EVID-10`.
- `packages/contracts/**`, `packages/domain/**`, `schemas/**` — `00-foundation` (PRD §44.3
  serial-owned); consumed, never written. `packages/database/**` — `01-app-data`; this ticket
  **consumes** `DATA-02`'s repository interface and writes no schema, migration or SQL.
  `packages/retrieval-client/**`, `services/search-rs/**` — `11-retrieval-engine`.
  `packages/observability/**` — `03-app-runtime`.
- `apps/**`, `pipelines/**`, `infra/**`, `tests/**`, `evals/**`, `docs/adr/**` — other modules per
  breakdown plan §4 and A9. `docs/PRD.md` — frozen.
- Root manifests and lockfiles — `FND-01`; a provider SDK dependency regenerates `pnpm-lock.yaml` as a
  build artifact, never a hand-merge.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header). `packages/model-gateway/src/{profiles,providers,schema}/**` is written by no other
ticket in the plan (plan §5.13). This is one of three wave-1 tickets in the module; its concurrent
siblings are `EVID-01` (`packages/pii/**`) and `EVID-04` (`packages/citations/**`) — different packages,
disjoint trees, no shared file and no import edge. `EVID-08` and `EVID-09` are downstream of this ticket
and never concurrent with it. Both declared blockers land first: `FND-03` (`00-foundation` wave 2) and
`DATA-02` (`01-app-data` wave 2). Shared append-only files: this package's manifest, `tsconfig.json` and
`src/index.ts`.

## Deliverables

1. **`src/profiles/registry.ts` — the six PRD §14.4 profiles as versioned frozen data**
   (`MODEL_PROFILE_REGISTRY_V1`). Each entry carries: `id` (the §14.4 name), `execution`
   (`HOSTED` | `LOCAL_IN_SEARCH_BOUNDARY`), `promotionState` (`CANDIDATE` | `APPROVED`), allowed
   provider ids, `maxInputTokens`, `maxOutputTokens`, `maxElapsedMs`, determinism settings, the required
   retention posture (`noTraining: true`, `retention: 'ZERO' | 'APPROVED_MINIMAL'`), and the
   `approvedFallbackProfileId?` — **absent by default**, because PRD §14.4 requires *"Every fallback
   requires independent approval"*. `QUERY_EMBEDDING` and `LOCAL_RERANK` are `LOCAL_IN_SEARCH_BOUNDARY`;
   invoking them through this gateway is a typed error naming `RETR-07` (PRD §17.3).
2. **Only `APPROVED` profiles serve production.** `resolveProfile(id, environment)` refuses a
   `CANDIDATE` profile outside the evaluation environment, and the refusal is a typed
   `ProfileNotApprovedError`, never a substitution. Basis: PRD §14.4 (*"A candidate MUST pass
   security/cost compatibility, development, frozen validation, blind testing and full non-regression
   before promotion"*); `ANS-007`.
3. **Per-profile ceilings enforced in code.** The §36.7 limits are enforced here as hard ceilings on a
   single call — maximum input/output tokens and maximum elapsed time — and a profile whose configured
   values exceed the registry ceiling is **rejected at load**, not clamped at call time. The *number of
   calls* per workflow (Quick 1 + repair; Deep ≤ 3 + repair) is `ASK-02`/`ASK-10`'s, but this ticket
   exposes `PROFILE_CALL_CEILINGS` so the two cannot disagree. Basis: PRD §36.7, §14.4 (*"provider
   token/time ceilings"*).
4. **`src/providers/adapter.ts` — the provider adapter interface**:
   `generate(profile, request, reservation, transport): Promise<ProviderResult>`. The signature makes
   three things structural:
   - `reservation: HeldReservation` — an opaque branded token this package **declares** and only
     `EVID-08` can mint; without one there is no call (sub-PRD **D17**, PRD §42.6);
   - `transport` — injected, so the recorded-cassette transport is the default in tests and no adapter
     constructs its own HTTP client;
   - the request type carries **only** the `EvidencePack`, the sanitized task facts, the profile id and
     the request/job ids — no tenant object, no credential, no tool list, no URL, no shell command
     (PRD §37.5).
5. **Allowlisted base URLs only.** Each provider id maps to a frozen base-URL allowlist; a request to
   any other origin throws at construction. There is **no** configuration key for an arbitrary base URL
   in this package — PRD §16.4: *"Arbitrary base URLs are prohibited."* Basis: PRD §16.4, §37.5, §21.1.
6. **`src/providers/transport/**` — the recorded-cassette transport** (sub-PRD **D15**). A cassette is a
   committed JSON file of `{ request fingerprint, status, headers subset, body }`; the default transport
   in tests replays cassettes and **fails loudly on a cache miss** rather than falling through to the
   network. A `record` mode exists, is off by default, requires an explicit environment flag plus a real
   key, and is **never** exercised in CI. A test asserts that with the network globally stubbed to
   throw, the entire suite still passes. Basis: PRD §20.2 (*"Coding agents MUST NOT receive production …
   provider credentials by default"*), §20.3.
7. **`src/providers/stub/**` — a deterministic stub provider** implementing every profile: given a pack
   and facts it returns a valid §36.5 object whose claims cite real `evidence_id`s from the pack, plus
   switchable failure modes (schema-invalid output, fabricated `evidence_id`, invented URL, embedded
   HTML, prohibited-certainty phrase, timeout, 429, 500, truncated JSON, empty body). Exported from a
   `./testing` subpath so `EVID-05`, `ASK-02`, `GOLD-15` and `ASSR-04` share one stub instead of
   inventing divergent ones. Basis: breakdown plan §8 **Q1** (*"`EVID-07` continues to build against
   provider/profile abstractions and stubs"*).
8. **`src/schema/request.ts` — what may be sent.** The outbound payload is assembled here from exactly
   two inputs (PRD §37.5: *"only sanitized task facts and selected evidence"*): the `EvidencePack`
   (already delimited by `EVID-04`) and the sanitized facts. The instruction text lives here as versioned
   frozen data (`INSTRUCTION_TEMPLATE_V1`) with a `version` recorded on every `model_execution`, and it
   **never** interpolates unescaped customer or source text — the pack is inserted as the delimited block
   `EVID-04` produced. The request contains **no** tool definition, no function schema with a side
   effect, no URL, no credential and no reasoning request. A type-level test asserts the absent members.
9. **`src/schema/response.ts` — strict PRD §36.5 validation.** The response is parsed against the §36.5
   object shape with **unknown properties rejected**; specifically, a `reasoning`, `thinking`,
   `chain_of_thought`, `scratchpad`, `analysis` or equivalent field is a **schema failure**, not a
   dropped extra (sub-PRD **D14**, PRD §9.4). A schema failure returns
   `GatewayResult.SchemaInvalid` with the failing path — there is no free-text salvage path, no "retry
   with a nudge" and no partial acceptance. `EVID-05` re-validates independently; this is the gateway's
   own gate, not a substitute. Basis: PRD §37.5 (*"Returned JSON is schema-validated"*), §36.5, §9.4.
10. **`src/providers/failure.ts` — the explicit failure matrix** (`ANS-007`'s named evidence). Every
    cell returns a typed unavailability with a distinct `reason`, and **none** substitutes a model:

    | Condition | Result |
    |---|---|
    | Provider connection/5xx/timeout | `Unavailable{reason: 'PROVIDER_FAILURE'}` |
    | Provider 429 | `Unavailable{reason: 'PROVIDER_RATE_LIMITED'}` (honours `Retry-After`, no substitution) |
    | Schema-invalid response | `Unavailable{reason: 'SCHEMA_INVALID'}` |
    | Elapsed ceiling exceeded | `Unavailable{reason: 'PROFILE_TIMEOUT'}` |
    | Profile not `APPROVED` | `Unavailable{reason: 'PROFILE_NOT_APPROVED'}` |
    | Kill switch on profile/provider | `Unavailable{reason: 'KILL_SWITCH'}` |
    | Missing/expired `HeldReservation` | `Unavailable{reason: 'NO_RESERVATION'}` |
    | Local profile invoked through the gateway | typed error naming `RETR-07` |

    All map to the customer-facing `GENERATION_UNAVAILABLE` (503, PRD §34.9) — the code is **consumed**
    from `FND-03`/`FND-04`, never redeclared. Fallback is attempted only when the profile carries an
    `approvedFallbackProfileId`, and then only to another `APPROVED` profile; a test asserts no code path
    selects a provider or model that is not in the resolved profile's allowlist. Basis: PRD §17.3
    (*"No unvalidated fallback"*), §14.4, §42.5, §34.9; **`ANS-007`**.
11. **Kill switch as an input.** `generate` accepts the caller-supplied kill-switch state (from
    `DATA-07`/`INTL-09`) scoped to profile and provider, and refuses accordingly; running work is
    cancelled at a stage boundary and the caller settles actual cost only. Basis: PRD §42.5 row 1;
    §12.4.
12. **`model_execution` metadata through `DATA-02`.** After every attempt the gateway records
    `{ jobId, profile, providerId, actualModelVersion, inputTokens, outputTokens, latencyMs,
    costMicroAud, schemaStatus, retentionMode, instructionTemplateVersion, packHash }` through the
    injected TenantContext repository port — **never** a raw prompt, a raw response, evidence text or a
    customer fact (PRD §35.6, §37.3). An architecture test asserts the package imports no SQLite driver
    and no unscoped connection factory (PRD §21.2, §45.2; `SEC-001`). `actualModelVersion` is what
    `ANS-004` requires in the snapshot.
13. **The no-tool boundary, enforced by an architecture test** (sub-PRD **D13**): the package must not
    import or reference `child_process`, `fs` write APIs, `net`, a SQLite/Postgres driver, an SMTP or
    email SDK, a webhook/HTTP-callback client, a browser automation library, or any module that
    constructs a URL outside the provider allowlist. Nor may it export a function that performs, or
    accepts a callback performing, an email send, webhook delivery, corpus promotion, record transition
    or credential use. Basis: PRD §37.5, §21.1.
14. **`test/providers/cassettes/**` and `test/schema/fixtures/**`** — the recorded-response and
    schema-failure corpora (synthetic per sub-PRD D22): one valid §36.5 response per hosted profile; one
    cassette per failure-matrix row; and schema fixtures for each rejected shape (unknown field,
    reasoning field, bad claim kind, non-integer offsets, dangling `assumption_refs`, truncated JSON).
15. **`README.md` in `packages/model-gateway`** — one page: the six profiles and which are local, the
    no-tool boundary and how it is tested, the reservation requirement, the failure matrix, the
    cassette/stub workflow, and the statement that no raw payload is ever persisted or logged.

## Acceptance checklist (classified)

- [ ] `[machine]` **No tool surface**: the architecture test finds no shell, filesystem-write, database,
      email, webhook, browser-automation or arbitrary-URL capability, and no exported function that can
      trigger an external action. (PRD §37.5; §21.1; sub-PRD D13)
- [ ] `[machine]` **No reasoning field is requested or accepted**: the request type has no member asking
      for reasoning traces, and a response containing `reasoning`/`thinking`/`chain_of_thought`/
      `scratchpad` is a **schema failure** — one test per name. (PRD §9.4; sub-PRD D14)
- [ ] `[fixture]` **Failure matrix** (`ANS-007`'s named evidence): each row of deliverable 10 replays
      from a cassette and returns its typed unavailability with the correct `reason`; **no** row
      substitutes a model, a provider or a smaller profile. (PRD §17.3; §14.4; §42.5; **`ANS-007`**)
- [ ] `[machine]` **Only `APPROVED` profiles serve production**: a `CANDIDATE` profile is refused
      outside the evaluation environment with `PROFILE_NOT_APPROVED`. (PRD §14.4)
- [ ] `[machine]` **Fallback requires approval**: with no `approvedFallbackProfileId`, no failure path
      calls a second profile; with one, only another `APPROVED` profile is called. (PRD §14.4
      *"Every fallback requires independent approval"*; §17.3)
- [ ] `[machine]` **No call without a reservation**: omitting `HeldReservation` is a compile error, and
      a forged/expired token yields `NO_RESERVATION`. (PRD §42.6; sub-PRD D17)
- [ ] `[machine]` **Allowlisted origins only**: constructing an adapter with an origin outside the
      provider allowlist throws; the package exposes no arbitrary base-URL configuration key.
      (PRD §16.4; §37.5)
- [ ] `[fixture]` **Everything replays offline**: with the network globally stubbed to throw and **no
      provider key present**, the entire suite passes; a cassette miss fails loudly rather than reaching
      the network. (PRD §20.2, §20.3; sub-PRD D15)
- [ ] `[machine]` **Local profiles are not callable here**: invoking `QUERY_EMBEDDING` or `LOCAL_RERANK`
      through the gateway is a typed error naming `RETR-07`. (PRD §17.3)
- [ ] `[machine]` **Ceilings are enforced, not clamped**: a profile configured above a registry ceiling
      is rejected at load; a call exceeding `maxElapsedMs` returns `PROFILE_TIMEOUT`. (PRD §36.7; §14.4)
- [ ] `[machine]` **No raw payload persisted or logged**: `model_execution` records only the deliverable
      12 fields; a canary in the prompt and a canary in the response appear in no repository call, log,
      metric or error message. (PRD §35.6; §37.3; §22)
- [ ] `[machine]` **TenantContext only**: an architecture test asserts no SQLite driver or unscoped
      connection factory is importable from this package; persistence goes through `DATA-02`'s port.
      (PRD §21.2; §45.2; `SEC-001`)
- [ ] `[machine]` **Sanitized facts only**: passing unsanitized text is a compile error (the branded
      type from `EVID-01` via the caller), and the pack is inserted as `EVID-04`'s delimited block with
      no re-interpolation. (PRD §37.5; §18.5 step 1)
- [ ] `[machine]` **Retention posture is a precondition**: a provider configured without
      no-training/zero-or-approved-minimal retention fails profile resolution. (PRD §10.2; Q-EVID-4)
- [ ] `[machine]` **Actual model version recorded** on every attempt, including failures where the
      provider reported one. (PRD §14.4; `ANS-004`)
- [ ] `[machine]` **Kill switch refuses**: with the profile or provider switch set, `generate` returns
      `KILL_SWITCH` and performs no provider call. (PRD §42.5; §12.4)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck` and `pnpm test` green (standing item, PRD §45.3).
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean. (PRD §20.1, §45.3)
- [ ] `[machine]` No Rust or Python surface — `cargo test --workspace` / `uv run pytest` unaffected;
      declared not applicable. (PRD §45.3)
- [ ] `[machine]` **Writeback item**: the benchmark-selected **Q1** row and the open **Q-EVID-4** row in
      `docs/prd/12-evidence-safety/README.md` are updated with the profile abstraction as built and the
      retention precondition as encoded. (Breakdown plan §1.1; CLAUDE.md issue #53)
- [ ] `[machine]` PR states the PRD §45.4 items: requirement/UAT IDs (**ANS-007**, contributes to
      **ANS-004**/**SEC-003**; `UAT-ANS-08` is run end to end by `15-answer-product`), user-visible
      change and non-goals, schema/API/event compatibility impact (the gateway result shape consumed by
      `ASK-02`, `EVID-08`, `GOLD-15`), **tenant/PII/security and retention impact** (no raw payload
      persisted; no tool surface; TenantContext-only persistence; provider retention posture),
      source/licence impact (none — the pack's licence limits are `EVID-06`'s),
      **cost/model/token impact** (per-profile ceilings and the measured token/latency profile of the
      stub; real provider cost is `EVID-08`'s), rollback path (revert; `EVID-08`, `ASK-02` and
      `GOLD-15` consume it), known gaps (**Q-EVID-4** provider commercial/retention terms; **Q1**'s
      exact models are benchmark-selected and pinned by `GOLD-15`, i.e. a pending measurement rather
      than a gap in this ticket).

Absent classes: no `[human]` criteria — the gateway is verified mechanically and by replay. Model
selection is decided by `GOLD-15`'s measured comparison and promotion is approved by the Founder on
that evidence (PRD §14.4); both belong to `21-evaluation-600`, not here. `UAT-ANS-08` is run at Gate 2
through `15-answer-product`. The
`[fixture]` items are recorded provider cassettes (breakdown plan §1.1's `[fixture]` class) authored
here — the PRD §14/§43 evaluation replays are `21-evaluation-600`.

## Test plan

Every step runs offline: **no network, no provider key**. Run the suite with a globally stubbed `fetch`
that throws, to prove it.

1. **Read the registry against the PRD.** Compare `MODEL_PROFILE_REGISTRY_V1` with `docs/PRD.md` §14.4's
   six profile names and §17.3's local/hosted split; confirm `QUERY_EMBEDDING` and `LOCAL_RERANK` are
   marked local and that no profile carries a fallback by default.
2. **Run the suite.** `pnpm --filter @<scope>/model-gateway test`, then `pnpm test`, `pnpm typecheck`,
   `pnpm lint` and `pnpm generate && pnpm generated:check` from the repository root. Construction
   pattern to copy: `RETR-09`'s mock-server behaviour matrix (`test/behaviour.test.ts`) for the failure
   cells, and `FND-09`'s versioned frozen data + committed fixture for the registry.
3. **Offline proof.** Stub the global network to throw; run the whole package suite; assert green and
   assert every provider interaction came from a cassette or the stub.
4. **Failure matrix.** One test per row of deliverable 10; assert the typed `reason`, that no second
   provider call occurred, and that the customer-facing code is `GENERATION_UNAVAILABLE`.
5. **Fallback negative test.** On a scratch branch add a default fallback profile to a registry entry
   and let a provider failure use it; assert the "fallback requires approval" test fails; discard.
6. **Schema strictness.** Feed each fixture in `test/schema/fixtures/**`; assert rejection with the
   failing path named, and specifically that a `reasoning` field is rejected rather than dropped.
7. **Architecture tests.** Run the no-tool and no-unscoped-DB import scans; on a scratch branch add
   `import { execSync } from 'child_process'` and assert the test fails; discard.
8. **Reservation test.** Attempt a call without a token (compile error); with a forged token (runtime
   `NO_RESERVATION`); with a valid stub token (proceeds).
9. **Canary test.** Put distinct canaries in the prompt and the stubbed response; assert neither appears
   in any repository call, metric, log or error.
10. **Ceiling tests.** Load a profile above the registry ceiling (rejected); run a stub that exceeds
    `maxElapsedMs` (`PROFILE_TIMEOUT`).
11. **Kill-switch test.** Set the profile and provider switches independently; assert refusal with no
    provider interaction.
12. **Append-only manifest.** `git diff packages/model-gateway/package.json … src/index.ts` shows
    additions only.
13. **Reviewer focus.** Confirm no code path can select a model outside the resolved profile's
    allowlist; confirm the instruction template never interpolates raw source or customer text; confirm
    a cassette miss cannot silently reach the network; confirm nothing persists a raw prompt or
    response; confirm the stub is exported so downstream modules do not fork it; confirm the package
    genuinely cannot open a database connection.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/12-evidence-safety/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *A provider only returns valid §36.5 JSON with a native "reasoning" field enabled* → that field may
     not be requested, stored or displayed (PRD §9.4). The gateway may **disable** the feature or reject
     the provider; it may not accept and drop the field silently. Record the provider and the constraint
     in `docs/prd/12-evidence-safety/README.md` **D14/Q-EVID-4** and route the vendor question to the
     **Founder**.
   - *No available provider offers no-training with zero/approved-minimal retention* → sub-PRD
     **Q-EVID-4**, owner **Founder**. Record it first; PRD §10.2 is a customer promise, so relaxing it is
     a PRD §45.5 product change, never a configuration default. (If no provider qualifies, the correct state is
     `GENERATION_UNAVAILABLE` with Search still available — PRD §8.2.)
   - *A workflow wants the gateway to call a tool (search, a calculator, a URL fetch)* → refuse. PRD
     §37.5 lists the boundary explicitly. Evidence comes from `EVID-04`'s pack; a genuine need is a
     writeback to `docs/prd/12-evidence-safety/README.md` **D13** and `docs/prd/breakdown-plan.md`
     before any code — see item 3.
   - *`ASK-02` needs a call-count or stage the ceilings do not express* → PRD §36.7 fixes the counts.
     Amend `PROFILE_CALL_CEILINGS` **in this ticket** in a docs PR amending both tickets so the workflow
     and the gateway cannot disagree.
   - *`EVID-08`'s reservation token shape does not fit* → change the token type **here** in a docs PR
     amending both tickets, then `--sync`; never let `EVID-08` write `src/providers/**`.
   - *`GOLD-15` selects a model whose ceilings differ from the registry* → the registry is versioned
     data; `GOLD-15` measures and writes back, and the value change lands as a docs PR against **this
     ticket** (the profile owner) plus `docs/prd/12-evidence-safety/README.md` **Q1**, so the profile
     that ships is the one the ticket describes.
3. **Falsified protocol.** If the no-tool boundary proves unworkable — for example if acceptable answer
   quality requires giving the model a retrieval or browsing tool — that overturns PRD §37.5, PRD §21.1
   and the evidence-first sequence of PRD §9.4 simultaneously, because a model-selected source is not a
   system-supplied evidence ID. **Stop.** Do not add the tool. Escalate for re-review, raise an ADR under
   `docs/adr/`, and write back to `docs/prd/12-evidence-safety/README.md` and
   `docs/prd/breakdown-plan.md` before any code. The same applies to any pressure to permit an
   unvalidated fallback under provider failure: PRD §17.3 forbids it and `ANS-007` tests for it.
