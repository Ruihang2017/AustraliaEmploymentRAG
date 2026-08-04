---
id: RLSE-02
title: "Production host baseline (systemd, cgroups, filesystem layout)"
module: 18-ops-release
lane: 18-ops-release
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-01]
blocks: [RLSE-03, RLSE-06, RLSE-07, RLSE-11]
---

# RLSE-02 — Production host baseline (systemd, cgroups, filesystem layout)

Implements PRD §19.1, §39.2, §39.3 (and §39.6's configuration/secret layering) — requirement families
`OPS-002` and `OPS-003`, epic `E30-OBS-DR`. **No ADR — the decision is already made in PRD §39.2
("Production uses systemd units/cgroups …") and breakdown-plan §2.1 decision A7; this is build ticket
2 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RLSE-01`](RLSE-01-immutable-release-archive-build-checksums-signature-sbom.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope transcribing two PRD
tables (§39.2 memory limits, §39.3 filesystem layout) into enforced systemd and layout artifacts —
not a new subsystem decision.

## Background + basis

**PRD §39.2 is the specification, quoted in full for the parts this ticket implements:**

> Initial operating system is a pinned supported Ubuntu LTS image. Production uses **systemd
> units/cgroups** for the app, worker, search, Litestream and cloudflared processes. CI publishes an
> immutable versioned release archive with checksums/signature; **no source build or floating package
> install occurs during promotion. Docker Compose remains a local/CI convenience, not a production
> dependency.** Cloudflare Tunnel is the only public route to the app. **SSH is IP/key restricted and
> disabled for coding agents.**

| Process | Initial memory limit | CPU intent | Network/data access |
|---|---:|---:|---|
| `app` | 320 MiB | burst up to 1 vCPU | app/ephemeral DB, worker enqueue, export read/sign permission, search localhost |
| `worker` | 384 MiB | burst up to 1 vCPU | app/ephemeral DB, search, export write permission, approved model providers, outbox deliveries |
| `search` | 768 MiB | burst up to 2 vCPU | read-only active corpus bundle; localhost only |
| `litestream` | 96 MiB | low | read app DB/WAL; write S3 backup prefix only |
| `cloudflared` | 96 MiB | low | outbound tunnel to app only |
| OS/systemd/file cache reserve | approximately 384 MiB | — | host operations |

> These limits total the 2 GiB host and are **release-benchmark inputs**. If the search process
> exceeds its limit, reduce always-hot vector coverage/cache before removing lexical corpus coverage.
> **Swap MUST NOT be used to hide sustained working-set failure**; a small encrypted emergency swap
> file MAY prevent abrupt OOM during transient promotion but is not counted as capacity.

**PRD §39.3 fixes the filesystem layout exactly:**

| Path | Disk | Owner/access | Contents | Backup |
|---|---|---|---|---|
| `/srv/aer/app/releases/<version>` | 60 GB system | deploy read-only | immutable app manifests/config templates | CI artifact source |
| `/srv/aer/data/app.sqlite*` | system | app/worker/Litestream | mutable tenant state and WAL | Litestream to S3 Sydney |
| `/srv/aer/data/ephemeral.sqlite*` | system | app/worker only | transient research content | **Explicitly excluded** |
| `/srv/aer/log` | system | process-specific | bounded 14-day operational logs | No customer-content backup |
| `/srv/aer/corpus/releases/<id>` | 32 GB attached | search read, promoter write | active/previous/candidate bundles | Rebuild/retrieve from R2 |
| `/srv/aer/corpus/active` | attached | atomic symlink/pointer | current release | Pointer recorded in app DB/audit |
| `/srv/aer/tmp` | system | isolated process dirs | bounded downloads/exports | No |

> **The app database, ephemeral database and corpus cannot share a wildcard backup rule.** A
> CI/restore test asserts that `ephemeral.sqlite` and corpus files are absent from the Litestream
> destination.

**The host is small and the money is fixed.** PRD §19.1: *"Sydney Lightsail: 2 GB RAM, 2 vCPU, 60 GB
system disk + 32 GB attached SSD … App/worker/search MUST have explicit memory limits. Production
MUST NOT compile application code, build large indexes or generate mass embeddings."* PRD §24.1
budgets *"Sydney Lightsail 2 GB | A$14–15"* and *"32 GB attached storage | A$4–5"* inside a total of
*"A$42–50"*.

**Configuration and secrets are layered and fail closed.** PRD §39.6:

> Configuration layers are: committed safe defaults → environment-specific non-secret config →
> encrypted/sealed secret injection → internal feature flag. **Production startup validates the
> complete schema and refuses unknown critical keys.** Minimum secret groups are database
> field-encryption key, auth/session secret, S3 backup credential, S3 export credential, R2
> read/promotion credential, email credential, model-provider/platform keys, webhook encryption key
> and release-verification public key. **Offline signing and destructive backup credentials are never
> present on the host.**

**breakdown-plan decision A7 is why this ticket exists at all:**

> Local Compose is **development/CI only** (`03-app-runtime`); the *production* deployment
> configuration PRD §44.3 calls serial-owned is systemd/release material (`18-ops-release`). Two
> different artifacts share one phrase in §44.3; PRD §39.2 settles it. Recorded by `RUNT-09` /
> `RLSE-02`.

**Why `RLSE-01` is the blocker.** breakdown-plan §6.2: `RLSE-01 --> RLSE-02`. The host baseline
installs and runs a *verified archive*; the unit files invoke `RLSE-01`'s `verify-release.mjs` before
starting, and the layout's `/srv/aer/app/releases/<version>` is defined by `RLSE-01`'s release
identity (`RLSE-01` deliverable 2).

**Accepted caveats carried forward, documented not enforced here:**

- **No real host is provisioned by this ticket.** PRD §20.2 forbids giving coding agents production
  SSH. Everything here is configuration plus an installer that runs against a `--root <dir>`
  temporary tree; the real installation is an operator action documented by `RLSE-10`'s
  `docs/runbooks/server-rebuild.md`.
- **The IP profile is decided by evidence, not by preference** (breakdown-plan §8 **Q7**, a *confirmed
  conditional decision*; sub-PRD decision-register entry **Q7**). PRD §19.1: *"The lower-cost IPv6 path
  MAY be used if end-to-end tunnel/connectivity tests pass; otherwise use the IPv4-inclusive plan
  within the cost reserve."* The rule is settled, and this ticket implements its host half: provision
  and test the cheaper **IPv6-only** profile first; if **every mandatory check** of `RLSE-03`'s
  end-to-end connectivity test passes (DNS, TLS, Cloudflare Tunnel, authenticated readiness, public
  status, latency, origin-port protection), IPv6-only is the production profile; if **any required
  IPv6 check fails**, the IPv4-inclusive profile within PRD §24.1's cost reserve is used. Once the
  report exists the Founder is **not** asked to choose on preference, and **cost saving is never a
  reason to keep IPv6-only after a connectivity or operational check has failed.** So this ticket
  commits **no default profile**: it parameterises the host for both, refuses to install without an
  explicit profile, and enforces the rule against the connectivity evidence (deliverable 14).
  `RLSE-03` produces that evidence and computes the verdict.
- **Secret custody is the Founder's** (sub-PRD **Q-RLSE-2**, raised as `M-Q2` in
  `docs/prd/01-app-data/README.md`). This ticket ships the *shape* and the fail-closed validation of
  every PRD §39.6 group, never a value and never a custody mechanism that costs money (sub-PRD
  **D18**).
- **Host-side discovery state has no PRD §39.3 row** (sub-PRD **Q-RLSE-1**, raised as `M1` in
  `docs/prd/05-ingestion-framework/README.md`). PRD §19.3 requires the host to keep doing discovery;
  this ticket resolves the path and its backup classification (deliverable 4) and writes back.

## Goal

Produce `infra/deploy/host/**`: the systemd units, cgroup limits, filesystem layout, configuration
and secret contract, and the preflight/installer tooling that make a pinned Ubuntu LTS host into the
PRD §19.1/§39.2/§39.3 production host — plus the shared host primitives (`lib/**`, sub-PRD **D4**)
that `RLSE-03`, `RLSE-06`, `RLSE-07`, `RLSE-08` and `RLSE-11` build on. Completion is mechanically
checkable without a real host: the installer materialises the exact PRD §39.3 tree under a temporary
root; every unit file's `MemoryMax` equals the PRD §39.2 figure and the sum fits 2 GiB with the
384 MiB OS reserve; the candidate units cannot write the active pointer, any release directory or the
corpus tree; configuration validation refuses an unknown critical key and any missing PRD §39.6 secret
group; and `swapPointer()` is proven atomic under a crash-injection test.

## Non-goals

- **No archive build, signing or verification implementation.** `RLSE-01`
  (`infra/deploy/release/**`). The units *call* `verify-release.mjs`.
- **No deployment sequence, migration run, pointer switch decision or rollback.** `RLSE-06`
  (`infra/deploy/promote/**`) owns the PRD §39.7 procedure; this ticket owns the primitives it uses.
- **No corpus promotion.** `RLSE-07` (`infra/deploy/corpus/**`).
- **No Cloudflare tunnel configuration, DNS, TLS or Pages.** `RLSE-03` (`infra/cloudflare/**`). This
  ticket ships the `cloudflared` **systemd unit** and its resource limits; the tunnel's ingress rules
  and credentials are `RLSE-03`'s.
- **No Litestream replication configuration.** `RLSE-05` (`infra/backup/**`). This ticket ships the
  `litestream` **systemd unit**, which reads its configuration from the path
  `AER_LITESTREAM_CONFIG` (default `/srv/aer/config/litestream.yml`) that `RLSE-05` installs.
- **No alerting, thresholds, external checks or status page.** `RLSE-08`
  (`infra/deploy/monitoring/**`).
- **No backup or restore procedure.** `RLSE-05`, `RLSE-09`.
- **No benchmark.** `RLSE-11` (`infra/deploy/benchmark/**`). This ticket sets the PRD §39.2 limits;
  `RLSE-11` measures against them.
- **No runbooks.** `RLSE-10` (`docs/runbooks/**`).
- **No `infra/compose/**`, ever.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**. Production must
  not depend on Compose and this ticket must not read, write or reference it (PRD §39.2).
- **No application, database or search code.** `apps/**`, `packages/**`, `services/**` belong to their
  modules. The units start binaries from the release archive; they do not configure application
  behaviour beyond the PRD §39.6 environment contract.
- **No real credential, key, token or host.** PRD §20.2, §39.6.

## File-scope (write-owns)

- `infra/deploy/host/**` — systemd unit files and drop-ins, the filesystem-layout installer, the
  configuration/secret schema, the preflight tool, the shared primitives under
  `infra/deploy/host/lib/**` (sub-PRD **D4**), `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/{release,promote,corpus,monitoring,benchmark}/**` — `RLSE-01`, `RLSE-06`, `RLSE-07`,
  `RLSE-08`, `RLSE-11`. `infra/{cloudflare,aws,backup,recovery}/**` — `RLSE-03`, `RLSE-04`, `RLSE-05`,
  `RLSE-09`. `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- Root manifests, lockfiles, tool-version files, `tools/**`, `.github/workflows/**` —
  `00-foundation` (`FND-01`, `FND-02`), PRD §44.3 serial-owned.
- `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `schemas/**`, `evals/**` — their owning
  modules. `tests/**` — `23-assurance`. `docs/PRD.md`, `docs/prd/breakdown-plan.md` — frozen / not
  this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/deploy/host/**`. breakdown-plan §4 gives
`infra/deploy/**` to this module and §5.19 gives `infra/deploy/host/**` wholly to this ticket; every
sibling owns a different subtree, so sibling scopes are disjoint by construction. breakdown-plan §4.1
names `infra/deploy/host/**` part of the **serial-owned "production deployment configuration"** row
with `RLSE-02` as its single owner — no other module may write it. In the sub-PRD wave shape this
ticket runs in wave 2 concurrently with `RLSE-04` (`infra/aws/**`), a disjoint tree.
`infra/compose/**` belongs to `RUNT-09` and must not be touched here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/deploy/host/README.md`** — one page: the PRD §39.2/§39.3 tables as implemented, the unit
   and port names (sub-PRD **D19**), the install and preflight commands, the statement that Compose is
   never a production dependency (PRD §39.2; breakdown-plan **A7**) and that no real host is
   provisioned by this repository.
2. **`infra/deploy/host/lib/layout.mjs`** — the PRD §39.3 path constants as a single exported table:
   `LAYOUT = [{ path, disk, owner, mode, contents, backup: 'LITESTREAM' | 'EXCLUDED' |
   'REBUILD_FROM_R2' | 'NONE' }]`, covering **every** row of PRD §39.3 verbatim plus
   `/srv/aer/app/current` (the PRD §20.4 atomic application pointer; sub-PRD **D3**) and
   `/srv/aer/config` (the §39.6 non-secret configuration directory). Exported so `RLSE-06`, `RLSE-07`,
   `RLSE-09` and `RLSE-11` never hard-code a path.
3. **`infra/deploy/host/install-layout.mjs`** — `node install-layout.mjs [--root <dir>] [--dry-run]`
   creating every `LAYOUT` path with its owner, group and mode, idempotently (a second run changes
   nothing), and refusing to run if a path exists with wrong ownership. `--root` makes the entire
   layout materialisable under a temporary directory, which is what makes every machine check here
   reproducible offline (sub-PRD **D6**).
4. **Host-side discovery state (sub-PRD Q-RLSE-1).** `LAYOUT` adds exactly one path beyond PRD §39.3:
   `/srv/aer/data/ingestion.sqlite*`, owner `worker`, backup classification **`EXCLUDED`** — it is
   rebuildable discovery state, and PRD §23.1 says *"Corpus databases/indexes and application binaries
   are rebuilt from immutable releases rather than duplicated into customer backup storage."* Basis
   for its existence: PRD §19.3 *"The production server continues lightweight source discovery so
   source health does not depend on the workstation being online."* The addition, its exclusion and
   the reasoning are recorded in `infra/deploy/host/README.md` **and** written back to
   `docs/prd/05-ingestion-framework/README.md` M1 and `docs/prd/18-ops-release/README.md`
   (Q-RLSE-1) as part of this ticket's acceptance.
5. **`infra/deploy/host/systemd/*.service`** — five serving units and three candidate/shadow units
   (sub-PRD **D19**), each with:
   - `MemoryMax` **exactly** the PRD §39.2 figure (`aer-app` 320M, `aer-worker` 384M, `aer-search`
     768M, `aer-litestream` 96M, `aer-cloudflared` 96M), `MemoryHigh` at 90% of `MemoryMax`,
     `CPUWeight` reflecting the CPU intent column, `TasksMax` bounded, `Restart=on-failure` with a
     bounded `StartLimitBurst`;
   - hardening: `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`,
     `ProtectKernelTunables=yes`, `ProtectControlGroups=yes`, `RestrictSUIDSGID=yes`,
     `LockPersonality=yes`, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, and an explicit
     `ReadWritePaths=` list per unit derived from `LAYOUT` — `aer-search` gets the corpus tree
     **read-only** (PRD §18.3 *"corpus.sqlite is … production read-only"*; PRD §39.1
     *"`services/search-rs` has no credentials/path for `app.sqlite`"*), and its `ReadWritePaths`
     contains no data path at all;
   - `ExecStartPre=` invoking `RLSE-01`'s `verify-release.mjs` against the release the pointer names,
     so an unverified archive can never start (PRD §21; PRD §20.3);
   - `EnvironmentFile=` pointing at the layered configuration of deliverable 7 — never inline secrets;
   - `WorkingDirectory=` under `/srv/aer/app/current`, and `ExecStart=` resolved **through the
     pointer**, so a pointer swap plus restart is a version change.
6. **Candidate/shadow unit isolation (sub-PRD D7).** `aer-app-candidate.service`,
   `aer-worker-candidate.service` and `aer-search-shadow.service` are separate unit files that:
   bind only the private candidate ports (`127.0.0.1:3001`, `127.0.0.1:7701`); resolve `ExecStart`
   from an **explicit release directory argument**, never through `/srv/aer/app/current`; and carry a
   `ReadWritePaths` list that **excludes** `/srv/aer/app/current`, `/srv/aer/app/releases`,
   `/srv/aer/corpus` and `/srv/aer/config`. A unit-file test asserts each exclusion by parsing the
   files, and a behavioural test under `--root` asserts a candidate process writing to any excluded
   path is denied. Basis: PRD §12.2 *"Failed releases MUST NOT modify active production data"*;
   PRD §39.7 step 5.
7. **`infra/deploy/host/config/`** — the PRD §39.6 layering as files:
   `defaults.env` (committed safe defaults, no secret), `production.env.example`
   (environment-specific non-secret config, every key documented, **no value that is a secret**), and
   `secrets.contract.json` declaring the nine PRD §39.6 secret groups by name, injection mechanism
   placeholder, required/optional flag and the units that consume each. Two groups are declared
   **`NEVER_ON_HOST`**: offline signing and destructive backup credentials (PRD §39.6, §23.1) — the
   validator fails if either is present in the environment.
   PRD §39.6's *"email credential"* group is declared under its confirmed concrete key name
   **`RESEND_API_KEY`**: breakdown-plan §8 **Q14** confirms **Resend** (Resend Free transactional
   tier) as the provider, so this group is no longer a placeholder for an undecided one. It is
   declared **once** here, `required: false` so a host with no mail configured still validates, with
   its consuming units named — `aer-worker`, whose channel and Resend adapter are `WTCH-04`/`WTCH-09`
   in `16-monitor-alerts`, and, where an operator binds one, the alert notifier `RLSE-08` ships. **No
   provider adapter, SDK or key value belongs anywhere in this module:** the value exists only in the
   sealed-secret layer and must never be committed, logged or exposed to coding agents (PRD §20.2,
   §22, §39.6).
8. **`infra/deploy/host/lib/config-validate.mjs`** — `validateHostConfig(env, contract)`, run by every
   unit's `ExecStartPre`: refuses startup when a required key is missing, when a **critical key is
   unknown** (PRD §39.6 *"refuses unknown critical keys"*), when a `NEVER_ON_HOST` group is present,
   or when a value has an obviously wrong shape. Error messages name the **key**, never the value
   (PRD §22).
9. **`infra/deploy/host/lib/hostAdapter.mjs`** (sub-PRD **D4**/**D6**) — the seam every host-touching
   tool in this module uses:
   `HostAdapter = { readFile, writeFile, rename, symlink, readlink, mkdir, stat, statfs, run(cmd,args),
   systemctl(verb, unit), readMeminfo() }`, with two implementations —
   `SystemdHostAdapter` (real; used only by `[human]` checks) and `LocalRootHostAdapter({ root })`
   (temporary directory + an in-memory fake systemd that records every `systemctl` call in order and
   can be programmed to fail on the *n*-th call). Every `[machine]` test in this module uses the
   local adapter.
