---
id: RUNT-07
title: "packages/observability: bounded logs and metrics"
module: 03-app-runtime
lane: 03-app-runtime
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [FND-03]
blocks: [RUNT-08]
---

# RUNT-07 — `packages/observability`: bounded logs and metrics

Implements PRD §22 (observability), carrying requirement `OPS-002` ("Search, answer, source, budget and
backup degradation are observable without content logs"). **No ADR — the decision is already made in
PRD §22; this is build ticket 7 of 9 against it.**
Parent sub-PRD: [03-app-runtime README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: `FND-03` — canonical enums and opaque ID conventions
([`00-foundation`](../../00-foundation/README.md)).
**Why `builder`:** a bounded change inside one module's declared file-scope implementing the log and
metric rules PRD §22 already enumerates — not a new subsystem decision.

## Background + basis

**PRD §22 is the whole specification, quoted in full:**

> - App, worker and search emit bounded JSON operational logs with request/job/retrieval/model/answer
>   correlations.
> - Logs MAY include technical IDs/hashes, operation, status, latency, cost and versions.
> - **Logs MUST exclude research/evidence content, PII text, credentials, assertions and provider
>   payloads.**
> - Application logs retain 14 days with age/size disk caps.
> - Audit/security records retain 12 months separately and are backed up.
> - Metrics cover server/disk/memory, backup lag, app/auth/PII, job queues, search latency/zero-results/
>   release, source freshness/quarantine/citation/evaluation and provider/tenant cost.
> - Immediate alerts cover process availability, disk >85%, OOM/restart, backup breach, tenant anomaly,
>   budget 90/100%, critical freshness, citation-validator spikes, release failure and severe incidents.
> - External checks cover liveness, readiness, authenticated synthetic Search and strictly budgeted
>   synthetic Answer.
> - **Full-content debug logs and crash dumps are disabled by default.**

**The correlation requirement is restated operationally.** PRD §42.2: "Operational logs use bounded
codes/IDs, not research bodies. **A request ID joins app → job → retrieval → model metadata →
answer/audit without placing the question or evidence in logs.**"

**The retention boundary is physical.** PRD §39.3 gives `/srv/aer/log` — "bounded 14-day operational
logs" with "No customer-content backup" — as a separate path from the app and ephemeral databases, and
PRD §37.3's content-retention matrix has the row "Operational IDs/status/timing/cost | App DB | App DB
safe metadata | **Bounded** | Yes where app DB" against "Sanitized question/facts … Logs/support: No"
and "Blocked raw PII | Never | Never | **Never** | Never".

**Requirement `OPS-002`** (PRD §30.2): "Search, answer, source, budget and backup degradation are
observable without content logs | Status/admin | health/status | App | **Alerts fire in controlled
failure drills**." The drill itself is `RLSE-08` (`18-ops-release`); this package is what makes the
signals exist.

**Why `FND-03` is the blocker.** breakdown-plan §5.1: `FND-03` produces "One generated source for every
controlled value in the product" (PRD §35.1). Log `operation`, `status` and metric label values are
controlled values; this package declares none of its own.

**Why the package, not a per-app logger.** breakdown-plan §4 allocates `packages/observability/**` to
this module as a single owner, consumed by `apps/api` (`RUNT-01`/`RUNT-08`), `apps/worker` (`RUNT-04`)
and — through its own idioms — `services/search-rs` (`11-retrieval-engine`). PRD §22's first bullet
requires the same correlation fields across all three processes.

**Accepted caveats carried forward, documented not enforced here:**

- **The metrics exposition protocol is not named by the PRD.** PRD §22 lists metric *families*; PRD
  §42.1 lists health endpoints but no metrics endpoint. This is open question **QR3** in
  [`../README.md` §6](../README.md#6-open-questions), owned by this module with `RLSE-08` as the
  consumer. This ticket ships a registry plus a pluggable exporter, so the protocol choice does not
  block it.
- **Alert thresholds are `18-ops-release`.** PRD §42.2's table (disk 75/85%, backup lag 10/15 min, job
  oldest age Quick >2 min / Deep >10 min, citation failure >5% rolling 20, spend 90/100%) is
  configured and fired by `RLSE-08`. This package **emits the measurements** those thresholds read.
- **`services/search-rs` is Rust** (`11-retrieval-engine`). This package cannot be imported there; it
  instead publishes the **field contract** as a versioned JSON schema so the Rust process emits
  matching records. That is the only cross-language artifact here.

## Goal

Produce `packages/observability` as the single source of bounded, correlated JSON operational logging
and the PRD §22 metric families for `apps/api` and `apps/worker`, in which a research body, PII text,
credential, assertion or provider payload is **structurally unable** to reach a log line. Completion is
mechanically checkable: the logger accepts only allowlisted fields and drops (and counts) everything
else; a canary-injection test proves a research string placed in every plausible position never appears
in emitted output; a correlation test proves one `request_id` joins an app record to a job record to a
model-metadata record; and the retention configuration caps application logs at 14 days with age and
size limits while audit/security records use a separate 12-month sink.

## Non-goals

- **No alert thresholds, no alert delivery, no status page, no external checks.**
  `infra/deploy/monitoring/**` is `18-ops-release` (`RLSE-08`), which is `blocked_by` `RUNT-08`.
- **No health or status endpoints.** `apps/api/src/routes/{health,system-status}/**` is `RUNT-08`.
- **No audit-event tables or the audit API.** `packages/database` operations tables are `DATA-07`
  (`01-app-data`); `GET /v1/audit-events` is `PLTF-09` (`20-developer-platform`). This package emits
  the **operational** record and writes the audit sink through the interface `DATA-07` provides — it
  owns no schema.
- **No PII detection.** `packages/pii` is `12-evidence-safety` (`EVID-01`). This package's protection
  is structural (allowlist + drop), not detective; the two are independent layers.
- **No cost ledger arithmetic.** PRD §42.6's reservation/settlement is `packages/domain/src/budget`
  (`FND-09`) and `packages/model-gateway` (`12-evidence-safety`). This package records the measurement.
- **No Rust or Python implementation.** `services/search-rs` is `11-retrieval-engine`; `pipelines/**`
  is `04`/`05`/`21`. This ticket publishes the field-contract schema they conform to and touches
  neither tree.
- **No log shipping, rotation daemon or disk enforcement on the host.** `infra/deploy/**` is
  `18-ops-release`; this package exposes the caps as configuration and the process honours them.

## File-scope (write-owns)

- `packages/observability/**` — including `package.json`, `tsconfig.json`, `src/**`, `test/**` and the
  published field-contract schema under `packages/observability/schema/**`. The manifest is an
  **append-only extension** of the `FND-01` skeleton (breakdown-plan §1.1).

Does not touch:

- `packages/contracts/**` — `00-foundation` (`FND-03`), serial-owned canonical enums.
- `packages/database/**` — `01-app-data` (`DATA-07` owns the audit tables).
- `packages/ui/**` — `RUNT-06`. `apps/api/**` — `RUNT-01`/`RUNT-02`/`RUNT-03`/`RUNT-08` and the product
  route areas. `apps/worker/**` — `RUNT-04` and the product handler subtrees. `apps/web/**` — `RUNT-05`
  and the product feature modules.
- `services/search-rs/**` — `11-retrieval-engine`. `pipelines/**` — `04`, `05`, `21`.
- `infra/**` — `RUNT-09` (compose) and `18-ops-release` (deploy, monitoring, backup, recovery).
- `schemas/**` — `00-foundation` (`openapi`, `events`), `04-corpus-contract` (`corpus-manifest`),
  `21-evaluation-600` (`evaluation`). The field-contract schema here lives **inside**
  `packages/observability/schema/**`, not under the root `schemas/` tree.
- `tests/**` — `23-assurance`. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.

**Serial-safety analysis.** First decomposition (breakdown-plan §1: phase 1, nothing merged, no
in-flight ticket), so nothing has previously written `packages/observability/**` and nothing contends
for it. breakdown-plan §4 gives the whole tree to `03-app-runtime` and §5.4 gives it wholly to this
ticket — no sibling shares it. Sibling tickets are in different trees: `RUNT-01`/`RUNT-02`/`RUNT-03`/
`RUNT-08` are `apps/api`, `RUNT-04` is `apps/worker`, `RUNT-05` is `apps/web`, `RUNT-06` is
`packages/ui`, `RUNT-09` is `infra/compose`. This ticket is in wave 1 with `RUNT-01`, `RUNT-04`,
`RUNT-05` and `RUNT-06`, all five runnable as concurrent lanes (breakdown-plan §7). `RUNT-08` consumes
this package in wave 2, after it lands.

## Deliverables

1. **`packages/observability/package.json` / `tsconfig.json`** — extend the `FND-01` skeleton;
   workspace dependency on `packages/contracts`. No toolchain version is declared here:
   breakdown-plan §8 **Q12** fixes them (Node.js `24.18.0`, pnpm `11.4.0`) and `FND-01` holds the
   pins.
2. **`src/fields.ts`** — the **allowlist**, exported as a frozen record mapping every permitted log
   field to its value kind. Permitted, per PRD §22 bullet 2: technical IDs and hashes, operation,
   status, latency, cost and versions. Correlation ids per PRD §22 bullet 1 and PRD §42.2:
   `request_id`, `job_id`, `retrieval_id`, `model_call_id`, `answer_snapshot_id`, plus
   `organization_id`, `actor_kind`, `release_id`, `schema_version`. Nothing else is a permitted key.
3. **`src/logger.ts`** — `export function createLogger(opts: LoggerOptions): Logger` emitting one JSON
   object per line. The record is assembled **only** from allowlisted fields: an unknown key is
   dropped, not stringified, and increments a `observability_dropped_fields_total` counter labelled by
   key name so the drop is visible without leaking the value. A string value exceeding the configured
   maximum length is truncated with a marker; free-text message strings are limited to a bounded
   `event` code drawn from `packages/contracts` plus the allowlisted fields (PRD §42.2 "Operational
   logs use bounded codes/IDs, not research bodies"). There is **no** `extra`, `meta`, `data` or
   `payload` escape hatch, and no API accepts an arbitrary object.
4. **`src/redact.ts`** — the second, defensive layer applied to allowlisted **values**: known
   credential shapes (bearer tokens, the `AUTC-04` credential prefix, private-key headers) and
   high-risk patterns are replaced with a fixed marker before serialisation. Redaction never emits a
   reversible hash of a detected value (PRD §37.2 "Metrics record category/count/result, not content or
   reversible hash").
5. **`src/correlation.ts`** — an async-context correlation store. `withCorrelation(ids, fn)` binds
   `request_id` / `job_id` / `retrieval_id` / `model_call_id` for everything executed inside, so a call
   site never has to thread them manually and cannot forget one. `RUNT-01` binds `request_id`,
   `RUNT-04` binds `job_id` at lease time, and `11`/`12` bind the retrieval/model ids.
6. **`src/metrics.ts`** — a registry covering the PRD §22 metric families, each declared with its name,
   type, unit and label set: server/disk/memory; backup lag; app/auth/PII; job queues (depth, oldest
   age, in-flight per PRD §39.5 class); search latency, zero-results, active release; source freshness,
   quarantine, citation validation, evaluation; provider and tenant cost in **integer micro-AUD**
   (PRD §34.1 "Money | Integer micro-AUD for internal cost; never floating point"). Labels are bounded:
   a label value not in its declared domain is rejected at registration, so cardinality cannot explode
   and a tenant identifier cannot become a free-form label carrying content.
7. **`src/exporter.ts`** — a pluggable exporter interface plus a default file/stdout exporter, so
   **QR3** (metrics protocol, `RLSE-08` consumer) does not block this ticket. Selecting the exporter is
   configuration (PRD §39.6).
8. **`src/retention.ts`** — the two sinks PRD §22 separates: application logs with a 14-day age cap and
   a configured size cap, and audit/security records to a **separate** sink with a 12-month retention
   marker, written through the `DATA-07` audit repository interface. The application-log sink refuses
   to accept a record classified as audit/security, and vice versa (PRD §22 bullets 4–5; PRD §39.3).
9. **`src/debug.ts`** — full-content debug logging and crash dumps are **off by default** and can only
   be enabled by an explicit non-production configuration flag; enabling them under
   `profile: 'production'` throws at startup (PRD §22 "Full-content debug logs and crash dumps are
   disabled by default"; PRD §39.6).
10. **`schema/log-record.schema.json`** — the versioned field contract, published so `services/search-rs`
    (Rust, `11-retrieval-engine`) emits records that join on the same correlation ids without importing
    this package (PRD §22 bullet 1: "App, worker and search emit bounded JSON operational logs with
    request/job/retrieval/model/answer correlations").
11. **`test/canary.ts`** — an exported reusable canary harness: it attempts to place a
    `secret-canary-<uuid>` string into every public entry point of the logger and metrics registry and
    asserts it appears in no emitted byte. Exported so `RUNT-01`, `RUNT-02`, `RUNT-04` and every
    product module can run the identical assertion against their own call sites.

## Acceptance checklist (classified)

- [ ] `[machine]` Only allowlisted fields are emitted: an unknown key is dropped, not stringified, and
      increments `observability_dropped_fields_total` labelled by key name with no value (PRD §22
      bullets 2–3)
- [ ] `[machine]` No public API accepts an arbitrary object — there is no `extra`/`meta`/`data`/
      `payload` parameter anywhere in the export surface, asserted at the type level and by a source
      scan (PRD §22 "Logs MUST exclude research/evidence content, PII text, credentials, assertions and
      provider payloads")
- [ ] `[machine]` Canary test: a `secret-canary-<uuid>` string placed in a message, a field value, an
      error object, a nested object, an array and an `Error.stack` appears in **no** emitted byte
      (PRD §22; `OPS-002`)
- [ ] `[machine]` Credential shapes (bearer token, `AUTC-04` credential prefix, private-key header) are
      replaced with a fixed marker and never with a reversible hash (PRD §22, §37.2)
- [ ] `[machine]` One `request_id` joins an app record → a job record → a model-metadata record without
      any of them carrying question or evidence text — asserted over a simulated three-hop flow using
      `withCorrelation` (PRD §42.2 "A request ID joins app → job → retrieval → model metadata →
      answer/audit without placing the question or evidence in logs")
- [ ] `[machine]` The metric registry declares every PRD §22 family — server/disk/memory, backup lag,
      app/auth/PII, job queues, search latency/zero-results/release, source freshness/quarantine/
      citation/evaluation, provider/tenant cost — asserted against a literal family list in the test
      (PRD §22; `OPS-002`)
- [ ] `[machine]` Cost metrics are integer micro-AUD; a floating-point value is rejected at
      registration (PRD §34.1)
- [ ] `[machine]` A label value outside its declared domain is rejected at registration, so metric
      cardinality is bounded and no free-form value can become a label (PRD §22)
- [ ] `[machine]` Application logs honour a 14-day age cap and a configured size cap; audit/security
      records go to a **separate** sink with a 12-month marker; each sink rejects the other's record
      class (PRD §22 bullets 4–5; PRD §39.3)
- [ ] `[machine]` Full-content debug logging and crash dumps are off by default, and enabling them
      under `profile: 'production'` throws at startup (PRD §22; PRD §39.6)
- [ ] `[machine]` `schema/log-record.schema.json` validates a record emitted by the TypeScript logger,
      so the Rust search process has an executable contract to conform to (PRD §22 bullet 1)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` `pnpm generate && pnpm generated:check` clean (PRD §20.1)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002` and the retention/PII impact
- No `[fixture]` criteria — this ticket replays no recorded source or evaluation data
      (breakdown-plan §1.1 maps `[fixture]` to PRD §40.8 adapter fixtures and §14/§43 evaluation replays)
- No `[human]` criteria — the deliverable is a library with no customer-visible surface; the
      irreducibly human part of `OPS-002` is the controlled failure drill, which is `RLSE-08`
      (`18-ops-release`)
- No `cargo test --workspace` / `uv run pytest` item — this ticket touches no Rust or Python; it
      only **publishes** the JSON schema `services/search-rs` conforms to (PRD §45.3)

## Test plan

Reviewer steps, offline, no network:

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/observability`. Suites live under `packages/observability/test/`.
3. **`allowlist.test.ts`** — emit a record containing one allowlisted key and five unknown keys;
   assert only the allowlisted key survives, that `observability_dropped_fields_total` incremented five
   times labelled by key name, and that no dropped **value** appears anywhere in the counter labels.
4. **`canary.test.ts`** — the exported harness in `test/canary.ts`. Place `secret-canary-<uuid>` in:
   a message string, an allowlisted field value, `new Error(canary)`, `error.stack`, a nested object, an
   array element, and a metric label. Capture all emitted bytes with an in-memory sink and assert the
   canary substring is absent in every case.
5. **`redact.test.ts`** — bearer token, the `AUTC-04` credential prefix pattern and a private-key
   header; assert the fixed marker and assert the output contains no hash of the input (compare against
   the sha256 of the input as a negative assertion).
6. **`correlation.test.ts`** — run a simulated three-hop flow through `withCorrelation`; assert all
   three records carry the same `request_id`, that the job record adds `job_id` and the model record
   adds `model_call_id`, and that no record carries a question or evidence field.
7. **`metrics.test.ts`** — assert the registry against a literal list of the PRD §22 families written
   out in the test file. Register a float cost (expect rejection) and an out-of-domain label value
   (expect rejection).
8. **`retention.test.ts`** — configure a 14-day age cap and a small size cap with a fake clock; assert
   pruning. Write an audit-class record to the application sink (expect rejection) and an
   application-class record to the audit sink (expect rejection).
9. **`debug.test.ts`** — default configuration has debug/crash dumps disabled; enabling under
   `profile: 'production'` throws.
10. **`schema.test.ts`** — validate a logger-emitted record against
    `packages/observability/schema/log-record.schema.json` with the repository's JSON-schema validator.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(version note + changelog line in the PR), re-publish with `publish-tickets.mjs --sync`, then change
code. Silent divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A caller genuinely needs a field the allowlist forbids** → do **not** add an escape hatch. Extend
  `src/fields.ts` with the specific named field, state in this ticket's Deliverable 2 why it is
  technical metadata and not content, `--sync`, and only then emit it. PRD §22's exclusion list is a
  MUST and `OPS-002`'s acceptance is "observable **without content logs**". A generic `extra` object
  would falsify the whole structural guarantee.
- **The metrics exposition protocol must be chosen now** (`RLSE-08` needs a scrape target) → that is
  open question **QR3**. Write `docs/adr/NNNN-metrics-exposition.md` first (PRD §45.5 "Architecture
  decision"; breakdown-plan **A9** gives per-file ADR ownership), record the answer in
  `docs/prd/03-app-runtime/README.md` §6, and only then implement the exporter. If it implies a new
  runtime dependency, check it against PRD §18.1's forbidden-infrastructure list before adopting it.
- **`packages/contracts` (`FND-03`) does not export the operation/status vocabulary** the log `event`
  code needs → raise a `00-foundation` ticket and add the dependency in
  `docs/prd/breakdown-plan.md` §5.4/§6.2; note the temporary local declaration in
  `docs/prd/03-app-runtime/README.md` §6. Do not write `packages/contracts/**` — it is serial-owned
  (breakdown-plan §4.1).
- **The audit sink needs a table `DATA-07` does not provide** → add a ticket to `01-app-data` and make
  this one `blocked_by` it, writing `docs/prd/breakdown-plan.md` §5.2/§6.2 first. Do not write
  `packages/database/**` — breakdown-plan **A3** and PRD §45.2 forbid it (breakdown-plan risk **R4**).
- **The Rust search process cannot conform to `schema/log-record.schema.json`** → the schema is the
  cross-language contract PRD §22 bullet 1 depends on. Amend it here and notify
  `11-retrieval-engine`; if the change is structural, record it in
  `docs/prd/03-app-runtime/README.md` §6 and in the PR's schema-compatibility line (PRD §45.4). Do not
  write `services/search-rs/**`.
- **A PRD §42.2 threshold turns out to need a measurement this package does not emit** → add the metric
  here (this module owns the registry) and notify `RLSE-08`; if it requires a new metric **family**
  beyond PRD §22's list, record it in `docs/prd/03-app-runtime/README.md` §6 first.

**3. Escalation.** "Logs MUST exclude research/evidence content, PII text, credentials, assertions and
provider payloads" (PRD §22) is a release requirement behind `OPS-002`, and PRD §26's Definition of
Done includes "Customer content is excluded from R2 and logs". If the structural allowlist approach is
outright falsified, that overturns a team decision every process depends on: escalate for re-review
before any code lands. Never widen the boundary silently inside this ticket.
