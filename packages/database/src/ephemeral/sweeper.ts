/**
 * DATA-08 deliverable 6 — the two PRD §35.7 expiry rules as a pure, testable sweep.
 *
 * > A five-minute cleanup deletes content one hour after terminal state and all content at 24 hours
 * > from creation.
 *
 * `TERMINAL_RETENTION_MS` and `CREATION_CEILING_MS` are a **customer-facing retention promise**
 * (PRD §10.4). Changing either is a PRD §45.5 product change — founder approval and a PRD update —
 * never a code or config tweak.
 *
 * The sweep never reads or decrypts a payload: it is pure SQL over fixed-width UTC ISO timestamps,
 * which is what keeps the write lock short enough not to starve `apps/api`/`apps/worker`
 * (PRD §39.4, one SQLite writer). Do not replace it with a `SELECT` + per-row `UPDATE` loop.
 */
import { assertNoAttachedDatabases, internalSqlite, type EphemeralDatabaseHandle } from './connection.js';
import { EphemeralError } from './errors.js';
import { EPHEMERAL_TABLE_NAMES } from './schema.js';

/** PRD §35.7 — "one hour after terminal state". Product-fixed; see the file header. */
export const TERMINAL_RETENTION_MS = 60 * 60_000;

/** PRD §35.7 — "all content at 24 hours from creation". Product-fixed; see the file header. */
export const CREATION_CEILING_MS = 24 * 60 * 60_000;

/**
 * How long a **contentless** tombstone row survives after creation.
 *
 * This is the one number the PRD does not fix: §35.7 and §10.4 pin the 1 h/24 h *content* rules and
 * are silent on the marker, while §10.4's "after expiry return 410" requires *something* to remember
 * that the job existed. A tombstone holds no content and no identity beyond the two opaque
 * references PRD §35.7 already permits, so it does not weaken the promise. Configurable per call;
 * the durable answer is DATA-05's app-side job status.
 */
export const TOMBSTONE_RETENTION_MS = 7 * 24 * 60 * 60_000;

export interface SweepOptions {
  readonly tombstoneRetentionMs?: number | undefined;
}

export interface SweepTableReport {
  readonly table: string;
  /** Rows whose payload was nulled by this sweep. */
  readonly contentExpired: number;
  /** Contentless tombstone rows deleted by this sweep. */
  readonly tombstonesRemoved: number;
}

export interface SweepReport {
  readonly sweptAt: string;
  readonly tables: readonly SweepTableReport[];
}

export function assertValidDate(value: unknown, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: `${label} must be a valid Date` });
  }
  return value;
}

/**
 * The earlier of `createdAt + 24 h` and, when the job has reached a terminal state,
 * `terminalAt + 1 h`.
 *
 * Stored in `expires_at` as a **derived convenience only**. It is never the authority: `sweepExpired`
 * recomputes both rules from `created_at`/`terminal_at` and must be correct even when `expires_at`
 * was never written or holds a wrong value.
 */
export function computeExpiresAt(createdAt: Date, terminalAt: Date | null): string {
  assertValidDate(createdAt, 'createdAt');
  const ceiling = createdAt.getTime() + CREATION_CEILING_MS;
  if (terminalAt === null) return new Date(ceiling).toISOString();
  assertValidDate(terminalAt, 'terminalAt');
  return new Date(Math.min(ceiling, terminalAt.getTime() + TERMINAL_RETENTION_MS)).toISOString();
}

/** The two cutoffs both the sweep and the read path evaluate. */
export function expiryCutoffs(now: Date): { terminalCutoff: string; creationCutoff: string } {
  assertValidDate(now, 'now');
  return {
    terminalCutoff: new Date(now.getTime() - TERMINAL_RETENTION_MS).toISOString(),
    creationCutoff: new Date(now.getTime() - CREATION_CEILING_MS).toISOString(),
  };
}

/**
 * Read-time evaluation of the same two rules, over the stored timestamp strings.
 *
 * This is what makes the retention promise independent of sweeper timing: a row whose rule has fired
 * but which the five-minute sweep has not reached yet still reads as `EXPIRED` and is never
 * decrypted. Comparison is lexicographic because `Date#toISOString()` is fixed-width UTC, so string
 * order is chronological order.
 */
export function hasExpired(createdAt: string, terminalAt: string | null, now: Date): boolean {
  const { terminalCutoff, creationCutoff } = expiryCutoffs(now);
  if (terminalAt !== null && terminalAt !== undefined && terminalAt <= terminalCutoff) return true;
  return createdAt <= creationCutoff;
}

const CONTENT_EXPIRY_SQL = (table: string): string =>
  `UPDATE ${table} SET payload_ciphertext = NULL ` +
  `WHERE payload_ciphertext IS NOT NULL ` +
  `AND ((terminal_at IS NOT NULL AND terminal_at <= :terminalCutoff) OR created_at <= :creationCutoff)`;

// The tombstone carries NO content — only the two opaque references and the timestamps. Keeping a
// truncated preview or "the question, for support" here would put customer content past its expiry
// and violate PRD §10.4. The `payload_ciphertext IS NULL` predicate is also what makes a
// `putEphemeral` landing between the two statements safe: a freshly written row is never deleted.
const TOMBSTONE_SQL = (table: string): string =>
  `DELETE FROM ${table} WHERE payload_ciphertext IS NULL AND created_at <= :tombstoneCutoff`;

/**
 * Applies both expiry rules to every table and returns per-table counts.
 *
 * `expires_at` appears nowhere in the predicates — the derived column is not the authority.
 */
export function sweepExpired(
  handle: EphemeralDatabaseHandle,
  now: Date,
  options: SweepOptions = {},
): SweepReport {
  assertValidDate(now, 'now');
  const sqlite = internalSqlite(handle);
  assertNoAttachedDatabases(sqlite);

  const tombstoneRetentionMs = options.tombstoneRetentionMs ?? TOMBSTONE_RETENTION_MS;
  if (!Number.isFinite(tombstoneRetentionMs) || tombstoneRetentionMs < 0) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', {
      detail: 'tombstoneRetentionMs must be a non-negative finite number',
    });
  }

  const { terminalCutoff, creationCutoff } = expiryCutoffs(now);
  const tombstoneCutoff = new Date(now.getTime() - tombstoneRetentionMs).toISOString();

  const tables: SweepTableReport[] = [];
  for (const table of EPHEMERAL_TABLE_NAMES) {
    // One short transaction per table, never one spanning the whole run and never held across a
    // decrypt — the sweep races live writers by design (PRD §39.4).
    const runTable = sqlite.transaction((): SweepTableReport => {
      const contentExpired = handle.run(CONTENT_EXPIRY_SQL(table), {
        terminalCutoff,
        creationCutoff,
      }).changes;
      const tombstonesRemoved = handle.run(TOMBSTONE_SQL(table), { tombstoneCutoff }).changes;
      return { table, contentExpired, tombstonesRemoved };
    });
    tables.push(runTable());
  }

  return { sweptAt: now.toISOString(), tables };
}
