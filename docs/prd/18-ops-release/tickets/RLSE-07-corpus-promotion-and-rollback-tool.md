---
id: RLSE-07
title: "Corpus promotion and rollback tool"
module: 18-ops-release
lane: 18-ops-release
size: L
agent: builder
status: draft
date: 2026-08-03
blocked_by: [RLSE-02, CRPS-07]
blocks: [RLSE-10, INTL-04]
---

# RLSE-07 — Corpus promotion and rollback tool

Implements PRD §18.4, §39.1 and §44.3 — requirement `ADM-002`, epic `E33-PROMOTION`, and the
production half of PRD §40.9's promotion stage graph. **No ADR — the decision is already made in
PRD §18.4 ("Production verifies signature, compatibility, disk, hashes, read-only database/index
integrity and smoke queries. Promotion uses a shadow process where memory permits, then an atomic
active-pointer switch"); this is build ticket 7 of 11 against it.**
Parent sub-PRD: [18-ops-release README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on:
[`RLSE-02`](RLSE-02-production-host-baseline-systemd-cgroups-filesystem-layout.md) and `CRPS-07`
(release staging upload to R2, `04-corpus-contract`) — mirrors `blocked_by`.
**Why `builder`:** a bounded change inside one module's declared file-scope implementing a promotion
sequence PRD §18.4 and §40.9 already fix — not a new subsystem decision.

## Background + basis

**PRD §18.4 is the specification, quoted in full for the production half:**

> **Build/sign/upload occurs offline. Production verifies signature, compatibility, disk, hashes,
> read-only database/index integrity and smoke queries. Promotion uses a shadow process where memory
> permits, then an atomic active-pointer switch. Active data MUST never be rebuilt or mutated in
> place. Old releases cannot be removed while jobs remain pinned.**

and the bundle layout it verifies:

```text
corpus-release-{id}/
├── corpus.sqlite
├── tantivy/
├── vectors.usearch
├── embedding-manifest.json
└── release-manifest.json
```

**PRD §40.9's stage graph names this ticket's exact scope** — everything from `V` rightwards:

```text
… T[Completeness/time/citation/licence/search/eval tests] --> S[Sign manifest + upload staging]
S --> V[Production verify/download] --> H[Shadow/serial smoke] --> A[Atomic active pointer]
```

**PRD §12.2 is the invariant:** *"**Failed releases MUST NOT modify active production data.**"*

**`ADM-002` (PRD §30.2):** *"Corpus promotion/rollback requires recent MFA, reason and immutable audit
| `/internal/releases` | release endpoints | App/Source | **Promotion failure leaves active pointer
unchanged**."* `UAT-OPS-01` (PRD §41.2): *"Corrupt candidate corpus fixture → **Promotion blocked;
active release/search unchanged**."*

**PRD §39.3 fixes the paths and the pointer:**

> | `/srv/aer/corpus/releases/<id>` | 32 GB attached | **search read, promoter write** |
> active/previous/candidate bundles | Rebuild/retrieve from R2 |
> | `/srv/aer/corpus/active` | attached | **atomic symlink/pointer** | current release |
> **Pointer recorded in app DB/audit** |

**PRD §39.4 fixes the single object-store channel:** *"promotion tool | R2 release prefix |
**Download/verify immutable public bundle**."*

**PRD §18.3 fixes the read side:** *"`corpus.sqlite` is release-specific, immutable and **production
read-only**. Search can read only corpus files; it MUST NOT read `app.sqlite`."*

**The consumed contracts, restated so this ticket is cold-startable:**

- **`CRPS-07`** (`04-corpus-contract`, `pipelines/corpus-builder/src/publish/**`) publishes the R2 key
  layout this tool mirrors: `release_prefix(release_id) = corpus-releases/{release_id}/`; object keys
  `{prefix}corpus.sqlite`, `{prefix}tantivy/<relative path>`, `{prefix}vectors.usearch`,
  `{prefix}embedding-manifest.json`, `{prefix}release-manifest.json`;
  `report_key(release_id) = corpus-releases/{release_id}/release-report.json`;
  `index_key() = corpus-releases/index.json`. `release-report.json` is *"the small object the
  promotion tool fetches **before** deciding to download tens of GB"* and carries `release_id`,
  `release_kind`, `parent_release_id`, `manifest_sha256`, `signature {algorithm, key_id}`, `versions`,
  `compatibility`, `files [{key, sha256, byte_size}]`, `total_byte_size`, `counts`, `coverage`,
  `quarantine`, `evaluation`, `published_at` and `store`. `release-manifest.json` is uploaded **last**,
  so its presence is the completion marker.
- **`CRPS-02`** (`04-corpus-contract`, `schemas/corpus-manifest/**` — PRD §44.3 serial-owned there)
  defines `release_kind` ∈ `{CANDIDATE, PUBLISHED, SYNTHETIC_FIXTURE}` and states:
  *"`verify_bundle()` returns the kind so that promotion tooling (`RLSE-07`) can refuse
  `SYNTHETIC_FIXTURE`."* The manifest carries `compatibility {app: {min,max}, search: {min,max},
  corpus_schema}`, `files[]`, `artifacts{}`, `counts{}`, `coverage[]`, `quarantine{}`, `evaluation{}`,
  `signature` and `manifest_sha256` over RFC 8785-style `canonical_bytes` excluding `signature` and
  `manifest_sha256`.
- **`RLSE-02`** (`infra/deploy/host/lib/**`, sub-PRD **D4**): `LAYOUT`, `HostAdapter` /
  `LocalRootHostAdapter`, `swapPointer` / `withPointerRollback`, `requireAuthorisation`, `preflight`,
  and sub-PRD **D19**'s unit names — `aer-search` on `127.0.0.1:7700`, shadow `aer-search-shadow` on
  `127.0.0.1:7701`.

**`DATA-09` records the app-side counterpart.** `01-app-data`'s invariant registry marks database
invariant 8 (bundle immutability) `OUT_OF_MODULE`, *"naming `RLSE-07` (with `CRPS-06`)"* — this ticket
is the named owner of that enforcement on the production side.

**Why these blockers.** breakdown-plan §6.2: `RLSE-02 --> RLSE-07` and `CRPS-07 --> RLSE-07`. The
host primitives and the pointer come from `RLSE-02`; the published bundle, its key layout and its
report come from `CRPS-07`.

**Accepted caveats carried forward, documented not enforced here:**

- **"Shadow where memory permits" is conditional by design.** PRD §39.2 gives `search` 768 MiB on a
  2 GiB host; a second full search process rarely fits. The tool therefore **measures** and takes one
  of two documented paths, recording which (deliverable 7). That is PRD §18.4's own wording, not a
  weakening.
- **The pinned-jobs check is a seam.** PRD §18.4: *"Old releases cannot be removed while jobs remain
  pinned."* Only `app.sqlite` knows which releases jobs are pinned to, and `services/search-rs` and
  this tool have no access to it (PRD §18.3, §39.1). The retention step therefore consults a
  `PinnedReleaseProvider` that **fails closed**; `INTL-04` (`22-internal-admin`, `blocked_by` this
  ticket) binds the real one over `DATA-05`/`DATA-07`.
- **The operator console is `INTL-04`'s.** `ADM-002`'s route surface (`/internal/releases`) and the
  typed-confirmation UI are `22-internal-admin`. This ticket ships the tool, the refusals and the
  audit-record shape that console drives.
- **No production credential.** PRD §20.2. Every merge-blocking check runs against
  `LocalRootHostAdapter` and a `LocalObjectStore`, using a locally re-signed `CANDIDATE`-kind bundle
  produced by `CRPS-06`'s factory — **not** the `SYNTHETIC_FIXTURE` bundle, which this tool must
  refuse.

## Goal

Produce `infra/deploy/corpus/**`: a promotion tool that fetches the small report first, downloads and
verifies a bundle into `/srv/aer/corpus/releases/<id>`, proves it healthy by shadow or bounded
read-only smoke, switches `/srv/aer/corpus/active` atomically, records the pointer in an audit sink —
and a rollback/retention tool that can return to a prior verified release and can never delete a
pinned or active one. Completion is mechanically checkable offline: a fault injected at **every** step
leaves the active pointer, the active bundle and the search process byte-identically unchanged
(`UAT-OPS-01`, `ADM-002`); a `SYNTHETIC_FIXTURE`, an unsigned manifest, a hash mismatch, an
incompatible range and an insufficient-disk condition are each refused before a byte is written to the
corpus tree; and the retention step refuses to remove the active, the previous or any pinned release,
and fails closed when the pinned-release provider is unbound.

## Non-goals

- **No corpus build, validation gates, signing, manifest or upload.** `04-corpus-contract`
  (`CRPS-01`…`CRPS-08`); `schemas/corpus-manifest/**` and `pipelines/corpus-builder/**` are PRD §44.3
  serial-owned there. PRD §40.9 puts everything left of `V[Production verify/download]` in that module.
- **No R2 bucket, prefix or token configuration.** `RLSE-03` (`infra/cloudflare/**`).
- **No application deploy, migration or app pointer.** `RLSE-06` (`infra/deploy/promote/**`).
  Application and corpus releases are promoted **independently** (PRD §20.4).
- **No search implementation, index format or query semantics.** `11-retrieval-engine`
  (`services/search-rs/**`). This tool starts, probes and reloads the process; it never opens a
  Tantivy or USearch file itself beyond an integrity open.
- **No `app.sqlite` write of any kind.** `01-app-data` owns every app table (breakdown-plan **A3**;
  PRD §45.2). The pointer record and the audit entry go through seams.
- **No internal admin route or console.** `22-internal-admin` (`INTL-04`, `blocked_by` this ticket).
- **No alerting or status page.** `RLSE-08` (`infra/deploy/monitoring/**`).
- **No runbook.** `docs/runbooks/corpus-promote-rollback.md` is `RLSE-10`, `blocked_by` this ticket.
- **No backup of corpus data.** PRD §23.1 — corpus databases and indexes are *"rebuilt from immutable
  releases rather than duplicated into customer backup storage"*; this tool retrieves from R2.
- **No real credential, host or bucket.** PRD §20.2, §39.6.
- **No `infra/compose/**`.** `RUNT-09` (`03-app-runtime`), breakdown-plan **A7**.

## File-scope (write-owns)

- `infra/deploy/corpus/**` — the promotion and rollback tools, the download/verify pipeline, the
  shadow/smoke runner, the retention tool, the audit-record shape, `test/**` and `fixtures/**`.

Does not touch:

- `infra/deploy/{release,host,promote,monitoring,benchmark}/**` — `RLSE-01`, `RLSE-02`, `RLSE-06`,
  `RLSE-08`, `RLSE-11`. `infra/{cloudflare,aws,backup,recovery}/**` — `RLSE-03`, `RLSE-04`, `RLSE-05`,
  `RLSE-09`. `docs/runbooks/**` — `RLSE-10`.
- **`infra/compose/**` — `RUNT-09` (`03-app-runtime`), breakdown-plan A7.**
- `pipelines/corpus-builder/**`, `schemas/corpus-manifest/**` — `04-corpus-contract`, PRD §44.3
  serial-owned. `services/search-rs/**` — `11-retrieval-engine`. `packages/database/**` —
  `01-app-data`. `apps/**` (including `apps/api/src/routes/internal/**`) — their owning modules.
  `tests/**` — `23-assurance`. Root manifests, lockfiles, `.github/workflows/**` — `00-foundation`.
  `docs/PRD.md`, `docs/prd/breakdown-plan.md` — frozen / not this ticket's to edit.

**Serial-safety analysis.** First decomposition (breakdown-plan §1 header: `phase: 1`, nothing merged,
no in-flight ticket) — nothing has previously written `infra/deploy/corpus/**`. breakdown-plan §4.1
names it one of the two **serial-owned "active release/promotion files"** paths with `RLSE-07` as its
single owner; no other module may write it. Siblings own disjoint subtrees. In the sub-PRD wave shape
this ticket runs in wave 3 concurrently with `RLSE-03` (`infra/cloudflare/**`) and `RLSE-05`
(`infra/backup/**`) — disjoint trees. Both blockers merge before it starts. `infra/compose/**` belongs
to `RUNT-09` and must not be touched here (breakdown-plan **A7**, §4.1).

## Deliverables

1. **`infra/deploy/corpus/README.md`** — one page: the PRD §18.4/§40.9 sequence as executed, the abort
   matrix, the exact commands, the R2 key layout mirrored from `CRPS-07`, and the statement that
   active data is never rebuilt or mutated in place (PRD §18.4).
2. **`infra/deploy/corpus/lib/keys.mjs`** — the R2 key layout, transcribed from `CRPS-07` deliverable 1
   so this tool is executable from its own ticket alone, with a test asserting it equals `CRPS-07`'s
   exported layout when `pipelines/corpus-builder` resolves and recording `SKIPPED_NOT_AVAILABLE`
   otherwise: `releasePrefix(id)`, `reportKey(id)`, `indexKey()`, and the five bundle object keys of
   PRD §18.4's layout.
3. **`infra/deploy/corpus/lib/store.mjs`** — a narrow read-only `ObjectStore`
   (`head`, `get`, `getRange`, `list`) with an R2/S3-compatible implementation configured from
   environment only (PRD §39.6) and a `LocalObjectStore` for tests. It exposes **no put and no
   delete**: PRD §39.4 gives the promotion tool *"Download/verify"* only, and `RLSE-03`'s
   `corpus-promote` token scope is read-only.
4. **`infra/deploy/corpus/lib/steps.mjs`** — the promotion sequence as ordered data, mirroring
   `RLSE-06`'s idiom: `{ id, prdBasis, title, run(ctx), compensate(ctx), pointOfNoReturn }` with ids
   exactly `fetch_report`, `authorise`, `preflight_disk`, `download_bundle`, `verify_bundle`,
   `integrity_open`, `smoke_queries`, `shadow_or_bounded_check`, `swap_pointer`, `reload_search`,
   `post_switch_smoke`, `record_pointer`, `retain_prior`. `pointOfNoReturn` is `true` only from
   `swap_pointer`. A test asserts the ids cover PRD §18.4's verification list and PRD §40.9's
   `V → H → A` tail in order.
5. **`infra/deploy/corpus/promote.mjs`** — the CLI:
   `node promote.mjs --release <id> --confirm-manifest-sha256 <hex> [--reason "<text>"] [--plan]
   [--adapter systemd|localroot --root <dir>]`. Step behaviour and abort path:

   | Step | Action | Refusal codes | Abort leaves |
   |---|---|---|---|
   | `fetch_report` | `GET corpus-releases/{id}/release-report.json` **first** (PRD §18.4; `CRPS-07` deliverable 5 exists precisely so tens of GB are not downloaded blindly); validate its shape | `REPORT_MISSING`, `REPORT_INVALID` | nothing written |
   | `authorise` | `requireAuthorisation(provider, { operation: 'CORPUS_PROMOTE', subject: <release_id>+<manifest_sha256> })`; **throws with no provider bound**; a reason is mandatory | `AUTHORISATION_REQUIRED`, `AUTHORISATION_STALE`, `SUBJECT_MISMATCH`, `REASON_REQUIRED` | nothing written |
   | `preflight_disk` | free space on the 32 GB attached mount ≥ `total_byte_size` × safety factor, keeping the active and previous bundles intact and staying under PRD §42.2's 85% critical | `INSUFFICIENT_DISK` | nothing written |
   | `download_bundle` | stream every `files[]` key into `/srv/aer/corpus/releases/<id>.staging/`, verifying each file's sha256 **as it streams**; resumable and idempotent | `DOWNLOAD_HASH_MISMATCH`, `DOWNLOAD_INCOMPLETE` | the staging directory is removed; the corpus tree is otherwise untouched |
   | `verify_bundle` | schema-validate `release-manifest.json`; recompute `manifest_sha256` over canonical bytes; verify the **signature** against a known `key_id`; refuse `release_kind: SYNTHETIC_FIXTURE`; refuse `signature: null`; check `compatibility.app`/`search` against the running app release and search protocol; check `versions.schema` equals `corpus_meta.schema_version`; check every `files[]` hash and size and that **no extra file exists** | `MANIFEST_INVALID`, `MANIFEST_HASH_MISMATCH`, `SIGNATURE_INVALID`, `UNSIGNED_RELEASE`, `FIXTURE_REFUSED`, `INCOMPATIBLE_APP`, `INCOMPATIBLE_SEARCH`, `SCHEMA_VERSION_MISMATCH`, `FILE_SET_MISMATCH` | staging removed |
   | `integrity_open` | open `corpus.sqlite` through the SQLite **read-only URI** and run `PRAGMA integrity_check` + `PRAGMA foreign_key_check`; open the vector and lexical index files read-only for a structural check | `DB_INTEGRITY_FAILED`, `INDEX_UNREADABLE` | staging removed |
   | `smoke_queries` | the PRD §18.4 *"smoke queries"*: a fixed set of exact-identifier, node-by-id and point-in-time lookups executed **read-only** against the staged `corpus.sqlite`, asserted against expectations derived from the manifest's `counts`/`coverage` | `SMOKE_QUERY_FAILED` | staging removed |
   | `shadow_or_bounded_check` | deliverable 7 | `SHADOW_UNHEALTHY` | shadow stopped; staging removed |
   | `swap_pointer` | rename staging into `/srv/aer/corpus/releases/<id>` (atomic directory rename within the same filesystem), then `swapPointer(adapter, '/srv/aer/corpus/active', …)` — **point of no return** | — | `withPointerRollback` restores the previous target |
   | `reload_search` | signal `aer-search` to load the release the pointer names, and wait for it to report the new `release_id` | `SEARCH_RELOAD_FAILED` | pointer rolled back and search reloaded to the prior release |
   | `post_switch_smoke` | re-run the smoke queries **through the running search process** on `127.0.0.1:7700` and assert it reports the new release id | `POST_SWITCH_SMOKE_FAILED` | automatic rollback (pointer + reload) |
   | `record_pointer` | write the audit record (deliverable 10) through the `AuditSink` and `PointerRecordSink` seams — PRD §39.3 *"Pointer recorded in app DB/audit"* | `AUDIT_SINK_UNBOUND` (visible failure, never a silent skip) | pointer stays switched; the failure is reported loudly |
   | `retain_prior` | deliverable 9 | — | nothing deleted |

   `--plan` performs no write, no download beyond the small report, and no `systemctl` call.
6. **Active-data inertness (the `UAT-OPS-01` proof).**
   `infra/deploy/corpus/lib/inertness.mjs` — `snapshotCorpusState(adapter)` hashes
   `/srv/aer/corpus/active`'s target plus a recursive content hash of every existing release
   directory, and `assertCorpusStateUnchanged(before, after)` fails naming the first difference. **All
   candidate work happens under `<id>.staging/`**, never in `active` and never in an existing release
   directory, so PRD §18.4's *"Active data MUST never be rebuilt or mutated in place"* is a structural
   property of the path layout, not a convention. Compatible with, and named alongside, `RLSE-06`'s
   equivalent primitive.
7. **`infra/deploy/corpus/lib/shadow.mjs`** — PRD §18.4's *"shadow process where memory permits"*, made
   explicit and measured:
   `chooseVerificationPath({ availableBytes, bundleBytes, searchLimitBytes })` returns
   `'SHADOW'` when a second search process fits inside the free memory after the PRD §39.2 budget
   (`aer-search` 768 MiB) with margin, and `'BOUNDED_READONLY'` otherwise. `SHADOW` starts
   `aer-search-shadow` on `127.0.0.1:7701` against the **staged** bundle and runs the smoke queries
   through it; `BOUNDED_READONLY` runs the same query set directly against the staged files with a
   bounded memory ceiling. The chosen path, the measured numbers and the reason are recorded in the
   promotion report and in the audit record — a promotion never silently skips verification, it
   records which verification it performed.
8. **`infra/deploy/corpus/rollback.mjs`** — `node rollback.mjs [--to <id>] [--plan]`:
   list `/srv/aer/corpus/releases/*`; keep only releases whose manifest verifies **now** (signature,
   hashes, `integrity_open`) and whose `compatibility.app` contains the running app release; require
   `requireAuthorisation(..., { operation: 'CORPUS_ROLLBACK' })` with a reason; `swapPointer` back;
   reload search; re-run the smoke queries; write the audit record. It never downloads, never
   rebuilds and never mutates a release directory. Basis: PRD §42.5 *"Corpus release/source/
   jurisdiction | Affected research warns/refuses | … **prior verified release may be activated**"*.
9. **`infra/deploy/corpus/retain.mjs`** — PRD §18.4's *"Old releases cannot be removed while jobs
   remain pinned"*: `plan()` lists release directories and classifies each `ACTIVE`, `PREVIOUS`,
   `PINNED`, `REMOVABLE`; `apply()` removes only `REMOVABLE` ones. It consults
   `PinnedReleaseProvider = () => Promise<string[]>` and **fails closed** with
   `PINNED_PROVIDER_UNBOUND` when unbound, removing nothing. It never removes `ACTIVE` or `PREVIOUS`
   under any flag. `INTL-04` binds the real provider over the app database (`DATA-05`'s job rows).
10. **`infra/deploy/corpus/lib/audit.mjs`** — the immutable `ADM-002` record:
    `{ event: 'CORPUS_PROMOTED' | 'CORPUS_ROLLED_BACK' | 'CORPUS_PROMOTION_ABORTED' |
      'CORPUS_RELEASE_REMOVED', actor_id, actor_kind, mfa_verified_at, reason, from_release_id,
      to_release_id, manifest_sha256, signature_key_id, verification_path ('SHADOW' |
      'BOUNDED_READONLY'), checks: [{id, status, code}], counts, coverage_summary, quarantine_summary,
      evaluation_summary, started_at, finished_at, outcome, journal_path }`. Written to the promotion
    journal **and** offered to an `AuditSink` seam that fails **visibly** when unbound. It carries no
    customer content and no credential (PRD §22). `PointerRecordSink` separately records the active
    pointer for PRD §39.3's *"Pointer recorded in app DB/audit"*; both are bound by `INTL-04`.
11. **`infra/deploy/corpus/lib/transaction.mjs`** — the same step engine idiom as `RLSE-06`: ordered
    execution, per-step journal entries under `/srv/aer/log/promote-<release>-<timestamp>.json`,
    reverse-order compensation, and a crash-safe journal that makes a second run refuse with
    `PROMOTION_JOURNAL_INTERRUPTED` until acknowledged.
12. **`infra/deploy/corpus/lib/api.mjs`** — the stable surface `RLSE-10` quotes and `INTL-04` drives:
    `promote(opts)`, `rollback(opts)`, `planPromotion(opts)`, `listReleases()`, `retainPlan()`,
    `chooseVerificationPath`, `STEP_IDS`, and the refusal-code enum.

## Acceptance checklist (classified)

Cross-references: `ADM-002` (recent MFA, reason, immutable audit, and *"Promotion failure leaves
active pointer unchanged"*), `OPS-002` (the promotion journal and post-switch smoke are what make a
promotion observable; PRD §42.2's *"release failure"* alert reads this ticket's outcome), `OPS-001`
(not applicable — corpus data is never backed up, PRD §23.1; stated so the absence is deliberate),
`OPS-003` (a promotion downloads tens of GB over R2 egress and must stay inside PRD §24.1's A$3–4 R2
line).

- [ ] `[machine]` The step ids cover PRD §18.4's verification list (signature, compatibility, disk,
      hashes, read-only database/index integrity, smoke queries) and PRD §40.9's `V → H → A` tail in
      order, asserted against a literal list (PRD §18.4, §40.9)
- [ ] `[machine]` **Fault-injection matrix — the core item and the `UAT-OPS-01` proof.** For **every**
      step, inject a failure and assert: (a) non-zero exit with the step's refusal code;
      (b) `assertCorpusStateUnchanged` passes for the active pointer, the active bundle and every
      pre-existing release directory; (c) the running search process still reports the **prior**
      release id; (d) no staging directory survives. For post-`swap_pointer` steps, additionally
      assert the pointer was rolled back and search reloaded the prior release (PRD §12.2; PRD §18.4;
      `ADM-002` "Promotion failure leaves active pointer unchanged"; `UAT-OPS-01`)
- [ ] `[machine]` A `release_kind: SYNTHETIC_FIXTURE` manifest is refused with `FIXTURE_REFUSED`
      before any download of bundle files (`CRPS-02` deliverable 4: *"`verify_bundle()` returns the
      kind so that promotion tooling (`RLSE-07`) can refuse `SYNTHETIC_FIXTURE`"*)
- [ ] `[machine]` An unsigned manifest (`signature: null`), a signature by an unknown `key_id`, a
      mutated manifest field and a `manifest_sha256` mismatch are each refused — one test per case
      (PRD §18.4 "Production verifies signature"; PRD §21)
- [ ] `[machine]` A single flipped byte in any bundle file, a missing file and an **extra** file not
      listed in `files[]` are each refused (PRD §18.4 "hashes"; both directions asserted)
- [ ] `[machine]` An out-of-range `compatibility.app` or `compatibility.search`, and a
      `versions.schema` differing from `corpus_meta.schema_version`, are refused (PRD §18.4
      "compatibility"; PRD §20.4)
- [ ] `[machine]` Insufficient free disk on the attached mount refuses **before** any download, keeping
      the active and previous bundles intact and respecting PRD §42.2's 85% critical threshold
      (PRD §18.4 "disk"; PRD §42.2)
- [ ] `[machine]` `corpus.sqlite` is opened through the SQLite **read-only URI** everywhere in this
      tool — asserted by a source scan and by a test in which the staged database file is made
      read-only and promotion still succeeds (PRD §18.3 "production read-only"; PRD §18.4 "read-only
      database/index integrity")
- [ ] `[machine]` All candidate work happens under `<id>.staging/`; a source scan proves no write path
      targets `/srv/aer/corpus/active` or an existing `/srv/aer/corpus/releases/<id>` other than the
      final atomic rename (PRD §18.4 "Active data MUST never be rebuilt or mutated in place")
- [ ] `[machine]` `chooseVerificationPath` returns `SHADOW` when memory permits and
      `BOUNDED_READONLY` otherwise, and the chosen path plus its measured numbers appear in the report
      and audit record — a promotion never records "verified" without naming which verification ran
      (PRD §18.4 "shadow process where memory permits"; PRD §39.2)
- [ ] `[machine]` Promotion refuses with `AUTHORISATION_REQUIRED` when no provider is bound, with
      `AUTHORISATION_STALE` on an old assertion, with `SUBJECT_MISMATCH` when the confirmed subject is
      not `release_id` + `manifest_sha256`, and with `REASON_REQUIRED` when no reason is given
      (PRD §20.4; `ADM-002`; sub-PRD D10)
- [ ] `[machine]` The pointer switch uses `swapPointer` and is atomic under crash injection at every
      adapter call; a crash mid-swap leaves the pointer resolving to exactly one existing release
      (PRD §39.3 "atomic symlink/pointer"; PRD §18.4 "atomic active-pointer switch")
- [ ] `[machine]` A failing post-switch smoke triggers **automatic rollback** to the prior release and
      exits non-zero naming the failing check (PRD §18.4; `ADM-002`)
- [ ] `[machine]` `retain.mjs` classifies `ACTIVE`, `PREVIOUS`, `PINNED` and `REMOVABLE` correctly, and
      **fails closed** with `PINNED_PROVIDER_UNBOUND` removing nothing when the provider is unbound;
      no flag can make it remove `ACTIVE` or `PREVIOUS` (PRD §18.4 "Old releases cannot be removed
      while jobs remain pinned")
- [ ] `[machine]` `rollback.mjs` re-verifies a prior release's signature, hashes and integrity **at
      rollback time** and refuses one that no longer verifies or is no longer app-compatible
      (PRD §42.5 "prior verified release may be activated"; PRD §21)
- [ ] `[machine]` The tool has **no put and no delete** against the object store, and never writes
      `app.sqlite` — asserted by a source scan and by a recording store that fails the test on any
      mutating call (PRD §39.4 "Download/verify immutable public bundle"; PRD §18.3; breakdown-plan A3)
- [ ] `[machine]` The audit record contains every deliverable-10 field, no customer content and no
      credential; an **unbound** `AuditSink` or `PointerRecordSink` causes a visible non-zero failure,
      never a silent skip (`ADM-002`; PRD §39.3 "Pointer recorded in app DB/audit"; PRD §22)
- [ ] `[machine]` Streaming discipline: download and hashing hold bounded memory — a bundle can be tens
      of GB (PRD §17.2) on a host where the promoter competes with a 768 MiB search process
      (PRD §39.2) — asserted by a bounded-heap test over a synthetic large fixture
- [ ] `[machine]` `--plan` downloads only the small report, performs no write and no `systemctl` call
      (deliverable 5)
- [ ] `[machine]` An interrupted promotion leaves a journal that makes a second run refuse with
      `PROMOTION_JOURNAL_INTERRUPTED` until acknowledged (deliverable 11)
- [ ] `[machine]` The key layout equals `CRPS-07`'s exported layout when `pipelines/corpus-builder`
      resolves, and records `SKIPPED_NOT_AVAILABLE` — never a silent pass — when it does not
      (`CRPS-07` deliverable 1)
- [ ] `[machine]` No file outside `infra/deploy/corpus/**` is modified — asserted by
      `git diff --name-only`. In particular `infra/compose/**` is untouched (breakdown-plan **A7**;
      sub-PRD D2)
- [ ] `[machine]` `pnpm lint`, `pnpm typecheck`, `pnpm test` green (PRD §20.3, §45.3)
- [ ] `[machine]` PR states the PRD §45.4 items, naming `ADM-002`, the source/licence impact (the
      promoted bundle's `coverage` and `quarantine` summaries are recorded in the audit), the cost
      impact (R2 egress against PRD §24.1's A$3–4 line), the memory/disk impact (staging space on the
      32 GB mount; the shadow decision) and the rollback path (this ticket **is** the rollback path)
- [ ] `[fixture]` Replay of the recorded **promotion journal** fixture under
      `infra/deploy/corpus/fixtures/journals/`: re-running against the committed
      `CANDIDATE`-kind bundle reproduces the same step sequence, refusal codes and corpus-state hashes
      (excluding timestamps) — the reproducible drill evidence PRD §26's *"safe promotion/rollback are
      demonstrated"* and `docs/runbooks/corpus-promote-rollback.md` (`RLSE-10`) rest on
- [ ] `[human]` **The founder-authorised promotion itself.** One real promotion of a real candidate
      release to the production host with recent MFA, a typed confirmation of the exact release id and
      manifest hash, and a reason — followed by one real rollback. **Not required to merge** —
      PRD §20.4 and `ADM-002` make this irreducibly human, and PRD §20.2 forbids giving coding agents
      production SSH, R2 or MFA credentials. The merge-time substitute is the `LocalRootHostAdapter`
      plus `LocalObjectStore` fault-injection matrix over a locally re-signed `CANDIDATE` bundle,
      which proves every refusal, every abort path and the active-data invariant without a host
- [ ] `[human]` `UAT-OPS-01` executed by the founder against the real host: *"Corrupt candidate corpus
      fixture → Promotion blocked; active release/search unchanged."* **Not required to merge** — the
      candidate-side half is `CRPS-06`'s and the offline half is asserted above (PRD §41.2)
- No `cargo test --workspace` / `uv run pytest` item — this ticket authors no Rust and no Python; it
      **invokes** the search process as an external service and reads Python-produced artifacts
      (PRD §45.3)

## Test plan

Reviewer steps. Everything except the two `[human]` rows runs offline with no host, no network, no R2
and no production credentials (PRD §20.2):

1. `corepack pnpm install --frozen-lockfile`; `pnpm typecheck && pnpm lint`.
2. `pnpm test --filter @aer/infra-corpus-promote`, **or** `node --test infra/deploy/corpus/test` if
   the workspace member is absent (open question **Q-RLSE-9**). Both must pass.
3. Harness: `test/helpers/world.mjs` builds a synthetic world — `RLSE-02`'s `LAYOUT` under `--root`
   with an existing active release and a previous one; a `LocalObjectStore` seeded with a **real**
   `CANDIDATE`-kind bundle produced by `CRPS-06`'s `candidate_factory` and signed with the `dev-`
   keypair (never a hand-written manifest — the same discipline
   `docs/prd/04-corpus-contract/tickets/CRPS-07-*.md` imposes); a fake `aer-search` that reports a
   release id and can be programmed to fail reload; stub `AuthorisationProvider`, `AuditSink`,
   `PointerRecordSink` and `PinnedReleaseProvider`. The recording store fails the test on any
   `put`/`delete`.
4. **`sequence.test.mjs`** — a successful promotion; assert the recorded step order and that the step
   ids cover PRD §18.4's verification list and PRD §40.9's `V → H → A`.
5. **`fault-matrix.test.mjs`** — the core suite: for each step id, snapshot corpus state, inject a
   failure, then assert exit code, refusal code, `assertCorpusStateUnchanged`, the search process
   still reporting the prior release, and no surviving staging directory. For post-`swap_pointer`
   steps assert the rollback.
6. **`verification.test.mjs`** — the refusal matrix: `SYNTHETIC_FIXTURE`; unsigned; unknown `key_id`;
   mutated manifest; `manifest_sha256` mismatch; one flipped byte per bundle file; missing file; extra
   file; out-of-range app compatibility; out-of-range search compatibility; schema-version mismatch.
   Assert each refusal happens before the next step's first write.
7. **`disk.test.mjs`** — synthetic free space just below and just above the requirement; assert
   `INSUFFICIENT_DISK` before any download and that the check respects the 85% critical threshold.
8. **`integrity.test.mjs`** — corrupt the staged `corpus.sqlite` (page-level) and assert
   `DB_INTEGRITY_FAILED`; truncate the vector file and assert `INDEX_UNREADABLE`; assert every open in
   the tool uses the read-only URI (source scan plus a read-only-file test).
9. **`shadow.test.mjs`** — `chooseVerificationPath` table over available memory; assert `SHADOW` starts
   `aer-search-shadow` on 7701 against the staging path and never against `active`; assert
   `BOUNDED_READONLY` runs with a bounded ceiling; assert both record the path and the numbers.
10. **`pointer.test.mjs`** — crash injection at every adapter call during the swap; assert the pointer
    always resolves to exactly one existing release directory.
11. **`retain.test.mjs`** — classification table (`ACTIVE`, `PREVIOUS`, pinned by the provider,
    removable); unbound provider fails closed removing nothing; a flag cannot remove `ACTIVE` or
    `PREVIOUS`.
12. **`rollback.test.mjs`** — a prior release whose signature no longer verifies is refused; one that
    is app-incompatible is refused; the happy path swaps, reloads and re-smokes; authorisation is
    required.
13. **`audit.test.mjs`** — every field present; unbound sinks fail visibly; a `content-canary-<uuid>`
    seeded in a manifest description and an error message is absent from the record and from all
    output.
14. **`keys.test.mjs`** — compare against `CRPS-07`'s exported layout when resolvable; assert the
    `SKIPPED_NOT_AVAILABLE` record otherwise.
15. **`memory.test.mjs`** — promote a synthetic multi-GB bundle with a bounded heap; assert peak RSS
    stays modest against the PRD §39.2 budget.
16. **`golden.test.mjs`** — the `[fixture]` row: replay the committed journal fixture and diff the step
    sequence, refusal codes and corpus-state hashes, ignoring timestamps.
17. **Diff check** — `git diff --name-only` lists only paths under `infra/deploy/corpus/`.
18. **Reviewer focus (concurrency- and data-loss-sensitive):** confirm nothing writes into `active` or
    an existing release directory at any point; confirm the staging→final rename is on the same
    filesystem (a cross-device rename is not atomic); confirm two concurrent promotions cannot both
    stage the same release id; confirm the pointer swap and the search reload cannot interleave into a
    state where search holds a deleted directory open while retention runs; confirm `retain` cannot be
    coerced into deleting a pinned release by a stale provider response (it must fail closed, not use
    a cached list); confirm the store client genuinely has no write or delete method; confirm no
    credential, manifest signature value or customer content reaches the journal, the audit record or
    stdout.

## Feedback obligation

**1. General rule.** If implementation falsifies this ticket, update **this ticket file** first
(docs PR → merge → `publish-tickets.mjs --sync`) and, where module context changes,
`docs/prd/18-ops-release/README.md` (version +0.1 with a changelog line), **then** change code. Silent
divergence is an incomplete ticket (CLAUDE.md, issue #53).

**2. Foreseeable frictions, each with its exact writeback target.**

- **A shadow search process never fits in memory on the 2 GiB host** → PRD §18.4 already says *"where
  memory permits"*, and deliverable 7 records which path ran. If `BOUNDED_READONLY` turns out to be
  the only path that ever runs, record that measurement in `docs/prd/18-ops-release/README.md` and in
  the PR's memory line (PRD §45.4), and coordinate with `RLSE-11`, which owns the real-scale memory
  picture. Never report a promotion as shadow-verified when it was not.
- **`CRPS-07`'s key layout or `release-report.json` shape differs from deliverables 2/5** → those are
  `04-corpus-contract`'s contracts. Do **not** adapt silently: raise a docs PR against `CRPS-07`,
  record the agreed layout in `docs/prd/04-corpus-contract/README.md` and
  `docs/prd/18-ops-release/README.md`, then `--sync` both tickets. `schemas/corpus-manifest/**` and
  `pipelines/**` must not be written from here (PRD §44.3 serial ownership).
- **The manifest lacks a field this tool needs to verify compatibility** → that is `CRPS-02`'s
  serial-owned schema. Raise a docs PR against `CRPS-02`, record the need in
  `docs/prd/18-ops-release/README.md`, and keep the tool refusing (fail closed) until the field
  exists. Never infer compatibility from a heuristic.
- **`PinnedReleaseProvider` cannot be bound because `INTL-04` is not built yet** → that is expected:
  `INTL-04` is `blocked_by` this ticket. The fail-closed default (`PINNED_PROVIDER_UNBOUND`, remove
  nothing) is the correct interim behaviour; record the operational consequence (disk fills with old
  releases until retention can run) in `docs/prd/18-ops-release/README.md` and in
  `docs/runbooks/corpus-promote-rollback.md` (`RLSE-10`).
- **R2 egress for a full bundle exceeds PRD §24.1's A$3–4 line** → record the measured transferred
  bytes in the PR's cost line (PRD §45.4) and in `docs/prd/18-ops-release/README.md`. Reducing
  promotion frequency is an operational choice; increasing the budget is a **Founder** decision
  (sub-PRD **D18**). Never disable hash verification to save egress — PRD §18.4 requires it.
- **The search process cannot reload without a restart** → that is `11-retrieval-engine`'s contract
  (`RETR-01`'s release pinning). Raise a docs PR against `RETR-01`, record the interim behaviour
  (stop/start `aer-search` with a measured availability gap) in
  `docs/prd/18-ops-release/README.md`, and state the gap in the PR's known-gaps line. Do not write
  `services/search-rs/**`.

**3. Escalation.** *"Active data MUST never be rebuilt or mutated in place"* and *"Old releases cannot
be removed while jobs remain pinned"* (PRD §18.4), together with *"Failed releases MUST NOT modify
active production data"* (PRD §12.2), are the guarantees `ADM-002`, `UAT-OPS-01`, `DATA-09`'s
invariant 8 and PRD §26's *"Source freshness, quarantine and safe promotion/rollback are
demonstrated"* all rest on. If any is outright falsified — if a promotion genuinely cannot avoid
touching active data — stop, escalate for re-review, and write back to
`docs/prd/18-ops-release/README.md` and `docs/prd/breakdown-plan.md` before any code lands. Never add
a flag that bypasses verification, and never let a candidate path write into `active`, inside this
ticket.
