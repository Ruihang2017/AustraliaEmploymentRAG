/**
 * DATA-08 deliverables 3, 4 and 5 — the encrypted write and read paths.
 *
 * # Encryption and the distinct purpose binding (deliverable 3)
 *
 * Every payload goes through DATA-03's codec with the `FieldBinding`
 * `{ organizationId: <opaque organisation ref>, table, column: 'payload_ciphertext', rowId: job_id }`.
 * The **distinct purpose is carried by the table component of the AAD**: `ephemeral_job_content`,
 * `ephemeral_evidence` and `ephemeral_result` are names no `app.sqlite` table uses, so an app
 * ciphertext replayed into an ephemeral row fails AEAD verification with `FIELD_DECRYPT_FAILED`, and
 * vice versa. A future ticket that names an app table `ephemeral_*` would silently break this.
 *
 * # Ordering contract for callers (deliverable 4 — `ASK-01` reads this)
 *
 * `app.sqlite` and `ephemeral.sqlite` are separate files: they cannot participate in one transaction
 * and must never be `ATTACH`ed (PRD §10.4). Callers therefore **write the ephemeral content first
 * and only then commit the `app.sqlite` job row that references it** (PRD §18.5 step 2's "opaque
 * ephemeral-content reference"). An orphaned ephemeral row is harmless — the sweeper removes it;
 * a job row referencing missing content is a user-visible failure.
 *
 * # Evidence is one row per job
 *
 * All three tables are keyed by `job_id`, so the whole evidence set is a single opaque UTF-8 payload
 * that the caller serialises.
 *
 * The registry and the handle are bound by `createEphemeralStore` rather than passed per call: a
 * module-level mutable registry singleton would leak key material across tests and make the
 * fail-closed load order untestable.
 */
import { encryptedTextCodec } from '../crypto/codec.js';
import type { KeyRegistry } from '../crypto/keys.js';
import type { EphemeralDatabaseHandle } from './connection.js';
import { EphemeralError } from './errors.js';
import { EPHEMERAL_TABLES, isEphemeralKind, type EphemeralKind } from './schema.js';
import {
  assertValidDate,
  computeExpiresAt,
  hasExpired,
  sweepExpired,
  type SweepOptions,
  type SweepReport,
} from './sweeper.js';

export interface EphemeralStoreOptions {
  readonly handle: EphemeralDatabaseHandle;
  readonly registry: KeyRegistry;
}

export interface PutEphemeralInput {
  readonly jobId: string;
  readonly organizationRef: string;
  /** Opaque UTF-8. The caller serialises; this module never inspects it. */
  readonly payload: string;
  readonly createdAt: Date;
  readonly terminalAt?: Date | null | undefined;
}

export type GetEphemeralResult =
  | { readonly status: 'PRESENT'; readonly payload: string }
  | { readonly status: 'EXPIRED' }
  | { readonly status: 'ABSENT' };

export interface EphemeralStore {
  putEphemeral(kind: EphemeralKind, input: PutEphemeralInput): void;
  /** Records the terminal state expiry rule 1 keys on. Never touches the payload. */
  markTerminal(kind: EphemeralKind, jobId: string, terminalAt: Date): void;
  getEphemeral(kind: EphemeralKind, jobId: string, now: Date): GetEphemeralResult;
  sweepExpired(now: Date, options?: SweepOptions): SweepReport;
}

interface EphemeralRow {
  organization_ref: string;
  payload_ciphertext: Uint8Array | null;
  created_at: string;
  terminal_at: string | null;
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: `${label} must be a non-empty string` });
  }
  return value;
}

function tableFor(kind: EphemeralKind): string {
  if (!isEphemeralKind(kind)) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'unknown kind' });
  }
  return EPHEMERAL_TABLES[kind];
}

