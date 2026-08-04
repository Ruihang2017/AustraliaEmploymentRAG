---
id: INGF-03
title: Immutable artifact store with hashing and R2 keys
module: 05-ingestion-framework
lane: 05-ingestion-framework
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [INGF-02]
blocks: [INGF-04, INGF-05]
---

# INGF-03 — Immutable artifact store with hashing and R2 keys

Implements PRD §35.3 (`source_artifact`, `licence_snapshot`), PRD §19.2 (object-store boundary) and
PRD §10.3 (durable retention) — no ADR — the decision is already made in PRD §35.3 and §19.2; this
is build ticket 3 of 9 against it.
Parent sub-PRD: [05-ingestion-framework README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [INGF-02 — Safe fetcher](INGF-02-safe-fetcher-allowlist-dns-ip-denial-redirect-type-size-time.md)
**Why `builder`:** a bounded implementation of one port declared in `INGF-01`, against a table whose
columns and constraints PRD §35.3 already fixes — not a new subsystem decision.

## Background + basis

**PRD §35.3 fixes the record.** `source_artifact` requires: `id`, `source_id`, `official_url`,
`retrieved_at`, `http_status`, `etag`, `last_modified`, `content_type`, `byte_length`, `sha256`,
**nullable** `r2_key`, `licence_snapshot_id`; constraints: *"immutable metadata; object key absent
when storage is not permitted; no customer data"*.

**PRD §40.7** assigns "hashing, artifact persistence" to the shared framework, and **PRD §40.9**
places `F[Fetch + hash immutable artifact]` immediately after discovery and immediately before the
licence gate — so the artifact exists (and is hashed) before any permitted-use decision is taken.

**PRD §19.2 fixes the boundary:**

> "Cloudflare R2 stores only public/rebuildable legal artifacts, normalised text, candidate/archived
> corpus releases and indexes. It MUST NOT contain customer identities, Research Records, answers,
> exports or backups."

and gives the reason: "R2 is cost-effective for public corpus/egress but its Oceania placement hint
is not an Australian residency guarantee." The private half of the split (`backups/`, `exports/` in
AWS S3 Sydney) belongs to `18-ops-release` / `RLSE-04` and is **not** touched here.

**PRD §10.3**: "Public legal sources and non-customer evaluation data: may be retained long term."
There is therefore no deletion/expiry path for source artifacts in the MVP.

**PRD §37.3** content-retention matrix, row "Public source artifact": `SAVE` → "Corpus/R2",
`EPHEMERAL` → "Same public corpus", Logs/support → "Source diagnostics only", Backup →
"Rebuildable, not customer backup".

**PRD §19.3** puts the fetch/parse pipeline on the local workstation: "The local pipeline performs
source-adapter development, full fetch/parse, OCR orchestration, normalisation, embedding, index
build, 600-case evaluation, release signing and candidate upload." So a local filesystem backend is
the primary path and R2 is the publish target — not the other way round.

**Reproducibility is the point.** Plan §5.6 states this ticket's goal as *"Every fetch is
reproducible from a hashed artifact."* PRD §40.8 item 5 requires "parser/node hierarchy and exact-text
round-trip tests" and item 7 requires incremental replay tests; both are only possible if parsing can
re-read the exact bytes without re-fetching.

**Carried caveat.** `INGF-04` decides *whether* storage is permitted; this ticket only accepts the
decision as a parameter (`storage_permitted`), because plan §6.2 orders `INGF-03` before `INGF-04`.
The wiring of the real decision happens in `INGF-04`.

## Goal

Implement the `ArtifactStore` port declared by `INGF-01` under
`pipelines/ingestion/src/<root>/artifacts/**`: a content-addressed, write-once store with a pinned
object-key convention, a local filesystem backend (default) and an S3-API/R2 backend, that records
exactly the PRD §35.3 `source_artifact` metadata for every fetch, verifies the fetcher's SHA-256
before accepting bytes, omits the object key when storage is not permitted, and can replay any stored
artifact's exact bytes offline — proven by tests that run with no network and no cloud credentials.

## Non-goals

- **No licence decision.** `INGF-04` computes `storage_permitted` and `licence_snapshot_id`; this
  ticket takes them as arguments (PRD §40.9 order).
