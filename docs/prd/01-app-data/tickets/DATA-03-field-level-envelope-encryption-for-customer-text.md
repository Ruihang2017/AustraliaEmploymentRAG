---
id: DATA-03
title: Field-level envelope encryption for customer text
module: 01-app-data
lane: 01-app-data
size: M
agent: builder
status: draft
date: 2026-08-03
blocked_by: [DATA-01]
blocks: [DATA-04, DATA-08, EVID-09]
---

# DATA-03 — Field-level envelope encryption for customer text

Implements PRD §35.1, §10.3, §23.1 and §39.6 (`E04-APPDB`; underpins PII-001 retention behaviour
and SEC-001's data boundary). No ADR — the decision is already made in PRD §35.1 and §39.6; this is
build ticket 3 of 9 against it.
Parent sub-PRD: [01-app-data README](../README.md). Master spec: [PRD](../../../PRD.md).
Depends on: [DATA-01 — Migration framework, expand/contract policy, ordering](DATA-01-migration-framework-expand-contract-policy-ordering.md)
**Why `builder`:** a bounded change inside one module's declared file-scope against a fixed
contract (PRD §35.1's "envelope encryption" plus the §39.6 secret group) — not a new subsystem
decision.

## Background + basis

Half of the app database's customer-facing columns are named `*_ciphertext` in the PRD §35.5 data
dictionary — `content_ciphertext`, `short_answer_ciphertext`, `text_ciphertext`, `quote_ciphertext`,
`impact_if_false_ciphertext`, `stage_results_ciphertext`, `reason_ciphertext`, `body_ciphertext` —
and PRD §35.4 requires `sso_connection` to store "encrypted configuration". Those columns cannot be
authored by `DATA-04`, `DATA-06` and `DATA-07` until one codec exists.

**PRD §35.1**:

> Customer text columns are encrypted only where stated; whole S3 backups are encrypted and
> sensitive credentials also use application **envelope encryption**.

**PRD §39.6** names the key and the configuration discipline:

> Configuration layers are: committed safe defaults → environment-specific non-secret config →
> encrypted/sealed secret injection → internal feature flag. Production startup validates the
> complete schema and refuses unknown critical keys. Minimum secret groups are **database
> field-encryption key**, auth/session secret, S3 backup credential, S3 export credential, R2
> read/promotion credential, email credential, model-provider/platform keys, webhook encryption key
> and release-verification public key. Offline signing and destructive backup credentials are never
> present on the host.

**PRD §23.1** governs rotation and the backup relationship:

> S3 uses encryption at rest/TLS; sensitive secret fields also use application-level encryption.
> … Force a confirmed recovery point before migrations, auth/application changes, bulk customer
> operations and **key rotation**.

**PRD §10.3** is the retention rule this ticket must not quietly redefine:

> Deleted customer records: 30-day recoverable period, then primary deletion. Deleted data in
> backups: ages out within a further maximum of 30 days.

Crypto-shredding (discarding a key) is therefore **not** a substitute for deletion — deletion
remains a data operation owned by `DATA-06`/`DATA-07` repositories and `RLSE-*` lifecycle. Carried
forward as an accepted constraint, documented, not enforced here.

**PRD §22** bounds what may ever be logged:

> Logs MUST exclude research/evidence content, PII text, credentials, assertions and provider
> payloads.

**PRD §37.3** (content retention matrix) states where the plaintext is allowed to exist at all:
`SAVE` → "Encrypted app rows"; `EPHEMERAL` → "Encrypted ephemeral DB"; Logs/support → "No".

Sub-PRD decision **D7** fixes the shape: AEAD envelope encryption with the AAD bound to
`organization_id` + table + column + row id; no deterministic or searchable encryption.

## Goal

Produce `packages/database/src/crypto/**`: an envelope cipher with a versioned, self-describing
ciphertext envelope, a multi-version key registry (write with the active key, read with any
non-retired key), an AAD binding that makes a ciphertext unusable in any other row, tenant, table or
column, a rotation entry point that reuses `DATA-01`'s recovery-point precondition, fail-closed
startup when the key is absent or malformed, and a column codec that `DATA-04`, `DATA-06`, `DATA-07`
and `DATA-08` apply to their `*_ciphertext` columns without re-implementing anything. Completion is
mechanically checkable: round-trip, tamper-detection, cross-binding rejection, rotation, and a
canary test proving plaintext never appears in the SQLite file bytes or in a thrown error.

## Non-goals

- **No tables and no migrations.** `DATA-04`, `DATA-06`, `DATA-07` declare the `*_ciphertext`
  columns; this ticket ships the codec and the DDL fragment they call.
- **No key material in the repository.** Keys come from configuration (PRD §39.6). Test keys are
  generated in-test; no key, real or sample, is committed.
- **No secret provisioning, sealing or KMS integration.** `18-ops-release` (`RLSE-02` host baseline,
  `RLSE-05` backup) owns production secret injection; sub-PRD open question **M-Q2** — module-local,
  not a plan §8 decision-register entry — records that the KEK holder and rotation cadence are the
  Founder's.
- **No BYOK provider-credential handling.** `EVID-09` (`packages/model-gateway/src/byok/**`) is
  `blocked_by` this ticket and owns PRD §16.4 behaviour; here we supply only the cipher.
- **No backup encryption.** S3-side encryption is PRD §23.1 infrastructure, owned by `RLSE-04`/
  `RLSE-05`.
- **No PII detection.** `packages/pii` is `12-evidence-safety` (`EVID-01`…`EVID-03`). Encryption is
  not a PII control (PRD §10.1 puts the boundary before persistence).
- **No searchable/deterministic encryption.** Rejected in sub-PRD "Rejected alternatives": it leaks
  equality and no PRD requirement needs it.

## File-scope (write-owns)

- `packages/database/src/crypto/**`
- `packages/database/test/crypto/**` (this ticket's own test area, sub-PRD D8)
- `packages/database/package.json` — append-only (sub-PRD D9, plan §1.1)

- Does not touch: `src/migrate/**`, `migrations/0001_*` (`DATA-01`) · `src/tenant/**`,
  `test/architecture/**` (`DATA-02`) · `src/schema/*.ts`, `src/repos/**`, `migrations/*_<group>.sql`
  (`DATA-04`–`DATA-07`) · `src/ephemeral/**` (`DATA-08`) · `src/invariants/**` (`DATA-09`) ·
  `packages/jobs/**` (`DATA-05`) · `packages/model-gateway/**` (`EVID-07`–`EVID-09`) · `infra/**`
  (`18-ops-release`) · `tests/**` (`23-assurance`).

**Serial safety.** First decomposition — nothing merged, no in-flight contention, no prior toucher
of these paths. The sibling that runs concurrently with this ticket is `DATA-02` (wave 2,
`src/tenant/**` + `test/architecture/**`); the scopes are disjoint. `DATA-01` merges before this
starts. `packages/database/package.json` is append-only shared within the module (sub-PRD D9);
conflicts resolve by re-running pnpm (PRD §44.3). This ticket authors **no migration**, so plan A5's
timestamp-prefixed expand-only rule does not even come into play for it — the table groups that use
this codec (`DATA-04`, `DATA-06`, `DATA-07`) each own their own group-suffixed migration file and do
not serialise on each other.

## Deliverables

1. **Key registry.** `packages/database/src/crypto/keys.ts`:
   - `loadKeyRegistry(config)` reading the PRD §39.6 "database field-encryption key" secret group.
     Config shape: an ordered set of `{ keyId, material, state: 'ACTIVE' | 'RETIRING' | 'RETIRED' }`
     with exactly one `ACTIVE`.
   - Fail closed: absent group, no `ACTIVE` key, more than one `ACTIVE`, or material shorter than
     256 bits throws `FIELD_ENCRYPTION_KEY_INVALID` at load time — before any connection is opened
     (PRD §39.6 "Production startup validates the complete schema and refuses unknown critical
     keys").
   - `keyId` is an opaque short string recorded in every envelope; key material is never returned
     from any accessor, never included in `toString`/`toJSON`, and is zeroed where the runtime
     permits.
2. **Envelope format.** `packages/database/src/crypto/envelope.ts` — a self-describing binary
   encoding stored in the `*_ciphertext` column: `version (1 byte) ‖ keyId length ‖ keyId ‖ nonce ‖
   ciphertext‖tag`. `keyId` and `version` must be recoverable **without** the key (rotation tooling
   and `DATA-09` need this). Export `parseEnvelopeHeader(buf)` and `ENVELOPE_VERSION`.
3. **AEAD cipher.** `packages/database/src/crypto/cipher.ts` exporting
   `encryptField(plaintext, binding)` / `decryptField(envelope, binding)` where
   ```ts
   interface FieldBinding { organizationId: string | null; table: string; column: string; rowId: string }
   ```
   Algorithm: AES-256-GCM from Node's `crypto` (no third-party crypto dependency), a fresh
   cryptographically random 96-bit nonce per encryption, and the **AAD** deterministically derived
   from `envelopeVersion ‖ keyId ‖ organizationId ‖ table ‖ column ‖ rowId`. Consequence, and the
   point of the design: a ciphertext copied into another row, column, table or tenant fails to
   decrypt. `organizationId` is `null` only for globally-scoped rows and must then be encoded
   distinguishably from the empty string.
4. **Column codec.** `packages/database/src/crypto/codec.ts` exporting
   `encryptedTextCodec({ table, column })` producing `{ encode(ctx, rowId, value), decode(ctx, rowId, stored) }`
   for `DATA-04`/`DATA-06`/`DATA-07`/`DATA-08` repositories, and `encryptedColumnDdl(name)` returning
   the column DDL fragment consistent with `DATA-01`'s `conventions.ts` (a `BLOB` column; state the
   choice once here so four tickets agree). `decode` on a `RETIRED` key throws a distinguishable
   `FIELD_KEY_RETIRED` error, never a generic parse failure.
5. **Rotation entry point.** `packages/database/src/crypto/rotate.ts` exporting
   `rotateFieldKeys({ batchSize, recoveryPoint, scan })`:
   - refuses to start without a recovery point, reusing `DATA-01`'s `RecoveryPointProvider` seam —
     PRD §23.1 requires a forced recovery point before key rotation;
   - re-encrypts in bounded batches (PRD §20.4 "background backfills"), resumable, idempotent;
   - takes the set of encrypted columns from the glob-discovered `TableManifest`s
     (`TableSpec.encryptedColumns`, `DATA-01` deliverable 9) so it needs no hand-maintained list and
     no shared registration file;
   - reports per-column progress and never logs plaintext.
6. **Log/error safety.** `packages/database/src/crypto/redaction.ts`: every error thrown by this
   module carries `{ code, table, column, keyId }` and never plaintext, key material or the raw
   envelope. Provide `redactForLog(value)` used by the module's own errors (PRD §22).
7. **Documented non-capability.** A module-level doc comment stating: this codec provides
   confidentiality at rest inside `app.sqlite`/`ephemeral.sqlite` only; it is not a substitute for
   deletion (PRD §10.3), not a PII control (PRD §10.1), and provides no equality or range search
   over ciphertext (sub-PRD D7).

## Acceptance checklist (classified)

- [ ] `[machine]` Round-trip: `decryptField(encryptField(p, b), b) === p` for empty, ASCII,
      multi-byte UTF-8 and ~1 MiB inputs
- [ ] `[machine]` Tamper detection: flipping any byte of ciphertext, tag, nonce or header makes
      decryption throw; no partial plaintext is returned (AEAD, PRD §35.1 "envelope encryption")
- [ ] `[machine]` AAD binding: a valid envelope produced for `(orgA, table, column, row1)` fails to
      decrypt under a binding differing in **any** of organisation, table, column or row id
      (sub-PRD D7)
- [ ] `[machine]` Nonce hygiene: 10 000 encryptions of the same plaintext under the same key produce
      10 000 distinct nonces and 10 000 distinct ciphertexts (no deterministic encryption)
- [ ] `[machine]` Key registry fails closed on: absent secret group, zero `ACTIVE`, two `ACTIVE`, and
      material shorter than 256 bits — each with `FIELD_ENCRYPTION_KEY_INVALID` (PRD §39.6)
- [ ] `[machine]` Rotation: a value written under `k1` still decrypts after `k2` becomes `ACTIVE`;
      after `rotateFieldKeys` all scanned envelopes carry `k2`; a value still on a `RETIRED` key
      throws `FIELD_KEY_RETIRED` (PRD §23.1)
- [ ] `[machine]` `rotateFieldKeys` without a recovery-point provider throws before writing anything
      (PRD §23.1 "Force a confirmed recovery point before … key rotation")
- [ ] `[machine]` Rotation is resumable and idempotent: interrupting after N batches and re-running
      completes with no double-encryption and no skipped row
- [ ] `[machine]` `parseEnvelopeHeader` recovers `version` and `keyId` **without** any key present
- [ ] `[machine]` Canary: a distinctive plaintext written through the codec into a temp SQLite file
      does not appear in the raw file bytes (including the `-wal` file after a checkpoint)
      (PRD §37.3 "Encrypted app rows")
- [ ] `[machine]` Errors and `redactForLog` never contain plaintext, key material or the full
      envelope — asserted by searching the serialised error for the canary (PRD §22)
- [ ] `[machine]` `encryptedColumnDdl` output passes `DATA-01`'s `assertSchemaConventions` for a
      throwaway table (PRD §35.1)
- [ ] `[machine]` No third-party cryptography dependency is added — the implementation uses Node's
      built-in `crypto` (PRD §21.1 "Pinned dependencies/images, lockfiles, SBOM, scans")
- [ ] `[machine]` `pnpm test` green
- [ ] No `[fixture]` criteria — nothing recorded is replayed; the only fixtures are in-test generated
      keys
- [ ] No `[human]` criteria — production key custody and rotation cadence are sub-PRD open question
      **M-Q2**, owned by the Founder and provisioned by `RLSE-02`/`RLSE-05`; no PRD §41.2 `UAT-*`
      script covers this module directly
- [ ] No Rust or Python is touched, so `cargo test --workspace` and `uv run pytest` are not required
      (PRD §45.3)

## Test plan

Offline; no network, no real secrets.

1. `pnpm test` at the root; focused run with
   `pnpm --filter <the packages/database package name> test`.
2. Harness: `packages/database/test/crypto/helpers.ts` generates ephemeral 256-bit keys with
   `crypto.randomBytes` per test. **No key material is committed**, and no `.env` file is read.
3. Reuse `withTempDatabase` from `packages/database/test/migrate/helpers.ts` (`DATA-01`) for the
   canary test; create a throwaway table with `encryptedColumnDdl`, insert through the codec, run
   `PRAGMA wal_checkpoint(TRUNCATE)`, then read both the `.sqlite` and `-wal` files as buffers and
   assert the canary string is absent.
4. AAD matrix: parametrise over the four binding fields; for each, mutate exactly that field and
   assert decryption throws. Assert the thrown error's `code` is stable across cases so callers
   cannot distinguish *which* field was wrong.
5. Rotation: seed 250 rows across two throwaway tables described by hand-built `TableManifest`s,
   rotate with `batchSize: 32`, kill after the third batch (throw from the scan callback), re-run,
   and assert every envelope carries the new `keyId` exactly once.
6. Redaction: `JSON.stringify` every error thrown across the suite and assert the canary and the key
   material are absent.
7. Reviewer greps the diff for any committed key-like literal, any `console.log` of a plaintext
   variable, and any use of a non-AEAD mode (`aes-256-cbc`, `aes-256-ctr`) — all are BOUNCE
   conditions.

## Feedback obligation

1. **General rule.** If implementation falsifies this spec, update this ticket and
   `docs/prd/01-app-data/README.md` first (version +0.1 + changelog line), then change code, then
   re-publish with `publish-tickets.mjs --sync` (CLAUDE.md, issue #53).
2. **Foreseeable frictions, each with its writeback target:**
   - *A `*_ciphertext` column turns out to need equality lookup* (e.g. a repository wants to find a
     row by encrypted value) → do **not** introduce deterministic encryption locally. That reverses
     sub-PRD D7 and a "Rejected alternatives" row: update `docs/prd/01-app-data/README.md` (D7 +
     rejected-alternatives table) and add `docs/adr/NNNN-searchable-encryption.md` **before** any
     code, because the leak is cross-tenant.
   - *The AAD binding cannot include `rowId`* — e.g. the id is assigned by the database after insert
     → record the actual binding in `docs/prd/01-app-data/README.md` D7 and state the residual risk
     (ciphertext relocation within a tenant) explicitly; do not silently drop a binding component.
   - *Node's built-in AES-256-GCM is unusable in the pinned runtime* → adding a crypto dependency is
     an Architecture decision under PRD §45.5: write `docs/adr/NNNN-field-encryption-primitive.md`
     and note the new dependency's effect on the PRD §21.1 SBOM/scan gate before adding it.
   - *Rotation needs a schema column* (e.g. a per-row `key_id` column for efficient scanning) → that
     is a migration, and this ticket owns none. Raise it as an addition to the owning table-group
     ticket (`DATA-04`/`DATA-06`/`DATA-07`), record the edge in
     `docs/prd/01-app-data/README.md`, and take the `blocked_by` change through
     `docs/prd/breakdown-plan.md` §5.2/§6.2 — never write another ticket's migration file.
   - *Crypto-shredding is proposed as the deletion mechanism* → that changes a customer-facing
     retention promise (PRD §10.3) and is a **Product change** under PRD §45.5: founder approval and
     a PRD update, not a code change.
3. **Falsified decision.** If field-level envelope encryption proves incompatible with the confirmed
   access layer — Kysely-style repositories over `better-sqlite3`, plan §8 **Q13**, recorded in
   `DATA-01`'s ADR — that overturns a PRD-level statement (§35.1) *and* a confirmed architecture
   decision. Stop, escalate for re-review, and update `docs/prd/breakdown-plan.md` §8 Q13,
   `docs/adr/NNNN-sqlite-access-layer.md` and `docs/prd/01-app-data/README.md` (D7 and D11) before
   changing approach. Never fall back to storing customer text in plaintext "temporarily".
