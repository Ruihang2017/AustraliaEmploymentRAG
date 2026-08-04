---
id: RLSE-04
title: "S3 Sydney backup and export prefixes with least privilege"
module: 18-ops-release
lane: 18-ops-release
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-01]
blocks: [RLSE-05, XPRT-01]
---

# RLSE-04 — S3 Sydney backup and export prefixes with least privilege

Implements PRD §19.2, §23.1 and §10.3 — requirement `EXP-002` (the storage-boundary half) and family
`OPS-001`, epic `E30-OBS-DR`. **No ADR — the decision is already made in PRD §19.2 ("AWS S3 Sydney
stores: `backups/` … `exports/` … The prefixes MUST use separate least-privilege permissions"); this
is build ticket 4 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [`RLSE-01`](RLSE-01-immutable-release-archive-build-checksums-signature-sbom.md)
(mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope writing the two prefixes
and four policies PRD §19.2/§23.1 already enumerate — not a new subsystem decision.

## Background + basis

**PRD §19.2 defines the store and the split, and gives the reason:**

> AWS S3 Sydney stores:
>
> - `backups/`: encrypted mutable customer-database recovery material;
> - `exports/`: private customer export artifacts with **seven-day lifecycle**.
>
> **The prefixes MUST use separate least-privilege permissions.** This split exists because R2 is
> cost-effective for public corpus/egress but its Oceania placement hint is not an Australian
> residency guarantee.

and, for the other store: *"Cloudflare R2 … MUST NOT contain customer identities, Research Records,
answers, exports or backups."*

**PRD §39.4 restates it as a credential rule:** *"`litestream` | S3 Sydney backup prefix |
Replication only"*, *"`app/worker` | S3 Sydney export prefix | Export artifact lifecycle only"*, and
*"**Backup and export use different credentials and prefixes.**"*

**PRD §23.1 adds the retention shape and the break-glass rule:**

> - Daily recovery points: seven days.
> - Weekly recovery points: 30 days.
> - S3 uses **encryption at rest/TLS**; sensitive secret fields also use application-level encryption.
> - **Destructive backup deletion and break-glass restore credentials MUST remain outside ordinary
>   production runtime.**
>
> Corpus databases/indexes and application binaries are **rebuilt from immutable releases rather than
> duplicated into customer backup storage.**

**PRD §10.3 fixes the retention arithmetic** this bucket must implement: *"Ordinary application logs:
14 days. Security and audit events: 12 months. Deleted customer records: 30-day recoverable period,
then primary deletion. **Deleted data in backups: ages out within a further maximum of 30 days.**"*

**`EXP-002` (PRD §30.2):** *"Private artifacts use S3 Sydney signed URLs and expire after seven days
| Export status | export download | App/S3 | **Expired or other-tenant URL is inaccessible**."* The
signed-URL generation and the tenant check are `XPRT-01` (`19-exports`, `blocked_by` this ticket);
the prefix, the lifecycle and the credential boundary that make the claim structurally true are here.

**Why this module owns the export prefix too.** breakdown-plan §4.2:

> | S3 bucket, prefixes, least-privilege credentials | `18` (`RLSE-04`) | `19` needs the export prefix
> | §19.2 requires separate least-privilege permissions per prefix — one owner defines both |

**Cost is capped.** PRD §24.1: *"S3 Sydney backups/private exports | A$1–2"* inside *"A$42–50"*, with
*"Actual provider billing MUST be monitored; the system MUST stop before exceeding the founder-funded
ceiling."* Storage class, versioning depth and lifecycle timings are therefore cost decisions.

**Why `RLSE-01` is the blocker.** breakdown-plan §6.2: `RLSE-01 --> RLSE-04`. The bucket's
configuration is applied and verified by tooling that ships in the release archive, and the policy
documents are versioned artifacts whose integrity is checked the same way `RLSE-01` checks every other
member — one verification idiom for the whole module.

**Accepted caveats carried forward, documented not enforced here:**

- **No AWS account is touched by this repository.** PRD §20.2: *"Coding agents MUST NOT receive
  production SSH, database, backup, signing or provider credentials by default."* Everything here is
  declarative policy plus a validator, a policy-evaluation test and a dry-run-by-default apply
  script; a human operator applies it (documented by `RLSE-10`'s `docs/runbooks/backup-restore.md`
  and `server-rebuild.md`).
- **Litestream's replication configuration is `RLSE-05`'s** (`infra/backup/**`). This ticket defines
  the prefix it may write and the credential's exact permissions; it does not configure the replica.
- **Export job admission, artifact production and signed-URL generation are `XPRT-01`'s**
  (`19-exports`). This ticket publishes the key layout `XPRT-01` mirrors (sub-PRD **D14**) and the
  policy that makes a cross-tenant key unreachable at the credential level.

## Goal

Produce `infra/aws/**`: the S3 Sydney bucket definition, its two prefixes, four least-privilege policy
documents, the lifecycle and retention rules PRD §19.2/§23.1/§10.3 require, the encryption/TLS
enforcement, and the published export key layout — plus a validator and an offline policy-evaluation
harness. Completion is mechanically checkable without an AWS account: the policy harness proves, for a
table of (principal, action, resource) triples, that the backup credential can write `backups/` and
**cannot** delete anything or touch `exports/`, that the export credential can write `exports/` and
cannot read `backups/`, that the app credential can read/sign only within `exports/`, and that only
the break-glass identity can delete; and the validator rejects a public-access setting, a missing
TLS-only condition, a missing encryption default, a lifecycle that does not expire exports at seven
days, and any committed credential value.

## Non-goals

- **No Litestream configuration or recovery-point tooling.** `RLSE-05` (`infra/backup/**`), which is
  `blocked_by` this ticket.
- **No restore drill or recovery environment.** `RLSE-09` (`infra/recovery/**`).
- **No export job, renderer, signed URL or export UI.** `19-exports` (`XPRT-01`…`XPRT-05`);
  `XPRT-01` is `blocked_by` this ticket. This ticket defines the prefix and its key layout, not the
  application code that uses them.
- **No Cloudflare or R2 configuration.** `RLSE-03` (`infra/cloudflare/**`). PRD §19.2 keeps the two
  object stores separate on purpose, and this ticket must not grant any identity access to both.
- **No host, systemd unit or secret-injection mechanism.** `RLSE-02` (`infra/deploy/host/**`) owns the
  PRD §39.6 secret groups; this ticket declares the **shape** of the two S3 credential groups and
  their exact permissions.
- **No field-level encryption or key management.** `DATA-03` (`01-app-data`) owns application-level
  encryption; PRD §23.1 pairs it with S3 encryption at rest, which is this ticket's half.
- **No cost ledger or circuit breaker.** `FND-09`/`EVID-08`; this ticket keeps the storage inside
  PRD §24.1's A$1–2 line and reports the measured figures.
- **No real credential, account or bucket.** PRD §20.2, §39.6.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/aws/**` — bucket and prefix definitions, IAM policy documents, lifecycle/retention rules,
  the export key-layout module, the validator, the offline policy-evaluation harness, the
  dry-run apply script, `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/**` — `RLSE-01`, `RLSE-02`, `RLSE-06`, `RLSE-07`, `RLSE-08`, `RLSE-11`.
  `infra/cloudflare/**` — `RLSE-03`. `infra/backup/**` — `RLSE-05`. `infra/recovery/**` — `RLSE-09`.
  `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `apps/api/src/routes/exports/**`, `apps/worker/src/handlers/export/**`,
  `apps/web/src/features/exports/**` — `19-exports` (`XPRT-01`…`XPRT-05`).
- `apps/**`, `packages/**`, `services/**`, `pipelines/**`, `schemas/**` — their owning modules.
  `tests/**` — `23-assurance`. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.
  `docs/PRD.md`, `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/aws/**`. breakdown-plan §4 gives the
whole tree to `18-ops-release`, §5.19 gives it wholly to this ticket, §4.1 names it part of the
serial-owned **production deployment configuration** row with `RLSE-04` as its single owner, and §4.2
explicitly resolves the one contested path — the export prefix `19-exports` needs — to this ticket.
Siblings own disjoint trees. In the sub-PRD wave shape this ticket runs in wave 2 concurrently with
`RLSE-02` (`infra/deploy/host/**`), a disjoint tree. `infra/compose/**` belongs to `RUNT-09` and must
not be touched here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/aws/README.md`** — one page: the two prefixes, the four identities and what each may do,
   the lifecycle timings with their PRD citations, the export key layout, the A$1–2 budget line
   (PRD §24.1), and the explicit statement that this repository holds **no** AWS credential
   (PRD §20.2).
2. **`infra/aws/bucket.yml`** — one bucket in `ap-southeast-2` (PRD §19.2 "S3 Sydney"), with:
   `BlockPublicAcls`/`IgnorePublicAcls`/`BlockPublicPolicy`/`RestrictPublicBuckets` all **true**;
   default server-side encryption **on** (SSE-S3 as the A$0 default; SSE-KMS noted as a paid option
   and therefore sub-PRD **D18**); versioning **enabled** (required for the PRD §23.1 daily/weekly
   recovery points and for PRD §10.3's *"Deleted data in backups: ages out within a further maximum of
   30 days"*); a bucket policy `Deny` on `aws:SecureTransport = false` (PRD §23.1 *"S3 uses encryption
   at rest/TLS"*); and no cross-account or public grant of any kind.
3. **`infra/aws/prefixes.mjs`** — the two prefixes as exported constants with their contract:
   `BACKUP_PREFIX = 'backups/'` and `EXPORT_PREFIX = 'exports/'`, plus a documented statement that
   **no third prefix exists** in this bucket and that corpus artifacts, application binaries and
   public material never appear here (PRD §19.2, §23.1). A validator check enforces that no policy or
   lifecycle rule names a resource outside these two prefixes.
4. **The export key layout (sub-PRD D14)** — `infra/aws/exportKeys.mjs`:
   `exportPrefix(organizationId)` → `exports/{organization_id}/`;
   `exportObjectKey(organizationId, exportId, artifactName)` →
   `exports/{organization_id}/{export_id}/{artifact_name}`. Rules, each with its basis:
   `organization_id` and `export_id` are opaque ids from `FND-03` (PRD §34.1); `artifact_name` is
   drawn from a **closed set** (`answer.pdf`, `answer.docx`, `answer.json`, `record.pdf`,
   `record.docx`, `record.json`) so no customer text, question or record title can ever appear in a
   key (PRD §37.3's content-retention matrix; PRD §41.1 *"customer research content is not placed in
   URL query strings"*, applied to object keys for the same reason); keys are lowercase and contain no
   spaces. `XPRT-01` mirrors this module — the same relationship `CRPS-07` has with `RLSE-07`.
   Exported alongside `assertExportKey(key)`, which rejects any key not matching the layout.
5. **`infra/aws/policies/` — four policy documents, one per identity**, each a JSON policy with an
   `aer:purpose` comment naming the PRD sentence it implements:

   | File | Identity | Allowed | Explicitly denied |
   |---|---|---|---|
   | `backup-writer.json` | `litestream` (`RLSE-05`) | `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` scoped to `backups/*` | **`s3:DeleteObject*`**, any `exports/*` resource, any bucket-level configuration action |
   | `export-writer.json` | `worker` (`XPRT-01`) | `s3:PutObject`, `s3:AbortMultipartUpload` scoped to `exports/*` | `s3:GetObject` on `backups/*`, `s3:DeleteObject*`, any bucket-level action |
   | `export-reader.json` | `app` (`XPRT-01` signed URLs) | `s3:GetObject`, `s3:ListBucket` scoped to `exports/*` | anything under `backups/*`, any write, any delete |
   | `break-glass.json` | offline operator identity only | `s3:DeleteObject*`, `s3:PutLifecycleConfiguration`, `s3:PutBucketVersioning`, restore-time reads | **must never be injected into a systemd unit** — carries an `aer:never_on_host: true` marker that `RLSE-02`'s `validateHostConfig` rejects if present in the host environment |

   Basis: PRD §19.2 *"separate least-privilege permissions"*; PRD §39.4 *"Backup and export use
   different credentials and prefixes"*; PRD §23.1 *"Destructive backup deletion and break-glass
   restore credentials MUST remain outside ordinary production runtime."*
6. **`infra/aws/lifecycle.yml`** — the retention rules as data, each carrying its PRD citation:
   - `exports/*`: expire current versions at **7 days**, expire noncurrent versions and abort
     incomplete multipart uploads at 1 day (PRD §19.2 *"seven-day lifecycle"*; `EXP-002`);
   - `backups/*`: retain **daily recovery points for 7 days** and **weekly recovery points for 30
     days** (PRD §23.1), expressed as noncurrent-version expiration plus a tagged weekly-retention
     rule, and bounded so deleted customer data ages out **within a further maximum of 30 days**
     (PRD §10.3);
   - no rule may transition backup objects to a retrieval-delayed storage class, because PRD §13.2's
     *"Core-service RTO ≤ 4 hours target"* cannot absorb a restore-from-archive delay — stated in the
     file as a comment and enforced by the validator.
7. **`infra/aws/lib/policy-eval.mjs`** — the offline evaluation harness that makes the least-privilege
   claim testable with no AWS account: `evaluate({ policies, principal, action, resource }) ->
   'Allow' | 'Deny'`, implementing explicit-deny-wins, wildcard resource matching and condition
   evaluation for the conditions actually used (`aws:SecureTransport`, `s3:prefix`). It is a
   deliberately small evaluator whose behaviour is asserted against a committed truth table; it is not
   a general IAM simulator, and its README says so.
8. **`infra/aws/lib/validate.mjs`** — `validateAwsConfig(dir) -> { ok, findings }`, refusing:
   any public-access setting not blocked; missing default encryption; missing TLS-only deny; missing
   versioning; a policy naming a resource outside the two prefixes; a policy granting delete to any
   identity other than break-glass; a lifecycle that does not expire `exports/*` at exactly 7 days; a
   lifecycle transitioning `backups/*` to an archival class; a policy without an `aer:purpose`
   comment; and any committed value matching a credential shape (AWS access key id, secret key,
   session token, private-key header) — reporting the **path/key**, never the value.
9. **`infra/aws/lib/credential-contract.mjs`** — the two PRD §39.6 secret groups this ticket owns,
   declared by name, consumer unit and required permissions (`AER_S3_BACKUP_CREDENTIAL`,
   `AER_S3_EXPORT_CREDENTIAL`), plus the break-glass group marked `NEVER_ON_HOST`. Shaped to be
   consumed directly by `RLSE-02`'s `secrets.contract.json` without duplication of meaning.
10. **`infra/aws/lib/cost.mjs`** — `estimateMonthlyCost({ backupGiB, exportGiB, requests, egressGiB })`
    against the PRD §24.1 A$1–2 line, with the assumed unit prices held in a committed, dated
    `prices.json` and a `--json` report. Used by the acceptance item asserting that the configured
    retention fits the budget at the PRD §13.4 tested capacity baseline (10 organisations, 100 users,
    5,000 searches/month, 1,000 Quick/month, 100 Deep/month, 10,000 API calls/month).
11. **`infra/aws/apply/`** — the human-run apply procedure: an auditable checklist plus an idempotent
    script that is **dry-run by default**, prints the exact API calls it would make, and requires
    `--confirm` plus an explicitly supplied credential path. Never executed by a test; tests assert
    its printed plan against a golden fixture.
12. **`infra/aws/lib/api.mjs`** — the small stable surface consumers use so they never restate a
    rule: `BACKUP_PREFIX`, `EXPORT_PREFIX`, `exportObjectKey`, `assertExportKey`,
    `EXPORT_TTL_DAYS = 7`, `BACKUP_DAILY_RETENTION_DAYS = 7`, `BACKUP_WEEKLY_RETENTION_DAYS = 30`.
    `RLSE-05` and `RLSE-09` read the backup constants; `XPRT-01` reads the export ones.

## Acceptance checklist (classified)

Cross-references: `EXP-002` (the storage boundary half — *"Expired or other-tenant URL is
inaccessible"*), `OPS-001` (the backup prefix and retention that `RLSE-05`/`RLSE-09` depend on),
`OPS-003` (the A$1–2 PRD §24.1 line), `ADM-002` (not applicable — corpus promotion uses R2, not this
bucket; stated so the absence is deliberate), `OPS-002` (the cost/lifecycle figures this ticket
publishes feed `RLSE-08`'s signals).

- [ ] `[machine]` **Least-privilege truth table** — for every (identity, action, resource) triple in a
      committed table, `policy-eval` returns the expected `Allow`/`Deny`. It must include, at minimum:
      backup-writer `PutObject backups/x` → Allow; backup-writer `DeleteObject backups/x` → **Deny**;
      backup-writer `GetObject exports/x` → **Deny**; export-writer `PutObject exports/x` → Allow;
      export-writer `GetObject backups/x` → **Deny**; export-reader `GetObject exports/x` → Allow;
      export-reader `PutObject exports/x` → **Deny**; export-reader `GetObject backups/x` → **Deny**;
      break-glass `DeleteObject backups/x` → Allow; every identity with
      `aws:SecureTransport = false` → **Deny** (PRD §19.2, §39.4, §23.1)
- [ ] `[machine]` No identity other than break-glass is granted any `s3:Delete*` action — asserted by
      scanning all four policy documents (PRD §23.1 "Destructive backup deletion … outside ordinary
      production runtime")
- [ ] `[machine]` The break-glass policy carries `aer:never_on_host: true`, and its credential group
      is declared `NEVER_ON_HOST` in the credential contract that `RLSE-02` consumes (PRD §23.1,
      §39.6)
- [ ] `[machine]` `exports/*` lifecycle expires current versions at **exactly 7 days** and aborts
      incomplete multipart uploads; a fixture with 8 days or a missing rule is rejected (PRD §19.2
      "seven-day lifecycle"; `EXP-002`)
- [ ] `[machine]` `backups/*` retention expresses daily-7-day and weekly-30-day recovery points, and
      no rule allows deleted data to persist beyond a further 30 days (PRD §23.1, §10.3)
- [ ] `[machine]` No lifecycle rule transitions `backups/*` to an archival/retrieval-delayed storage
      class (PRD §13.2 "Core-service RTO ≤ 4 hours target")
- [ ] `[machine]` The bucket blocks all public access, enables default encryption and versioning, and
      denies non-TLS requests; a fixture missing any one is rejected (PRD §19.2, §23.1)
- [ ] `[machine]` No policy or lifecycle rule names a resource outside `backups/*` and `exports/*` —
      in particular nothing grants access to a corpus, release or public artifact path (PRD §19.2)
- [ ] `[machine]` `assertExportKey` accepts the layout and rejects: a key with a segment outside the
      closed artifact-name set; a key containing a space, an uppercase letter, a `..` segment or a
      URL-encoded separator; a key whose organisation segment is absent — one test per case
      (`EXP-002`; PRD §37.3; sub-PRD D14)
- [ ] `[machine]` The export key layout carries **no** customer-derived text: a property test over
      generated record titles, questions and file names asserts none can reach a key (PRD §37.3;
      PRD §41.1)
- [ ] `[machine]` No committed file contains an AWS access key id, secret key, session token or
      private key — asserted by a secret-shape scan reporting the **path** and never the value, seeded
      with a `secret-canary-<uuid>` (PRD §20.2, §22)
- [ ] `[machine]` `estimateMonthlyCost` at the PRD §13.4 tested capacity baseline is inside PRD §24.1's
      A$1–2 line, with the dated price assumptions committed alongside the result (PRD §24.1;
      `OPS-003`)
- [ ] `[machine]` The apply script is dry-run by default, prints a plan matching the golden fixture,
      and makes no call without `--confirm` and an explicitly supplied credential path — asserted with
      a stub that fails the test if any network call is attempted (PRD §20.2)
- [ ] `[machine]` The policy evaluator's own behaviour matches a committed truth table for
      explicit-deny-wins, wildcard matching and the two conditions used — so a wrong evaluator cannot
      make a wrong policy look right (deliverable 7)
- [ ] `[machine]` No file outside `infra/aws/**` is modified — asserted by `git diff --name-only`. In
      particular `infra/compose/**` is untouched (breakdown-plan **A7**; sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `EXP-002` and `OPS-001`, the tenant/PII impact
      (export keys carry no customer text; export and backup credentials cannot cross), the retention
      impact (PRD §10.3), the cost impact (PRD §24.1 A$1–2) and the rollback path (bucket
      configuration is declarative and revertible; lifecycle changes never delete retroactively)
- [ ] `[human]` The founder applies the configuration to the real AWS account and confirms, with the
      real credentials, that the backup credential cannot delete, the export credential cannot read
      `backups/`, and an export object disappears after seven days. **Not required to merge** —
      PRD §20.2 forbids giving coding agents provider credentials; the merge-time substitute is the
      offline policy evaluator plus the committed truth table, which asserts every one of those
      outcomes against the exact policy documents that are applied
- No `[fixture]` criteria — this ticket replays no recorded source, evaluation or drill data
      (breakdown-plan §1.1); its fixtures are synthetic policy documents
- No `cargo test --workspace` / `uv run pytest` item — no Rust or Python authored (PRD §45.3)

## Test plan

Reviewer steps. Everything except the single `[human]` row runs offline with no network, no AWS
account and no credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-aws`, **or** `node --test infra/aws/test` if the workspace member is
   absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/awsFixtures.mjs` loads the real committed policy/bucket/lifecycle documents
   and provides a mutator per rejection case — every negative test is a one-line mutation of the
   shipped configuration, never a hand-written straw man. This is the same discipline
   `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md` applies with `candidate_factory`.
4. **`policy-eval.test.mjs`** — first assert the evaluator against its own committed truth table
   (explicit deny wins; `arn:…/backups/*` does not match `exports/x`; `aws:SecureTransport` condition).
   Then run the deliverable-5 truth table over the **real** policy documents and assert every expected
   verdict.
5. **`policies.test.mjs`** — scan all four documents: no `s3:Delete*` outside break-glass; no
   bucket-level configuration action outside break-glass; every document has an `aer:purpose`;
   break-glass carries `aer:never_on_host`.
6. **`bucket.test.mjs`** — the good baseline validates; then mutate each of: public-access block off;
   encryption absent; versioning off; TLS deny removed. Assert refusal and the exact finding code.
7. **`lifecycle.test.mjs`** — exports at 7 days passes; 8 days, missing rule, and missing
   multipart-abort each fail. Backups: daily/weekly rules present; an archival transition fails; a
   noncurrent expiry beyond 30 days fails.
8. **`export-keys.test.mjs`** — round-trip `exportObjectKey`/`assertExportKey`; the rejection matrix in
   the acceptance list; then a property test generating record titles, questions and filenames
   containing spaces, unicode and PII-shaped strings, asserting none can be embedded in a key.
9. **`secrets.test.mjs`** — seed each committed file class with a canary shaped as an AWS access key,
   a secret key and a private-key header; assert refusal, that the path is named, and that the canary
   appears in no emitted byte.
10. **`cost.test.mjs`** — run `estimateMonthlyCost` at the PRD §13.4 baseline; assert the result is
    inside A$1–2 and that `prices.json` carries a date; assert an inflated input pushes it outside and
    is reported, not silently rounded.
11. **`apply.test.mjs`** — dry-run prints the golden plan and makes no call (stub the SDK/`fetch` to
    throw); `--confirm` without a credential path refuses.
12. **Diff check** — `git diff --name-only` lists only paths under `infra/aws/`.
13. **Reviewer focus (security- and tenant-sensitive):** confirm no policy grants an identity access to
    both prefixes; confirm the export-reader cannot list across organisations in a way that would
    reveal another tenant's `export_id` (the `s3:prefix` condition must bind to the caller's
    organisation, or listing must be denied entirely and enumeration left to `XPRT-01`'s database);
    confirm delete is genuinely unreachable for runtime identities, including through multipart abort
    and lifecycle manipulation; confirm the key layout cannot be bypassed by a caller supplying a raw
    key; confirm no committed artifact carries a credential or an account id.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **Litestream cannot replicate without `s3:DeleteObject`** (it prunes old generations) → do **not**
  quietly grant delete on `backups/*`. PRD §23.1 puts destructive deletion outside ordinary runtime.
  Resolve it by moving retention entirely into S3 **lifecycle** rules (which the break-glass identity
  configures once) and record the decision in this ticket's deliverable 5 and in
  `docs/prd/18-ops-release/README.md`, coordinating with `RLSE-05`. If Litestream genuinely cannot
  operate that way, that is an escalation, not a policy widening.
- **`XPRT-01` needs a key shape this layout forbids** (a customer-supplied filename, a nested path) →
  the layout is a cross-module contract (sub-PRD **D14**). Change it **here** (docs PR → `--sync`),
  record it in `docs/prd/18-ops-release/README.md` (Decisions), and have `XPRT-01`'s ticket cite it.
  Never let a customer-derived string into an object key without writing down why PRD §37.3 permits it.
- **The seven-day export lifecycle conflicts with a customer request** → that is a **product** change
  under PRD §45.5 (it changes a promise in PRD §19.2 and `EXP-002`) and requires founder approval and
  a PRD update. Record it in `docs/prd/18-ops-release/README.md` and stop; do not extend the lifecycle
  in configuration.
- **Meeting PRD §23.1's retention exceeds the A$1–2 line** → record the measured figures from
  `estimateMonthlyCost` in the PR's cost line (PRD §45.4) and in
  `docs/prd/18-ops-release/README.md`. Any increase to PRD §24.1's table is a **Founder** decision
  (sub-PRD **D18**); reducing retention below PRD §23.1's stated days is **not** an available
  trade-off inside this ticket.
- **SSE-KMS or Object Lock is wanted for stronger guarantees** → both add cost. Record the option, the
  benefit and the price in `docs/prd/18-ops-release/README.md` and leave the decision to the Founder
  (sub-PRD **D18**). SSE-S3 satisfies PRD §23.1's *"encryption at rest"* today.
- **A second bucket or a third prefix is wanted** (for example for logs) → PRD §19.2 names exactly two
  prefixes for this bucket and PRD §22 keeps application logs on the host with a 14-day cap
  (PRD §39.3). Write `docs/prd/18-ops-release/README.md` and `docs/prd/breakdown-plan.md` §4.2 first
  if the boundary must move; do not add a prefix inside this ticket.

**3. Escalation.** *"The prefixes MUST use separate least-privilege permissions"* (PRD §19.2) and
*"Destructive backup deletion and break-glass restore credentials MUST remain outside ordinary
production runtime"* (PRD §23.1) are the two sentences that make an origin compromise survivable —
`OPS-001`, `EXP-002` and `RLSE-09`'s whole restore story rest on them. If either is outright falsified,
stop, escalate for re-review, and write back to `docs/prd/18-ops-release/README.md` and
`docs/prd/breakdown-plan.md` before any policy lands. Never merge the two credentials, and never grant
delete to a runtime identity, inside this ticket.
