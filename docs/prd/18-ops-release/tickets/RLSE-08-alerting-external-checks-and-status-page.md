---
id: RLSE-08
title: "Alerting, external checks and status page"
module: 18-ops-release
lane: 18-ops-release
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-03, RUNT-08]
blocks: [LNCH-03]
---

# RLSE-08 — Alerting, external checks and status page

Implements PRD §22, §42.1 and §42.2 — requirement `OPS-002` (with the `OPS-003` spend rows), epic
`E30-OBS-DR`. **No ADR — the decision is already made in PRD §22 (which enumerates the metric
families, the immediate alerts and the external checks) and PRD §42.2 (which tabulates every
threshold); this is build ticket 8 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-03`](RLSE-03-cloudflare-edge-tunnel-dns-tls-pages-origin-protection.md) and `RUNT-08`
(health, readiness and `/v1/system-status`, `03-app-runtime`) — mirrors `blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope turning two PRD tables
(§42.1 checks, §42.2 thresholds) into configuration and a drill harness — not a new subsystem
decision.

## Background + basis

**PRD §22 is the specification, quoted for the parts this ticket implements:**

> - Metrics cover server/disk/memory, backup lag, app/auth/PII, job queues, search latency/
>   zero-results/release, source freshness/quarantine/citation/evaluation and provider/tenant cost.
> - **Immediate alerts cover process availability, disk >85%, OOM/restart, backup breach, tenant
>   anomaly, budget 90/100%, critical freshness, citation-validator spikes, release failure and severe
>   incidents.**
> - **External checks cover liveness, readiness, authenticated synthetic Search and strictly budgeted
>   synthetic Answer.**
> - Full-content debug logs and crash dumps are disabled by default.
> - **Logs MUST exclude research/evidence content, PII text, credentials, assertions and provider
>   payloads.**

**PRD §42.2 is the threshold table this ticket must implement row for row:**

| Condition | Threshold | Delivery | Initial operator action |
|---|---|---|---|
| Origin/app/search unavailable | 2 consecutive 1-minute failures | Immediate | Enable status/maintenance; inspect process/resources |
| Disk pressure | warn 75%, critical 85% | Immediate critical | Stop candidate download/build; rotate safe logs/cache; never delete active/backup evidence blindly |
| OOM/restart | any unexpected | Immediate | Preserve technical metadata; reduce admission/concurrency; inspect process budget |
| Backup lag | warn 10 min, critical 15 min | Immediate critical | Stop risky deploy/write operation; restore replication |
| Last valid recovery point | older than 24 h | Immediate | Resolve before deployment; incident if customer data at risk |
| Job oldest age | Quick >2 min, Deep >10 min | Immediate/digest by severity | Check lease/provider; pause admissions if growing |
| Citation validation failure | >5% rolling 20 jobs or any integrity mismatch | Immediate | Pause affected generation profile/release; investigate |
| Critical source freshness | misses declared critical SLA by 2× | Immediate | Mark degraded; stop definitive affected answers if material |
| Founder spend | 90% forecast/actual | Immediate warning | Reduce synthetic/Deep; ask paid users for prepaid/BYOK |
| Founder spend | 100% hard ceiling | Immediate + hard stop | Stop founder-funded model calls; preserve Search |
| Cross-tenant anomaly | any | SEV-1 immediate | Global customer-data capability kill switch; preserve evidence; assess notification |

> **Operational logs use bounded codes/IDs, not research bodies.** A request ID joins app → job →
> retrieval → model metadata → answer/audit without placing the question or evidence in logs.

**PRD §42.1 fixes the five checks and the degradation rules:**

| Endpoint/check | Public? | Success means |
|---|---:|---|
| `/health/live` | Tunnel-restricted probe | App event loop/process alive only |
| `/health/ready` | Tunnel-restricted probe | App DB writable, active corpus compatible, search responds, critical migrations complete |
| `/v1/system-status` | Yes, low detail | General product/search/generation/freshness/monitor status without topology |
| Authenticated synthetic Search | No | Login/tenant/API/search/current release work end-to-end |
| Budgeted synthetic Answer | No | PII/job/search/model/validator/commit work; **strict daily spend cap** |

> Readiness fails during incompatible app/corpus/schema state. Provider outage does not make Search
> unready; it marks generation degraded. A source-specific outage does not take the app down.

**`OPS-002` (PRD §30.2):** *"Search, answer, source, budget and backup degradation are observable
without content logs | Status/admin | health/status | App | **Alerts fire in controlled failure
drills**."* That last phrase is this ticket's central acceptance item.

**The status page must survive the origin.** PRD §13.3: *"**Public status page independent of the
origin server.**"* PRD §19.1 puts the static edge in front of the host. `LNCH-03` (`24-launch`,
`apps/web/public-site/**`, `blocked_by` this ticket) renders the page; this ticket publishes the
machine-readable document it renders.

