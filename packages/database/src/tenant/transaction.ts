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
 * # Why the connection is an argument
 *
 * `withTenantTransaction(db, ctx, fn)`, not `(ctx, fn)`: there is no ambient connection to find one
 * from — deliberately, per deliverable 1, which makes the connection package-private and *not* a
 * module-level singleton — so a two-argument form would have to reintroduce exactly the global handle
 * the ticket exists to abolish. The handle is unreachable outside this package, so this adds no
 * surface. Ticket deliverable 6 and sub-PRD **D12** carry the decision (ticket amendment 2026-08-11).
 *
 * # Two entry points, because there are two scopes
 *
 * A `TENANT` table is written through {@link withTenantTransaction} and a `GLOBAL` one (PRD §35.6
 * `detected_change`) through {@link withSystemTransaction}. They share all their machinery and differ
 * only in which context they accept — but both must exist, because a `systemContext` cannot be
 * admitted to a tenant transaction (it has no organisation, so "one organisation per transaction" is
 * unenforceable for it) and a `GLOBAL` repository's `insert` requires *some* transaction. Without the
 * second entry point that `insert` is a member that exists on the type and at runtime and can never
 * succeed, which is what review round 1 found.
 *
 * The two never nest inside one another, and an elevation does not bridge them: elevation is a
 * cross-*organisation* grant (PRD §21.2), not a cross-*scope* one.
 */
import { APP_SQLITE_BUSY_TIMEOUT_MS } from '../migrate/pragmas.js';
import { emitTenantAudit } from './audit.js';
import type { AppDatabaseHandle } from './connection.js';
import { assertTenantContext, isSystemContext } from './context.js';
import type { TenantContext } from './context.js';
import { TenantAccessError } from './errors.js';
import { listPreCommitInvariants } from './invariants.js';
import { createTx, resolveTx } from './tx-internal.js';
import type { ChangeSetEntry, InternalTx, Tx } from './tx-internal.js';

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
    // for it and every tenant write inside would be unscoped. GLOBAL tables have their own entry
    // point (`withSystemTransaction`) rather than a relaxation of this one.
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'systemContext() cannot open a tenant transaction; GLOBAL tables use withSystemTransaction()',
    );
  }
  return enterTransaction(db, ctx, fn, 'withTenantTransaction');
}

/**
 * Runs `fn` inside one transaction held by a {@link systemContext}, for `GLOBAL`-scoped tables.
 *
 * PRD §35.6 calls `detected_change` "a global public-source event, not tenant content": it has no
 * `organization_id` to scope to, so the tenant entry point cannot accept it and a `GLOBAL`
 * repository's `insert` would otherwise have no reachable transaction. Everything else — savepoint
 * nesting, pre-commit invariants, `SQLITE_BUSY` handling, the opaque handle — is identical.
 *
 * A tenant context is refused here for the mirror-image reason it is refused by the repository
 * factory: a transaction whose scope disagrees with its writes is exactly the confusion this layer
 * exists to make impossible.
 */
export function withSystemTransaction<T>(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  fn: (tx: Tx) => T,
): T {
  assertTenantContext(ctx);
  if (!isSystemContext(ctx)) {
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'withSystemTransaction() takes a systemContext(); a tenant context uses withTenantTransaction()',
    );
  }
  return enterTransaction(db, ctx, fn, 'withSystemTransaction');
}

function enterTransaction<T>(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  fn: (tx: Tx) => T,
  entryPoint: string,
): T {
  if (typeof fn !== 'function') {
    throw new TenantAccessError('INVALID_SPEC', `${entryPoint}() needs a callback`);
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
 *
 * The elevation must be the **joining** context's own (review round 2, finding 3). An earlier reading
 * accepted the mix whenever *either* side was elevated, which let an ordinary, unelevated org-B
 * context be composed into an org-A break-glass transaction and committed atomically with it — with
 * only the other operator's elevation to show for it in the audit trail. A grant is issued to one
 * operator for one organisation; it is not ambient permission for whatever nests inside it.
 */
function assertSameOrganization(outer: InternalTx, ctx: TenantContext): void {
  if (isSystemContext(outer.ctx) !== isSystemContext(ctx)) {
    // Checked before the elevation escape below: an elevation is a cross-*organisation* grant, and
    // must never be readable as permission to mix a GLOBAL scope with a tenant one.
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      'a system transaction and a tenant transaction cannot nest; GLOBAL and TENANT writes are ' +
        'separate units of work',
    );
  }
  if (outer.ctx.organizationId === ctx.organizationId) return;
  if (ctx.elevation !== undefined) return;
  // Mirrors requireWriteTx's refusal audit (repository.ts): deliverable 8 requires that "every
  // rejected cross-tenant access" emits one, and this is the transaction-boundary half of that same
  // rule — an unelevated context nesting inside another organisation's transaction.
  emitTenantAudit({
    event: 'CROSS_TENANT_ACCESS_REFUSED',
    actorId: ctx.actorId,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    reason: "a transaction cannot span two organisations without a cross-tenant elevation of its own",
  });
  throw new TenantAccessError(
    'ELEVATION_REQUIRED',
    'a transaction cannot span two organisations without a cross-tenant elevation of its own ' +
      "(PRD §21.2); another context's elevation does not carry over",
  );
}

/**
 * Records one row-level change against the transaction level that will actually keep it.
 *
 * Not against the handle the caller passed: a write issued through the *outer* handle while a
 * savepoint is open still executes inside that savepoint — there is one connection — so `ROLLBACK TO`
 * discards it at the database level. Appending it to the outer change set would leave the pre-commit
 * invariants (deliverable 7, the D5 seam `DATA-09` consumes) judging a row that no longer exists:
 * either aborting a legitimate transaction, or recording an invariant as satisfied over rolled-back
 * work. Both silently. So the entry goes to the innermost open level for this connection, which
 * `runNested` merges upward on `RELEASE` and drops on `ROLLBACK TO`.
 *
 * The caller's handle is still validated first — it must be a genuine, open, same-connection `Tx`.
 */
export function recordTxChange(db: AppDatabaseHandle, tx: unknown, entry: ChangeSetEntry): void {
  const passed = requireOpenTx(tx, db);
  const innermost = openTransactions.get(db) ?? passed;
  innermost.changeSet.push(entry);
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