- **No corpus tables and no corpus write path.** `corpus.sqlite` is `CRPS-01`'s and is production
  read-only (PRD §18.3). This ticket writes the artifact index into the module's own working store
  (`ingestion.sqlite`, sub-PRD D6) — whose schema and lifecycle are `INGF-05`'s; until `INGF-05`
  lands, this ticket persists its index through the `ArtifactIndex` protocol it declares, with a
  JSONL/SQLite-file implementation of its own under `src/<root>/artifacts/`.
- **No AWS S3 `backups/` or `exports/` prefixes, credentials or lifecycle** — `18-ops-release` /
  `RLSE-04`. PRD §19.2 requires separate least-privilege permissions per prefix and gives one owner
  both.
- **No release bundle upload** — `CRPS-07` (`pipelines/corpus-builder/src/publish/**`) owns staging
  upload of candidate releases to R2.
- **No deletion, expiry or GC of stored artifacts** — PRD §10.3 permits long-term retention of public
  legal sources; a pruning tool is out of scope and must not be added as a side effect.
- **No customer data, ever.** PRD §19.2 and §35.3 forbid it; enforced by a type-level test, not by
  convention.
- **No parsing or decompression of artifact content** — `INGF-06`.

## File-scope (write-owns)

- `pipelines/ingestion/src/<root>/artifacts/**` (plan §5.6 `src/artifacts/**`).
- `pipelines/ingestion/tests/artifacts/**`.
- `pipelines/ingestion/pyproject.toml` — **append-only** (S3 client + in-memory S3 stub test
  dependency); conflicts resolve by re-running `uv lock` (plan §1.1).
- Does not touch: `pipelines/ingestion/src/<root>/fetch/**` — `INGF-02` (consume `FetchResult`,
  do not modify it).
- Does not touch: `pipelines/ingestion/src/<root>/{adapter,licensing,quarantine,runs,parsing,registry,discovery,conformance}/**`
  — `INGF-01`, `INGF-04`…`INGF-09`.
- Does not touch: `pipelines/corpus-builder/**` — `04-corpus-contract`.
- Does not touch: `infra/aws/**`, `infra/cloudflare/**` — `18-ops-release` (`RLSE-03`, `RLSE-04`).
- Does not touch: `pipelines/adapters/**` — modules `06`–`10`.

**Serial safety.** First decomposition; nothing merged, nothing in flight. `INGF-01` and `INGF-02`
have landed and own `src/<root>/adapter/**` and `src/<root>/fetch/**`. The only ticket that can be
concurrent with this one is **`INGF-06`** (both are `blocked_by INGF-02` and neither blocks the
other): `INGF-06` owns `src/<root>/parsing/**` and `tests/parsing/**`, disjoint from this ticket's
`artifacts/` directories. The one shared path is `pyproject.toml`, append-only by plan §1.1.

## Deliverables

1. **`<root>.artifacts.keys` — the object-key convention (binding).**
   `artifact_key(group_id: str, sha256: str, content_type: str) -> str` returning exactly:

   ```text
   sources/{group_id_lower}/{sha256[0:2]}/{sha256[2:4]}/{sha256}{ext}
   ```

   where `group_id_lower` is the lowercase group id (= the adapter directory name), the two
   two-character fan-out segments prevent a single flat prefix, and `ext` comes from a **committed,
   closed** content-type → extension table (`.html`, `.xml`, `.json`, `.pdf`, `.txt`, `.zip`,
   `.csv`, `.rtf`, `.doc`, `.docx`, and `""` for anything unmapped). The key is a pure function of
   its inputs — a test asserts determinism and that the same bytes from two groups produce two keys
   (provenance is per-source, PRD §35.3 `source_artifact.source_id`).

