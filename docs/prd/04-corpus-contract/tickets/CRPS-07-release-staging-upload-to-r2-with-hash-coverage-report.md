---
id: CRPS-07
title: Release staging upload to R2 with hash/coverage report
module: 04-corpus-contract
lane: 04-corpus-contract
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [CRPS-06]
blocks: [RLSE-07]
---

# CRPS-07 — Release staging upload to R2 with hash/coverage report

Implements PRD §18.4, §19.2, §24.1 — requirement ID `ADM-002`, epic `E07-CORPUS-SCHEMA`.
No ADR — the decision is already made in PRD §18.4 ("Build/sign/upload occurs offline") and §19.2
(what R2 may and may not contain); this is build ticket 7 of 8 against it.
Parent sub-PRD: [04-corpus-contract README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [CRPS-06 — Candidate release build and validation gates](CRPS-06-candidate-release-build-and-validation-gates.md) (mirrors `blocked_by`).
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed contract
(the bundle from `CRPS-06`, the manifest from `CRPS-02`, the object-store boundary from PRD §19.2) —
not a new subsystem decision.

## Background + basis

**Upload is the last offline stage.** PRD §18.4: *"Build/sign/upload occurs offline. Production
verifies signature, compatibility, disk, hashes, read-only database/index integrity and smoke queries.
Promotion uses a shadow process where memory permits, then an atomic active-pointer switch. Active
data MUST never be rebuilt or mutated in place. Old releases cannot be removed while jobs remain
pinned."* PRD §40.9's stage graph places `S[Sign manifest + upload staging]` immediately before
`V[Production verify/download]`.

**R2 is public-artifact-only.** PRD §19.2: *"Cloudflare R2 stores only public/rebuildable legal
artifacts, normalised text, candidate/archived corpus releases and indexes. It MUST NOT contain
customer identities, Research Records, answers, exports or backups."* And the reason:
*"This split exists because R2 is cost-effective for public corpus/egress but its Oceania placement
hint is not an Australian residency guarantee."*

**The consumer is the promotion tool, over a narrow channel.** PRD §39.4's internal network matrix:
*"promotion tool | R2 release prefix | Download/verify immutable public bundle."* That tool is
`RLSE-07` (`18-ops-release`, `infra/deploy/corpus/**`), which is `blocked_by` this ticket and which
PRD §44.3 makes serial-owned there.

**Cost is capped and small.** PRD §24.1 budgets *"R2 public corpus | A$3–4"* inside a total of
*"A$42–50"*, with *"Actual provider billing MUST be monitored; the system MUST stop before exceeding
the founder-funded ceiling."* An upload that re-uploads an existing release, or that leaves partial
multipart uploads behind, spends real money.

**Local workstation, not production.** PRD §19.3: *"The local pipeline performs source-adapter
development, full fetch/parse, OCR orchestration, normalisation, embedding, index build, 600-case
evaluation, release signing and candidate upload."*

**No production credentials for agents.** PRD §20.2: *"Coding agents MUST NOT receive production SSH,
database, backup, signing or provider credentials by default."* Therefore every `[machine]`/`[fixture]`
check in this ticket runs against a local S3-compatible stub, never against a real bucket; the one
real-bucket check is `[human]` and explicitly not required to merge.

**Carried caveat (accepted, documented, not enforced here):** lifecycle/retention of archived releases
on R2 ("Old releases cannot be removed while jobs remain pinned", PRD §18.4) is enforced by the
promotion/retention side (`RLSE-07`, `RLSE-09`), because only the app database knows which releases
jobs are pinned to. This ticket never deletes anything.

## Goal

Produce the staging publisher in `pipelines/corpus-builder/src/publish/**`: a write-once, resumable,
idempotent uploader that takes a bundle built and signed by `CRPS-06`/`CRPS-02`, verifies it before
sending, uploads every bundle file to a deterministic R2 key layout without ever overwriting an
existing key, verifies the uploaded copy by hash, and publishes a machine-readable
`release-report.json` (per-file hashes/sizes plus source coverage) that the promotion tool can fetch
first to decide whether to download the bundle at all. Completion is mechanically checkable:
`uv run pytest pipelines/corpus-builder/tests/publish` is green against a local S3-compatible stub,
an attempt to publish over an existing release fails without writing a byte, and a mid-upload
interruption resumes without duplicating or corrupting objects.

## Non-goals

- **No download, verification-on-host, shadow run, atomic pointer switch or rollback** — `RLSE-07`
  (`18-ops-release`, `infra/deploy/corpus/**`; PRD §44.3 serial-owned there). PRD §18.4 puts those on
  the production side.
- **No bucket, prefix or credential provisioning** — R2/S3 infrastructure is `18-ops-release`
  (`RLSE-03`/`RLSE-04`; breakdown plan §4.2 gives `RLSE-04` the bucket/prefix/least-privilege
  ownership). This ticket consumes configuration.
- **No deletion, lifecycle or retention policy** — `RLSE-07`/`RLSE-09` (PRD §18.4 "Old releases cannot
  be removed while jobs remain pinned").
- **No app-database writes** — `corpus_release` rows in `app.sqlite`-side operational views belong to
  `01-app-data`/`22-internal-admin`. This ticket writes only the corpus-side row through `CRPS-02`'s
  `insert_release_row` when publishing marks the release `PUBLISHED`.
- **No S3 Sydney (backups/exports) access of any kind** — different store, different credentials,
  different owner (PRD §19.2; `18-ops-release`/`19-exports`).
- **No build, no gates, no signing** — `CRPS-06`, `CRPS-02`.
- **No cost monitoring/alerting implementation** — `OPS-003` and PRD §42.6 belong to
  `18-ops-release`/`22-internal-admin`. This ticket reports transferred bytes so those can act.

## File-scope (write-owns)

- `pipelines/corpus-builder/src/publish/**`
- `pipelines/corpus-builder/tests/publish/**`
- Module-shared, append-only (breakdown plan §1.1): `pipelines/corpus-builder/pyproject.toml`
  (dependencies only — e.g. the S3-compatible client and the local stub; regenerate the root
  `uv.lock` as a build artifact, never hand-merge).

Does not touch:

- `pipelines/corpus-builder/schema/**`, `src/contracts/**` — `CRPS-01`; `schemas/corpus-manifest/**`,
  `src/manifest/**` — `CRPS-02`. These are the PRD §44.3 **serial-owned corpus schema and release
  manifest**: `04-corpus-contract` is their sole owner and **no other module may write them**; inside
  this module only `CRPS-01`/`CRPS-02` do.
- `src/chunking/**` — `CRPS-03`. `src/tiering/**` — `CRPS-04`. `pipelines/embeddings/**` — `CRPS-05`.
  `src/{build,validation}/**` — `CRPS-06`. `fixtures/**` — `CRPS-08`.
- `infra/**` (including `infra/aws/**`, `infra/cloudflare/**`, `infra/deploy/corpus/**`) —
  `18-ops-release`. `apps/**`, `packages/**`, `services/**`, `pipelines/{ingestion,adapters,evaluation}/**`,
  `evals/**`, `schemas/**`, `tests/**` — other modules per breakdown plan §4. `docs/PRD.md` — frozen.

**Serial-safety analysis.** First decomposition: nothing merged, no in-flight contention (breakdown
plan §1 header — `phase: 1`). `src/publish/**` does not exist before this ticket. `CRPS-07` is alone
in wave 5 (its only blocker `CRPS-06` is merged before it starts), so no sibling can contend for any
path; the only shared file is the module's append-only `pyproject.toml`.

## Deliverables

1. `src/publish/keys.py` — the deterministic key layout, exported as functions so that `RLSE-07` can
   mirror it from the ticket text alone:
   - `release_prefix(release_id) -> str` = `corpus-releases/{release_id}/`
   - object keys: `{prefix}corpus.sqlite`, `{prefix}tantivy/<relative path>`,
     `{prefix}vectors.usearch`, `{prefix}embedding-manifest.json`, `{prefix}release-manifest.json`
   - `report_key(release_id)` = `corpus-releases/{release_id}/release-report.json`
   - `index_key()` = `corpus-releases/index.json` (an append-only list of published release ids and
     their report keys, see deliverable 6).
   Keys are lowercase, contain no spaces, and never encode a mutable notion such as "latest" — the
   active pointer lives on the production host (PRD §39.3 `/srv/aer/corpus/active`), never in the
   object store.
2. `src/publish/client.py` — a narrow `ObjectStore` protocol (`head`, `put_stream`,
   `put_bytes`, `get_bytes`, `list_prefix`) with two implementations: an S3-compatible client
   configured for R2 from environment/config only (PRD §39.6), and `LocalObjectStore` backed by a
   temporary directory for tests. No credential is ever read from a committed file, and no default
   endpoint/bucket is hard-coded.
3. `src/publish/publish.py::publish_release(bundle_dir, store, *, expected_release_kind =
   "CANDIDATE") -> PublishResult` with this ordering constraint:
   1. **verify before sending** — call `CRPS-02`'s `verify_bundle()`; a non-`ok` report aborts with
      zero network calls (PRD §21: trust artifacts only after verification);
   2. refuse when the manifest's `release_kind` is `SYNTHETIC_FIXTURE` — a fixture release
      (`CRPS-08`) must never reach the staging bucket (breakdown plan A4; PRD §12.2);
   3. refuse when `signature` is null;
   4. **write-once check** — `head` every target key; if any already exists, abort with
      `ReleaseAlreadyPublished` and upload nothing. Basis: PRD §18.4 "Active data MUST never be
      rebuilt or mutated in place"; §35.8 invariant 8;
   5. upload every file streamed in bounded chunks, largest-first is **not** used — upload in sorted
      key order so a partial upload is reproducible; `release-manifest.json` is uploaded **last**, so
      the presence of the manifest key is itself the completion marker;
   6. **verify after sending** — re-`head` each key and compare size, and re-download and hash at
      least `release-manifest.json` and `embedding-manifest.json` in full plus a configurable sampled
      subset of large files (default: verify the recorded sha256 of every file under 64 MiB, sample
      the rest by ranged read of the first and last 1 MiB);
   7. write `release-report.json` (deliverable 5), then append to `index.json` (deliverable 6);
   8. mark the corpus-side release row `PUBLISHED` via `CRPS-02`'s `insert_release_row`/status update
      path — never by direct SQL here.
4. **Resumability and idempotence.** `publish_release(..., resume=True)` skips keys whose `head`
   reports the expected byte size **and** whose recorded sha256 matches a stored per-object checksum
   metadata field; everything else is re-uploaded. Re-running a completed publish is a no-op that
   returns `PublishResult(status="ALREADY_COMPLETE")` rather than an error. Any multipart upload
   aborted by an exception is explicitly aborted in a `finally` block so no billable orphan parts
   remain (PRD §24.1).
5. `release-report.json` — the small object the promotion tool fetches **before** deciding to download
   tens of GB. Required members: `release_id`, `release_kind`, `parent_release_id`,
   `manifest_sha256`, `signature` (`{algorithm, key_id}` — the value stays in the manifest),
   `versions`, `compatibility`, `files: [{key, sha256, byte_size}]`, `total_byte_size`,
   `counts`, `coverage` (per source group: `coverage_status`, `freshness_status`, `document_count`,
   date bounds), `quarantine` summary, `evaluation` summary, `published_at`, `store`
   (`{provider: "r2", bucket_alias}` — never a credential, never a signed URL). Basis: PRD §18.4's
   manifest field list, PRD §12.1's five separated freshness dates, PRD §39.4's promotion-tool
   channel.
6. `index.json` — append-only registry of published releases:
   `{updated_at, releases: [{release_id, published_at, report_key, parent_release_id}]}`.
   Updated with a read-modify-write that first `head`s the object's ETag and retries on mismatch; a
   lost update must never drop an existing entry (assert the new list is a superset of the old).
7. **Content-safety assertion.** `src/publish/safety.py::assert_public_artifacts_only(bundle_dir)` —
   runs before any upload and blocks on: any file outside the PRD §18.4 layout; any path resembling
   `app.sqlite`, `ephemeral.sqlite`, `*.env`, key material, or an export; and any `source_artifact`
   row in the bundle's corpus database whose `r2_key` is set while its licence assessment forbids
   storage. Basis: PRD §19.2 ("MUST NOT contain customer identities, Research Records, answers,
   exports or backups"), PRD §35.7 (ephemeral database is excluded from every backup glob), PRD §11.1.
8. `src/publish/cli.py` — `uv run python -m corpus_builder publish --bundle <dir> [--resume]
   [--dry-run]`. `--dry-run` performs steps 1–4 and prints the planned key list and total bytes
   without a single write — the safe way to review a publish. Exit codes: `0` published or already
   complete, `2` refused (verification, write-once, safety), `1` transport/internal error.
9. `PublishResult` carries `{release_id, uploaded_objects, skipped_objects, uploaded_bytes,
   verified_bytes, elapsed_seconds, status}`; `uploaded_bytes` is the number `18-ops-release` needs
   for the PRD §24.1 R2 cost line.
10. `src/publish/README.md` — one page: the key layout (so `RLSE-07` can mirror it), the write-once
    rule, the `--dry-run` workflow, and the explicit statement that this tool never deletes and never
    promotes.

## Acceptance checklist (classified)

- [ ] `[machine]` A bundle failing `verify_bundle()` is refused with **zero** calls on the
      `ObjectStore` — asserted with a recording stub. (PRD §21; §18.4)
- [ ] `[machine]` A manifest with `release_kind: SYNTHETIC_FIXTURE`, or with a null `signature`, is
      refused. (Breakdown plan A4; PRD §18.4)
- [ ] `[machine]` Write-once: publishing a release whose prefix already contains any target key aborts
      with `ReleaseAlreadyPublished` and writes nothing. (PRD §18.4 "never be rebuilt or mutated in
      place"; §35.8 invariant 8; `ADM-002`)
- [ ] `[machine]` `release-manifest.json` is the last key written — asserted from the stub's call
      order, so an interrupted publish is detectable by its absence. (Deliverable 3.5)
- [ ] `[machine]` Resume after a simulated interruption uploads exactly the missing objects, and a
      re-run of a complete publish returns `ALREADY_COMPLETE` without uploading. (Deliverable 4)
- [ ] `[machine]` An exception mid-upload aborts any in-flight multipart upload — asserted by the stub
      recording an abort call. (PRD §24.1 cost discipline)
- [ ] `[machine]` Post-upload verification fails when the stub returns a wrong size or wrong bytes for
      any key. (PRD §18.4 "hashes")
- [ ] `[machine]` `assert_public_artifacts_only()` blocks a bundle containing an extra `app.sqlite`,
      an `ephemeral.sqlite`, a `.env`, a private key file, or a stray export artifact — one test per
      case. (PRD §19.2; §35.7)
- [ ] `[machine]` `release-report.json` contains every required member of deliverable 5, asserted
      against an explicit literal list, and contains **no** credential, signed URL or bucket secret.
      (PRD §39.4; §19.2)
- [ ] `[machine]` `index.json` update is a superset of the previous list under a simulated concurrent
      writer (ETag mismatch → retry), and never drops an entry. (Deliverable 6)
- [ ] `[machine]` `--dry-run` performs no writes and prints the exact key list and total byte size.
      (Deliverable 8)
- [ ] `[machine]` No credential is read from a committed file, and the module hard-codes no endpoint,
      bucket name or account id — asserted by a source scan test. (PRD §20.2; §39.6)
- [ ] `[fixture]` End-to-end publish of the `CRPS-06` golden candidate bundle into `LocalObjectStore`
      reproduces the expected key set and a `release-report.json` matching the recorded golden
      (excluding timestamps). (PRD §40.8 item 4 discipline)
- [ ] `[human]` One real staging upload to the actual R2 bucket, performed by the founder with the
      real credentials, confirming the promotion tool (`RLSE-07`) can fetch `release-report.json` and
      the bundle. **Not required to merge** — PRD §20.2 forbids giving coding agents those
      credentials; the offline stub covers the logic. (PRD §18.4; §39.4)
- [ ] `[machine]` `uv run pytest` green (Python; PRD §45.3).
- [ ] `[machine]` `pnpm test` green (standing item, breakdown plan §1.1).
- [ ] `[machine]` PR states requirement ID `ADM-002`; source/licence impact (public-artifact-only
      assertion); cost impact (uploaded bytes vs the PRD §24.1 A$3–4 R2 line); security impact
      (credential handling, no customer data); rollback path (a published prefix is never mutated —
      recovery is a new release id); known gaps. (PRD §45.4)
- [ ] `cargo test --workspace` not applicable — this ticket touches no Rust.

## Test plan

Everything except the one `[human]` item runs offline against `LocalObjectStore`; no network, no real
credentials.

1. `uv run pytest pipelines/corpus-builder/tests/publish -q`.
   Harness: pytest. `tests/publish/conftest.py` provides `RecordingObjectStore` (wraps
   `LocalObjectStore`, records every call in order, and can be programmed to fail on the *n*-th
   `put_stream` or to return wrong metadata) and reuses `CRPS-06`'s `candidate_factory` fixture to
   produce a real signed bundle — do not hand-write a fake bundle.
2. Refusal matrix: unverifiable bundle, `SYNTHETIC_FIXTURE`, unsigned, pre-existing key — each asserts
   the exception type and `store.calls == []` (or head-only calls for the write-once case).
3. Ordering: assert `release-manifest.json` is the last `put_*` call and that keys are otherwise in
   sorted order.
4. Interruption/resume: program the stub to raise on the third `put_stream`; assert the abort call;
   re-run with `resume=True`; assert the union of uploaded keys equals the full set with no key
   uploaded twice.
5. Post-upload verification: program the stub to return a wrong size for one key, then wrong bytes for
   another; assert both fail.
6. Safety scan: build bundles with each forbidden extra file and assert refusal, including a corpus
   database row whose `r2_key` is set under a storage-forbidding licence assessment.
7. Concurrency on `index.json`: simulate an ETag mismatch on the first write attempt and assert the
   retry preserves both entries.
8. Suite green: `uv run pytest` and `pnpm test` from the repository root.
9. Reviewer focus (security- and cost-sensitive): confirm no credential is logged or included in
   `release-report.json`; confirm nothing in this module can delete or overwrite an object; confirm
   streaming upload holds bounded memory (a bundle can be tens of GB, PRD §17.2) — no
   `read()`-whole-file; confirm the write-once check cannot be bypassed by a flag; confirm the
   ephemeral database and any `app.sqlite` can never be selected for upload.

## Feedback obligation

1. **General rule.** If implementation falsifies this ticket, update **this ticket** (docs PR →
   merge → `publish-tickets.mjs --sync`) and, where module context changes,
   `docs/prd/04-corpus-contract/README.md` (version +0.1 with a changelog line) **before** changing
   code. Silent divergence is an incomplete ticket.
2. **Foreseeable frictions, each with its exact writeback target:**
   - *The key layout in deliverable 1 conflicts with what `RLSE-07` needs, or with the prefix/
     least-privilege model `RLSE-04` defines* → the layout is a cross-module contract: change it in
     **this ticket** and record the agreed layout in `docs/prd/04-corpus-contract/README.md`
     (Decisions), then have `RLSE-07`'s ticket cite it. Breakdown plan §4.2 already assigns bucket and
     prefix ownership to `RLSE-04`; do not write `infra/aws/**` or `infra/cloudflare/**` from here.
   - *R2's API surface differs from the S3-compatible subset used* → keep the `ObjectStore` protocol
     narrow and adapt the implementation; if the write-once guarantee cannot be expressed
     (no conditional put), record the mitigation (head-then-put plus post-verify, and the residual
     race) in **this ticket** and in `docs/prd/04-corpus-contract/README.md` — do not silently accept
     an overwrite path.
   - *Full-bundle hash verification after upload is too slow or too expensive in egress* (PRD §24.1)
     → the sampling policy in deliverable 3.6 is the tunable; record any change to it in **this
     ticket** with the measured numbers, and note that `RLSE-07` performs the authoritative
     verification on download (PRD §18.4).
   - *Publishing needs to record something in the app database* → it must not. Raise it against
     `22-internal-admin`/`18-ops-release` (release visibility, `INTL-04`) and record the dependency in
     `docs/prd/04-corpus-contract/README.md`. `pipelines` must not write customer/app data (PRD §45.2:
     `pipelines` "Must not own: Production customer research").
3. **Falsified protocol.** If PRD §19.2's object-store split is falsified — for example if a bundle
   provably must carry something the section forbids on R2 — that is a **product/privacy** change
   under PRD §45.5 requiring founder approval and a PRD update, because the split exists for data-
   residency reasons. Stop, escalate for re-review, and write back to
   `docs/prd/04-corpus-contract/README.md` and `docs/prd/breakdown-plan.md` before uploading anything
   outside the §18.4 bundle. Never widen the object-store boundary inside the ticket.
