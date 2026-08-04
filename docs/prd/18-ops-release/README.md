# 18-ops-release — sub-PRD

> Module sub-PRD. Authored from `docs/prd/breakdown-plan.md` §5.19 (wave B). The **tickets** under
> `tickets/` are the executable source of truth; this file is the module's shared context. On any
> disagreement between a ticket and this file, the ticket wins (CLAUDE.md, issue #53).

| Field | Value |
|---|---|
| Module | `18-ops-release` |
| Lane | `18-ops-release` |
| Ticket prefix | `RLSE` |
| Tickets | 11 (`RLSE-01` … `RLSE-11`) |
| PRD epics | `E06-RUNTIME` (deploy/backup baseline half), `E30-OBS-DR`, `E32-QUALITY` (the 2 GB benchmark half — `RLSE-11`), `E33-PROMOTION` (the app/corpus release-drill half — `RLSE-06`/`RLSE-07`) |
| Requirement families | `OPS-001`, `OPS-002`, `OPS-003` (breaker plumbing), `ADM-002`; the S3 boundary half of `EXP-002` |
| Depends on modules | `00-foundation`, `01-app-data`, `03-app-runtime`, `04-corpus-contract`, `11-retrieval-engine` |
| Modules that depend on this one | `19-exports`, `22-internal-admin`, `23-assurance`, `24-launch` |
| Languages | Node ESM tooling (`.mjs`) + declarative configuration (systemd units, YAML, JSON, IAM policy documents) + Markdown runbooks. **No Rust, no Python.** |
| Master spec | [`docs/PRD.md`](../../PRD.md) |
| Version | v0.2 (2026-08-03) |

## Problem

Everything else in this repository is code that can be re-run. This module is the part that
**cannot** be re-run: a bad promotion, a wildcard backup rule or an unvalidated recovery point
destroys customer data that no test suite can reconstruct. Four PRD sentences define the whole
module, and each of them is a prohibition:

1. **PRD §12.2:** *"Failed releases MUST NOT modify active production data."*
2. **PRD §18.4:** *"Active data MUST never be rebuilt or mutated in place. Old releases cannot be
   removed while jobs remain pinned."*
3. **PRD §39.3:** *"The app database, ephemeral database and corpus cannot share a wildcard backup
   rule."*
4. **PRD §42.3:** *"Continuous Litestream replication is monitored by generation/validation of a
   recovery point, not merely 'process is running'."*

Four concrete pressures make this a module of its own rather than an appendix to `03-app-runtime`.

1. **PRD §44.3 names two of its artifacts serial-owned.** *"Serial owners are required for root
   lockfiles, canonical enums, OpenAPI root, app migration order, corpus schema/manifest, **active
   release/promotion files and production Compose/deployment configuration**."* One phrase covers two
   different artifacts; breakdown-plan decision **A7** splits them, and PRD §39.2 settles it:
   *"Docker Compose remains a local/CI convenience, not a production dependency."* Local Compose is
   `RUNT-09` (`infra/compose/**`, `03-app-runtime`) and is **never touched here**; systemd, the
   immutable release archive and the promotion tools are this module.
2. **The host is 2 GB and the budget is A$50/month.** PRD §19.1 fixes the host at *"2 GB RAM, 2 vCPU,
   60 GB system disk + 32 GB attached SSD"*; PRD §39.2 allocates every mebibyte of it across five
   processes; PRD §24.1 caps total spend at *"A$42–50"* and states *"the system MUST stop before
   exceeding the founder-funded ceiling."* Every architectural choice in this module is first a cost
   choice. There is no room for a second host, a managed control plane or an observability SaaS.
3. **Deployment and promotion are transactions with an abort path, not scripts.** PRD §39.7 gives
   eight ordered steps ending *"Prior release remains available for rollback"*; PRD §18.4 gives
   *"verify → shadow where memory permits → atomic active-pointer switch"*. Both must be provably
   incapable of damaging active data when they fail halfway. That is a design property, and it needs
   an owner.
4. **Coding agents get no production credentials.** PRD §20.2: *"Coding agents MUST NOT receive
   production SSH, database, backup, signing or provider credentials by default."* So every
   merge-blocking check in this module runs offline against a temporary root, a local
   S3-compatible stub and a fake systemd — and the module's honesty depends on those substitutes
   being explicitly described rather than quietly assumed.

## Scope

In scope (the module's breakdown-plan §4 write-owns row, in full):

- `infra/deploy/**` — the immutable release archive builder/signer/verifier (`release/`), the
  production host baseline and shared host primitives (`host/`), the app deploy/rollback tool
  (`promote/`), the corpus promotion/rollback tool (`corpus/`), alerting and external checks
  (`monitoring/`) and the real-scale benchmark (`benchmark/`).
- `infra/cloudflare/**` — tunnel, DNS/TLS, Pages projects, origin protection, R2 bucket/prefix and
  read/promotion token configuration.
- `infra/aws/**` — the S3 Sydney bucket, the two prefixes and their least-privilege credentials and
  lifecycle rules.
- `infra/backup/**` — Litestream replication configuration and recovery-point validation.
- `infra/recovery/**` — the isolated restore-drill environment and the whole-server recovery runner.
- `docs/runbooks/**` — the ten PRD §42.7 files.

Out of scope in one line: **this module deploys, replicates, promotes, measures and documents; it
never implements a product surface, never writes an application table and never reads customer
research content.**

## Non-goals

Each names its owner module/ticket or standing reason.

| Not in this module | Owner / reason |
|---|---|
| **Local/CI Docker Compose** (`infra/compose/**`) | `03-app-runtime` (`RUNT-09`). breakdown-plan **A7**; PRD §39.2 *"Docker Compose remains a local/CI convenience, not a production dependency."* This module must not write, read-into or reference `infra/compose/**` as a production artifact. |
| CI workflow files (`.github/workflows/**`), root manifests, lockfiles, tool-version files | `00-foundation` (`FND-01`, `FND-02`). PRD §20.3's *"CI builds one immutable app artifact"* is realised by `FND-02`'s workflow **invoking** `RLSE-01`'s builder; the workflow file itself is not ours. |
| Health, readiness and `/v1/system-status` endpoints | `03-app-runtime` (`RUNT-08`). PRD §42.1's three endpoints are application routes; this module probes and alerts on them (`RLSE-08`, `blocked_by RUNT-08`). |
| The logger, the metric registry and the log field contract | `03-app-runtime` (`RUNT-07`, `packages/observability`). PRD §22's families are declared there; PRD §42.2's **thresholds** are declared here. |
| App schema, migrations, the migration runner, `ephemeral.sqlite`, the eight invariants | `01-app-data` (`DATA-01`…`DATA-09`). PRD §44.3 makes app migration order serial-owned there; this module *invokes* the runner and *consumes* `DATA-08`'s backup-exclusion assertion. |
| Corpus schema, release manifest, candidate build, validation gates, R2 staging upload, the synthetic fixture | `04-corpus-contract` (`CRPS-01`…`CRPS-08`). PRD §44.3 makes corpus schema/manifest serial-owned there. PRD §40.9's stage graph splits at `S[Sign manifest + upload staging]` → `V[Production verify/download]`: everything left of the arrow is `04`, everything right of it is `RLSE-07`. |
| Search process, retrieval profile, retrieval benchmark harness | `11-retrieval-engine` (`RETR-01`…`RETR-10`). `RLSE-11` runs at real scale on the real host and **consumes** `RETR-10`'s `retrieval-benchmark-report.json`; it does not re-implement it. |
| Export job admission, renderers, signed-URL generation and the export UI | `19-exports` (`XPRT-01`…`XPRT-05`, `XPRT-01 blocked_by RLSE-04`). This module owns the S3 prefix, its lifecycle and its least-privilege credential — not the application code that uses them. |
| The corpus release/promotion **console**, incidents, kill switches, cost console | `22-internal-admin` (`INTL-04`, `INTL-07`, `INTL-09`; `INTL-04 blocked_by RLSE-07`). This module ships the tool and the audit record shape; the operator UI and the customer-visible incident state machine are `22`. |
| The public marketing/status **page** | `24-launch` (`LNCH-03`, `blocked_by RLSE-08`). `RLSE-08` publishes the machine-readable status document to the edge so the page survives an origin outage (PRD §13.3 *"Public status page independent of the origin server"*); it renders nothing. |
| Cross-boundary suites under `tests/**`, including the restore/DR assertions | `23-assurance` (`ASSR-02 blocked_by RLSE-01`, `ASSR-08 blocked_by RLSE-09`). Unit/integration tests for this module live **inside** its own `infra/**` subtrees (breakdown-plan §1.1). |
| The cost ledger, reservation/settlement arithmetic and the admission circuit breaker | `00-foundation` (`FND-09`) and `12-evidence-safety` (`EVID-08`). PRD §42.6's breaker is admission control inside the application; this module alerts at 90%/100% (`RLSE-08`) and keeps its own infrastructure inside the PRD §24.1 lines. |
| Choosing the hosted models, embedding model or retrieval constants | **Benchmark-selected** (breakdown-plan §8 Q1/Q2/Q4; PRD §14.4) — resolved by measured evidence through `GOLD-15`/`RETR-10`, not by preference and not here. `RLSE-11` resolves **only** Q3's four deferred values (always-hot vector count, semantic-cache entry/byte limit, search resident-memory allocation, cold/hot tier boundary). |
| The alert **email channel**, the `EmailTransport` port and the **Resend adapter** | `16-monitor-alerts` (`WTCH-04`, `WTCH-09`). breakdown-plan §8 **Q14** confirms Resend as the provider; the channel and its adapter are module 16's and must not be duplicated here. This module owns only the ops-side halves: the `RESEND_API_KEY` production secret group (`RLSE-02`) and the sending-domain DNS records (`RLSE-03`). |
| Provisioning real infrastructure, holding real credentials, running against production | Standing reason: **PRD §20.2** — *"Coding agents MUST NOT receive production SSH, database, backup, signing or provider credentials by default."* Every ticket here produces configuration and tooling; a human operator applies it. |

## Decisions

Each decision states its basis: a PRD section, a breakdown-plan §2.1 ADR candidate, a breakdown-plan
§8 decision-register entry, or an explicit naming choice classified under PRD §45.5. The register
entries that bind this module are recorded in their own subsection immediately after this table —
they are settled decisions or declared future measurements, **not** open questions. Where neither the
PRD nor the register answers, the item is an open question below.

| # | Decision | Basis |
|---|---|---|
| D1 | **Production is systemd units + cgroups over an immutable, signed, versioned release archive.** No container runtime, no orchestrator, no source build and no floating package install ever runs on the production host. | PRD §39.2 *"Production uses systemd units/cgroups for the app, worker, search, Litestream and cloudflared processes. CI publishes an immutable versioned release archive with checksums/signature; no source build or floating package install occurs during promotion."*; §19.1 *"Production MUST NOT compile application code, build large indexes or generate mass embeddings"*; §20.3; §18.1 (no Kubernetes/service mesh); breakdown-plan **A7**. |
| D2 | **`infra/compose/**` is invisible to this module.** No ticket here reads, writes, imports or references it as a production artifact, and no production procedure may require it. | breakdown-plan **A7**; PRD §39.2; PRD §44.3's single phrase resolved into two owners in breakdown-plan §4.1. |
| D3 | **Two independent pointers, both swapped by `rename(2)` over a symlink.** `/srv/aer/app/current` → `/srv/aer/app/releases/<version>` (the PRD §20.4 "atomic application pointer") and `/srv/aer/corpus/active` → `/srv/aer/corpus/releases/<id>` (PRD §39.3's "atomic symlink/pointer"). Application and corpus releases are promoted and rolled back **independently**. | PRD §20.4 *"versioned release directories, candidate health checks and an atomic application pointer. Application and corpus releases are independently versioned and declare compatibility ranges."*; PRD §39.3. `/srv/aer/app/current` is a naming choice — PRD §39.3 names the release directory but not the pointer; classified "Implementation detail" under PRD §45.5 and fixed here so every ticket and runbook uses one name. |
| D4 | **The shared host primitives live in `infra/deploy/host/lib/**` and are owned by `RLSE-02`.** `HostAdapter` (filesystem/systemd/process), `swapPointer()`, `AuthorisationProvider`, `preflight()` and the PRD §39.3 path constants. `RLSE-03`, `RLSE-06`, `RLSE-07`, `RLSE-08` and `RLSE-11` consume them and are all `blocked_by RLSE-02` transitively or directly. | Avoids five copies of the same pointer-swap primitive without creating a file two in-flight tickets write (breakdown-plan §2). The DAG already orders it: `RLSE-02 --> RLSE-03 & RLSE-06 & RLSE-07 & RLSE-11` (breakdown-plan §6.2). |
| D5 | **`RLSE-05` and `RLSE-09` deliberately do not consume D4's primitives.** Backup replication and the restore drill must work when the production host is gone. PRD §42.3's whole-server recovery starts with *"recreate Sydney compute/storage"* and PRD §23.2 requires an **isolated** environment. Each ships its own minimal environment builder. | PRD §23.2, §42.3. Also a DAG fact: neither `RLSE-05` (`blocked_by RLSE-04, DATA-01`) nor `RLSE-09` (`blocked_by RLSE-05`) has `RLSE-02` in its blocker closure, so importing it would be an undeclared dependency. |
| D6 | **Every host-touching operation goes through a `HostAdapter`, with a `LocalRootHostAdapter` that operates on a temporary directory and a recorded command log.** Every merge-blocking test uses the local adapter; the systemd adapter is exercised only by `[human]` checks that are explicitly *not required to merge*. | PRD §20.2 (no production credentials for agents); CLAUDE.md (the Reviewer re-runs the full suite independently, so every gate must be locally reproducible). |
| D7 | **A failed app candidate cannot modify the active pointer, any existing release directory, or the corpus tree.** Candidate systemd units run with `ProtectSystem=strict`, `NoNewPrivileges=yes`, `PrivateTmp=yes` and a `ReadWritePaths` list that excludes `/srv/aer/app/current`, `/srv/aer/app/releases/**` and `/srv/aer/corpus/**`. The pointer swap is the single privileged step and happens **after** the candidate is healthy. | PRD §12.2 *"Failed releases MUST NOT modify active production data"*; PRD §39.7 steps 5–6; PRD §21.1. |
| D8 | **The app candidate does share `app.sqlite` — and that is stated, not hidden.** PRD §39.7 step 4 runs expand migrations *before* the candidate starts, and PRD §42.1 requires readiness to prove *"App DB writable"*. Expand-only migrations (breakdown-plan **A5**, PRD §20.4) plus the **forced recovery point** of PRD §39.7 step 3 are the prescribed mitigations, and `RLSE-06` refuses to proceed without a confirmed recovery point. | PRD §39.7 steps 3–5; PRD §23.1 *"Force a confirmed recovery point before migrations, auth/application changes, bulk customer operations and key rotation."* |
| D9 | **Corpus promotion is strictly `download → verify → shadow-where-memory-permits → atomic pointer switch`, and every failure mode leaves the active pointer byte-identical.** Candidate bundles are only ever written under `/srv/aer/corpus/releases/<id>`, never under `active`. | PRD §18.4; PRD §40.9's `V → H → A` tail; `ADM-002` *"Promotion failure leaves active pointer unchanged"*; `UAT-OPS-01`. |
| D10 | **Promotion authority is a fail-closed seam, not an assumption.** `RLSE-06`/`RLSE-07` require an `AuthorisationProvider` returning a recent-MFA assertion, an actor, a reason and a typed confirmation of the exact version/hash; with no provider bound the tool refuses. `22-internal-admin` (`INTL-04`) binds the real provider over `packages/auth` (`AUTC-02`). | PRD §20.4 *"Founder-authorised promotion requires recent MFA, explicit version/changelog confirmation, health/space/compatibility checks and forced database recovery point."*; `ADM-002`. Neither ticket has a `blocked_by` edge to `AUTC-02`, and inventing one would change the DAG (breakdown-plan §6.2) — the seam is how the requirement is honoured without it. |
| D11 | **Backup selection is an explicit allowlist of exact file names, never a glob.** `infra/backup/**` names `app.sqlite` and its WAL/SHM siblings and calls `DATA-08`'s `assertNotBackedUp(candidateGlobs)` in its own test suite. Corpus databases, indexes and application binaries are never replicated to customer backup storage. | PRD §39.3 *"The app database, ephemeral database and corpus cannot share a wildcard backup rule"*; PRD §23.1 *"Corpus databases/indexes and application binaries are rebuilt from immutable releases rather than duplicated into customer backup storage"*; PRD §10.4. |
| D12 | **Backup health is a generated-and-validated recovery point, never process liveness.** `RLSE-05` forces a checkpoint, waits for the object to appear, restores it to a temporary path and runs `PRAGMA integrity_check` before reporting a recovery point. | PRD §42.3 *"monitored by generation/validation of a recovery point, not merely 'process is running'"*; `OPS-001`. |
| D13 | **Two S3 prefixes, four distinct policies, one owner.** `backups/` (Litestream write-only, no `DeleteObject`) and `exports/` (worker write, app read/sign) live under one bucket with separate least-privilege policies; destructive deletion and break-glass restore are a **fourth** identity that is never injected into a systemd unit. `RLSE-04` owns both prefixes because `19-exports` needs one of them. | PRD §19.2 *"The prefixes MUST use separate least-privilege permissions"*; PRD §23.1 *"Destructive backup deletion and break-glass restore credentials MUST remain outside ordinary production runtime"*; breakdown-plan §4.2. |
| D14 | **The export key layout is a published cross-module contract:** `exports/{organization_id}/{export_id}/{artifact}`. `RLSE-04` defines it; `XPRT-01` mirrors it. The layout carries no customer text and no file name derived from research content. | PRD §19.2; `EXP-002`; PRD §37.3 (content-retention matrix); mirrors the pattern `CRPS-07` already uses for the R2 key layout consumed by `RLSE-07`. |
| D15 | **Post-deploy verification and continuous external checks are two different artifacts.** `RLSE-06` owns the one-shot PRD §39.7 step-7 verification inside the deploy transaction; `RLSE-08` owns the scheduled PRD §22 external checks. They are not merged, because `RLSE-08` is not in `RLSE-06`'s blocker closure and an invented edge would change the DAG. | PRD §39.7 step 7 vs PRD §22 *"External checks cover liveness, readiness, authenticated synthetic Search and strictly budgeted synthetic Answer"*; breakdown-plan §6.2. Consolidation later is a writeback, not a local merge. |
| D16 | **Alert thresholds are declarative configuration over `RUNT-07`'s metric families, and every PRD §42.2 row must fire in a controlled drill before `OPS-002` is claimed.** | PRD §42.2's table; `OPS-002` minimum acceptance evidence: *"Alerts fire in controlled failure drills."* |
| D17 | **Degradation is directional under memory pressure: hot dense vector coverage and the semantic cache shrink before lexical corpus coverage.** Full lexical corpus coverage is kept; every process keeps an explicit memory limit (D1, `RLSE-02`); and any dense-coverage downgrade is **disclosed**, never silent. `RLSE-11` computes the reduction; it never proposes narrowing legal scope. This **policy is settled** (breakdown-plan §8 **Q3**); the four numbers it governs are deferred until `RLSE-11` measures them. | PRD §39.2 *"If the search process exceeds its limit, reduce always-hot vector coverage/cache before removing lexical corpus coverage"*; PRD §26 *"2 GB real-scale performance/memory/disk benchmark passes or hot dense coverage is safely reduced"*; breakdown-plan §8 **Q3**. |
| D18 | **No new recurring paid service is adopted inside a ticket.** Anything that adds a line to PRD §24.1's A$42–50 table — a second host, a managed monitoring service, a paid uptime provider, Cloudflare Paid Workers — is a Founder decision recorded as an open question here first. | PRD §24.1 *"Cloudflare Paid Workers is not a default dependency. Actual provider billing MUST be monitored; the system MUST stop before exceeding the founder-funded ceiling."*; PRD §45.5 ("Product change … requires founder approval"). |
| D19 | **Ports and unit names are fixed once, here.** Serving: `aer-app.service` on `127.0.0.1:3000`, `aer-worker.service`, `aer-search.service` on `127.0.0.1:7700`, `aer-litestream.service`, `aer-cloudflared.service`. Candidate/shadow: `aer-app-candidate.service` on `127.0.0.1:3001`, `aer-worker-candidate.service`, `aer-search-shadow.service` on `127.0.0.1:7701`. Nothing else binds a port, and no candidate port is ever reachable from the tunnel. | PRD §39.4's network matrix (`Cloudflare Tunnel → 127.0.0.1:3000`; `app`/`worker` → `127.0.0.1:7700`; *"Search exposes no public port"*); PRD §39.7 step 5 *"Candidate systemd units start on a private health route/ports"*. The candidate port numbers are an implementation detail under PRD §45.5, fixed so runbooks and tooling agree. |
| D20 | **Release identity:** an application release is `<semver>+<git-short-sha>`; its archive is `aer-app-<version>.tar.zst`; its manifest is **`app-release-manifest.json`**, deliberately distinct from the corpus bundle's `release-manifest.json` (PRD §18.4) so the two can never be confused by a verifier, a runbook or an operator. | PRD §20.4 *"Application and corpus releases are independently versioned and declare compatibility ranges"*; PRD §18.4's bundle layout. |
| D21 | **Tooling language and test entry.** All tooling is plain Node ESM (`.mjs`) using the standard-library test runner, so every suite is runnable both as `pnpm test` (through the workspace member `FND-01` declares for `infra/*` in `pnpm-workspace.yaml`) **and** directly as `node --test infra/<area>/test` with no workspace resolution. No ticket in this module writes `pnpm-workspace.yaml` or any root manifest. | PRD §45.3's command list; breakdown-plan §4 (root manifests are `00-foundation`'s); the direct-invocation fallback keeps every gate reproducible if the workspace glob is missing — see **Q-RLSE-9**. |
| D22 | **Test layout.** Each ticket's tests live under `<its own file-scope>/test/**` and its fixtures under `<its own file-scope>/fixtures/**`. No ticket writes into a sibling's tree, and nothing in this module writes `tests/**` (that is `23-assurance`). | breakdown-plan §1.1 *"Unit/integration tests live inside the owning package or app and belong to that module's tickets."* |
| D23 | **Signing keys, provider tokens and break-glass credentials never exist in the repository.** Tooling reads them from a filesystem path or environment variable only; the committed fixtures are development keypairs whose `key_id` starts `dev-`, mirroring `CRPS-02`'s convention. | PRD §39.6 *"Offline signing and destructive backup credentials are never present on the host"*; PRD §20.2; `CRPS-02` deliverable 8. |

### Decision-register entries binding on this module (breakdown-plan §8)

`docs/prd/breakdown-plan.md` §8 is the canonical wording; this subsection carries the entries this
module must act on, so its tickets stay cold-startable. The identifiers are unchanged, so existing
cross-references from `RLSE-02`, `RLSE-03`, `RLSE-10` and `RLSE-11` still resolve. A **confirmed**
entry is settled: no ticket may re-open it, substitute its own preference for it, or describe it as
pending. A **deferred** entry is a declared future measurement, not a missing decision.

**Q7 — IPv6-only versus IPv4-inclusive Lightsail. Status: CONFIRMED CONDITIONAL DECISION.**

*Resolving tickets: `RLSE-02` (the `AER_IP_PROFILE` parameter plus the fail-closed evidence seam) and
`RLSE-03` (the end-to-end connectivity test that computes the verdict). Also recorded in
`docs/runbooks/server-rebuild.md` (`RLSE-10`). PRD basis: §19.1, §24.1. Blocks nothing before first
provisioning.*

This is the rule, not a preference:

1. Provision and test the cheaper **IPv6-only** profile first.
2. Run the full end-to-end connectivity test `RLSE-03` defines: **DNS, TLS, Cloudflare Tunnel,
   authenticated readiness, public status, latency, origin-port protection.**
3. If **every mandatory check passes**, IPv6-only is the production profile.
4. If **any required IPv6 check fails**, use the IPv4-inclusive profile within the budget reserve.
   PRD §19.1 prescribes that fallback itself (*"otherwise use the IPv4-inclusive plan within the cost
   reserve"*), so it is not a new D18 spend decision.
5. **The evidence decides.** Once the test report exists the Founder is not asked to choose on
   preference, and neither ticket commits a default profile.
6. **Cost saving is never a reason to keep IPv6-only after a connectivity or operational check has
   failed.**

**Adopted profile:** *pending first provisioning.* It MUST be recorded here **together with the real
connectivity report** it came from (`infra/cloudflare/reports/connectivity-<profile>-<timestamp>.json`),
naming any failed mandatory check. A profile recorded without its report is not a record.

**Q14 — Transactional email provider. Status: CONFIRMED PROVIDER DECISION.**

*Ops-side resolving tickets here: `RLSE-02` (the `RESEND_API_KEY` secret group) and `RLSE-03` (the
sending-domain DNS records). The channel, the `EmailTransport` port and the Resend adapter belong to
`16-monitor-alerts` (`WTCH-04`, `WTCH-09`) and must not be duplicated in this module. PRD basis:
§8.8, §24.1, §39.6.*

- Provider: **Resend**, on the Resend Free transactional-email tier. Expected MVP provider cost within
  the free allowance is **A$0/month**, so PRD §24.1's A$42–50 table gains no line. This satisfies
  **D18**: the provider was decided by the Founder in the register, not adopted inside a ticket.
- Current planning allowance: 3,000 emails/month, 100/day. Provider pricing and allowances are
  external operational configuration that can change; they are not a permanent PRD guarantee, and
  needing a paid tier would be a fresh D18 decision.
- The API key lives **only** in the production sealed-secret layer, under the name `RESEND_API_KEY`
  (`RLSE-02` deliverable 7 — PRD §39.6's *"email credential"* group). It must never be committed,
  logged, or exposed to coding agents (PRD §20.2, §22, §39.6).
- The **sending domain must be verified with the correct DNS records.** Those records are owned here
  by `RLSE-03` (`infra/cloudflare/dns/records.yml`): declarative, DNS-only, carrying no origin address
  and no credential.
- Transactional email still must not contain customer questions, answers, evidence excerpts or
  Research Record content (PRD §22, §37.3).
- Restore drills keep using `NullTransport`; tests keep using offline/fake/file transports (`RLSE-09`;
  PRD §42.3's *"no emails/webhooks/providers/real sessions fire"*).
- The bounce/complaint/suppression-processing gap stays open until a ticket explicitly plans and
  implements it — a stated known gap, not a silent one.

**Q3 — always-hot vectors and semantic-cache size. Status: DEFERRED UNTIL REAL-SCALE MEASUREMENT.**

*Owner `18-ops-release`; resolved by `RLSE-11` against the real 2 GB benchmark. PRD basis: §17.2,
§36.2, §39.2, §27. Blocks the launch decision to reduce hot dense coverage before lexical scope
(PRD §26).*

The governing **policy is settled** and is repeated as **D17**: keep full lexical corpus coverage;
reduce hot dense coverage before cutting lexical scope; respect the 2 GB production-host budget; give
every process an explicit memory limit; and disclose any dense-coverage downgrade rather than letting
it happen silently.

Still awaiting measurement — deliberately unfilled here, and never guessed:

| Deferred value | Recorded by | Measured value |
|---|---|---|
| Always-hot vector count | `RLSE-11` | *not yet measured* |
| Semantic-cache entry/byte limit | `RLSE-11` | *not yet measured* |
| Search resident-memory allocation inside PRD §39.2's 768 MiB limit | `RLSE-11` | *not yet measured* |
| Cold/hot tier boundary (recorded here; the shipped default is `CRPS-04`'s) | `RLSE-11` | *not yet measured* |

PRD §17.2's *"approximately 150,000–300,000 always-hot semantic chunks"* is a **capacity hypothesis**
that the PRD itself requires to be *"replaced by measured corpus statistics"*. It must never be
presented as a product commitment, a target or a recommendation; inside this module it may appear only
as the `prd_hypothesis` column of `RLSE-11`'s `hypothesis_comparison`.

**Q1, Q2, Q4 (benchmark-selected) and Q5 (deferred until corpus measurement)** are not this module's
to decide and are not missing product decisions. Q1 (hosted model per profile), Q2 (embedding model
and representation) and Q4 (retrieval constants) are resolved by measured evidence through
`GOLD-15`/`RETR-10`; Q5 (measured corpus statistics and the capacity claims that depend on them) is
resolved by `GOLD-16` (`21-evaluation-600`). `RLSE-11` feeds them measurements; it never selects for
them.

## Rejected alternatives

| Rejected | Why |
|---|---|
| **Containers/Kubernetes/Nomad in production**, or reusing `infra/compose/**` as the production runtime. | PRD §18.1 forbids Kubernetes, service mesh and module-per-service deployment in the MVP; PRD §39.2 selects systemd and calls Compose *"a local/CI convenience, not a production dependency"*; breakdown-plan **A7**. Reusing Compose would also give two modules one artifact — precisely what §4.1 exists to prevent. |
| **Blue/green on two hosts**, or a standing staging server. | PRD §20.2 *"No permanently running paid staging server."* A second Sydney Lightsail 2 GB instance is A$14–15/month against a A$42–50 total (PRD §24.1) — it consumes the entire variance reserve. Replaced by D3/D7: candidate units on a private port on the same host. |
| **`git pull && pnpm install && pnpm build` on the host.** | PRD §19.1 *"Production MUST NOT compile application code, build large indexes or generate mass embeddings"*; PRD §20.3 *"Production MUST verify and run it without floating installs or builds"*; PRD §39.2 *"no source build or floating package install occurs during promotion."* |
| **Rebuilding or mutating the active corpus in place** (for example applying a delta to `corpus.sqlite`). | PRD §18.4 *"Active data MUST never be rebuilt or mutated in place."* Replaced by D9's whole-bundle download and pointer switch. |
| **Backing up `corpus.sqlite`, the indexes or the application binaries to S3 with the customer data.** | PRD §23.1 *"Corpus databases/indexes and application binaries are rebuilt from immutable releases rather than duplicated into customer backup storage."* It would also multiply the A$1–2 S3 line by a factor of a hundred (PRD §24.1) and put public artifacts under customer-data controls. |
| **A single wildcard backup rule** such as `/srv/aer/data/*.sqlite*`. | PRD §39.3 *"The app database, ephemeral database and corpus cannot share a wildcard backup rule"*, and PRD §10.4 *"[ephemeral content] MUST NOT enter Litestream, daily/weekly backups, exports or support tools."* Replaced by D11's explicit allowlist plus `DATA-08`'s `assertNotBackedUp`. |
| **Treating "the Litestream process is running" as backup health.** | PRD §42.3 states the opposite in one sentence. Replaced by D12. |
| **Automatic database rollback when an app release is rolled back.** | PRD §39.7 *"Database rollback is not automatic; use a forward fix unless the runbook explicitly restores a verified recovery point during maintenance."* `RLSE-06`'s rollback refuses to touch the database and prints the runbook path. |
| **One S3 credential for backups and exports.** | PRD §19.2 *"The prefixes MUST use separate least-privilege permissions"*; PRD §39.4 *"Backup and export use different credentials and prefixes."* |
| **Keeping the offline signing key or the destructive-backup credential on the host** so promotion can be fully automated. | PRD §39.6 *"Offline signing and destructive backup credentials are never present on the host"*; PRD §23.1. Promotion is founder-authorised by design (D10), not unattended. |
| **A hosted observability/uptime SaaS** (Datadog, Grafana Cloud, Better Uptime paid tier) or **Cloudflare Paid Workers** for the status page. | PRD §24.1 lists no such line and states *"Cloudflare Paid Workers is not a default dependency."* Any paid choice is D18 — a Founder decision, recorded as **Q-RLSE-4**, never an assumption inside a ticket. |
| **Hosting the status page on the origin server.** | PRD §13.3 *"Public status page independent of the origin server."* A status page that goes down with the origin reports nothing at the only moment it matters. |
| **Serving `/health/*` publicly** so an external checker can reach it directly. | PRD §42.1 marks both as *"Tunnel-restricted probe"* and PRD §39.4 states *"Search exposes no public port."* External checks authenticate through the tunnel (`RLSE-03`/`RLSE-08`). |
| **Giving the deploy tool a production SSH key inside CI** so promotion is a pipeline step. | PRD §20.2 and PRD §39.2 *"SSH is IP/key restricted and disabled for coding agents."* CI **builds and signs**; a human **promotes** (PRD §20.4). |
| **One "build the deployment" ticket.** | The module would be a single serial lane, which breakdown-plan §2/§7 forbid; the 11-way split reaches the 5-wave minimum at concurrency 3 (breakdown-plan §7). |
| **Letting `RLSE-11` edit a shipped retrieval or tiering default when its measurements suggest a better constant.** | Those files belong to `RETR-01`/`CRPS-04`, and CLAUDE.md/issue #53 make the ticket the spec. `RLSE-11` measures, decides Q3 and writes back; a default change is a docs PR against the owning ticket plus `publish-tickets.mjs --sync`. |

## Open questions

None blocks the module's first wave. Each names an owner and the artifact that resolves it. Anything
that would add a recurring line to PRD §24.1's A$42–50 table is a **Founder** decision under D18.
breakdown-plan §8's **Q7** (IP profile) and **Q14** (email provider) are **confirmed decisions**, and
**Q3** is a **declared future measurement**: all three live in the decision-register subsection above,
not in this table.

| # | Question | Owner | Resolved by | Blocks | Basis |
|---|---|---|---|---|---|
| **Q-RLSE-1** | **Where does host-side discovery state (`ingestion.sqlite`) live, and does the production host run discovery-only ingestion at all?** PRD §19.3 says *"The production server continues lightweight source discovery so source health does not depend on the workstation being online"*, but PRD §39.3's filesystem table has no row for it. Raised as **M1** in `docs/prd/05-ingestion-framework/README.md` with `RLSE-02` named as owner. | `18-ops-release` (`RLSE-02`) | `RLSE-02` adds exactly one path to the layout with an explicit backup classification (rebuildable → **excluded** from Litestream, per PRD §23.1), and writes back to `docs/prd/05-ingestion-framework/README.md` M1 | Nothing — `INGF-05`/`INGF-08` default to a workstation-local path taken from configuration | PRD §19.3, §39.3, §23.1 |
| **Q-RLSE-2** | **Production custody of the PRD §39.6 secret groups** — which sealed/encrypted injection mechanism, and who holds the field-encryption key and its rotation path. Raised as **M-Q2** in `docs/prd/01-app-data/README.md` with the Founder and `RLSE-02` named. | **Founder**, staged through `RLSE-02` | `RLSE-02` ships the layering and the *shape* of every group with a fail-closed startup validation; the Founder chooses the custody mechanism. If the choice is a paid service it is D18 | Nothing before first provisioning | PRD §39.6, §23.1, §20.2, §45.5 |
| **Q-RLSE-3** | **The application pointer mechanism** — symlink + `rename(2)` (D3) vs a systemd template unit with a port swap at the tunnel. **ADR candidate:** it is a durable deployment trade-off under PRD §45.5. | `18-ops-release` (`RLSE-06`) | `RLSE-06` records the choice in a new `docs/adr/NNNN-application-release-pointer.md` (breakdown-plan **A9**: the creating ticket claims the file) | Nothing — D3 is buildable today | PRD §20.4, §39.7, §45.5 |
| **Q-RLSE-4** | **From where do the external checks run, at A$0?** PRD §22 requires *"External checks cover liveness, readiness, authenticated synthetic Search and strictly budgeted synthetic Answer"* and PRD §13.3 a status page independent of the origin, but PRD §24.1 budgets no monitoring line — and a host-local runner cannot detect a host outage. **The delivery-provider half is closed:** plan §8 **Q14** confirms Resend on the free tier at A$0, with the channel and adapter owned by `WTCH-04`/`WTCH-09` and the key and DNS records owned here (register subsection above). What remains open is the **runner location** and any **paid** uptime/monitoring service, which is D18. | `18-ops-release` (`RLSE-08`) proposes the A$0 runner; **Founder** approves any paid path | `RLSE-08` ships a pluggable notifier whose A$0 `FileNotifier`/`EdgeStatusNotifier` path is always available, documents the workstation/free-scheduler runner and states the residual gap honestly | `OPS-002`'s outside-the-origin half only — the measurements and drills are unaffected | PRD §22, §13.3, §24.1, §42.2 |
| **Q-RLSE-5** | **Where does the monthly restore drill run?** PRD §23.2 requires *"an isolated environment with email, webhook, provider calls, SSO callbacks and real sessions disabled"* and PRD §42.3 step 1 requires *"isolated temporary host/network"*. A temporary Lightsail instance costs money per drill; containers on the founder workstation cost nothing. | `18-ops-release` (`RLSE-09`) proposes; **Founder** approves any spend (D18) | `RLSE-09` ships the workstation/container path as the default and the temporary-host path as an option, and records the achieved RPO/RTO for whichever was used | Nothing — `OPS-001`'s monthly cadence is satisfied by either | PRD §23.2, §42.3, §24.1 |
| **Q-RLSE-6** | **Can the real-scale 2 GB benchmark run on the production host without customer impact, or does it need a temporary identical instance?** PRD §13.2 makes the objectives *"subject to the representative 2 GB production benchmark"* but PRD §19.1 forbids heavy work on the production host. | **Founder** (cost) with `18-ops-release` (`RLSE-11`) | `RLSE-11` runs pre-launch on the production host **before** paid access exists (the only impact-free window), or on a temporary identical instance if the Founder approves the cost; the report records which | PRD §26's benchmark item, via `LNCH-05` | PRD §13.2, §19.1, §24.1, §26 |
| **Q-RLSE-7** | **Metrics exposition protocol/endpoint.** PRD §22 names the metric families; PRD §42.1 names no metrics endpoint. Raised as **QR3** in `docs/prd/03-app-runtime/README.md`, owned by `RUNT-07` with this module as the consumer. | `03-app-runtime` (`RUNT-07`) | `RUNT-07`'s pluggable exporter; **confirmed** by `RLSE-08`, which is the first real consumer. A change of protocol is a writeback to `docs/prd/03-app-runtime/README.md` §6, not a local re-implementation | Alerting wiring only | PRD §22, §42.2, §45.5 |
| **Q-RLSE-8** | **Does the promotion CLI verify recent MFA itself, or only accept an assertion minted by the internal admin path?** D10 makes it a fail-closed seam; the real binding is `INTL-04` (`blocked_by RLSE-07`), and no `blocked_by` edge exists from `RLSE-06`/`RLSE-07` to `AUTC-02`. | `18-ops-release` (`RLSE-06`) with `22-internal-admin` (`INTL-04`) | `INTL-04` binds the provider and confirms the assertion shape; a shape change is a docs PR against `RLSE-06`/`RLSE-07` | Nothing — the seam refuses by default, which is the safe state | PRD §20.4, §38.2, `ADM-002` |
| **Q-RLSE-9** | **Does `FND-01`'s `pnpm-workspace.yaml` include `infra/*`?** D21 assumes it does and provides the `node --test` fallback if it does not. | `00-foundation` (`FND-01`) | Confirmed or falsified by `RLSE-01`, the first ticket here to ship a test suite; a gap is a `00-foundation` ticket plus a note in this table — **never** a root-manifest edit from this module | Nothing — the fallback is always available | breakdown-plan §4, §1.1; PRD §20.1, §45.3 |
| **Q-RLSE-10** | **Who serves `/.well-known/security.txt`?** PRD §21.1 requires *"`security.txt` and a vulnerability-reporting address"* but no PRD section names a path or an owner. `RLSE-03` ships it at the edge so it survives an origin outage; `LNCH-03` (`apps/web/public-site/**`) is the alternative owner. | `18-ops-release` (`RLSE-03`) proposes; `24-launch` (`LNCH-03`) may claim it | `RLSE-03` ships it; if `LNCH-03` claims it instead, that is a writeback to this table and to `docs/prd/breakdown-plan.md` §4.2 | Nothing | PRD §21.1, §19.1, §45.5 |

## Work breakdown

Lane is `18-ops-release` and agent is `builder` for all eleven tickets (breakdown-plan §1.1).
File-scopes are relative to the repository root, are exactly breakdown-plan §5.19, are disjoint
between siblings, and all lie inside the module's §4 write-owns row. `depends-on` is exactly
breakdown-plan §5.19; `blocks` on each ticket is the exact inverse from §6.2.

| Ticket | Size | Lane | File-scope (write-owns) | Depends on |
|---|---|---|---|---|
| [`RLSE-01`](tickets/RLSE-01-immutable-release-archive-build-checksums-signature-sbom.md) — Immutable release archive: build, checksums, signature, SBOM | L | `18-ops-release` | `infra/deploy/release/**` | `FND-02`, `RUNT-01`, `RUNT-04`, `RETR-01` |
| [`RLSE-02`](tickets/RLSE-02-production-host-baseline-systemd-cgroups-filesystem-layout.md) — Production host baseline (systemd, cgroups, filesystem layout) | L | `18-ops-release` | `infra/deploy/host/**` | `RLSE-01` |
| [`RLSE-03`](tickets/RLSE-03-cloudflare-edge-tunnel-dns-tls-pages-origin-protection.md) — Cloudflare edge: tunnel, DNS/TLS, Pages, origin protection | M | `18-ops-release` | `infra/cloudflare/**` | `RLSE-02` |
| [`RLSE-04`](tickets/RLSE-04-s3-sydney-backup-and-export-prefixes-with-least-privilege.md) — S3 Sydney backup and export prefixes with least privilege | M | `18-ops-release` | `infra/aws/**` | `RLSE-01` |
| [`RLSE-05`](tickets/RLSE-05-litestream-replication-and-recovery-point-validation.md) — Litestream replication and recovery-point validation | M | `18-ops-release` | `infra/backup/**` | `RLSE-04`, `DATA-01` |
| [`RLSE-06`](tickets/RLSE-06-app-deploy-and-rollback-tooling.md) — App deploy and rollback tooling | L | `18-ops-release` | `infra/deploy/promote/**` | `RLSE-02`, `RLSE-05` |
| [`RLSE-07`](tickets/RLSE-07-corpus-promotion-and-rollback-tool.md) — Corpus promotion and rollback tool | L | `18-ops-release` | `infra/deploy/corpus/**` | `RLSE-02`, `CRPS-07` |
| [`RLSE-08`](tickets/RLSE-08-alerting-external-checks-and-status-page.md) — Alerting, external checks and status page | M | `18-ops-release` | `infra/deploy/monitoring/**` | `RLSE-03`, `RUNT-08` |
| [`RLSE-09`](tickets/RLSE-09-restore-drill-tooling-and-isolated-recovery-environment.md) — Restore drill tooling and isolated recovery environment | L | `18-ops-release` | `infra/recovery/**` | `RLSE-05` |
| [`RLSE-10`](tickets/RLSE-10-the-ten-runbook-files.md) — The ten runbook files | M | `18-ops-release` | `docs/runbooks/**` | `RLSE-06`, `RLSE-07`, `RLSE-09` |
| [`RLSE-11`](tickets/RLSE-11-real-scale-2gb-benchmark-and-hot-dense-coverage-decision.md) — Real-scale 2 GB benchmark and hot-dense-coverage decision | L | `18-ops-release` | `infra/deploy/benchmark/**` | `RLSE-02`, `RETR-10`, `CRPS-06` |

Wave shape (breakdown-plan §7: **5 minimum waves, 3 useful lanes, not fully serial**). External
blockers are shown in brackets:

```text
wave 1  RLSE-01 [FND-02, RUNT-01, RUNT-04, RETR-01]
wave 2  RLSE-02                     | RLSE-04
wave 3  RLSE-03                     | RLSE-05 [DATA-01]        | RLSE-07 [CRPS-07]
wave 4  RLSE-06                     | RLSE-08 [RUNT-08]        | RLSE-09
wave 5  RLSE-10                     | RLSE-11 [RETR-10, CRPS-06]
```

`RLSE-11` has no intra-module blocker beyond `RLSE-02` and may run as early as wave 3; it is placed
in wave 5 above only to show a schedule that reaches the 5-wave minimum at concurrency 3, and
because its external blockers (`RETR-10`, `CRPS-06`) land late in the global schedule.

There are **no module-shared files** in this module: every ticket's file-scope is a distinct subtree,
and no ticket writes a root manifest, a lockfile, `pnpm-workspace.yaml`, `.github/workflows/**` or
`infra/compose/**` (D2, D21, D22). The only shared-additive writes are new `docs/adr/NNNN-*.md`
files, claimed per file by their creating ticket under breakdown-plan **A9**.

## Acceptance — what makes the whole module done

The module is done when all eleven tickets are delivered (`/verify-delivery` green each) **and**:

1. **`OPS-001` — replication meets the ≤15-minute target and restore is tested monthly.**
   PRD §30.2's minimum evidence is *"Timestamped restore report and integrity checks pass."*
   `RLSE-05` demonstrates measured replication lag below the PRD §42.2 critical threshold of 15
   minutes and a recovery point validated by restore-and-`PRAGMA integrity_check` (D12); `RLSE-09`
   produces a dated drill report containing the recovery point, start/end times, **achieved RPO and
   RTO**, counts, failures and operator (PRD §42.3 step 7). The report either meets PRD §13.2's
   *"Customer-data RPO ≤ 15 minutes target"* and *"Core-service RTO ≤ 4 hours target"* or states the
   measured shortfall and its cause explicitly — a drill that reports a target it did not measure is
   a failed drill.
2. **`OPS-002` — degradation is observable without content logs.** PRD §30.2's minimum evidence is
   *"Alerts fire in controlled failure drills."* Every row of PRD §42.2 has a configured rule in
   `RLSE-08` and fires in its drill; no alert payload contains research content, evidence text, PII,
   a credential or a provider payload (PRD §22); `/v1/system-status` and the external checks report
   the PRD §42.1 states without disclosing topology.
3. **`OPS-003` — infrastructure never breaches the A$50 ceiling.** Every recurring cost this module
   introduces maps to a line in PRD §24.1's table with a stated figure, and the total stays inside
   A$42–50. `RLSE-08` alerts at the PRD §42.2 90% and 100% rows; the strictly budgeted synthetic
   Answer check has a hard daily cap and is suppressed at 90% (PRD §42.1, §42.6). No ticket in this
   module adds an unbudgeted paid dependency (D18).
4. **`ADM-002` — promotion/rollback requires recent MFA, reason and immutable audit, and failure
   leaves the active pointer unchanged.** `RLSE-07` refuses to promote without a recent-MFA
   assertion, a reason and a typed confirmation of the exact release id/hash (D10), writes an
   immutable audit record, and — under fault injection at **every** step — leaves
   `/srv/aer/corpus/active`, the active bundle and Search byte-identical. This is the
   `UAT-OPS-01` behaviour (*"Corrupt candidate corpus fixture → Promotion blocked; active
   release/search unchanged"*), whose candidate-side half is `CRPS-06`'s.
5. **The PRD §23 restore and rollback drills are demonstrated, not described.** PRD §26 Operations
   requires *"Backup lag, monthly restore procedure, app rollback and CorpusRelease rollback are
   demonstrated."* Four distinct demonstrations exist and are reproducible from `docs/runbooks/**`:
   backup lag (`RLSE-05`), monthly restore (`RLSE-09`), app rollback (`RLSE-06`) and corpus rollback
   (`RLSE-07`).
6. **A failed release cannot touch active data — proven by fault injection, not by review.**
   PRD §12.2 and §18.4. `RLSE-06` and `RLSE-07` each ship a fault-injection matrix that fails at
   every step of their sequence and asserts, for each, that the active pointer, the active release
   directory and the corpus tree are unchanged (D7, D9).
7. **The PRD §39.2 resource budget is respected and measured.** `RLSE-02`'s units set the exact
   memory limits from PRD §39.2's table; `RLSE-11` measures peak RSS per process against them at
   real scale and either passes or reduces hot dense coverage — never lexical corpus coverage (D17,
   PRD §26).
8. **The ten PRD §42.7 runbooks exist before the activities they gate.** `RLSE-10` ships all ten
   files, each naming its "Required before" activity, each quoting commands that exist in the
   repository, and each marking any step whose mechanism is owned elsewhere and not yet merged as
   `PENDING <ticket-id>` rather than describing a procedure that cannot be executed.
9. **Nothing in this module requires production credentials to merge.** PRD §20.2. Every
   `[machine]`/`[fixture]` acceptance item in every ticket runs offline against a temporary root, a
   local S3-compatible stub, a development keypair and recorded fixtures; every check that genuinely
   needs paid or production infrastructure is `[human]` and marked *not required to merge*, with the
   merge-time substitute named.
10. **`infra/compose/**` is untouched.** A diff assertion in every ticket confirms it (D2,
    breakdown-plan **A7**).
11. **Suite green on the merged default branch:** `pnpm lint`, `pnpm typecheck`, `pnpm test`
    (PRD §20.3, §45.3). No `cargo test --workspace` or `uv run pytest` item — this module authors no
    Rust and no Python.

## Changelog

- **v0.2 — 2026-08-03** — aligned with `docs/prd/breakdown-plan.md` §8's decision register.
  **Q7** (IPv6-only vs IPv4-inclusive) is now a **confirmed conditional decision** — test IPv6-only
  first, fall back to the IPv4-inclusive profile within the cost reserve on any failed mandatory
  check, the evidence decides, and cost never overrides a failed check — and is carried as a
  deliverable with acceptance items in `RLSE-02` (`AER_IP_PROFILE` plus a fail-closed
  `ConnectivityEvidenceProvider` seam and the `IPV6_CONTRADICTED_BY_EVIDENCE` refusal) and `RLSE-03`
  (the connectivity test computes the verdict from seven mandatory checks; the adopted profile is
  recorded with the report). **Q14** is now a **confirmed provider decision** (Resend, free
  transactional tier, A$0): this module owns the `RESEND_API_KEY` secret group (`RLSE-02`) and the
  sending-domain DNS records (`RLSE-03`), while the channel and adapter stay with `WTCH-04`/`WTCH-09`;
  `RLSE-08`'s "provider undecided" framing is removed and Q-RLSE-4 is narrowed to the runner location.
  **Q3** is restated as **deferred until real-scale measurement** — settled policy, four explicitly
  unfilled measured values — which `RLSE-11` now resolves, records and writes back in every status.
  Q7 and Q3 move out of the open-questions table into a decision-register subsection; Q-RLSE-1 …
  Q-RLSE-3 and Q-RLSE-5 … Q-RLSE-10 are unchanged. No change to product scope, the ticket set,
  dependency order, PRD traceability, the quality gates or the A$50 ceiling.
- **v0.1 — 2026-08-03** — initial decomposition from `docs/prd/breakdown-plan.md` §5.19 (11 tickets,
  `RLSE-01` … `RLSE-11`). Records decisions D1–D23, rejects 15 alternatives, carries breakdown-plan
  §8 Q7 (IPv6) and Q3 (`RLSE-11`, hot dense coverage) as they stood before §8 became a decision
  register — both restated by v0.2 above — and opens Q-RLSE-1 … Q-RLSE-10, four of them touching
  Founder spend under the A$50 ceiling (Q-RLSE-2 secret custody, Q-RLSE-4 the outside-the-origin check
  runner, Q-RLSE-5 drill environment, Q-RLSE-6 benchmark host) and one an ADR candidate (Q-RLSE-3, the
  application release pointer, owned by `RLSE-06`).