export function createEphemeralStore(options: EphemeralStoreOptions): EphemeralStore {
  const handle = options?.handle;
  const registry = options?.registry;
  if (handle === undefined || registry === undefined) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'handle and registry are required' });
  }

  const codecFor = (table: string): ReturnType<typeof encryptedTextCodec> =>
    encryptedTextCodec({ table, column: 'payload_ciphertext' });

  const readRow = (table: string, jobId: string): EphemeralRow | undefined =>
    handle.get<EphemeralRow>(
      `SELECT organization_ref, payload_ciphertext, created_at, terminal_at FROM ${table} WHERE job_id = :jobId`,
      { jobId },
    );

  return {
    putEphemeral(kind, input): void {
      const table = tableFor(kind);
      const jobId = assertNonEmptyString(input?.jobId, 'jobId');
      const organizationRef = assertNonEmptyString(input?.organizationRef, 'organizationRef');
      if (typeof input.payload !== 'string') {
        throw new EphemeralError('EPHEMERAL_INPUT_INVALID', {
          table,
          detail: 'payload must be a string',
        });
      }
      const createdAt = assertValidDate(input.createdAt, 'createdAt');
      const terminalAt =
        input.terminalAt === undefined || input.terminalAt === null
          ? null
          : assertValidDate(input.terminalAt, 'terminalAt');

      const ciphertext = codecFor(table).encode(
        { organizationId: organizationRef, registry },
        jobId,
        input.payload,
      );

      handle.run(
        `INSERT INTO ${table} (job_id, organization_ref, payload_ciphertext, created_at, terminal_at, expires_at) ` +
          `VALUES (:jobId, :organizationRef, :payload, :createdAt, :terminalAt, :expiresAt) ` +
          `ON CONFLICT(job_id) DO UPDATE SET organization_ref = excluded.organization_ref, ` +
          `payload_ciphertext = excluded.payload_ciphertext, created_at = excluded.created_at, ` +
          `terminal_at = excluded.terminal_at, expires_at = excluded.expires_at`,
        {
          jobId,
          organizationRef,
          payload: ciphertext,
          createdAt: createdAt.toISOString(),
          terminalAt: terminalAt === null ? null : terminalAt.toISOString(),
          expiresAt: computeExpiresAt(createdAt, terminalAt),
        },
      );
    },

    markTerminal(kind, jobId, terminalAt): void {
      const table = tableFor(kind);
      const id = assertNonEmptyString(jobId, 'jobId');
      const terminal = assertValidDate(terminalAt, 'terminalAt');
      const row = readRow(table, id);
      if (row === undefined) return;
      handle.run(
        `UPDATE ${table} SET terminal_at = :terminalAt, expires_at = :expiresAt WHERE job_id = :jobId`,
        {
          jobId: id,
          terminalAt: terminal.toISOString(),
          expiresAt: computeExpiresAt(new Date(row.created_at), terminal),
        },
      );
    },

    getEphemeral(kind, jobId, now): GetEphemeralResult {
      const table = tableFor(kind);
      const id = assertNonEmptyString(jobId, 'jobId');
      assertValidDate(now, 'now');
      const row = readRow(table, id);
      if (row === undefined) return { status: 'ABSENT' };
      // The tombstone: a row whose payload the sweeper has already nulled.
      if (row.payload_ciphertext === null) return { status: 'EXPIRED' };
      // Read-time expiry: a rule may have fired without the sweeper having run yet. Return EXPIRED
      // WITHOUT decrypting, so the retention promise never depends on sweeper timing.
      if (hasExpired(row.created_at, row.terminal_at, now)) return { status: 'EXPIRED' };
      const payload = codecFor(table).decode(
        { organizationId: row.organization_ref, registry },
        id,
        row.payload_ciphertext,
      );
      if (payload === null) return { status: 'EXPIRED' };
      return { status: 'PRESENT', payload };
    },

    sweepExpired(now, options): SweepReport {
      return options === undefined ? sweepExpired(handle, now) : sweepExpired(handle, now, options);
    },
  };
}
