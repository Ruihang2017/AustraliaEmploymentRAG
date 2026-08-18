/**
 * The scoped-statement helper — sub-PRD **D14**.
 *
 * # Why it exists
 *
 * Three behaviours PRD §35.4 requires of this table group cannot be expressed with
 * `defineTenantRepository` alone:
 *
 *  1. the append-only tables (`invitation`, `api_credential`) have no `update` member at all — by
 *     design, PRD §35.8 invariant 5 — yet must stamp `accepted_at` / `revoked_at` / `last_used_at`;
 *  2. the invitation single-use rule is a **conditional** update
 *     (`… AND accepted_at IS NULL AND expires_at > ?`), which is what makes "one use" atomic rather
 *     than a read-then-write race;
 *  3. `row_version` compare-and-swap needs `… AND row_version = ?` **in the WHERE clause**. A
 *     read-compare-then-write in JavaScript happens to be safe inside `BEGIN IMMEDIATE` today, but
 *     stops being safe the moment a caller uses the repository outside a transaction, and it cannot
 *     distinguish a lost update from a missing row.
 *
 * # What it does NOT relax
 *
 * It reproduces the repository factory's own path exactly, in the same order:
 *
 *     requireOpenTx(tx, db)
 *       → build with db.qb (Kysely)  → .compile()
 *       → assertTenantScoped(sql, parameters, ctx)
 *       → db.sqlite.prepare(sql).run(...) / .all(...)
 *       → recordTxChange(db, tx, entry)
 *
 * `.execute()` on a Kysely builder is never called — that would skip the chokepoint, which is the
 * single rule the whole layer rests on (D11, `src/tenant/connection.ts`'s header). Every statement
 * built here carries `organization_id = ?` bound to the context's organisation, and every predicate
 * is an `AND` chain: `assertTenantScoped` explicitly does not analyse boolean structure, so a scope
 * predicate parked in an `OR` branch would satisfy it while still being able to reach another
 * tenant. Keep them conjunctive.
 *
 * Promotion into `src/tenant/**` is a later, `DATA-02`-owned ticket's call; that directory is
 * outside this ticket's file-scope. `DATA-05`…`DATA-07` reuse this helper rather than copying it.
 */
import type { AppDatabaseHandle } from '../../../tenant/connection.js';
import type { TenantContext } from '../../../tenant/context.js';
import { assertTenantScoped } from '../../../tenant/scoped-sql.js';
import { recordTxChange, requireOpenTx } from '../../../tenant/transaction.js';
import type { Tx } from '../../../tenant/tx-internal.js';

export type Row = Record<string, unknown>;

/** The comparisons this helper allows in a WHERE chain. All conjunctive, all bound. */
export type ScopedComparison = '=' | '>' | '<' | '>=' | '<=' | 'is' | 'is not';

/** One `column <op> value` term. `is` / `is not` are for `NULL` only. */
export interface ScopedCondition {
  readonly column: string;
  readonly op: ScopedComparison;
  readonly value: unknown;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string, what: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TypeError(`${what} must be a lower_snake_case identifier; got ${JSON.stringify(value)}`);
  }
  return value;
}

interface Compiled {
  compile(): { sql: string; parameters: readonly unknown[] };
}

function applyConditions<Q>(query: Q, conditions: readonly ScopedCondition[]): Q {
  let built = query as unknown as {
    where(column: string, op: string, value: unknown): unknown;
  };
  for (const condition of conditions) {
    assertIdentifier(condition.column, 'condition column');
    built = built.where(condition.column, condition.op, condition.value) as typeof built;
  }
  return built as unknown as Q;
}

/**
 * The tenant predicate, always first in the chain so the statement reads scope-first and every
 * later term narrows within one organisation.
 */
function scopeCondition(ctx: TenantContext): ScopedCondition {
  return { column: 'organization_id', op: '=', value: ctx.organizationId };
}

export interface ScopedSelectSpec {
  readonly table: string;
  readonly where: readonly ScopedCondition[];
  readonly limit?: number;
  readonly orderBy?: string;
}