**The budget is A$0 and the spend checks cost money.** PRD §24.1 budgets *"Cloudflare Pages/tunnel/
free edge | A$0 target"* and *"Hosted model hard budget | approximately A$12"*, and states *"the
system MUST stop before exceeding the founder-funded ceiling."* A synthetic Answer check is a real
hosted call, so PRD §42.1's *"strict daily spend cap"* is a hard requirement, not advice.

**The consumed contracts, restated so this ticket is cold-startable:**

- **`RUNT-08`** (`03-app-runtime`, `apps/api/src/routes/{health,system-status}/**`) exposes
  `GET /health/live` (200 while every dependency fails, no dependency call), `GET /health/ready`
  (200 only when all four PRD §42.1 checks pass, else 503, body = check ids and outcome codes only)
  and `GET /v1/system-status` (five bounded dimensions `product`, `search`, `generation`, `freshness`,
  `monitor`, plus `environment` and `corpus_release {id, date, status}`, plus `request_id` and
  `schema_version`; **no topology**). It also *"publishes the readiness/status outcomes as metrics in
  the PRD §22 families `RUNT-07` declares so `RLSE-08` can alert on them"*.
- **`RUNT-07`** (`03-app-runtime`, `packages/observability`) declares the PRD §22 metric families with
  names, types, units and bounded label sets, exports a **pluggable exporter** (sub-PRD **Q-RLSE-7** /
  `03-app-runtime` QR3 — the exposition protocol is `RUNT-07`'s to choose and this ticket's to
  confirm), and publishes `packages/observability/schema/log-record.schema.json` as the cross-language
  field contract. Cost metrics are **integer micro-AUD**.
- **`RLSE-05`** (`infra/backup/lib/api.mjs`) exports `measureLag()` plus
  `BACKUP_LAG_WARN_SECONDS = 600`, `BACKUP_LAG_CRITICAL_SECONDS = 900`,
  `RECOVERY_POINT_MAX_AGE_SECONDS = 86400`, and writes `backup-status.json`.
- **`RLSE-06`** (`infra/deploy/promote/lib/api.mjs`) exports `syntheticSearchCheck` and
  `syntheticAnswerCheck` (sub-PRD **D15**: the one-shot post-deploy verification lives there; the
  scheduled external checks live here, and this ticket reuses those functions rather than
  reimplementing their semantics).
- **`RLSE-03`** (`infra/cloudflare/**`) owns the edge; `/health/*` is reachable only through an
  authenticated edge path, and the Pages projects are declared there.

**Why these blockers.** breakdown-plan §6.2: `RLSE-03 --> RLSE-08` and `RUNT-08 --> RLSE-08`. The
external checks travel through `RLSE-03`'s edge and probe `RUNT-08`'s endpoints. `RLSE-05` and
`RLSE-06` are **not** blockers, so their exports are consumed through fail-closed seams
(deliverable 4).

**Accepted caveats carried forward, documented not enforced here:**

- **The email provider is settled; the runner location is not.** breakdown-plan §8 **Q14** is a
  **confirmed provider decision**: **Resend**, on the Resend Free transactional-email tier, at an
  expected MVP cost of **A$0/month**, so PRD §24.1's table gains no line. The channel, the
  `EmailTransport` port and the Resend adapter belong to `16-monitor-alerts` (`WTCH-04`, `WTCH-09`)
  and are **not** reimplemented here; the API key is `RLSE-02`'s `RESEND_API_KEY` secret group and
  never exists in this scope. What remains open is sub-PRD **Q-RLSE-4** narrowed to its real residue —
  **from where the outside-the-origin checks run at A$0**, plus any **paid** uptime/monitoring service,
  which stays a Founder decision under sub-PRD **D18**. PRD §22 requires the checks and PRD §24.1
  budgets no monitoring line, so this ticket ships a pluggable notifier whose A$0
  `FileNotifier`/`EdgeStatusNotifier` path is always available and states the residual gap honestly.
- **Kill switches and incidents are `22-internal-admin`'s** (`INTL-09`, `ADM-003`). PRD §42.5's scoped
  behaviour and PRD §42.4's incident states are consumed as **inputs** to alert suppression and status
  reporting; nothing here activates a switch.
- **The application-side circuit breaker is `FND-09`/`EVID-08`'s.** PRD §42.6's admission control
  stops spend; this ticket alerts at 90%/100% and suppresses its own budgeted check.

## Goal

