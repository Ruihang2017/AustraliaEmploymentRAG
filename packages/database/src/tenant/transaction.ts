/**
 * DATA-02 deliverable 6 — `withTenantTransaction`.
 *
 * PRD §34.3 requires that "creating a record and admitting the job occur in the same transaction"
 * (PRD §18.5 steps 2 and 6 say the same from the worker's side). That is only expressible if two
 * different repositories can be handed one transaction, which is what the opaque `Tx` handle is for.
 *
 * # The callback is synchronous, and that is load-bearing
 *
 * `better-sqlite3` is synchronous, and there is exactly one connection. An `await` inside a
 * transaction returns control to the event loop with `BEGIN` still open, so unrelated work can run
 * statements on the same connection and end up inside — or worse, commit — someone else's
 * transaction. `fn` therefore returns `T`, not `Promise<T>`, and a thenable return value is rejected
 * explicitly rather than silently producing that race.
 *
 * # Signature note (deviation, disclosed)
 *
 * The ticket writes this as `withTenantTransaction(ctx, fn)`. It takes the `AppDatabaseHandle` as a
 * first argument instead. There is no ambient connection to find one from — deliberately, per
 * deliverable 1, which makes the connection package-private and *not* a module-level singleton — so a
 * two-argument form would have to reintroduce exactly the global handle the ticket exists to abolish.
 * The handle is unreachable outside this package, so this adds no surface.
 */
import { APP_SQLITE_BUSY_TIMEOUT_MS } from '../migrate/pragmas.js';
import type { AppDatabaseHandle } from './connection.js';
import { assertTenantContext, isSystemContext } from './context.js';
import type { TenantContext } from './context.js';
import { TenantAccessError } from './errors.js';
import { listPreCommitInvariants } from './invariants.js';
import { createTx, resolveTx } from './tx-internal.js';
import type { InternalTx, Tx } from './tx-internal.js';

/** The transaction currently open on a given connection, if any. */
const openTransactions = new WeakMap<AppDatabaseHandle, InternalTx>();

const BEGIN_RETRY_DELAY_MS = 25;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBusy(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('SQLITE_BUSY');
}

function isThenable(value: unknown): boolean {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * `BEGIN IMMEDIATE`, retried while another *process* holds the write lock.
 *
 * `IMMEDIATE` rather than the default deferred begin: a deferred transaction takes the write lock at
 * its first write, so two transactions that both read then write deadlock, and SQLite resolves that
 * by failing one of them at an arbitrary point mid-body. Taking the lock up front turns the conflict
 * into a wait at a single, well-defined place.
 *
 * `busy_timeout` already makes SQLite wait internally; this loop is what turns the eventual
 * `SQLITE_BUSY` into a typed `TX_CONFLICT` instead of leaking a driver error code to callers.
 */
function beginImmediate(db: AppDatabaseHandle): void {
  const deadline = Date.now() + APP_SQLITE_BUSY_TIMEOUT_MS;
  for (;;) {
    try {
      db.sqlite.prepare('BEGIN IMMEDIATE').run();
      return;
    } catch (error) {
      if (!isBusy(error)) throw error;
      if (Date.now() >= deadline) {
        throw new TenantAccessError(
          'TX_CONFLICT',
          `another writer held the database for longer than APP_SQLITE_BUSY_TIMEOUT_MS ` +
            `(${APP_SQLITE_BUSY_TIMEOUT_MS}ms)`,
        );
      }
      sleepSync(BEGIN_RETRY_DELAY_MS);
    }
  }
}

function runPreCommitInvariants(tx: Tx, internal: InternalTx): void {
  for (const invariant of listPreCommitInvariants()) {
    invariant.check(tx, internal.ctx, Object.freeze([...internal.changeSet]));
  }
}

/**
 * Runs `fn` inside one tenant transaction and returns its result.
 *
 * A nested call on the same connection joins the outer transaction through a `SAVEPOINT`, so an inner
 * failure rolls back only the inner work (`ROLLBACK TO`) and the outer transaction survives. The
 * pre-commit invariants run once, at the outermost level, against the whole change set — an inner
 * savepoint has not committed anything yet, so checking there would judge an incomplete picture.
 */
export function withTenantTransaction<T>(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  fn: (tx: Tx) => T,
): T {
  assertTenantContext(ctx);
  if (isSystemContext(ctx)) {
    // A system context has no organisation, so "one organisation per transaction" is unenforceable
    // for it and every write inside would be unscoped. GLOBAL tables are written outside this helper.
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'systemContext() cannot open a tenant transaction; GLOBAL tables are not tenant-scoped',
    );
  }
  if (typeof fn !== 'function') {
    throw new TenantAccessError('INVALID_SPEC', 'withTenantTransaction() needs a callback');
  }

  const outer = openTransactions.get(db);
  return outer === undefined ? runOutermost(db, ctx, fn) : runNested(outer, ctx, fn);
}