2. **`<root>.artifacts.store` — the `ArtifactStore` implementation.**
   `put(result: FetchResult, *, source_id: str, licence_snapshot_id: str | None,
   storage_permitted: bool) -> ArtifactRef`:
   1. re-hash the streamed body from `result.body_path` and compare with `result.sha256`; a mismatch
      raises `ArtifactHashMismatch` carrying the failure code `ARTIFACT_HASH_MISMATCH` — the bytes are
      **not** stored;
   2. compute `byte_length` independently and compare with `result.byte_length`;
   3. when `storage_permitted` is `False`: record the metadata row with `storage_key = None`, keep the
      bytes only in the per-run temp directory, and register the ref as `transient` so the run
      teardown deletes it (PRD §35.3 "object key absent when storage is not permitted");
   4. when `storage_permitted` is `True`: write the object at `artifact_key(...)` **write-once** — if
      the key already exists, verify the stored object's SHA-256 equals the new one and return the
      existing `ArtifactRef` (dedupe); if it differs, raise `ArtifactKeyConflict`
      (`ARTIFACT_KEY_CONFLICT`) and store nothing;
   5. record the metadata row (deliverable 4) and return `ArtifactRef` as declared by `INGF-01`.

   `open(ref) -> BinaryIO` and `replay(artifact_id) -> BinaryIO` return the exact stored bytes;
   `replay` additionally re-verifies the SHA-256 on read and raises `ArtifactCorrupt`
   (`ARTIFACT_CORRUPT`) on mismatch. Nothing in the module offers an update or delete method — a test
   asserts the public surface contains no `update`/`delete`/`overwrite` symbol (PRD §35.3
   "immutable metadata").