Produce `infra/deploy/monitoring/**`: a declarative rule set covering every PRD §42.2 row, an external
check runner implementing PRD §42.1's four non-public checks from outside the origin, a pluggable
alert notifier that never carries content, a machine-readable status document published to the edge so
it survives an origin outage, and a **controlled failure drill harness** that induces each condition
and proves the alert fires. Completion is mechanically checkable offline: every PRD §42.2 row has a
rule whose threshold equals the PRD figure; the drill harness makes each rule fire and each recovery
clear it; a content canary placed in every input never reaches an alert, a status document or a log
line; the synthetic Answer check refuses to run above the configured daily cap or at 90% spend while
the synthetic Search check still runs; and the status document contains no topology.

## Non-goals

- **No health, readiness or `/v1/system-status` implementation.** `RUNT-08` (`03-app-runtime`). This
  ticket probes them.
- **No logger, metric registry or exposition protocol.** `RUNT-07` (`packages/observability`). This
  ticket **consumes** the families and confirms the protocol (sub-PRD **Q-RLSE-7**).
- **No public status page rendering, marketing content or its build.** `LNCH-03` (`24-launch`,
  `apps/web/public-site/**`, breakdown-plan **A8**), which is `blocked_by` this ticket. This ticket
  publishes the JSON document that page renders.
- **No edge, tunnel, DNS, TLS or Pages configuration.** `RLSE-03` (`infra/cloudflare/**`).
- **No backup measurement or recovery-point logic.** `RLSE-05` (`infra/backup/**`); consumed through
  a seam.