10. **`infra/deploy/host/lib/atomicPointer.mjs`** — `swapPointer(adapter, pointerPath, targetPath)`
    implementing sub-PRD **D3**: create a sibling temporary symlink, then `rename(2)` it over the
    pointer. `readPointer(adapter, pointerPath)` returns the current target or `null`.
    `withPointerRollback(adapter, pointerPath, fn)` restores the previous target if `fn` throws. The
    swap must be atomic: a crash injected at any instruction boundary leaves the pointer resolving to
    exactly one of the two targets and never to a missing path — asserted by a test that interrupts
    after each adapter call.
11. **`infra/deploy/host/lib/authorisation.mjs`** (sub-PRD **D10**) —
    `AuthorisationProvider = { assertRecentMfa({ operation, subject }) -> Promise<Authorisation> }`
    with `Authorisation = { actor_id, actor_kind, mfa_verified_at, method, reason, confirmed_subject }`.
    `requireAuthorisation(provider, { operation, subject, maxAgeSeconds })` **throws
    `AUTHORISATION_REQUIRED` when no provider is bound** and `AUTHORISATION_STALE` when
    `mfa_verified_at` is older than `maxAgeSeconds`, and refuses when `confirmed_subject` does not
    equal the exact release id/hash being promoted. `RLSE-06` and `RLSE-07` consume it; `INTL-04`
    (`22-internal-admin`, `blocked_by RLSE-07`) binds the real provider over `packages/auth`
    (`AUTC-02`). Basis: PRD §20.4; `ADM-002`; sub-PRD **Q-RLSE-8**.
