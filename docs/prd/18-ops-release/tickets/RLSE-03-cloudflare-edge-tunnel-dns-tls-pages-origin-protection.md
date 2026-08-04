---
id: RLSE-03
title: "Cloudflare edge: tunnel, DNS/TLS, Pages, origin protection"
module: 18-ops-release
lane: 18-ops-release
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-02]
blocks: [RLSE-08]
---

# RLSE-03 — Cloudflare edge: tunnel, DNS/TLS, Pages, origin protection

Implements PRD §19.1, §21.1 and §39.4 — requirement family `OPS-002`, epic `E30-OBS-DR`.
**No ADR — the decision is already made in PRD §39.2 ("Cloudflare Tunnel is the only public route to
the app") and PRD §18.2 (the selected edge is "Cloudflare Pages/DNS/TLS/tunnel/proxy"); this is build
ticket 3 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RLSE-02`](RLSE-02-production-host-baseline-systemd-cgroups-filesystem-layout.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope transcribing PRD §39.4's
network matrix into edge configuration — not a new subsystem decision.

## Background + basis

**The tunnel is the only public route, and the origin has no open ports.** PRD §39.2:

> **Cloudflare Tunnel is the only public route to the app.** SSH is IP/key restricted and disabled for
> coding agents.

PRD §21.1, first required control: *"**Origin/internal ports hidden behind outbound tunnel.**"*

**PRD §39.4 fixes exactly what may talk to what:**

| Caller | Callee | Allowed purpose |
|---|---|---|
| Cloudflare Tunnel | `127.0.0.1:3000` | Public authenticated Web/API/status routes |
| `app` | `127.0.0.1:7700` | Search/document retrieval with pinned release |
| `worker` | `127.0.0.1:7700` | Evidence retrieval only |
| `worker` | approved model endpoints | Sanitized evidence-bounded generation |
| `worker` | email/webhook destinations | Outbox deliveries with SSRF-safe webhook policy |
| `litestream` | S3 Sydney backup prefix | Replication only |
| `app/worker` | S3 Sydney export prefix | Export artifact lifecycle only |
| promotion tool | R2 release prefix | Download/verify immutable public bundle |

> **Search exposes no public port.** Database files are never made available to the Cloudflare static
> edge or the search process unless explicitly required above. Backup and export use different
> credentials and prefixes.

**The static surfaces live at the edge.** PRD §19.1's topology puts *"Cloudflare edge/static/tunnel"*
above the Lightsail host; PRD §39.1's process diagram opens with
`WEB[Cloudflare Pages: Web/admin/widget assets] --> APP[app: Fastify API + auth + SSE]`.

**R2 is the public corpus store and the promotion tool's only object-store channel.** PRD §19.2:
*"Cloudflare R2 stores only public/rebuildable legal artifacts, normalised text, candidate/archived
corpus releases and indexes. It MUST NOT contain customer identities, Research Records, answers,
exports or backups."*

**The edge budget is A$0.** PRD §24.1: *"Cloudflare Pages/tunnel/free edge | A$0 target"*,
*"R2 public corpus | A$3–4"*, and *"**Cloudflare Paid Workers is not a default dependency.**"*

**Health probes are tunnel-restricted, not public.** PRD §42.1 marks `/health/live` and
`/health/ready` *"Tunnel-restricted probe"* while `/v1/system-status` is *"Yes, low detail"*. The
endpoints themselves are `RUNT-08` (`03-app-runtime`); the restriction is enforced here.

**`security.txt` is a required control with no named owner.** PRD §21.1: *"`security.txt` and
vulnerability-reporting address."* No PRD section names a path or a module, so sub-PRD open question
**Q-RLSE-10** records that this ticket ships it at the edge (so it survives an origin outage) and that
`LNCH-03` (`24-launch`, `apps/web/public-site/**`) may claim it instead.

**Why `RLSE-02` is the blocker.** breakdown-plan §6.2: `RLSE-02 --> RLSE-03`. The tunnel's origin
target is the `aer-app` unit's loopback port from `RLSE-02` deliverable 5 (sub-PRD **D19**), the
`cloudflared` systemd unit and its 96 MiB limit are `RLSE-02`'s, and the IPv4/IPv6 addressing profile
this ticket tests is `RLSE-02`'s `AER_IP_PROFILE` parameter. `RLSE-02` deliverable 14 declares the
shape this ticket's connectivity report must expose so its fail-closed `ConnectivityEvidenceProvider`
seam can bind it: `{ report_path, profile_tested, mandatory_checks_passed, failed_checks,
generated_at }`.

**Accepted caveats carried forward, documented not enforced here:**

- **No Cloudflare account is touched by this repository.** PRD §20.2 forbids giving coding agents
  provider credentials. Everything here is declarative configuration plus a validator and a
  connectivity-test script; a human operator applies it (documented by `RLSE-10`'s
  `docs/runbooks/server-rebuild.md`).
- **The IP profile is decided by this ticket's evidence, under a confirmed rule** (breakdown-plan §8
  **Q7**, a *confirmed conditional decision*). PRD §19.1: *"The lower-cost IPv6 path MAY be used if
  end-to-end tunnel/connectivity tests pass; otherwise use the IPv4-inclusive plan within the cost
  reserve."* The rule: test the cheaper **IPv6-only** profile first; if **every mandatory check**
  passes, IPv6-only is the production profile; if **any required IPv6 check fails**, the
  IPv4-inclusive profile within PRD §24.1's cost reserve is used. The mandatory checks are exactly
  **DNS, TLS, Cloudflare Tunnel, authenticated readiness, public status, latency and origin-port
  protection** (deliverable 11). Once this ticket's report exists the Founder is **not** asked to
  choose on preference, and **cost saving is never a reason to keep IPv6-only after a connectivity or
  operational check has failed.** So this ticket does not merely gather evidence: it **computes the
  verdict the rule prescribes**, and the adopted profile is recorded together with the real report.
- **Application security headers are `RUNT-01`'s.** PRD §21.1's *"strict CSP"*, cookie flags and CSRF
  are response-level concerns of `apps/api` (`03-app-runtime`). The edge does not set or override
  them; a duplicated CSP at two layers is a debugging trap and a silent second owner.

## Goal

Produce `infra/cloudflare/**`: declarative, reviewable configuration for the tunnel (ingress rules,
origin target, no public origin port), DNS/TLS, the Pages projects that serve the web/admin/widget
assets, the R2 bucket/prefix and read-only promotion token scope, edge access rules that keep
`/health/*` tunnel-restricted, `security.txt`, the sending-domain verification records for the
confirmed transactional email provider (breakdown-plan §8 **Q14**), plus a validator and an
end-to-end connectivity test that produces the PRD §19.1 evidence **and computes the IP-profile
verdict** breakdown-plan §8 **Q7** prescribes. Completion is mechanically checkable: the validator
rejects any ingress rule whose service is not the single loopback app port, any rule that would expose
the search port or a database path, any DNS record that points at the origin address directly, any
HTTP-serving record that is not proxied or mail record that is, any non-TLS or weak-TLS setting, and
any R2 token scope that grants write or delete on the release prefix; a fixture-driven test proves
`/health/*` is unreachable except through the tunnel's authenticated path; and an offline verdict
matrix proves the connectivity test adopts `ipv6` only when **every** mandatory check passes and
`ipv4-inclusive` when **any one** of them fails, with nothing able to override it.

## Non-goals

- **No host, systemd unit or filesystem layout.** `RLSE-02` (`infra/deploy/host/**`) owns the
  `cloudflared` unit and its resource limits; this ticket supplies the tunnel configuration that unit
  reads.
- **No health, readiness or `/v1/system-status` implementation.** `RUNT-08` (`03-app-runtime`).
- **No alert rules, external checks, synthetic probes or status page.** `RLSE-08`
  (`infra/deploy/monitoring/**`), which is `blocked_by` this ticket.
- **No public marketing/status page content.** `LNCH-03` (`24-launch`, `apps/web/public-site/**`,
  breakdown-plan **A8**). This ticket configures the Pages **project**; the bundle it serves is built
  elsewhere.
- **No web/admin/widget asset build, and no publication of them.** The bundles come from `RLSE-01`'s
  archive and are published by `RLSE-06`'s deploy step; `apps/web/**`, `apps/admin/**` and
  `apps/widget/**` belong to `03-app-runtime`, `22-internal-admin` and `20-developer-platform`.
- **No application response headers (CSP, cookies, CSRF), no widget origin allowlist.** `RUNT-01`,
  `RUNT-02` (`03-app-runtime`) and `AUTC-05`/`IDNT-07` (widget origins, PRD §38.4).
- **No S3 Sydney configuration of any kind.** Different provider, different owner: `RLSE-04`
  (`infra/aws/**`). PRD §19.2 keeps the two stores separate on purpose.
- **No corpus upload.** `CRPS-07` (`04-corpus-contract`) writes to R2; this ticket defines the bucket
  and the token scopes it and `RLSE-07` use.
- **No email channel, `EmailTransport` port, Resend adapter or API key.** breakdown-plan §8 **Q14**
  confirms the provider (**Resend**, free transactional tier); the channel and the provider adapter
  are `16-monitor-alerts` (`WTCH-04`, `WTCH-09`) and the key is `RLSE-02`'s `RESEND_API_KEY` secret
  group. This ticket owns **only** the sending-domain DNS records that verification requires
  (deliverable 3), and holds no key and no provider account.
- **No real credential, token or account.** PRD §20.2, §39.6.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/cloudflare/**` — tunnel configuration, DNS/TLS records, Pages project definitions, R2 bucket
  and token-scope definitions, edge access rules, `security.txt`, the validator, the connectivity
  test, `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/**` — `RLSE-01`, `RLSE-02`, `RLSE-06`, `RLSE-07`, `RLSE-08`, `RLSE-11`.
  `infra/{aws,backup,recovery}/**` — `RLSE-04`, `RLSE-05`, `RLSE-09`. `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `schemas/**` — their owning modules;
  `apps/web/public-site/**` specifically is `LNCH-03` (`24-launch`). `tests/**` — `23-assurance`.
- Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`. `docs/PRD.md`,
  `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/cloudflare/**`. breakdown-plan §4 gives
the whole tree to `18-ops-release` and §5.19 gives it wholly to this ticket; §4.1 names it part of the
serial-owned **production deployment configuration** row with `RLSE-03` as its single owner, so no
other module may write it. Siblings own disjoint trees (`infra/deploy/*` subtrees, `infra/aws`,
`infra/backup`, `infra/recovery`, `docs/runbooks`). In the sub-PRD wave shape this ticket runs in
wave 3 concurrently with `RLSE-05` (`infra/backup/**`) and `RLSE-07` (`infra/deploy/corpus/**`) —
disjoint trees. `infra/compose/**` belongs to `RUNT-09` and must not be touched here (breakdown-plan
**A7**, §4.1).

## Deliverables

1. **`infra/cloudflare/README.md`** — one page: the PRD §39.4 matrix as implemented, what a human
   operator applies and in what order, the A$0 edge budget (PRD §24.1) and the explicit statement that
   this repository holds **no** Cloudflare credential (PRD §20.2).
2. **`infra/cloudflare/tunnel/config.yml`** — the `cloudflared` ingress configuration the `RLSE-02`
   unit reads:
   - exactly **one** service rule mapping the public hostname to `http://127.0.0.1:3000` (PRD §39.4
     row 1; sub-PRD **D19**);
   - a terminal catch-all returning `http_status:404`, so no unmatched hostname reaches the origin;
   - `noTLSVerify: false`, bounded `connectTimeout`/`keepAliveTimeout`, and `originRequest` limits;
   - **no** rule for `127.0.0.1:7700`, `127.0.0.1:3001`, `127.0.0.1:7701` or any filesystem path
     (PRD §39.4 *"Search exposes no public port"*; PRD §39.7 step 5's private candidate ports must
     never be publicly routable).
   The tunnel **credential file path** is a parameter; the credential itself never exists here.
3. **`infra/cloudflare/dns/records.yml`** — the DNS records as data, each carrying an explicit `class`
   (`HTTP_SERVING` | `MAIL_VERIFICATION`) and an explicit `proxied` field:
   - **`HTTP_SERVING`** — the apex/`www` records proxied through Cloudflare (orange-cloud), the tunnel
     `CNAME` target and the Pages custom-domain records. Every one of them **must** be proxied.
   - **`MAIL_VERIFICATION`** (breakdown-plan §8 **Q14**) — the records that verify the sending domain
     for the confirmed transactional email provider, **Resend** on its free transactional tier: the
     provider's domain-verification and DKIM `TXT` record(s), the return-path/bounce host record, and
     the `SPF` and `DMARC` policy records for that sending domain. They are `TXT`/`MX`/`CNAME` records
     on a mail hostname, are **DNS-only by necessity** — Cloudflare proxying applies to HTTP-serving
     records, and proxying a mail record breaks verification — so each is declared `proxied: false`
     with that reason stated inline. The provider-issued selector and public key are **operator-
     supplied parameter placeholders**: this repository holds no account state and no credential
     (PRD §20.2). The DKIM **private** key never exists here or on the host; it stays with the
     provider. The API key is `RLSE-02`'s `RESEND_API_KEY` group and the channel is
     `WTCH-04`/`WTCH-09`'s — neither belongs in this tree.
   A record that resolves **directly to the origin address** is forbidden in **either** class
   (PRD §21.1 *"Origin/internal ports hidden behind outbound tunnel"*), as is an `HTTP_SERVING` record
   that is not proxied and a `MAIL_VERIFICATION` record that is; the validator rejects all three.
4. **`infra/cloudflare/tls/settings.yml`** — TLS mode `full (strict)` or better, minimum TLS 1.2 (1.3
   preferred), HSTS with a stated max-age and `includeSubDomains`, Always-Use-HTTPS on, and automatic
   HTTPS rewrites. Each setting carries a comment naming the PRD §21.1 control it serves.
5. **`infra/cloudflare/pages/projects.yml`** — the Pages projects for the customer web app, the admin
   app and the widget assets (PRD §39.1's `WEB` node), each declaring: project name, custom domain,
   build **output** directory only (the build itself happens in CI — PRD §19.1 forbids production
   builds), preview-deployment policy (PRD §20.2 *"Static frontend previews"*), and the explicit
   statement that Pages serves **no** customer research content and holds no credential (PRD §19.2's
   store boundary, applied by analogy: the static edge never receives a database file — PRD §39.4).
   The `apps/web/public-site` project is declared as `owner: LNCH-03` with its build output path left
   as a documented parameter (breakdown-plan **A8**).
6. **`infra/cloudflare/r2/bucket.yml`** — the R2 bucket and prefix definition for public corpus
   artifacts, mirroring the key layout `CRPS-07` publishes so `RLSE-07` and `CRPS-07` agree:
   `corpus-releases/{release_id}/…`, `corpus-releases/{release_id}/release-report.json` and
   `corpus-releases/index.json`. Declares public-read on the release prefix (PRD §19.2 "public
   artifacts"), lifecycle/retention as **manual only** (PRD §18.4 *"Old releases cannot be removed
   while jobs remain pinned"* — automatic expiry would delete a pinned release), and a hard statement
   that customer identities, Research Records, answers, exports and backups may never be written here
   (PRD §19.2).
7. **`infra/cloudflare/r2/tokens.yml`** — two token scopes, never values:
   `corpus-publish` (used from the **local workstation** by `CRPS-07` — `Object:Write` on
   `corpus-releases/*`, **no delete**) and `corpus-promote` (used on the production host by `RLSE-07`
   — `Object:Read` on `corpus-releases/*` **only**, no write, no delete, no bucket-level operation).
   Basis: PRD §39.4 *"promotion tool | R2 release prefix | Download/verify immutable public bundle"*;
   PRD §19.3 (build/sign/upload is the workstation's); PRD §21.1 (least privilege). The validator
   rejects any promotion-side scope carrying write or delete.
8. **`infra/cloudflare/access/rules.yml`** — edge rules keeping PRD §42.1's probe endpoints
   tunnel-restricted: `/health/live` and `/health/ready` are reachable **only** through an
   authenticated edge path (a Cloudflare Access service-token policy or an equivalent
   header/mTLS-bound rule), never anonymously; `/v1/system-status` is public and low-detail;
   `/internal/*` (PRD §8.11, `22-internal-admin`) is denied at the edge for any identity outside the
   internal policy, as defence in depth behind `INTL-01`'s application-level separation. Each rule
   states the PRD sentence it enforces.
9. **`infra/cloudflare/security.txt`** (sub-PRD **Q-RLSE-10**) — served at `/.well-known/security.txt`
   from the edge so it survives an origin outage, containing a vulnerability-reporting address, a
   policy URL placeholder owned by `LNCH-01` (`docs/policies/**`, `24-launch`), a preferred-languages
   line (`en`, PRD §13.1) and an `Expires` field. Basis: PRD §21.1 *"`security.txt` and
   vulnerability-reporting address."*
10. **`infra/cloudflare/lib/validate.mjs`** — `validateEdgeConfig(dir) -> { ok, findings }`, the
    machine check behind most acceptance items. Findings are codes and subjects, never free text
    carrying a value. It refuses:
    - any ingress rule whose service is not `http://127.0.0.1:3000`, other than the terminal 404
      catch-all;
    - any reference to `7700`, `7701`, `3001`, a `.sqlite` path, `/srv/aer/data`, `/srv/aer/corpus`
      or a filesystem service (`unix:`/`file:`) anywhere in the edge configuration (PRD §39.4
      *"Database files are never made available to the Cloudflare static edge"*);
    - a DNS record that resolves to the origin address, in either record class;
    - an `HTTP_SERVING` record that is not proxied, or a `MAIL_VERIFICATION` record that is
      (breakdown-plan §8 **Q14**: proxying a mail record breaks sending-domain verification);
    - a committed DKIM **private** key or provider API key of any shape — reporting the key/path,
      never the value;
    - TLS mode weaker than full-strict, or a minimum version below 1.2;
    - an R2 token scope granting write or delete to the promotion side, or any scope naming a prefix
      outside `corpus-releases/*`;
    - any committed value matching a credential shape (Cloudflare API token, tunnel token, R2 access
      key, private-key header) — reporting the **key/path**, never the value;
    - any reference to a paid Cloudflare product (Workers Paid, Argo, Load Balancing, Logpush) —
      PRD §24.1 *"Cloudflare Paid Workers is not a default dependency"*; sub-PRD **D18**.
11. **`infra/cloudflare/connectivity-test.mjs`** — the PRD §19.1 evidence producer **and** the machine
    that applies breakdown-plan §8 **Q7**'s confirmed rule:
    `node connectivity-test.mjs --profile ipv6|ipv4|dual --host <hostname> [--json] [--offline]`.
    It runs the **seven mandatory checks** the rule names against the profile under test, each with a
    stable check id: `dns` (resolution per address family), `tls` (handshake and negotiated version),
    `tunnel` (Cloudflare Tunnel reachability of the single origin route), `authenticated_readiness`
    (`/health/ready` through the Access policy, recording only the failing check ids `RUNT-08`
    returns), `public_status` (`/v1/system-status` reachable and low-detail), `latency` (round trip
    measured against a same-run control profile, failing when the profile under test cannot complete
    within the committed per-check timeout or is worse than the control by more than a **committed,
    documented margin** that is echoed into the report so the verdict is recomputable), and
    `origin_port_protection` (the origin address is **not** directly reachable on 3000, 7700 or 22
    from the public internet). It writes
    `infra/cloudflare/reports/connectivity-<profile>-<timestamp>.json` containing
    `{ report_id, generated_at, host, profile_tested, checks: [{ id, mandatory, status, observed,
    threshold }], resolved_families, latency, mandatory_checks_passed: boolean,
    failed_checks: [<check id>], adopted_profile: 'ipv6' | 'ipv4-inclusive',
    decision_rule: 'breakdown-plan §8 Q7' }`.
    **The verdict is computed, not chosen.** `adopted_profile` is `ipv6` when the IPv6-only run has
    `mandatory_checks_passed: true`, and `ipv4-inclusive` when any mandatory check failed — PRD §19.1's
    *"otherwise use the IPv4-inclusive plan within the cost reserve"*. There is **no flag, environment
    variable or configuration key** that can set `adopted_profile` directly, suppress a failed check or
    downgrade a mandatory check to advisory, and the tool takes **no cost input**: Q7 rule 6 —
    *cost saving is never a reason to keep IPv6-only after a connectivity or operational check has
    failed*. The report's `{ report_path, profile_tested, mandatory_checks_passed, failed_checks,
    generated_at }` members are exactly the shape `RLSE-02` deliverable 14's
    `ConnectivityEvidenceProvider` seam consumes, so an operator cannot install `ipv6` against a
    failing report. In `--offline` mode it runs the whole matrix against a local fixture server, so
    every check and every verdict path is testable with no network and no account.
12. **`infra/cloudflare/lib/matrix.mjs`** — PRD §39.4's table as committed data plus
    `assertMatrixCoverage(edgeConfig)`, which asserts that the edge configuration expresses exactly
    row 1 of the matrix and no other row. Exported so `RLSE-08` can assert its external checks travel
    the same single path.
13. **`infra/cloudflare/apply/`** — the human-run apply procedure as an **auditable checklist plus an
    idempotent, dry-run-by-default script** that prints the exact provider CLI/API calls it would make
    and requires `--confirm` plus an explicitly supplied credential path to do anything. It is never
    executed by a test; tests assert its printed plan against a golden fixture. Basis: PRD §20.2 — the
    tooling exists, the credentials do not.

## Acceptance checklist (classified)

Cross-references: `OPS-002` (the edge is where availability and degradation become observable from
outside), `OPS-003` (A$0 edge line in PRD §24.1), `ADM-002` (the read-only promotion token scope the
corpus promotion path depends on), `OPS-001` (not applicable — no backup surface here; stated so the
absence is deliberate).

- [ ] `[machine]` The tunnel configuration contains exactly one service rule targeting
      `http://127.0.0.1:3000` plus a terminal `http_status:404` catch-all; a fixture adding any second
      service rule is rejected (PRD §39.4 row 1; §39.2 "Cloudflare Tunnel is the only public route")
- [ ] `[machine]` No edge artifact references `7700`, `7701`, `3001`, a `.sqlite` path,
      `/srv/aer/data`, `/srv/aer/corpus` or a `unix:`/`file:` service — one test per class
      (PRD §39.4 "Search exposes no public port"; "Database files are never made available to the
      Cloudflare static edge")
- [ ] `[machine]` Every `HTTP_SERVING` DNS record is proxied and a fixture leaving one unproxied is
      rejected; a fixture record resolving directly to the origin address is rejected in **either**
      record class (PRD §21.1 "Origin/internal ports hidden behind outbound tunnel")
- [ ] `[machine]` The `MAIL_VERIFICATION` records for the sending domain exist (provider
      verification/DKIM `TXT`, return-path/bounce host, `SPF`, `DMARC`), are declared `proxied: false`
      with the reason inline, carry no origin address, and contain only operator-supplied
      placeholders — a fixture that proxies one, or that commits a DKIM private key or a provider API
      key, is rejected with the path named and the value never echoed (breakdown-plan §8 **Q14**;
      PRD §20.2, §39.6)
- [ ] `[machine]` TLS settings are full-strict with minimum TLS 1.2 and HSTS enabled; a fixture with
      flexible TLS or TLS 1.0 is rejected (PRD §21.1)
- [ ] `[machine]` `/health/live` and `/health/ready` are covered by an access rule requiring an
      authenticated edge identity; a fixture making either anonymous is rejected. `/v1/system-status`
      remains public (PRD §42.1's Public? column)
- [ ] `[machine]` `/internal/*` is denied at the edge for identities outside the internal policy
      (PRD §8.11; defence in depth behind `INTL-01`)
- [ ] `[machine]` The `corpus-promote` R2 token scope grants **read only** on `corpus-releases/*`; a
      fixture granting write or delete, or naming any other prefix, is rejected (PRD §39.4 "Download/
      verify immutable public bundle"; PRD §21.1 least privilege; `ADM-002`)
- [ ] `[machine]` The R2 prefix layout matches the keys `CRPS-07` publishes
      (`corpus-releases/{release_id}/…`, `release-report.json`, `index.json`) — asserted against a
      literal list transcribed from `CRPS-07` deliverable 1, so `RLSE-07` and `CRPS-07` cannot drift
      (PRD §18.4, §19.2)
- [ ] `[machine]` R2 lifecycle is manual-only; a fixture adding automatic expiry on
      `corpus-releases/*` is rejected (PRD §18.4 "Old releases cannot be removed while jobs remain
      pinned")
- [ ] `[machine]` No committed file contains a Cloudflare API token, tunnel token, R2 access key or
      private key — asserted by a secret-shape scan that reports the **path** and never the value,
      seeded with a `secret-canary-<uuid>` (PRD §20.2, §22)
- [ ] `[machine]` No paid Cloudflare product is referenced anywhere in `infra/cloudflare/**`
      (PRD §24.1 "Cloudflare Paid Workers is not a default dependency"; `OPS-003`; sub-PRD D18)
- [ ] `[machine]` `security.txt` exists, is served from the edge path, and contains a reporting
      address, an `Expires` field and `Preferred-Languages: en` (PRD §21.1, §13.1)
- [ ] `[machine]` `assertMatrixCoverage` proves the edge expresses exactly PRD §39.4 row 1 and no
      other row (PRD §39.4)
- [ ] `[machine]` `connectivity-test.mjs --offline` runs the full check matrix against a local fixture
      server for `ipv6`, `ipv4` and `dual`, writes a report containing **all seven mandatory checks**
      with their ids, and exits non-zero when the fixture exposes port 3000/7700/22 directly
      (PRD §19.1; §21.1)
- [ ] `[machine]` **Q7's verdict is computed from the evidence:** with every mandatory IPv6 check
      passing, the report records `mandatory_checks_passed: true` and `adopted_profile: 'ipv6'`; with
      **each** mandatory check failed in turn (seven cases) it records `mandatory_checks_passed:
      false`, the failing id in `failed_checks`, and `adopted_profile: 'ipv4-inclusive'`
      (breakdown-plan §8 **Q7** rules 1–4; PRD §19.1)
- [ ] `[machine]` Nothing can override the verdict: no flag, environment variable or configuration key
      sets `adopted_profile` directly, suppresses a failed mandatory check or downgrades one to
      advisory, and the tool reads no cost input — asserted by a source scan plus attempted overrides
      (breakdown-plan §8 **Q7** rule 6: cost saving is never a reason to keep IPv6-only after a failed
      check)
- [ ] `[machine]` The report carries `{ report_path, profile_tested, mandatory_checks_passed,
      failed_checks, generated_at }` in exactly the shape `RLSE-02` deliverable 14's
      `ConnectivityEvidenceProvider` consumes — asserted against a literal transcription of that
      shape, so an operator cannot install `ipv6` against a failing report (`RLSE-02`;
      breakdown-plan §8 **Q7**)
- [ ] `[machine]` The apply script is dry-run by default, prints its plan and makes no call without
      `--confirm` and an explicitly supplied credential path — asserted against a golden plan fixture
      and by a stub that fails the test if any network call is attempted (PRD §20.2)
- [ ] `[machine]` No file outside `infra/cloudflare/**` is modified — asserted by
      `git diff --name-only`. In particular `infra/compose/**` is untouched (breakdown-plan **A7**;
      sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `OPS-002`, the security impact (origin
      exposure, token scopes, probe restriction), the cost impact (A$0 edge line plus the A$3–4 R2
      line, PRD §24.1) and the rollback path (edge configuration is declarative and revertible;
      reverting a DNS/ingress change restores the prior route)
- [ ] `[human]` The founder applies the configuration to the real Cloudflare account and runs
      `connectivity-test.mjs` against the real hostname, **IPv6-only first** (breakdown-plan §8 **Q7**
      rule 1), confirming the origin address answers on **no** public port and that `/health/*` is
      unreachable anonymously. **Not required to merge** — PRD §20.2 forbids giving coding agents
      provider credentials; the merge-time substitute is the `--offline` fixture server, which
      exercises the identical check logic, every refusal case and every verdict path
- [ ] `[human]` **Adopted IP profile recorded together with the real connectivity report.** The
      profile the rule selects — `ipv6` when all seven mandatory checks pass, otherwise
      `ipv4-inclusive` within PRD §24.1's cost reserve — is written into
      `docs/prd/18-ops-release/README.md` **Q7** with the report path and any failed check ids, and is
      consumed by `RLSE-02`'s `AER_IP_PROFILE`. No preference is solicited and neither ticket commits
      a default: the evidence decides. **Not required to merge** — it needs the real account and host
      (breakdown-plan §8 **Q7**)
- [ ] `[human]` The founder completes sending-domain verification with the provider after applying the
      `MAIL_VERIFICATION` records, and records that the domain shows verified. **Not required to
      merge** — PRD §20.2 forbids giving coding agents provider credentials; the merge-time substitute
      is the validator's record-shape assertions (breakdown-plan §8 **Q14**)
- No `[fixture]` criteria — this ticket replays no recorded source, evaluation or drill data
      (breakdown-plan §1.1); its offline connectivity fixtures are synthetic servers, not recorded
      traffic
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored (PRD §45.3)

## Test plan

Reviewer steps. Everything except the three `[human]` rows runs offline with no network, no Cloudflare
account and no credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-cloudflare`, **or** `node --test infra/cloudflare/test` if the
   workspace member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/edgeFixtures.mjs` produces a valid edge configuration tree in a temporary
   directory plus a mutator for each rejection case, so every validator assertion is a one-line
   mutation of a known-good baseline rather than a hand-written broken file.
4. **`tunnel.test.mjs`** — the good baseline validates; then mutate: a second service rule; a rule
   targeting `127.0.0.1:7700`; a rule targeting `127.0.0.1:3001`; a `unix:` service; a missing
   catch-all; `noTLSVerify: true`. Assert refusal and the exact finding code for each.
5. **`dns-tls.test.mjs`** — an `HTTP_SERVING` record left unproxied; a record pointing at the origin in
   each class; flexible TLS; TLS 1.0 minimum; HSTS absent. Assert refusal for each; assert the good
   baseline passes.
6. **`mail-records.test.mjs`** — the `MAIL_VERIFICATION` set is present and complete (provider
   verification/DKIM `TXT`, return-path/bounce host, `SPF`, `DMARC`); each is `proxied: false` with an
   inline reason and carries no origin address; proxying one is refused; a committed DKIM private key
   or provider API key is refused with the path named and the value never echoed (breakdown-plan §8
   **Q14**).
7. **`access.test.mjs`** — remove the `/health/*` policy; make `/v1/system-status` non-public; remove
   the `/internal/*` deny. Assert refusal for the first and third, and that the second is refused
   because PRD §42.1 marks it public.
8. **`r2.test.mjs`** — assert the key layout equals a literal list transcribed from `CRPS-07`
   deliverable 1; add write to `corpus-promote`; add delete; name a prefix outside
   `corpus-releases/*`; add an automatic expiry rule. Assert refusal for each.
9. **`secrets.test.mjs`** — seed each committed file class with a `secret-canary-<uuid>` shaped as a
   Cloudflare token, a tunnel token, an R2 access key, a provider API key and a private-key header;
   assert refusal, that the **path** is named, and that the canary appears in no emitted byte.
10. **`paid-products.test.mjs`** — a fixture referencing Workers Paid, Argo, Load Balancing or Logpush
    is rejected with a finding naming PRD §24.1.
11. **`connectivity.test.mjs`** — start a local fixture origin plus a fake edge; run
    `connectivity-test.mjs --offline` for each profile; assert the report contains all seven mandatory
    checks and that exposing port 3000, 7700 or 22 on the fixture makes the run exit non-zero. Then the
    **Q7 verdict matrix**: all checks passing → `mandatory_checks_passed: true`,
    `adopted_profile: 'ipv6'`; each mandatory check failed in turn (seven cases) →
    `mandatory_checks_passed: false`, the id in `failed_checks`, `adopted_profile: 'ipv4-inclusive'`.
    Finally assert that no flag or environment variable sets `adopted_profile`, suppresses a failed
    check or introduces a cost input, and that the report's evidence members match the literal shape
    `RLSE-02` deliverable 14 consumes.
12. **`apply.test.mjs`** — run the apply script with no flags; assert it prints a plan matching the
    golden fixture, makes no call (stub `fetch` to throw), and exits `0`; then assert `--confirm`
    without a credential path refuses.
13. **Diff check** — `git diff --name-only` lists only paths under `infra/cloudflare/`.
14. **Reviewer focus (security-sensitive):** confirm the catch-all is genuinely terminal and cannot be
    bypassed by rule ordering; confirm no configuration path allows the tunnel to reach anything other
    than the single app port; confirm the promotion token cannot be widened by an environment variable
    or a flag; confirm the validator's "no value in output" rule holds for every finding; confirm the
    apply script cannot read a credential from a committed file; confirm `/health/*` restriction is
    expressed at the edge and not merely documented; confirm `adopted_profile` is derived from the
    seven mandatory checks alone, with no cost input and no override path; confirm the
    `MAIL_VERIFICATION` records carry no origin address and no key material.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **The tunnel cannot express a needed route without a second service rule** (for example a separate
  hostname for the admin app) → a second rule is permissible **only** if it still targets
  `127.0.0.1:3000`; anything else falsifies PRD §39.4. Record the added rule and its justification in
  this ticket's deliverable 2 and in `docs/prd/18-ops-release/README.md`, then implement. Never route
  the tunnel to the search port or a candidate port.
- **`/health/*` cannot be restricted at the edge** with the free feature set → PRD §42.1 calls both
  *"Tunnel-restricted probe"*. Raise it against `RUNT-02`'s admission profile (`03-app-runtime`,
  which owns the `probe` profile per `RUNT-08` deliverable 1) as a docs PR so the restriction is
  enforced application-side, record the gap in `docs/prd/18-ops-release/README.md`, and state it in
  the PR's security-impact line (PRD §45.4). Do not leave the probes anonymous.
- **A required edge capability is only available on a paid plan** → that changes PRD §24.1's A$0 edge
  line and is a **Founder** decision (sub-PRD **D18**). Record the capability, the cheapest option and
  the cost in `docs/prd/18-ops-release/README.md` Q-RLSE-4 **before** adopting it; never assume the
  spend inside this ticket.
- **The IPv6-only path fails the connectivity test** → that is a decided outcome, not a question:
  breakdown-plan §8 **Q7** settles it and PRD §19.1 prescribes the fallback (*"otherwise use the
  IPv4-inclusive plan within the cost reserve"*). The tool records `adopted_profile:
  'ipv4-inclusive'` with the failed check ids; attach the report, record the adopted profile **with
  its report path** in `docs/prd/18-ops-release/README.md` **Q7**, and notify `RLSE-02`
  (`AER_IP_PROFILE`) and `RLSE-10` (`docs/runbooks/server-rebuild.md`). Never re-run until the cheaper
  profile happens to pass, never downgrade a mandatory check to advisory to keep IPv6-only, and never
  ask the Founder to choose on preference.
- **The provider requires a sending-domain record this ticket does not declare, or changes one** → the
  record set is the ops-side half and lives here, but the **provider** is breakdown-plan §8 **Q14** and
  the channel/adapter are `WTCH-04`/`WTCH-09`. Add or amend the `MAIL_VERIFICATION` record in
  deliverable 3, record it in `docs/prd/18-ops-release/README.md`, `--sync`, and notify
  `16-monitor-alerts`. Never proxy a mail record to make it validate, never commit a provider key or a
  DKIM private key, and never create a second owner of this DNS zone.
- **The R2 key layout `CRPS-07` publishes differs from deliverable 6** → the layout is a cross-module
  contract owned by `CRPS-07` (`04-corpus-contract`). Do **not** change it here: raise a docs PR
  against `CRPS-07`, and record the agreed layout in `docs/prd/04-corpus-contract/README.md` and
  `docs/prd/18-ops-release/README.md`. `RLSE-07` reads whatever the two agree on.
- **`LNCH-03` wants to own `security.txt`** → that is sub-PRD **Q-RLSE-10**. Move it by writing
  `docs/prd/18-ops-release/README.md` Q-RLSE-10 and `docs/prd/breakdown-plan.md` §4.2 first, then
  deleting it here in the same change. Two owners of one URL is the failure §4.2 exists to prevent.
- **An application security header must be set at the edge** → it must not, unless the application
  genuinely cannot set it. `RUNT-01` owns response headers (PRD §21.1). Raise it there; a CSP defined
  in two layers is a silent second owner and a debugging trap.

**3. Escalation.** *"Cloudflare Tunnel is the only public route to the app"* (PRD §39.2) and
*"Origin/internal ports hidden behind outbound tunnel"* (PRD §21.1) are the two sentences that make
the origin's security model true; `RLSE-08`'s external checks and `LNCH-03`'s public surface both
assume them. If either is outright falsified — if the origin genuinely must accept a direct inbound
connection — that overturns a team decision the whole deployment topology rests on: stop, escalate for
re-review, and write back to `docs/prd/18-ops-release/README.md` and `docs/prd/breakdown-plan.md`
before any configuration lands. Never open an origin port inside this ticket.