- **No deploy, rollback or promotion.** `RLSE-06`, `RLSE-07`. This ticket **alerts on** their outcomes
  (PRD §22's *"release failure"*).
- **No kill switches, incident records or admin console.** `22-internal-admin` (`INTL-09`, `INTL-10`;
  `ADM-003`).
- **No cost ledger, reservation, settlement or admission breaker.** `FND-09` (`packages/domain/budget`)
  and `EVID-08` (`packages/model-gateway`). This ticket reads the reported spend and alerts.
- **No email/webhook delivery implementation, and no provider adapter.** `16-monitor-alerts` owns the
  customer channels and the provider adapter: `WTCH-04` (the `EmailTransport` port), `WTCH-09` (the
  **Resend** adapter — breakdown-plan §8 **Q14**) and `WTCH-05` (signed webhooks). Operator alerting
  here is a different surface with a different audience, but it **binds** those seams rather than
  growing a second Resend implementation, and it holds no API key — that is `RLSE-02`'s
  `RESEND_API_KEY` group.
- **No real credential, provider account or paid service.** PRD §20.2, §24.1, sub-PRD **D18**.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/deploy/monitoring/**` — the rule set, the evaluator, the external check runner, the notifier
  interface and its A$0 implementations, the status-document publisher, the drill harness, `test/**`
  and `fixtures/**`.

Does not touch:

- `infra/deploy/{release,host,promote,corpus,benchmark}/**` — `RLSE-01`, `RLSE-02`, `RLSE-06`,
  `RLSE-07`, `RLSE-11`. `infra/{cloudflare,aws,backup,recovery}/**` — `RLSE-03`, `RLSE-04`, `RLSE-05`,
  `RLSE-09`. `docs/runbooks/**` — `RLSE-10` (this ticket **references** runbook paths; it writes none).
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `packages/observability/**`, `apps/api/src/routes/{health,system-status}/**` — `03-app-runtime`
  (`RUNT-07`, `RUNT-08`). `apps/web/public-site/**` — `24-launch` (`LNCH-03`).
  `apps/api/src/routes/internal/**`, `apps/admin/**` — `22-internal-admin`. `apps/**`, `packages/**`,
  `services/**`, `pipelines/**`, `schemas/**` — their owning modules. `tests/**` — `23-assurance`.
  Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`. `docs/PRD.md`,
  `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/deploy/monitoring/**`. breakdown-plan §4
gives `infra/deploy/**` to this module and §5.19 gives `infra/deploy/monitoring/**` wholly to this
ticket; siblings own disjoint subtrees. In the sub-PRD wave shape this ticket runs in wave 4
concurrently with `RLSE-06` (`infra/deploy/promote/**`) and `RLSE-09` (`infra/recovery/**`) —
disjoint trees. Both blockers merge before it starts. `infra/compose/**` belongs to `RUNT-09` and must
not be touched here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/deploy/monitoring/README.md`** — one page: every PRD §42.2 row and where its rule lives,
   how to run a drill, where the status document is published, the A$0 constraint and the open
   question about delivery (sub-PRD **Q-RLSE-4**).
2. **`infra/deploy/monitoring/rules/*.yml`** — one rule file per PRD §42.2 row, each declaring:
   `id`; `condition` (a metric expression over `RUNT-07`'s families or a check outcome); `threshold`
   with the **exact** PRD figure; `for` (the sustain window — `2 consecutive 1-minute failures` for
   availability); `severity` mapped to PRD §42.4's `SEV-1`…`SEV-4`; `delivery`
   (`IMMEDIATE` | `IMMEDIATE_CRITICAL` | `DIGEST`); `operator_action` quoting PRD §42.2's "Initial
   operator action" column verbatim; and `runbook` naming the `docs/runbooks/*.md` file (`RLSE-10`)
   the operator should open. A committed `rules/index.yml` lists all eleven ids, and a test asserts
   the set equals a literal transcription of PRD §42.2's rows — a missing row fails the build.
3. **`infra/deploy/monitoring/lib/evaluate.mjs`** — a pure evaluator:
   `evaluate(rules, samples, now) -> Alert[]` with `Alert = { rule_id, state: 'FIRING' | 'RESOLVED',
   severity, observed, threshold, since, runbook, operator_action }`. Pure and table-testable; hysteresis
   and the sustain window are explicit so a flapping input cannot produce alert storms. **`observed`
   is always a number or a bounded code — never a message, a payload or an identifier of customer
   content** (PRD §22, §42.2).
4. **`infra/deploy/monitoring/lib/sources.mjs`** — the input seams, every one **fail-visible**:
   `MetricSource` (reads `RUNT-07`'s exporter — the protocol is sub-PRD **Q-RLSE-7**, so this is an
   adapter, not a hard-coded scrape), `BackupStatusSource` (reads `RLSE-05`'s `backup-status.json`
   and its exported thresholds), `SystemStatusSource` (reads `/v1/system-status`), `HostSource`
   (disk/memory/OOM from the host), `ReleaseOutcomeSource` (reads `RLSE-06`/`RLSE-07` journals for
   PRD §22's *"release failure"*), `SpendSource` (month-to-date spend in integer micro-AUD) and
   `KillSwitchSource` (PRD §42.5 scopes, for suppression). An unbound or unreachable source yields
   `UNKNOWN`, which **fires a dedicated `monitoring_source_unavailable` alert** — it never reads as
   healthy.
5. **`infra/deploy/monitoring/external-checks.mjs`** — PRD §42.1's four non-public checks, run from
   **outside** the origin so an origin outage is detectable (PRD §13.3):
   - `liveness` — `GET /health/live` through the edge's authenticated probe path (`RLSE-03`
     deliverable 8);
   - `readiness` — `GET /health/ready`, recording the failing check ids from `RUNT-08`'s body;
   - `synthetic_search` — delegates to `RLSE-06`'s `syntheticSearchCheck` through a seam
     (sub-PRD **D15**), asserting login/tenant/API/search work end to end and that the response names
     the current release;
   - `synthetic_answer` — delegates to `RLSE-06`'s `syntheticAnswerCheck`, guarded by deliverable 6.
   Each check records `{ id, status, latency_ms, code }` and **nothing else**. The runner is
   schedulable (a cron-style loop with jitter) and is designed to run from the founder workstation or
   a free edge scheduler — see deliverable 10 and sub-PRD **Q-RLSE-4**.
6. **`infra/deploy/monitoring/lib/budget-guard.mjs`** — the cost discipline PRD §42.1 demands of the
   synthetic Answer check: a **hard daily cap** in integer micro-AUD, a persisted daily counter, and
   three refusals — `SPEND_CAP_REACHED` (today's synthetic spend at the cap),
   `SPEND_90_PERCENT` (month-to-date at PRD §42.2's 90% row) and `SPEND_100_PERCENT` (hard ceiling).
   In every refusal the synthetic **Search** check still runs, because PRD §26 requires *"Search
   remains available independently of hosted-generation budget"* and PRD §42.2's 100% row says
   *"Stop founder-funded model calls; **preserve Search**"*. The refusal is recorded as
   `SKIPPED_BUDGET`, never as a pass.
7. **`infra/deploy/monitoring/lib/notify.mjs`** — `Notifier = { send(alert) -> Promise<Receipt> }`
   with: a `FileNotifier` (always available, writes to a bounded local file), an
   `EdgeStatusNotifier` (updates the status document of deliverable 8), and a pluggable
   `WebhookNotifier`/`EmailNotifier`. `send` is given only the `Alert` structure of deliverable 3, so
   a notifier is structurally incapable of transmitting research content, PII, a credential or a
   provider payload (PRD §22). Delivery failures are retried with bounded backoff and are themselves
   alertable.
   The `EmailNotifier` is a **seam, not a provider implementation.** breakdown-plan §8 **Q14**
   confirms **Resend** (free transactional tier), and the transport port and its Resend adapter are
   `WTCH-04`/`WTCH-09` in `16-monitor-alerts`. This ticket therefore declares only the notifier's
   configuration shape (`transport`, `from_address`, `to_address`, `enabled`) and binds an injected
   transport: it ships **no** provider SDK, no provider HTTPS call and no key, and the key name is
   `RLSE-02`'s `RESEND_API_KEY` secret group. With no transport bound the `EmailNotifier` is absent and
   the A$0 `FileNotifier`/`EdgeStatusNotifier` path carries delivery — which is exactly why the
   residual open question (sub-PRD **Q-RLSE-4**) is the *runner location*, not the provider. When
   bound, operator alerting shares the same Resend free allowance as `16-monitor-alerts`' customer
   channel (the register's current planning allowance is 3,000 emails/month and 100/day — external
   operational configuration that can change, not a PRD guarantee): the bounded backoff and PRD §42.2's
   `DIGEST` delivery class exist partly so an alert storm cannot consume it, and needing a paid tier
   would be a fresh Founder decision under sub-PRD **D18**.
8. **`infra/deploy/monitoring/status-document.mjs`** — publishes `status.json` to an edge-hosted
   location (`RLSE-03`'s Pages project) so it is readable when the origin is down (PRD §13.3):
   `{ schema_version, generated_at, product, search, generation, freshness, monitor, incident:
     { state, since, summary_code } | null, checks: [{id, status, observed_at}], history_24h:
     [{hour, worst_status}] }`. Every field is a **bounded enum or a number**; there is no free-text
   field, no host, no port, no path, no process name and no internal version — PRD §42.1's *"without
   topology"* applied to the public status surface. `LNCH-03` renders it.
9. **`infra/deploy/monitoring/drill.mjs`** — the `OPS-002` acceptance instrument:
   `node drill.mjs [--rule <id> | --all] [--json]`. For each PRD §42.2 rule it drives the sources with
   a **recorded or synthesised sample series** that crosses the threshold, asserts the rule fires with
   the expected severity and delivery, asserts the notifier received exactly one alert carrying the
   right `rule_id`/`observed`, then drives the series back and asserts a `RESOLVED` alert. It writes
   `drill-report-<timestamp>.json` listing every rule, whether it fired, the observed value and the
   elapsed time — the artifact `OPS-002`'s *"Alerts fire in controlled failure drills"* is claimed
   from. A rule that cannot be drilled is a **failure**, not an omission.
10. **`infra/deploy/monitoring/schedule/`** — the A$0 execution plan for the external checks
    (sub-PRD **Q-RLSE-4**): a documented systemd timer for the **host-local** checks and a documented
    workstation/free-scheduler path for the **outside-the-origin** checks, with an explicit statement
    of what each path can and cannot detect (a host-local timer cannot detect a host outage — that is
    exactly why the outside path exists). The systemd timer **unit file** is `RLSE-02`'s; this ticket
    ships the command, the interval and the documentation, and records the gap if no outside path is
    yet chosen.
11. **`infra/deploy/monitoring/lib/suppression.mjs`** — PRD §42.5-aware suppression: while a scoped
    kill switch is active for a capability, that capability's alerts are marked `SUPPRESSED_BY_SWITCH`
    with the switch's scope and expiry rather than silenced — *"Kill switches expire or require review
    at the recorded time"* (PRD §42.5). Suppression never applies to `SEV-1` rows (cross-tenant
    anomaly) or to backup/recovery-point rows.
12. **`infra/deploy/monitoring/lib/api.mjs`** — the stable surface: `RULES`, `evaluate`,
    `runExternalChecks`, `publishStatus`, `runDrill`, `BUDGET_GUARD_CODES`. `LNCH-03` reads the status
    document, not this module.

## Acceptance checklist (classified)

Cross-references: `OPS-002` (this ticket **is** `OPS-002`'s acceptance instrument — *"Alerts fire in
controlled failure drills"*), `OPS-003` (the 90%/100% spend rows and the synthetic Answer cap),
`OPS-001` (the backup-lag and recovery-point rows, whose measurements come from `RLSE-05`),
`ADM-002` (the *"release failure"* alert reads `RLSE-06`/`RLSE-07` outcomes).

- [ ] `[machine]` The rule set contains **exactly one rule per PRD §42.2 row**, asserted against a
      literal transcription of the table in the test; a missing or extra rule fails (PRD §42.2)
- [ ] `[machine]` Every rule's threshold equals the PRD §42.2 figure — disk 75/85%, backup lag
      10/15 min, recovery point 24 h, availability 2 consecutive 1-minute failures, job oldest age
      Quick 2 min / Deep 10 min, citation failure >5% rolling 20, freshness 2× critical SLA, spend
      90%/100% — asserted numerically, not by comment (PRD §42.2)
- [ ] `[machine]` Every rule carries the PRD §42.2 "Initial operator action" text verbatim and a
      `runbook` path that exists in PRD §42.7's list (PRD §42.2, §42.7)
- [ ] `[machine]` **Controlled failure drill — the `OPS-002` item.** `drill.mjs --all` makes **every**
      rule fire with the expected severity and delivery, and every recovery produce a `RESOLVED`
      alert; the report lists all eleven rules with observed values. A rule that cannot be drilled
      fails the run (`OPS-002` "Alerts fire in controlled failure drills")
- [ ] `[machine]` An unbound or unreachable source yields `UNKNOWN` and fires
      `monitoring_source_unavailable`; it never evaluates as healthy — one test per source
      (PRD §22; fail-visible discipline)
- [ ] `[machine]` **Content safety:** a `content-canary-<uuid>` seeded into a metric label, a
      `/v1/system-status` field, a backup-status message, a release journal, an exception message and
      a spend record appears in **no** alert, **no** status document and **no** emitted log byte
      (PRD §22 "Logs MUST exclude research/evidence content, PII text, credentials, assertions and
      provider payloads"; §42.2 "bounded codes/IDs, not research bodies")
- [ ] `[machine]` The `Alert` structure has no free-text field capable of carrying a payload — asserted
      at the type level and by a source scan proving `send()` receives only the declared structure
      (PRD §22)
- [ ] `[machine]` The status document contains **no** host name, IP, port, filesystem path, process
      name or internal version — asserted by seeding every source with a `topology-canary-<uuid>` and
      requiring its absence, mirroring `RUNT-08`'s own assertion (PRD §42.1 "without topology")
- [ ] `[machine]` The status document is published to the edge location and is readable when the origin
      is simulated down — asserted by taking the fixture origin offline and still serving the document
      (PRD §13.3 "Public status page independent of the origin server")
- [ ] `[machine]` The synthetic Answer check refuses with `SPEND_CAP_REACHED`, `SPEND_90_PERCENT` or
      `SPEND_100_PERCENT` at the respective conditions, records `SKIPPED_BUDGET` (never a pass), and
      in every case the synthetic **Search** check still runs (PRD §42.1 "strict daily spend cap";
      PRD §42.2 100% row "preserve Search"; PRD §26; `OPS-003`)
- [ ] `[machine]` The daily synthetic spend counter is integer micro-AUD and is persisted across
      restarts; a floating-point value is rejected (PRD §34.1; `RUNT-07` deliverable 6)
- [ ] `[machine]` `readiness` records the failing check ids from `RUNT-08`'s response body and nothing
      else, and a provider outage leaves readiness passing while `generation` degrades — reproducing
      `RUNT-08`'s degradation contract from the outside (PRD §42.1 "Provider outage does not make
      Search unready")
- [ ] `[machine]` Availability fires only after **2 consecutive 1-minute failures**, not on the first —
      asserted with an injected clock and a flapping series (PRD §42.2 row 1)
- [ ] `[machine]` Suppression marks alerts `SUPPRESSED_BY_SWITCH` with scope and expiry rather than
      silencing them, and never suppresses the `SEV-1` cross-tenant row or the backup/recovery-point
      rows (PRD §42.5 "Kill switches expire or require review at the recorded time")
- [ ] `[machine]` Notifier delivery failures retry with bounded backoff and are themselves alertable;
      no retry loop is unbounded (PRD §22)
- [ ] `[machine]` No paid service, account or SDK is required by any default code path — asserted by a
      source and dependency scan (PRD §24.1; sub-PRD D18; `OPS-003`)
- [ ] `[machine]` **No second email implementation:** this scope contains no provider SDK, no provider
      HTTPS call and no API key or key value; the `EmailNotifier` reaches a provider **only** through
      an injected transport, and with none bound it is absent while `FileNotifier`/`EdgeStatusNotifier`
      still deliver — asserted by an import/dependency scan plus a secret-shape scan that names the
      path and never the value (breakdown-plan §8 **Q14**; `WTCH-04`/`WTCH-09` own the adapter,
      `RLSE-02` owns `RESEND_API_KEY`; PRD §20.2)
- [ ] `[machine]` No file outside `infra/deploy/monitoring/**` is modified — asserted by
      `git diff --name-only`. In particular `infra/compose/**` is untouched (breakdown-plan **A7**;
      sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002` and `OPS-003`, the security/PII
      impact (no content in alerts or the status document; no topology), the cost impact (the A$0
      monitoring path — including email on Resend's free tier, breakdown-plan §8 **Q14**, which adds no
      PRD §24.1 line — plus the capped synthetic Answer spend against PRD §24.1's ~A$12 model line) and
      the known gaps (the outside-the-origin runner, sub-PRD Q-RLSE-4)
- [ ] `[fixture]` Replay of the committed **recorded sample series** under
      `infra/deploy/monitoring/fixtures/series/` — one per PRD §42.2 rule, capturing a real threshold
      crossing and recovery — reproduces the same firing/resolution sequence and the same
      `drill-report.json` (excluding timestamps). This is the replayable drill evidence `OPS-002` and
      PRD §26's *"External health/status, alerts, incident workflow and kill switches operate"* rest on
- [ ] `[human]` One real controlled drill against the production host by the founder: induce disk
      pressure, stop a process, and stall replication, confirming each alert arrives through the
      chosen channel and that the status page updates while the origin is unreachable.
      **Not required to merge** — PRD §20.2 forbids giving coding agents production access and the
      outside-the-origin runner is still to be chosen (sub-PRD **Q-RLSE-4**; the email provider itself
      is settled — breakdown-plan §8 **Q14**); the merge-time substitute is `drill.mjs --all` over the
      fixture series, which proves every rule, threshold, severity and recovery path offline
- [ ] `[human]` **Outside-the-origin runner recorded**, together with the notifier configuration
      actually bound, written into `docs/prd/18-ops-release/README.md` Q-RLSE-4 with its PRD §24.1 cost
      line. The **provider** is not part of this record: breakdown-plan §8 **Q14** already confirms
      Resend on the free tier at A$0, delivered through `WTCH-04`/`WTCH-09`. **Not required to merge**
      — the `FileNotifier` and `EdgeStatusNotifier` paths work at A$0 today (sub-PRD D18)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored (PRD §45.3)

## Test plan

Reviewer steps. Everything except the two `[human]` rows runs offline with no network, no provider
account and no production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-monitoring`, **or** `node --test infra/deploy/monitoring/test` if the
   workspace member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/sources.mjs` provides programmable stubs for every source in deliverable 4,
   including one that throws and one that returns `UNKNOWN`; `test/helpers/fixtureOrigin.mjs` serves
   `RUNT-08`-shaped `/health/live`, `/health/ready` and `/v1/system-status` responses and can be taken
   offline mid-test; `test/helpers/recordingNotifier.mjs` records every `send()` argument in order.
   Copy the recording-stub pattern from
   `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md`.
4. **`rules.test.mjs`** — assert the rule id set equals a literal transcription of PRD §42.2's eleven
   rows; assert each threshold numerically; assert each `operator_action` string and each `runbook`
   path against PRD §42.7's list.
5. **`evaluate.test.mjs`** — table-driven over each rule: below threshold, at threshold, above
   threshold, and back below. Assert firing state, severity, `observed` type (number or bounded code),
   and the sustain window for the availability rule with an injected clock and a flapping series.
6. **`sources.test.mjs`** — for each source: unbound; throwing; returning `UNKNOWN`. Assert
   `monitoring_source_unavailable` fires and that no rule evaluates healthy.
7. **`canary.test.mjs`** — seed a `content-canary-<uuid>` into a metric label, a status field, a
   backup-status message, a release journal entry, an exception message and a spend record; capture
   every alert, the status document and all emitted bytes; assert absence in each.
8. **`topology.test.mjs`** — seed a `topology-canary-<uuid>` into every source's diagnostic fields;
   serialise the status document; assert absence and that the key set exactly equals the declared type.
9. **`budget.test.mjs`** — synthetic Answer at 0%, 89%, 90% and 100% spend and at/over the daily cap;
   assert the refusal codes, `SKIPPED_BUDGET` recording, and that the synthetic Search check ran in
   every case. Assert integer micro-AUD and rejection of a float.
10. **`external-checks.test.mjs`** — against `fixtureOrigin`: healthy; readiness 503 with two failing
    check ids (assert only the ids are recorded); provider outage shape (readiness passes,
    `generation` degraded); origin offline (assert liveness fails and the status document still
    serves).
11. **`status-document.test.mjs`** — publish; take the fixture origin offline; assert the document is
    still readable from the edge fixture and that `history_24h` is bounded.
12. **`suppression.test.mjs`** — an active kill switch for a capability marks its alerts
    `SUPPRESSED_BY_SWITCH` with scope and expiry; the `SEV-1` cross-tenant row and the backup rows are
    never suppressed.
13. **`drill.test.mjs`** — `drill.mjs --all` over the fixture series; assert every rule fires and
    resolves and that the report lists all eleven; then delete one series file and assert the run
    fails rather than skipping.
14. **`golden.test.mjs`** — the `[fixture]` row: diff `drill-report.json` against the recorded golden,
    ignoring timestamps.
15. **Diff check** — `git diff --name-only` lists only paths under `infra/deploy/monitoring/`.
16. **Reviewer focus (security- and cost-sensitive):** confirm no code path can put a message, payload
    or identifier of customer content into an `Alert` or the status document; confirm the synthetic
    Answer check cannot be run by an unauthenticated caller or by a loop that ignores the cap; confirm
    the daily counter cannot be reset by a flag; confirm an unreachable source can never read as
    healthy; confirm suppression cannot silence the `SEV-1` row; confirm no default code path requires
    a paid dependency; confirm the status document exposes no topology even when a source returns a
    hostname.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **`RUNT-07`'s exposition protocol is not decided** (sub-PRD **Q-RLSE-7** / `03-app-runtime` **QR3**)
  → this ticket is the first real consumer and must **confirm**, not choose. Raise it against
  `RUNT-07` as a docs PR, record the answer in `docs/prd/03-app-runtime/README.md` §6 and in
  `docs/prd/18-ops-release/README.md` Q-RLSE-7, and keep the `MetricSource` adapter narrow so the
  choice does not leak into eleven rule files. Do not write `packages/observability/**`.
- **A PRD §42.2 threshold needs a measurement `RUNT-07` does not emit** → the metric registry is
  `RUNT-07`'s. Raise a docs PR against it (its own feedback obligation already anticipates this), and
  record the gap in `docs/prd/18-ops-release/README.md`. Until the metric exists, the rule's source is
  `UNKNOWN` and fires `monitoring_source_unavailable` — a missing measurement must be **visible**, not
  a silently absent rule.
- **Alert delivery requires a paid service** → the **email provider is not that case**:
  breakdown-plan §8 **Q14** confirms Resend on the free transactional tier at A$0, delivered through
  `WTCH-04`/`WTCH-09`. A *different* paid dependency — a hosted uptime checker, a paid monitoring SaaS,
  or a paid provider tier because the shared free allowance is exceeded — is sub-PRD **Q-RLSE-4** and
  **D18**: record the options and their PRD §24.1 cost in
  `docs/prd/18-ops-release/README.md` Q-RLSE-4 before adopting anything, and ship the A$0
  `FileNotifier`/`EdgeStatusNotifier` path meanwhile.
- **Operator alerting cannot bind `WTCH-04`'s transport across the app/infra boundary** → do not
  answer that by writing a second Resend adapter here. Record the constraint in
  `docs/prd/18-ops-release/README.md` Q-RLSE-4 and raise a docs PR against `WTCH-04`/`WTCH-09` for a
  reusable seam; until one exists, operator alerts stay on the A$0
  `FileNotifier`/`EdgeStatusNotifier` path and the gap is stated in the PR's known-gaps line
  (PRD §45.4). Two implementations of one provider is exactly the duplication breakdown-plan §8
  **Q14** and §4.2 both exist to prevent.
- **The external checks cannot run from outside the origin at A$0** → say so plainly rather than
  running them host-locally and calling `OPS-002` satisfied. A host-local check cannot detect a host
  outage; record the limitation in `docs/prd/18-ops-release/README.md` Q-RLSE-4, in
  `infra/deploy/monitoring/README.md` and in the PR's known-gaps line (PRD §45.4).
- **The synthetic Answer check's cost is material against PRD §24.1's ~A$12 model line** → reduce its
  frequency and record the measured monthly figure in the PR's cost line and in
  `docs/prd/18-ops-release/README.md`. Removing the check entirely is a **PRD §22 requirement**
  change (*"External checks cover … strictly budgeted synthetic Answer"*) and therefore an
  escalation, not a configuration choice.
- **`RLSE-06`'s synthetic check functions are unavailable** (it merges after this ticket in some
  schedules) → the seam must fail **closed** with a named code and the drill must report the check as
  `UNAVAILABLE`, never as passing. Record it in `docs/prd/18-ops-release/README.md`; do not duplicate
  the check semantics (sub-PRD **D15**), because two implementations of "authenticated synthetic
  Search" will diverge.
- **`LNCH-03` needs a status field this document does not carry** → the document is this ticket's
  contract. Add the field **here** as a bounded enum or number (never free text), record it in
  deliverable 8, `--sync`, and notify `24-launch`. Never widen it into a free-text channel — PRD §42.1's
  "without topology" and PRD §22's content exclusion both live in this document's shape.

**3. Escalation.** *"Alerts fire in controlled failure drills"* (`OPS-002`), *"Logs MUST exclude
research/evidence content, PII text, credentials, assertions and provider payloads"* (PRD §22) and
*"Public status page independent of the origin server"* (PRD §13.3) are release requirements behind
PRD §26's *"External health/status, alerts, incident workflow and kill switches operate"*. If any is
outright falsified — if a condition genuinely cannot be drilled, or the status surface genuinely
cannot be served independently — stop, escalate for re-review, and write back to
`docs/prd/18-ops-release/README.md` and `docs/prd/breakdown-plan.md` before any code lands. Never
declare a rule covered because it is configured but never fired, and never let content into an alert,
inside this ticket.