3. **Two backends behind one `ObjectBackend` protocol** (`put_object`, `get_object`, `head_object`):
   - `LocalObjectBackend(root: Path)` — the default and the only one used in tests and on the
     workstation (PRD §19.3). Writes via a temp file + atomic rename so a partial write is never
     visible; sets the file read-only after write.
   - `S3ObjectBackend(client, bucket, prefix)` — S3-API compatible, used for Cloudflare R2. Uses
     conditional put (`If-None-Match: *`) where the endpoint supports it, else `head_object` before
     `put_object`. Credentials come only from the configuration layer; **no credential is read at
     import time** and none is logged (PRD §39.6, §20.2 "Coding agents MUST NOT receive production …
     credentials by default").

4. **`<root>.artifacts.index` — the metadata record.** A frozen `SourceArtifactRecordDraft`
   populated with exactly the PRD §35.3 columns: `id` (opaque, generated), `source_id`,
   `official_url`, `retrieved_at`, `http_status`, `etag`, `last_modified`, `content_type`,
   `byte_length`, `sha256`, `r2_key` (nullable — the `artifact_key` value, or `None`),
   `licence_snapshot_id`. Emitted as an `IntermediateRecordEnvelope` with
   `record_type=SOURCE_ARTIFACT` through `INGF-01`'s `RecordSink` — never written to a corpus table
   (PRD §40.7). Also declare the `ArtifactIndex` protocol
   (`record(draft) -> None`, `find_by_sha256(...)`, `find_by_descriptor_key(...)`) plus a
   file-backed implementation for use until `INGF-05`'s working store exists; `INGF-05` supplies the
   `ingestion.sqlite` implementation of the same protocol.

5. **`<root>.artifacts.paths` — per-run temp isolation.** `run_temp_dir(run_id) -> Path` creating an
   isolated directory with `0o700`, cleaned unconditionally at run teardown (context manager), and
   never nested under a path that PRD §39.3 assigns to app data. Default roots come from
   configuration with workstation-local defaults; the production path question is sub-PRD open
   question **M1** (owner `RLSE-02`) and must not be hard-coded to `/srv/aer/...` here.

6. **Failure codes** registered with `register_failure_codes("artifacts", …)`, each with an operator
   action: `ARTIFACT_HASH_MISMATCH`, `ARTIFACT_KEY_CONFLICT`, `ARTIFACT_CORRUPT`,
   `ARTIFACT_STORAGE_UNAVAILABLE`, `ARTIFACT_STORAGE_NOT_PERMITTED` (informational, used when a
   downstream stage asks for bytes that were never stored).

7. **No-customer-data guard.** A test asserts that no public function in this area accepts or returns
   a type whose module path is under `packages/database`, `packages/auth` or any tenant/customer
   package, and that the module never imports one (extends `INGF-01`'s scanner). PRD §19.2, §35.3
   "no customer data"; PRD §39.1 "Python pipeline code never imports tenant/customer packages".

8. **Reproducibility CLI.** `python -m <root>.artifacts replay <artifact-id> [--out FILE]` writes the
   exact bytes and prints the verified SHA-256 — the operator recovery path referenced by quarantine
   actions (`INGF-05`) and the mechanism the conformance kit uses for offline replay (`INGF-09`).

## Acceptance checklist (classified)

- [ ] `[machine]` `artifact_key()` is deterministic, produces the exact documented shape, applies the
      closed extension table, and yields different keys for the same bytes under different
      `group_id`s (deliverable 1).
- [ ] `[machine]` `put()` with a body whose real SHA-256 differs from `FetchResult.sha256` raises
      `ArtifactHashMismatch` and stores **nothing** (asserted on the backend) (PRD §40.9 "Fetch + hash
      immutable artifact").
- [ ] `[machine]` `put()` with `storage_permitted=False` records the metadata row with
      `r2_key is None`, writes no object to the backend, and the temp bytes are gone after run
      teardown (PRD §35.3 "object key absent when storage is not permitted").
- [ ] `[machine]` Write-once: a second `put()` of identical bytes returns the existing ref and issues
      no second object write; a `put()` whose key exists with different bytes raises
      `ArtifactKeyConflict` and does not overwrite (PRD §35.3 "immutable metadata").
- [ ] `[machine]` The public surface of `<root>.artifacts` exposes no `update`, `delete` or
      `overwrite` symbol (PRD §35.3, §10.3).
- [ ] `[machine]` `replay(artifact_id)` returns byte-identical content for a stored artifact and
      raises `ArtifactCorrupt` when the stored object is mutated behind the store's back
      (plan §5.6 goal: "Every fetch is reproducible from a hashed artifact").
- [ ] `[machine]` The emitted `SOURCE_ARTIFACT` envelope contains exactly the PRD §35.3 columns —
      asserted against an explicit column list in the test, so a missing or extra field fails
      (PRD §35.3).
- [ ] `[machine]` `LocalObjectBackend` never leaves a partially written object visible: a simulated
      failure mid-write leaves no file at the final path (atomic rename) (PRD §18.4 immutability
      principle applied to artifacts).
- [ ] `[fixture]` `S3ObjectBackend` is exercised end-to-end against an **in-process S3 stub** with
      recorded request/response pairs: conditional put, existing-key head, and an unavailable-endpoint
      path mapping to `ARTIFACT_STORAGE_UNAVAILABLE`. No network and no credentials are used
      (PRD §20.2, §20.3).
- [ ] `[machine]` No module in `src/<root>/artifacts/**` imports a tenant/customer package, and no
      public signature references one (PRD §19.2, §35.3, §39.1; deliverable 7).
- [ ] `[machine]` No credential value appears in any log record emitted by this area; the log fields
      are exactly the bounded set (`group_id`, `artifact_id`, `sha256`, `byte_length`,
      `storage_key_present`, `failure_code`) (PRD §22).
- [ ] `[machine]` Every failure code in deliverable 6 is registered with a non-empty operator action
      (ADM-001, PRD §40.8 item 10).
- [ ] `[machine]` `uv run pytest` green.
- [ ] `[machine]` `pnpm test` green (unchanged — no TypeScript in this ticket).
- [ ] `[human]` PR body states the PRD §45.4 items: requirement IDs (**ADM-001** provenance
      groundwork; supports **SEC-002**'s "no customer data on the source path"); UAT IDs — none
      (`UAT-OPS-01` is `RLSE-07`/`CRPS-06`'s); schema/API/event compatibility (fixes the R2 key
      convention — changing it after adapters land invalidates stored keys); tenant/PII/security
      impact (public source bytes only; R2 must never receive customer data, PRD §19.2);
      source/licence impact (`storage_permitted` is honoured but decided by `INGF-04`); cost/memory
      impact (streaming writes, no full buffering — state the measured peak); rollback path; known
      gaps (sub-PRD M1).
- **No `[human]` acceptance criteria beyond the PR contract** — the storage boundary is mechanically
  testable and PRD §41.2 has no `UAT-*` row for artifact storage. Declared absent deliberately.

## Test plan

Harness: `uv run pytest pipelines/ingestion/tests/artifacts -q`, fully offline. Copy the fixture
patterns from `INGF-02`'s `tests/fetch/conftest.py` (fake clock, temp roots) and `INGF-01`'s
`tests/adapter/test_architecture.py` (AST scan).

1. `uv sync --frozen && uv run pytest pipelines/ingestion/tests/artifacts -q`.
2. **`test_keys.py`** — determinism, shape, extension table (including the unmapped case), per-group
   separation.
3. **`test_store_put.py`** — the five `put()` mechanics of deliverable 2 as a table: hash mismatch;
   length mismatch; storage-not-permitted; dedupe on identical bytes; key conflict on different
   bytes. Each asserts backend side effects, not just the return value.
4. **`test_immutability.py`** — public-surface symbol scan; atomic-rename failure injection;
   read-only mode on the stored file.
5. **`test_replay.py`** — round-trip byte equality for html/xml/json/pdf/zip fixtures under
   `tests/artifacts/fixtures/`; corruption detection by mutating the stored object directly.
6. **`test_record.py`** — envelope column list asserted against the literal PRD §35.3 list held in
   the test file, so drift in either direction fails.
7. **`test_s3_backend.py`** `[fixture]` — in-process S3 stub; conditional put, head, and failure
   mapping.
8. **`test_no_customer_data.py`** — import scan + signature scan.
9. `uv run pytest` (whole repo) and `pnpm test` — green.

Reviewer focus: that a hash mismatch aborts **before** any object write; that `storage_permitted=False`
leaves no durable trace of the bytes; that dedupe cannot be tricked into returning a ref for different
content; and that no S3/R2 credential is read at import time or written to a log.

## Feedback obligation

**General rule.** If implementation falsifies this ticket, update **this ticket** first (docs PR/MR,
sub-PRD changelog line, then `publish-tickets.mjs --sync`), then change code.

**Foreseeable frictions and their exact writeback targets:**

1. **`CRPS-01` already publishes a `source_artifact` record type with a different field set** →
   import and use it (plan §2.1 **A4**, sub-PRD **D8**); do not define a parallel draft type. Update
   this ticket's deliverable 4 and `docs/prd/05-ingestion-framework/README.md` D8 in the same PR.
2. **The R2/S3 endpoint does not support conditional put (`If-None-Match: *`)** → keep write-once
   semantics via `head_object` + a documented race window, record the residual risk in
   `docs/prd/05-ingestion-framework/README.md` (decision D-note under D6's neighbourhood) **before**
   changing `src/<root>/artifacts/store.py`. Do not silently downgrade to last-write-wins: PRD §35.3
   requires immutability.
3. **The artifact index genuinely needs `ingestion.sqlite` before `INGF-05` lands** → do **not**
   create the working-store schema here. Either keep the file-backed implementation declared in
   deliverable 4, or, if that is untenable, the writeback is a plan change (`INGF-03` `blocked_by`
   `INGF-05`) recorded in `docs/prd/breakdown-plan.md` §5.6/§6.2 and escalated — note it would make
   the module more serial, so prefer the file-backed implementation.
4. **The production filesystem layout for artifacts and `ingestion.sqlite` is undecided** (sub-PRD
   **M1**; PRD §39.3 has no row) → take the path from configuration and default to a workstation-local
   directory. Record the requirement in `docs/prd/05-ingestion-framework/README.md` M1 so `RLSE-02`
   picks it up. Never hard-code `/srv/aer/...` here.
5. **A source's licence forbids storing bytes at all, but a later stage needs them** → that is
   working as designed (PRD §11.1 "Unclear rights default to metadata, limited quotation and official
   links"). The downstream stage must degrade, not re-fetch and store. If a stage cannot degrade,
   raise it against `INGF-04` and the affected group's registry status (`INGF-07`) — never add a
   storage bypass.

**Escalation rule.** If write-once immutability, the no-customer-data boundary (PRD §19.2), or the
"object key absent when storage is not permitted" rule (PRD §35.3) cannot be honoured, that overturns
a stated PRD constraint and a data-residency decision. Stop and escalate for re-review; never relax
one of them inside this ticket.
