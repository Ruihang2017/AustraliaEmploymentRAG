/**
 * DATA-08 deliverable 2 — the self-bootstrapping schema of `ephemeral.sqlite`.
 *
 * Sub-PRD D6: this database bootstraps its own schema and is **not** part of the app migration
 * sequence — there is no ledger, no migration history and no file under
 * `packages/database/migrations/`. It is disposable: PRD §35.7's 24-hour ceiling deletes everything
 * anyway and PRD §10.4 says it is "not recoverable after expiry or server loss".
 *
 * PRD §35.7 fixes the contents exactly: three tables keyed by job id, "no identity beyond an opaque
 * job/organisation reference". Every column below is either the key, the opaque organisation
 * reference, the encrypted payload, or a timestamp. Adding a user id, email, actor id, IP, record id
 * or session id here would break that promise and is asserted against in
 * `test/ephemeral/schema.test.ts`.
 */
import { idColumn, timestampColumn, UTC_TIMESTAMP_GLOB } from '../migrate/conventions.js';
import { encryptedColumnDdl } from '../crypto/codec.js';
import type { EphemeralDatabaseHandle } from './connection.js';
import { EphemeralError } from './errors.js';

/**
 * The three PRD §35.7 content kinds.
 *
 * `EVIDENCE` is **one row per job, not one row per excerpt**: all three tables are keyed by
 * `job_id`, so the whole evidence set is a single opaque UTF-8 payload that the *caller* serialises
 * (see `store.ts`). That is a caller-visible contract for `ASK-01`.
 */
export type EphemeralKind = 'JOB_CONTENT' | 'EVIDENCE' | 'RESULT';

export const EPHEMERAL_TABLES: Readonly<Record<EphemeralKind, string>> = Object.freeze({
  JOB_CONTENT: 'ephemeral_job_content',
  EVIDENCE: 'ephemeral_evidence',
  RESULT: 'ephemeral_result',
});

/** Sorted, for tests and per-table report ordering. */
export const EPHEMERAL_TABLE_NAMES: readonly string[] = Object.freeze(
  Object.values(EPHEMERAL_TABLES).slice().sort(),
);

/** The literal column set every one of the three tables has. Sorted. */
export const EPHEMERAL_COLUMNS: readonly string[] = Object.freeze([
  'created_at',
  'expires_at',
  'job_id',
  'organization_ref',
  'payload_ciphertext',
  'terminal_at',
]);

export const EPHEMERAL_KINDS: readonly EphemeralKind[] = Object.freeze([
  'JOB_CONTENT',
  'EVIDENCE',
  'RESULT',
]);

export function isEphemeralKind(value: unknown): value is EphemeralKind {
  return typeof value === 'string' && (EPHEMERAL_KINDS as readonly string[]).includes(value);
}

/** Resolves a kind to its table name, or throws `EPHEMERAL_INPUT_INVALID`. */
export function tableForKind(kind: EphemeralKind): string {
  if (!isEphemeralKind(kind)) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'unknown kind' });
  }
  return EPHEMERAL_TABLES[kind];
}

/**
 * `timestampColumn` is `NOT NULL` by construction, and `terminal_at`/`expires_at` are nullable.
 * Written here rather than in `src/migrate/conventions.ts`, which is DATA-01's file-scope.
 */
function nullableTimestampColumn(name: string): string {
  return `${name} TEXT CHECK (${name} IS NULL OR ${name} GLOB '${UTC_TIMESTAMP_GLOB}')`;
}

function createTableSql(table: string): string {
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    [
      // one row per (kind, job)
      idColumn('job_id'),
      // opaque; never a joinable foreign key to an app-database organisation row
      idColumn('organization_ref', { primaryKey: false }),
      // nullable on purpose: NULL is the tombstone left behind by the sweeper (see sweeper.ts)
      encryptedColumnDdl('payload_ciphertext'),
      timestampColumn('created_at'),
      nullableTimestampColumn('terminal_at'),
      // derived convenience only — never the authority for expiry (sweeper.ts rule 6)
      nullableTimestampColumn('expires_at'),
    ].join(', '),
    ')',
  ].join('');
}

/**
 * Creates the three tables if they are absent. Idempotent; safe to call on every open.
 *
 * Timestamps are `Date#toISOString()` TEXT (fixed-width `YYYY-MM-DDTHH:MM:SS.mmmZ`, PRD §35.1), so
 * SQLite's lexicographic `<=` on TEXT is chronological — which is what makes the sweep a plain
 * comparison over an index rather than a per-row decode.
 */
export function ensureEphemeralSchema(handle: EphemeralDatabaseHandle): void {
  for (const table of EPHEMERAL_TABLE_NAMES) {
    handle.run(createTableSql(table));
    handle.run(`CREATE INDEX IF NOT EXISTS ${table}_created_at_idx ON ${table} (created_at)`);
  }
}
