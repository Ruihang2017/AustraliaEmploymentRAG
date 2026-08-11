/**
 * The opaque transaction handle and its private registry.
 *
 * Deliverable 6 requires that a `Tx` "must not expose the underlying Kysely instance or
 * `better-sqlite3` connection". The strongest way to honour that is for the handle to carry no
 * reference to them **at all**: the object a caller receives holds two strings, and everything the
 * repository needs is looked up through a module-private `WeakMap` keyed by that object. Nothing is
 * reachable by walking the object graph, by `Object.getOwnPropertySymbols`, or by a debugger inspecting
 * what the caller holds — because it is not there.
 *
 * `Tx` is also nominally typed. The brand below is `declare`d, so it exists only in the type system;
 * `{ organizationId, requestId }` does not satisfy `Tx`, which stops a caller fabricating one in
 * TypeScript, and {@link resolveTx} stops a JavaScript caller doing the same at runtime.
 */
import type { AppDatabaseHandle } from './connection.js';
import type { TenantContext } from './context.js';

declare const TX_BRAND: unique symbol;

/** An open tenant transaction. Obtained only from `withTenantTransaction`. */
export interface Tx {
  /** Phantom — this property does not exist at runtime. */
  readonly [TX_BRAND]: 'tenant-transaction';
  readonly organizationId: string;
  readonly requestId: string;
}

/** One row-level change made inside a transaction, handed to the pre-commit invariants. */
export interface ChangeSetEntry {
  readonly table: string;
  readonly operation: 'insert' | 'update' | 'delete';
  readonly organizationId: string;
  /** The row's opaque id, when the operation names one. */
  readonly id?: string;
}

export interface InternalTx {
  readonly db: AppDatabaseHandle;
  readonly ctx: TenantContext;
  readonly changeSet: ChangeSetEntry[];
  /** Savepoint nesting depth; 0 is the outermost `BEGIN IMMEDIATE`. */
  depth: number;
  /** Cleared on commit/rollback so a captured handle cannot be reused afterwards. */
  active: boolean;
}

const registry = new WeakMap<object, InternalTx>();

/** Mints the caller-facing handle and records its private state. */
export function createTx(db: AppDatabaseHandle, ctx: TenantContext): { tx: Tx; internal: InternalTx } {
  const tx = Object.freeze({
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
  }) as unknown as Tx;
  const internal: InternalTx = { db, ctx, changeSet: [], depth: 0, active: true };
  registry.set(tx, internal);
  return { tx, internal };
}

/** The private state behind `tx`, or `undefined` when `tx` did not come from {@link createTx}. */
export function resolveTx(tx: unknown): InternalTx | undefined {
  if (typeof tx !== 'object' || tx === null) return undefined;
  return registry.get(tx);
}