/** A scoped SELECT. Reads need no transaction; the scope predicate is still mandatory. */
export function runScopedSelect(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  spec: ScopedSelectSpec,
): Row[] {
  const table = assertIdentifier(spec.table, 'table');
  let query = db.qb.selectFrom(table).selectAll() as unknown as Compiled;
  query = applyConditions(query, [scopeCondition(ctx), ...spec.where]);
  if (spec.orderBy !== undefined) {
    query = (query as unknown as { orderBy(column: string): unknown }).orderBy(
      assertIdentifier(spec.orderBy, 'orderBy'),
    ) as unknown as Compiled;
  }
  if (spec.limit !== undefined) {
    query = (query as unknown as { limit(n: number): unknown }).limit(spec.limit) as unknown as Compiled;
  }
  const { sql, parameters } = query.compile();
  assertTenantScoped(sql, parameters, ctx);
  return db.sqlite.prepare(sql).all(...(parameters as unknown[])) as Row[];
}

export interface GlobalSelectSpec {
  readonly table: string;
  readonly where: readonly ScopedCondition[];
  readonly limit?: number;
}

/**
 * A SELECT against a `GLOBAL` table (`user`, `actor` — PRD §35.4/§35.6).
 *
 * There is no `organization_id` on a `GLOBAL` table, so `assertTenantScoped` cannot apply and is
 * not called — exactly as the repository factory itself skips the chokepoint for a `GLOBAL` binding
 * (`run()` in `src/tenant/repository.ts` guards it with `if (binding.scoped)`). The compensating
 * control is that a `GLOBAL` repository binds **only** under `systemContext('GLOBAL', …)`, which is
 * refused for every `TENANT` table, so this path cannot be used to read tenant content.
 */
export function runGlobalSelect(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  spec: GlobalSelectSpec,
): Row[] {
  assertGlobalContext(ctx);
  const table = assertIdentifier(spec.table, 'table');
  let query = db.qb.selectFrom(table).selectAll() as unknown as Compiled;
  query = applyConditions(query, spec.where);
  if (spec.limit !== undefined) {
    query = (query as unknown as { limit(n: number): unknown }).limit(spec.limit) as unknown as Compiled;
  }
  const { sql, parameters } = query.compile();
  return db.sqlite.prepare(sql).all(...(parameters as unknown[])) as Row[];
}

export interface GlobalUpdateSpec {
  readonly table: string;
  readonly id: string;
  readonly set: Row;
  readonly where: readonly ScopedCondition[];
}

/** A conditional UPDATE against a `GLOBAL` table. Same reasoning as {@link runGlobalSelect}. */
export function runGlobalUpdate(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  tx: Tx,
  spec: GlobalUpdateSpec,
): number {
  assertGlobalContext(ctx);
  requireOpenTx(tx, db);
  const table = assertIdentifier(spec.table, 'table');
  const patch = assertPatch(table, spec.set);
  let query = db.qb.updateTable(table).set(patch as never) as unknown as Compiled;
  query = applyConditions(query, [{ column: 'id', op: '=', value: spec.id }, ...spec.where]);
  const { sql, parameters } = query.compile();
  const changes = db.sqlite.prepare(sql).run(...(parameters as unknown[])).changes;
  if (changes > 0) {
    recordTxChange(db, tx, {
      table,
      operation: 'update',
      organizationId: ctx.organizationId,
      id: spec.id,
    });
  }
  return changes;
}

/**
 * Fails closed on a tenant context.
 *
 * Without it a caller could reach a `GLOBAL` table's rows through a tenant context and skip both
 * the chokepoint (no `organization_id` to check) and the factory's `SCOPE_MISMATCH` refusal.
 */
function assertGlobalContext(ctx: TenantContext): void {
  if (ctx.actorType !== 'SYSTEM') {
    throw new TypeError(
      'a GLOBAL-table statement takes systemContext("GLOBAL", …); a tenant context is refused ' +
        '(PRD §35.6, DATA-02 SCOPE_MISMATCH)',
    );
  }
}

/** The three `actor` columns that say which principal an actor row stands for, and nothing else. */
export interface ActorLinkage {
  readonly id: string;
  readonly actorType: string;
  readonly userId: string | null;
  readonly serviceAccountId: string | null;
}