12. **`infra/deploy/host/preflight.mjs`** — `node preflight.mjs [--root <dir>] [--json]` implementing
    PRD §39.7 step 3's *"checks disk/memory, backup lag, active app/corpus compatibility"* for the
    parts this ticket owns: free disk on both the 60 GB system and 32 GB attached mounts against
    PRD §42.2's warn 75% / critical 85%; available memory against the PRD §39.2 budget; the layout
    exists with correct ownership; the pointer resolves; the configuration validates; swap policy
    (deliverable 13). Backup lag and corpus compatibility are **seams** (`BackupLagProvider`,
    `CompatibilityProvider`) that fail closed when unbound — `RLSE-05` and `RLSE-07` bind them.
    Output is a `{ ok, checks: [{id, status, observed, threshold}] }` document; it never prints a
    configuration value.
13. **`infra/deploy/host/lib/swap-policy.mjs`** — PRD §39.2's swap rule as an enforced check: sustained
    swap usage above a small threshold fails preflight with `SWAP_HIDING_WORKING_SET`; an encrypted
    emergency swap file up to a bounded size is permitted and is **excluded from reported capacity**.
    The check's output states the observed swap bytes and the policy sentence it enforces.
14. **`infra/deploy/host/lib/network-plan.mjs` and `infra/deploy/host/lib/ip-profile.mjs`** — the
    PRD §39.4 internal matrix as data (`{caller, callee, purpose}` rows) plus
    `assertNoPublicListener(units)`, which parses the unit files and fails if any unit binds an
    address other than `127.0.0.1` (or `[::1]`) — PRD §39.4 *"Search exposes no public port"*,
    PRD §39.2 *"Cloudflare Tunnel is the only public route to the app"*.

    The **IPv4/IPv6 addressing profile is a parameter** (`AER_IP_PROFILE=ipv6|ipv4|dual`) with **no
    default committed**, because breakdown-plan §8 **Q7** makes the profile an *evidence-decided
    outcome* rather than a build-time preference, and `ip-profile.mjs` enforces that rule so the
    confirmed decision cannot be quietly overridden at install time.
    `assertIpProfileDecision({ profile, evidence })` takes the verdict a bound
    `ConnectivityEvidenceProvider` returns — the machine-readable half of `RLSE-03`'s connectivity
    report: `{ report_path, profile_tested, mandatory_checks_passed: boolean,
    failed_checks: [<check id>], generated_at }`. Rules, each with its Q7 basis:
    - **no explicit `AER_IP_PROFILE`** → refuse with `IP_PROFILE_NOT_DECIDED`; nothing commits a
      default (Q7 rule 5);
    - **`ipv6` with no evidence bound** → refuse with `IP_PROFILE_EVIDENCE_REQUIRED`, because
      IPv6-only is conditional on a passing end-to-end test, never on it being cheaper (Q7 rules 1–3);
    - **`ipv6` while the bound evidence reports `mandatory_checks_passed: false`** → refuse with
      `IPV6_CONTRADICTED_BY_EVIDENCE`, naming the failed check ids. This is Q7 rule 6 made mechanical:
      *cost saving is never a reason to keep IPv6-only after a connectivity or operational check has
      failed*;
    - **`ipv4` / `dual`** → permitted; the install record must carry the evidence reference and the
      failed check ids that justified using PRD §24.1's cost reserve (Q7 rule 4);
    - the check takes **no cost input at all** — no flag, environment variable or configuration key
      can select a cheaper profile against the evidence.
    `install-layout.mjs` and `preflight.mjs` call it and write
    `{ ip_profile, evidence: { report_path, generated_at, failed_checks } }` into an install record
    under `/srv/aer/config`, so the adopted profile is never recorded without the report that decided
    it. `RLSE-03` is **not** in this ticket's blocker closure (it is blocked *by* this ticket), so
    this is a declared shape plus a fail-closed seam — exactly like `BackupLagProvider` in
    deliverable 12 — never an import.
