/**
 * Shared plumbing for the tenancy repositories: the clock, the id shape, the constraint-error
 * classifier and the `row_version` compare-and-swap.
 *
 * All four are here rather than in each module because a second spelling of any of them is a
 * correctness bug rather than duplication: two clocks produce timestamps the CHECKs disagree about,
 * two classifiers disagree about which driver errors may be swallowed, and two CAS implementations
 * disagree about what a lost update looks like.
 */
import { randomUUID } from 'node:crypto';

import type { AppDatabaseHandle } from '../../../tenant/connection.js';
import type { TenantContext } from '../../../tenant/context.js';
import { ResourceNotFound } from '../../../tenant/errors.js';
import type { Tx } from '../../../tenant/tx-internal.js';

import { TenancyError } from '../errors.js';
import { runGlobalSelect, runGlobalUpdate, runScopedSelect, runScopedUpdate } from './statement.js';
import type { Row } from './statement.js';

/** Options every tenancy repository accepts, so tests control time and keys. */
export interface RepositoryOptions {
  /** Defaults to {@link nowIso}. */
  readonly now?: () => string;
}

/**
 * The ISO-UTC shape every timestamp CHECK in `*_tenancy.sql` accepts
 * (`YYYY-MM-DDTHH:MM:SS[.mmm]Z`, PRD §35.1).
 */
export function nowIso(): string {
  return new Date().toISOString();
}

export function resolveNow(options: RepositoryOptions | undefined): () => string {
  return options?.now ?? nowIso;
}

/** PRD §35.1 — "globally random primary ID". Opaque; nothing parses it. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

interface DriverError {
  code?: string;
  message?: string;
}

/**
 * `true` when `error` is SQLite's UNIQUE violation for `table.column`.
 *
 * Both halves are checked. Matching on the code alone would let *any* unique violation on the table
 * be reported as, say, a slug conflict — including the composite tenant-key violations this schema
 * depends on, which would then be silently mislabelled instead of surfacing. Anything that is not
 * this exact constraint is re-thrown unchanged by the callers.
 */
export function isUniqueViolation(error: unknown, table: string, column: string): boolean {
  const driver = error as DriverError;
  if (typeof driver?.code !== 'string' || !driver.code.startsWith('SQLITE_CONSTRAINT')) return false;
  return typeof driver.message === 'string' && driver.message.includes(`${table}.${column}`);
}

export interface CasSpec {
  readonly table: string;
  readonly id: string;
  readonly expectedRowVersion: number;
  readonly patch: Row;
  /** `'TENANT'` uses the scoped path; `'GLOBAL'` (user) uses the system path. */
  readonly scope: 'TENANT' | 'GLOBAL';
  readonly kind: string;
}

/**
 * `row_version` compare-and-swap — the documented write path for every mutable-metadata table in
 * this group (PRD §34.1 "Concurrency", §34.9).
 *
 * One statement:
 *
 *     SET <patch>, updated_at = ?, row_version = ?   -- expected + 1
 *     WHERE id = ? AND organization_id = ? AND row_version = ?
 *
 * `row_version = expected + 1` rather than `row_version + 1` so no raw SQL expression is needed —
 * the WHERE clause has already pinned the current value to `expected`, so the two are identical.
 *
 * `changes === 1` → the row is re-read and returned. `changes === 0` is ambiguous on its own, so it
 * is resolved by one scoped read: absent → `ResourceNotFound` (indistinguishable from another
 * tenant's id, PRD §16.5); present → `CONCURRENT_MODIFICATION`, which `RCRD-01`/`IDNT-*` map to 409.
 */
export function compareAndSwap(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  tx: Tx,
  now: string,
  spec: CasSpec,
): Row {
  if (!Number.isInteger(spec.expectedRowVersion) || spec.expectedRowVersion < 1) {
    throw new TenancyError(
      'INVALID_ARGUMENT',
      `${spec.table}: expectedRowVersion must be a positive integer`,
    );
  }
  const set: Row = {
    ...spec.patch,
    updated_at: now,
    row_version: spec.expectedRowVersion + 1,
  };
  const where = [
    { column: 'row_version', op: '=' as const, value: spec.expectedRowVersion },
  ];

  const changes =
    spec.scope === 'TENANT'
      ? runScopedUpdate(db, ctx, tx, {
          table: spec.table,
          id: spec.id,
          set,
          where: [{ column: 'id', op: '=', value: spec.id }, ...where],
        })
      : runGlobalUpdate(db, ctx, tx, { table: spec.table, id: spec.id, set, where });

  if (changes === 1) return requireRow(db, ctx, spec);
  const current = findRow(db, ctx, spec);
  if (current === undefined) throw new ResourceNotFound(spec.kind);
  throw new TenancyError(
    'CONCURRENT_MODIFICATION',
    `${spec.table}: the row changed since it was read (expected row_version ` +
      `${spec.expectedRowVersion}) (PRD §34.1)`,
    spec.table,
  );
}

function findRow(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  spec: Pick<CasSpec, 'table' | 'id' | 'scope'>,
): Row | undefined {
  const where = [{ column: 'id', op: '=' as const, value: spec.id }];
  const rows =
    spec.scope === 'TENANT'
      ? runScopedSelect(db, ctx, { table: spec.table, where, limit: 1 })
      : runGlobalSelect(db, ctx, { table: spec.table, where, limit: 1 });
  return rows[0];
}

function requireRow(db: AppDatabaseHandle, ctx: TenantContext, spec: CasSpec): Row {
  const row = findRow(db, ctx, spec);
  if (row === undefined) throw new ResourceNotFound(spec.kind);
  return row;
}