/**
 * Reads one `actor` row's linkage columns from a **tenant** context.
 *
 * This is the deliberate, narrow exception to {@link assertGlobalContext}, and it exists for exactly
 * one reason: `actor` is `GLOBAL`, so `invitation.(organization_id, invited_by_actor_id)` has no
 * composite parent key to reference (sub-PRD M-Q5, recorded under D1). PRD §35.8 invariant 4 then
 * has to be kept by an application check, and that check has to start by asking *which* principal
 * the actor is — a question only this table can answer.
 *
 * Why it is safe to answer it from a tenant context:
 *
 *  - the projection is closed to `id`, `actor_type`, `user_id`, `service_account_id`. An `actor` row
 *    carries no organisation-owned content; those columns are opaque ids;
 *  - the ids it returns are never returned to the caller — they are fed straight back into a
 *    **scoped** read (`membership` / `service_account`) whose answer is what decides the refusal. So
 *    this widens nothing: the only observable outcome is "belongs to this organisation" or
 *    `INVALID_ACTOR_LINKAGE`;
 *  - it cannot write. {@link runGlobalUpdate} still refuses a tenant context.
 *
 * Keep the projection closed. Selecting `*` here would turn a scope-decision input into a
 * cross-tenant read of whatever a later ticket adds to `actor`.
 */
export function readActorLinkage(db: AppDatabaseHandle, actorId: string): ActorLinkage | undefined {
  const query = db.qb
    .selectFrom('actor')
    .select(['id', 'actor_type', 'user_id', 'service_account_id'])
    .where('id', '=', actorId)
    .limit(1) as unknown as Compiled;
  const { sql, parameters } = query.compile();
  const row = db.sqlite.prepare(sql).get(...(parameters as unknown[])) as Row | undefined;
  if (row === undefined) return undefined;
  return {
    id: row['id'] as string,
    actorType: row['actor_type'] as string,
    userId: (row['user_id'] ?? null) as string | null,
    serviceAccountId: (row['service_account_id'] ?? null) as string | null,
  };
}

function assertPatch(table: string, set: Row): Row {
  const patch: Row = {};
  for (const [column, value] of Object.entries(set)) {
    assertIdentifier(column, `${table} column`);
    if (column === 'id' || column === 'organization_id') {
      throw new TypeError(`${table}: ${column} identifies the row and cannot be updated`);
    }
    patch[column] = value;
  }
  if (Object.keys(patch).length === 0) {
    throw new TypeError(`${table}: a scoped update needs at least one column`);
  }
  return patch;
}

export interface ScopedUpdateSpec {
  readonly table: string;
  /** The row this update addresses, for the change-set entry the pre-commit invariants see. */
  readonly id: string;
  readonly set: Row;
  /** Extra conjunctive terms — the conditional part of a conditional update. */
  readonly where: readonly ScopedCondition[];
}

/**
 * A scoped, conditional UPDATE. Returns the number of rows changed — `0` is a legitimate,
 * information-carrying outcome here (the CAS lost, or the invitation was already used), which is
 * why this returns a count rather than throwing.
 *
 * The change is recorded against the transaction only when a row actually changed: recording a
 * no-op would make `DATA-09`'s pre-commit invariants judge a row this statement did not write.
 */
export function runScopedUpdate(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  tx: Tx,
  spec: ScopedUpdateSpec,
): number {
  requireOpenTx(tx, db);
  const table = assertIdentifier(spec.table, 'table');
  const patch = assertPatch(table, spec.set);

  let query = db.qb.updateTable(table).set(patch as never) as unknown as Compiled;
  query = applyConditions(query, [scopeCondition(ctx), ...spec.where]);
  const { sql, parameters } = query.compile();
  assertTenantScoped(sql, parameters, ctx);
  const changes = db.sqlite.prepare(sql).run(...(parameters as unknown[])).changes;
  if (changes > 0) {
    recordTxChange(db, tx, {
      table,
      operation: 'update',
      organizationId: ctx.organizationId,
      id: spec.id,
    });
  }
  return changes;
}