15. **`infra/deploy/host/bootstrap/`** — the pinned-image bootstrap as an auditable, idempotent shell
    script plus a manifest of the exact OS packages it installs (pinned versions). It installs no
    language toolchain and no build tooling (PRD §19.1, §39.2), configures SSH as IP/key restricted
    with password authentication disabled and a comment recording PRD §39.2's *"SSH is … disabled for
    coding agents"*, and enables unattended security updates. It is **never executed by any test**;
    tests assert its content (no `apt install` of a compiler, no unpinned package, no credential).
16. **`infra/deploy/host/lib/budget.mjs`** — `assertMemoryBudget(units)`: the sum of `MemoryMax` across
    the five serving units plus PRD §39.2's ~384 MiB OS reserve must not exceed 2 GiB, and each unit's
    value must equal the PRD §39.2 table. Exported so `RLSE-11` can re-assert it against measured RSS.

## Acceptance checklist (classified)

Cross-references: `OPS-002` (the host makes degradation observable and bounded), `OPS-003` (the host
is exactly the PRD §24.1 A$14–15 + A$4–5 lines and adds nothing), `ADM-002` (the authorisation seam
and atomic pointer this module's promotion path requires), `OPS-001` (indirect — the layout and the
backup classification that `RLSE-05`/`RLSE-09` depend on).