function runOutermost<T>(db: AppDatabaseHandle, ctx: TenantContext, fn: (tx: Tx) => T): T {
  const { tx, internal } = createTx(db, ctx);
  beginImmediate(db);
  openTransactions.set(db, internal);

  let result: T;
  try {
    result = fn(tx);
    if (isThenable(result)) {
      throw new TenantAccessError(
        'INVALID_SPEC',
        'withTenantTransaction() callbacks must be synchronous: better-sqlite3 is synchronous and ' +
          'an await inside an open transaction lets unrelated work run on the same connection',
      );
    }
    runPreCommitInvariants(tx, internal);
    db.sqlite.prepare('COMMIT').run();
  } catch (error) {
    try {
      db.sqlite.prepare('ROLLBACK').run();
    } catch {
      // Already rolled back (e.g. SQLite aborted the transaction itself). The original error wins.
    }
    throw error;
  } finally {
    internal.active = false;
    openTransactions.delete(db);
  }
  return result;
}

let savepointCounter = 0;

function runNested<T>(outer: InternalTx, ctx: TenantContext, fn: (tx: Tx) => T): T {
  assertSameOrganization(outer, ctx);

  const db = outer.db;
  savepointCounter += 1;
  const name = `tenant_sp_${savepointCounter}`;
  const { tx, internal } = createTx(db, ctx);
  // The nested handle shares the outer change set: the invariants at commit time must see every
  // change the transaction made, including those made under a savepoint that was released.
  const shared: InternalTx = internal;
  shared.depth = outer.depth + 1;

  db.sqlite.prepare(`SAVEPOINT ${name}`).run();
  const previous = openTransactions.get(db);
  openTransactions.set(db, shared);
  try {
    const result = fn(tx);
    if (isThenable(result)) {
      throw new TenantAccessError(
        'INVALID_SPEC',
        'withTenantTransaction() callbacks must be synchronous',
      );
    }
    db.sqlite.prepare(`RELEASE ${name}`).run();
    outer.changeSet.push(...shared.changeSet);
    return result;
  } catch (error) {
    db.sqlite.prepare(`ROLLBACK TO ${name}`).run();
    db.sqlite.prepare(`RELEASE ${name}`).run();
    throw error;
  } finally {
    shared.active = false;
    if (previous === undefined) openTransactions.delete(db);
    else openTransactions.set(db, previous);
  }
}

/**
 * PRD §21.2: one transaction, one organisation — unless the context is elevated.
 *
 * Two organisations in a single transaction is how a cross-tenant write gets committed atomically
 * with a legitimate one, so it is refused rather than audited-and-allowed. The break-glass path
 * (which is already reason-required, recent-MFA and audited at context construction) is the
 * exception the PRD names.
 */
function assertSameOrganization(outer: InternalTx, ctx: TenantContext): void {
  if (outer.ctx.organizationId === ctx.organizationId) return;
  if (ctx.elevation !== undefined || outer.ctx.elevation !== undefined) return;
  throw new TenantAccessError(
    'ELEVATION_REQUIRED',
    'a transaction cannot span two organisations without a cross-tenant elevation (PRD §21.2)',
  );
}

/**
 * The private state behind an open `Tx`, for `repository.ts`.
 *
 * Throws rather than returning `undefined` for a forged, closed or foreign handle: a write that
 * quietly ran outside a transaction is the failure mode this exists to prevent.
 */
export function requireOpenTx(tx: unknown, db: AppDatabaseHandle): InternalTx {
  const internal = resolveTx(tx);
  if (internal === undefined) {
    throw new TenantAccessError(
      'INVALID_TRANSACTION',
      'a Tx from withTenantTransaction() is required; a fabricated object is not one',
    );
  }
  if (!internal.active) {
    throw new TenantAccessError('INVALID_TRANSACTION', 'this transaction has already ended');
  }
  if (internal.db !== db) {
    throw new TenantAccessError(
      'INVALID_TRANSACTION',
      'this Tx belongs to a different database connection',
    );
  }
  return internal;
}