- [ ] `[machine]` `install-layout.mjs --root <tmp>` creates **every** PRD §39.3 path plus
      `/srv/aer/app/current`, `/srv/aer/config` and the deliverable-4 discovery path, with the
      recorded owner and mode; a second run is a no-op; a path with wrong ownership aborts naming the
      path (PRD §39.3)
- [ ] `[machine]` Each of the five serving units declares `MemoryMax` **exactly** equal to the
      PRD §39.2 figure, and `assertMemoryBudget` passes with the ~384 MiB OS reserve inside 2 GiB —
      asserted against a literal table written out in the test (PRD §39.2, §19.1)
- [ ] `[machine]` `aer-search` has **no** writable data path and mounts the corpus tree read-only;
      it has no path or credential capable of reaching `app.sqlite` — asserted by parsing
      `ReadWritePaths`/`InaccessiblePaths` (PRD §18.3, §39.1, §45.2)
- [ ] `[machine]` Every unit sets `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes` and
      an explicit `ReadWritePaths` — a table-driven test over all eight unit files (PRD §21.1)
- [ ] `[machine]` **Candidate isolation:** `aer-app-candidate`, `aer-worker-candidate` and
      `aer-search-shadow` exclude `/srv/aer/app/current`, `/srv/aer/app/releases`, `/srv/aer/corpus`
      and `/srv/aer/config` from `ReadWritePaths`, and a candidate process attempting to write any of
      them under `LocalRootHostAdapter` is denied — one test per path (PRD §12.2 "Failed releases MUST
      NOT modify active production data"; PRD §39.7 step 5)
- [ ] `[machine]` No unit binds a non-loopback address; `assertNoPublicListener` fails a deliberately
      broken fixture unit that binds `0.0.0.0` (PRD §39.4 "Search exposes no public port"; §39.2
      "Cloudflare Tunnel is the only public route")
- [ ] `[machine]` **Q7 is enforced, not assumed:** `install-layout.mjs` refuses with
      `IP_PROFILE_NOT_DECIDED` when `AER_IP_PROFILE` is absent, with `IP_PROFILE_EVIDENCE_REQUIRED`
      when `ipv6` is selected and no connectivity evidence is bound, and with
      `IPV6_CONTRADICTED_BY_EVIDENCE` — naming the failed check ids — when `ipv6` is selected while
      the bound evidence reports `mandatory_checks_passed: false`; `ipv4`/`dual` is accepted only with
      an evidence reference. Table-driven over the six cases in the test plan (breakdown-plan §8
      **Q7** rules 1–6; PRD §19.1)
- [ ] `[machine]` No flag, environment variable or configuration key can select an IP profile against
      the evidence, and `ip-profile.mjs` reads **no** cost input — asserted by a source scan plus an
      attempted override (breakdown-plan §8 **Q7** rule 6: cost saving is never a reason to keep
      IPv6-only after a failed check)
- [ ] `[machine]` The install record written under `/srv/aer/config` carries the adopted `ip_profile`
      **together with** its evidence (`report_path`, `generated_at`, `failed_checks`); a record naming
      a profile with no evidence reference is rejected (breakdown-plan §8 **Q7**: the adopted profile
      is recorded with the real connectivity report)
- [ ] `[machine]` `secrets.contract.json` declares PRD §39.6's email-credential group under the
      confirmed name `RESEND_API_KEY`, marked optional, with its consuming units named and **no value
      committed**; `validateHostConfig` names the key and never the value when it is malformed —
      seeded with a `secret-canary-<uuid>` (breakdown-plan §8 **Q14**; PRD §39.6, §20.2, §22)
- [ ] `[machine]` Every unit's `ExecStartPre` invokes `RLSE-01`'s `verify-release.mjs`, and a unit
      whose release fails verification does not reach `ExecStart` — asserted through the fake systemd
      call log (PRD §21; §20.3 "Production MUST verify and run it")
- [ ] `[machine]` `swapPointer` is atomic: with a crash injected after **each** adapter call, the
      pointer afterwards resolves to exactly one valid target and never to a missing path — a
      table-driven test over every injection point (PRD §20.4 "atomic application pointer"; §39.3
      "atomic symlink/pointer")
- [ ] `[machine]` `withPointerRollback` restores the previous target when the body throws, and leaves
      the new target when it succeeds (PRD §39.7 step 8 "Prior release remains available for
      rollback")
- [ ] `[machine]` `requireAuthorisation` **throws with no provider bound** (`AUTHORISATION_REQUIRED`),
      throws on a stale `mfa_verified_at` (`AUTHORISATION_STALE`), and throws when
      `confirmed_subject` differs from the subject being authorised — three tests (PRD §20.4
      "recent MFA, explicit version/changelog confirmation"; `ADM-002`; sub-PRD D10)
- [ ] `[machine]` `validateHostConfig` refuses a missing required key, an **unknown critical key**,
      and the presence of either `NEVER_ON_HOST` group; every message names the key and no message
      contains the value — seeded with a `secret-canary-<uuid>` (PRD §39.6, §23.1, §22)
- [ ] `[machine]` `production.env.example` and `defaults.env` contain no real credential — asserted by
      a secret-shape scan over the committed files (PRD §20.2)
- [ ] `[machine]` `preflight.mjs` fails closed when the backup-lag or compatibility provider is
      unbound, and reports disk against PRD §42.2's 75%/85% thresholds and memory against the
      PRD §39.2 budget — table-driven over a synthetic `--root` (PRD §39.7 step 3; §42.2)
- [ ] `[machine]` Swap policy: sustained swap above the threshold fails preflight with
      `SWAP_HIDING_WORKING_SET`; a bounded emergency swap file passes and is excluded from reported
      capacity (PRD §39.2 "Swap MUST NOT be used to hide sustained working-set failure")
- [ ] `[machine]` The bootstrap script installs no compiler, no language toolchain and no unpinned
      package, and disables SSH password authentication — asserted by parsing the script and its
      package manifest, never by executing them (PRD §19.1, §39.2)
- [ ] `[machine]` The discovery-state path is present in `LAYOUT` with backup classification
      `EXCLUDED`, and no `LAYOUT` entry classified `EXCLUDED` or `REBUILD_FROM_R2` can be selected by
      any backup rule expressed as a glob — asserted by the same wildcard test `DATA-08`'s
      `assertNotBackedUp` performs (PRD §39.3, §23.1, §10.4)
- [ ] `[machine]` **Writeback performed:** `docs/prd/18-ops-release/README.md` Q-RLSE-1 and
      `docs/prd/05-ingestion-framework/README.md` M1 record the resolved discovery path and its
      exclusion (sub-PRD Q-RLSE-1; this is an acceptance item because the ticket concludes an open
      question)
- [ ] `[machine]` No file outside `infra/deploy/host/**` is modified except the two writeback lines
      above — asserted by `git diff --name-only`. In particular `infra/compose/**` is untouched
      (breakdown-plan **A7**; sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002`/`OPS-003`, the security impact
      (hardening, SSH, secret groups, candidate isolation), the memory/disk impact (the PRD §39.2
      budget), the cost impact (no line beyond PRD §24.1's A$14–15 + A$4–5) and the rollback path
      (pointer swap + prior release retained)
- [ ] `[human]` One real installation on a pinned Ubuntu LTS Lightsail instance by the founder,
      following only `infra/deploy/host/README.md`: the layout materialises, all five units start,
      `systemd-analyze verify` is clean, `systemctl show -p MemoryMax` matches the PRD §39.2 table and
      the host stays inside its PRD §24.1 budget. **Not required to merge** — PRD §20.2 forbids giving
      coding agents production SSH; the merge-time substitute is `LocalRootHostAdapter` plus unit-file
      parsing, which proves every limit, every path and every isolation rule without a host
- [ ] `[human]` **Adopted IP profile recorded with its evidence.** After `RLSE-03`'s end-to-end
      connectivity test on the real host, the profile the rule selects — IPv6-only when every
      mandatory check passes, otherwise IPv4-inclusive within PRD §24.1's cost reserve — is installed
      as `AER_IP_PROFILE` and written into `docs/prd/18-ops-release/README.md` **Q7** *together with
      the connectivity report path and any failed check ids*. No preference is solicited: the evidence
      decides. **Not required to merge** — no real host is provisioned here, the installer refuses
      without an explicit value, and `IPV6_CONTRADICTED_BY_EVIDENCE` blocks the cheaper profile after
      a failed check (PRD §19.1; breakdown-plan §8 **Q7**)
- No `[fixture]` criteria — this ticket replays no recorded source, evaluation or drill data; its
      fixtures are synthetic unit files and a temporary root (breakdown-plan §1.1)
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored (PRD §45.3)

## Test plan

Reviewer steps. Everything except the two `[human]` rows runs offline, with no host, no network and
no production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-host`, **or** `node --test infra/deploy/host/test` if the workspace
   member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/tmpRoot.mjs` creates a temporary root and returns a
   `LocalRootHostAdapter` bound to it; `test/helpers/fakeSystemd.mjs` records `systemctl` calls in
   order and can fail on the *n*-th. Copy the recording-stub construction pattern from
   `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md` (`RecordingObjectStore`).
4. **`layout.test.mjs`** — install under a temporary root; assert every `LAYOUT` path exists with the
   recorded mode/owner; re-run and assert no change; corrupt one path's ownership and assert the
   abort names it. Assert the `LAYOUT` table equals a literal transcription of PRD §39.3 plus the
   three documented additions.
5. **`units.test.mjs`** — parse all eight unit files with a small ini parser. Table-driven assertions:
   `MemoryMax` per PRD §39.2; hardening directives present; `ReadWritePaths` contents per unit;
   `aer-search` has no writable data path; `ExecStartPre` invokes `verify-release.mjs`; no unit
   inlines a secret. Then `assertMemoryBudget` and `assertNoPublicListener`, each with a deliberately
   broken fixture unit proving the check fails.
6. **`candidate-isolation.test.mjs`** — for each excluded path, run a fake candidate process through
   `LocalRootHostAdapter` that attempts a write, and assert denial. Assert the candidate units resolve
   `ExecStart` from an explicit release directory and never through `/srv/aer/app/current`.
7. **`pointer.test.mjs`** — the crash matrix: for `i` in `0..n`, run `swapPointer` with the adapter
   programmed to throw on call `i`; after each, assert the pointer resolves to exactly one of
   `{old, new}` and that `readlink` never returns a path that does not exist. Then
   `withPointerRollback` success and failure paths.
8. **`authorisation.test.mjs`** — no provider bound; stale `mfa_verified_at`; mismatched
   `confirmed_subject`; happy path. Assert the thrown codes and that no assertion value is logged.
9. **`config.test.mjs`** — missing required key; unknown critical key; `NEVER_ON_HOST` group present;
   canary in a value asserted absent from every message. Secret-shape scan over `defaults.env` and
   `production.env.example`.
10. **`preflight.test.mjs`** — unbound providers fail closed; synthetic disk usage at 74%, 76% and 86%
    produce ok/warn/critical; memory below the PRD §39.2 budget fails; swap policy cases.
11. **`bootstrap.test.mjs`** — parse the bootstrap script and its package manifest; assert no
    compiler/toolchain package, no unpinned version, SSH password authentication disabled; assert the
    test never executes the script.
12. **`backup-classification.test.mjs`** — assert no `EXCLUDED`/`REBUILD_FROM_R2` path can be matched
    by the wildcard forms `*.sqlite`, `*.sqlite*`, `data/*` — the same assertion `DATA-08`'s
    `assertNotBackedUp` makes, so `RLSE-05` and `ASSR-08` inherit a consistent rule.
13. **`ip-profile.test.mjs`** — the Q7 matrix: absent `AER_IP_PROFILE` (`IP_PROFILE_NOT_DECIDED`);
    `ipv6` with no evidence bound (`IP_PROFILE_EVIDENCE_REQUIRED`); `ipv6` with evidence reporting
    `mandatory_checks_passed: false` (`IPV6_CONTRADICTED_BY_EVIDENCE`, with the failed check ids
    named); `ipv6` with passing evidence (accepted); `ipv4`/`dual` with and without an evidence
    reference. Then assert the install record always pairs the profile with its evidence, and that no
    flag or environment variable can override the verdict or introduce a cost input.
14. **Diff check** — `git diff --name-only` lists only `infra/deploy/host/**` plus the two writeback
    lines in `docs/prd/18-ops-release/README.md` and
    `docs/prd/05-ingestion-framework/README.md`.
15. **Reviewer focus (security- and concurrency-sensitive):** confirm `swapPointer` never uses
    `unlink`-then-`symlink` (a window where the pointer does not exist); confirm no unit grants the
    search process a path to `app.sqlite`; confirm the candidate `ReadWritePaths` exclusions cannot be
    widened by an environment variable; confirm `validateHostConfig` cannot be bypassed by a flag;
    confirm no configuration value, key or token reaches stdout, stderr or a unit file; confirm the
    installer refuses to run without an explicit `AER_IP_PROFILE` rather than defaulting, and that
    `ipv6` cannot be installed against evidence reporting a failed mandatory check; confirm
    `RESEND_API_KEY` appears only as a declared, valueless group name.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A PRD §39.2 memory limit makes a process unrunnable** → do **not** raise the limit in a unit file.
  The limits are *"release-benchmark inputs"* (PRD §39.2) and the authoritative measurement is
  `RLSE-11`. Record the observed number in the PR's memory line (PRD §45.4) and in
  `docs/prd/18-ops-release/README.md`; if the budget genuinely cannot hold, PRD §39.2 prescribes the
  direction — *"reduce always-hot vector coverage/cache before removing lexical corpus coverage"* —
  and that decision is `RLSE-11`'s and the Founder's, not this ticket's. A larger host is a **cost**
  change (PRD §24.1) and therefore a Founder decision (sub-PRD **D18**).
- **The PRD §39.3 layout needs another path** (beyond the one deliverable 4 adds) → add it to `LAYOUT`
  **with an explicit backup classification**, record it in `infra/deploy/host/README.md` and in
  `docs/prd/18-ops-release/README.md`, and notify `RLSE-05`/`RLSE-09`/`ASSR-08`. A path with no
  classification is exactly how a wildcard backup rule gets born (PRD §39.3).
- **Systemd hardening breaks a process** (`ProtectSystem=strict` blocks a legitimate write) → widen
  `ReadWritePaths` with the **specific** path and record why in the unit's comment and in this
  ticket's deliverable 5. Never relax `NoNewPrivileges`, never drop `ProtectSystem`, and never widen a
  **candidate** unit's exclusions — that would falsify PRD §12.2, which is the whole point of
  deliverable 6.
- **A secret group cannot be injected without a paid service** (a managed secret store) → that is
  sub-PRD **Q-RLSE-2** and a **Founder** decision under PRD §24.1 (sub-PRD **D18**). Record the
  options and the cost in `docs/prd/18-ops-release/README.md` Q-RLSE-2 **before** adopting anything;
  do not add a dependency that changes the PRD §24.1 table inside this ticket.
- **The IPv6-only path fails `RLSE-03`'s connectivity test** → that is a decided outcome, not a
  question. breakdown-plan §8 **Q7** settles it and PRD §19.1 gives the fallback (*"otherwise use the
  IPv4-inclusive plan within the cost reserve"*). Install the IPv4-inclusive profile, and record the
  failed check ids, the connectivity report path and the adopted profile in
  `docs/prd/18-ops-release/README.md` **Q7** and in `docs/runbooks/server-rebuild.md` (`RLSE-10`). Do
  not commit a default, do not ask the Founder to choose on preference, and do not keep IPv6-only
  because it is cheaper — `IPV6_CONTRADICTED_BY_EVIDENCE` exists to make that impossible.
- **A shared primitive in `lib/**` turns out to be needed by `RLSE-05` or `RLSE-09`** → it must not be
  imported: neither has `RLSE-02` in its blocker closure (sub-PRD **D5**), and an undeclared
  cross-ticket import is exactly the contention the file-scope cut prevents. Either duplicate the
  small primitive inside the consuming ticket's own scope with a comment naming this one, or propose a
  DAG change by writing `docs/prd/breakdown-plan.md` §5.19/§6.2 first. A `blocked_by` added to an
  already-started ticket cannot be honoured mid-run (CLAUDE.md).
- **Compose turns out to be convenient for a production procedure** → it must not be. PRD §39.2 and
  breakdown-plan **A7** are explicit, and `RUNT-09` owns `infra/compose/**`. Write
  `docs/prd/breakdown-plan.md` §4.1 and both sub-PRDs first if the boundary genuinely needs to move;
  never reference Compose from a production path inside this ticket.

**3. Escalation.** PRD §39.2's memory table and PRD §39.3's layout, including *"The app database,
ephemeral database and corpus cannot share a wildcard backup rule"*, are the constraints that
`RLSE-05`, `RLSE-06`, `RLSE-07`, `RLSE-09`, `RLSE-11` and `ASSR-08` all build on, and breakdown-plan
**A7** is a decomposition-critical decision that keeps one PRD §44.3 phrase from producing two owners
of one artifact. If any of them is outright falsified, that overturns a team decision the whole module
depends on: stop, escalate for re-review, and write back to `docs/prd/18-ops-release/README.md` and
`docs/prd/breakdown-plan.md` before any code lands. Never blur the Compose/production boundary or the
backup classification silently inside this ticket.
