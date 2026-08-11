/**
 * DATA-02 deliverable 3 — `defineTenantRepository`, the only thing in this package that builds and
 * runs a statement.
 *
 * Plan §2.1 A3 and PRD §45.2 put every app table and repository here; product modules own routes and
 * handlers only. What makes that decomposition an actual boundary rather than a convention is that a
 * repository is the *only* way to reach the connection, and a repository does not exist until it has
 * been handed a `TenantContext`.
 *
 * # Two stages, and why
 *
 * `defineTenantRepository(spec)` returns a **definition**, not a repository. The definition validates
 * the table spec once, at module load, and carries no context and no connection — so it has no
 * callable that could run a query. `definition.for(db, ctx)` is what produces the repository, and it
 * cannot be called without a genuine branded context. There is therefore no state in which a
 * queryable object exists without a context: the acceptance item "no callable that can run without a
 * `TenantContext`" is a property of the shape, not of a guard inside each method.
 *
 * # Every statement is built here, checked, then executed
 *
 * Kysely constructs the statement and `.compile()`s it to `{ sql, parameters }`; `assertTenantScoped`
 * checks that pair; `better-sqlite3` executes it. `.execute()` on a Kysely builder would skip the
 * middle step, so it is never called — see `connection.ts` and `test/tenant/purity.test.ts`.
 *
 * # Not-found is one code path
 *
 * Every read/update/delete is one `WHERE id = ? AND organization_id = ?`. Another tenant's id and an
 * id that never existed both return zero rows, on the same line, and the same `ResourceNotFound`
 * value is constructed from the same argument. There is no branch in which the two could diverge —
 * which is what PRD §16.5 asks for, and is stronger than remembering to return the same error twice.
 */
import type { TableMutability, TableSpec } from '../migrate/manifest.js';
import { emitTenantAudit } from './audit.js';
import type { AppDatabaseHandle } from './connection.js';
import { assertTenantContext, isSystemContext } from './context.js';
import type { TenantContext } from './context.js';
import { ResourceNotFound, TenantAccessError } from './errors.js';
import { assertTenantScoped } from './scoped-sql.js';
import { recordTxChange, requireOpenTx } from './transaction.js';
import type { Tx } from './tx-internal.js';

/** What a row looks like to this layer. `DATA-04`…`DATA-07` supply the real per-table types. */
export type Row = Record<string, unknown>;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: unknown, what: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TenantAccessError(
      'INVALID_SPEC',
      `${what} must be a lower_snake_case identifier; got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export interface TenantRepositorySpec<M extends TableMutability = TableMutability> {
  /** The physical table. Must equal `spec.name` — a mismatch scopes the wrong table silently. */
  readonly table: string;
  /** The `TableSpec` from `DATA-01`'s `manifest.ts`, as authored by the table-group ticket. */
  readonly spec: TableSpec & { readonly mutability: M };
  /** The resource kind reported by `ResourceNotFound`. Defaults to the table name. */
  readonly kind?: string;
}

export interface ReadOps<T> {
  /** The row, or `undefined`. Use when absence is an expected outcome. */
  find(id: string): T | undefined;
  /** The row, or `ResourceNotFound`. Other-tenant and absent ids are indistinguishable. */
  get(id: string): T;
  /** Every row this context may see, ordered by `id` so results are stable. */
  list(options?: { readonly limit?: number; readonly offset?: number }): T[];
}

export interface InsertOps<T> {
  /** Inserts one row. `organization_id` is supplied by the context, never by the caller. */
  insert(tx: Tx, values: Row): T;
}

export interface MutateOps<T> {
  update(tx: Tx, id: string, values: Row): T;
  delete(tx: Tx, id: string): void;
}

/**
 * The repository type for a table of mutability `M`.
 *
 * For `IMMUTABLE` and `APPEND_ONLY` the mutating members are **absent from the type** (PRD §35.8
 * invariant 5, REC-001) — not present-and-throwing. They are absent at runtime too, so a JavaScript
 * caller gets a `TypeError` rather than a silent no-op. When `M` is not a single literal (a spec
 * whose mutability widened to the union) the conditional distributes to `unknown`, so the mutating
 * members are absent as well: unsure fails closed.
 */
export type TenantRepository<T, M extends TableMutability> = ReadOps<T> &
  InsertOps<T> &
  (M extends 'MUTABLE_METADATA' ? MutateOps<T> : unknown);

export interface TenantRepositoryDefinition<T, M extends TableMutability> {
  readonly table: string;
  readonly spec: TableSpec;
  /** Binds the definition to a connection and a context. The only way to obtain a repository. */
  for(db: AppDatabaseHandle, ctx: TenantContext): TenantRepository<T, M>;
}

/**
 * Validates a table spec and returns its repository definition.
 *
 * Everything checkable without a context is checked here, once, at definition time — a table that can
 * never be scoped correctly should fail when the module loads, not on the first request that touches
 * it in production.
 */
export function defineTenantRepository<T = Row>(
  spec: TenantRepositorySpec<'MUTABLE_METADATA'>,
): TenantRepositoryDefinition<T, 'MUTABLE_METADATA'>;
export function defineTenantRepository<T = Row>(
  spec: TenantRepositorySpec<'APPEND_ONLY' | 'IMMUTABLE'>,
): TenantRepositoryDefinition<T, 'APPEND_ONLY'>;
export function defineTenantRepository<T = Row>(
  spec: TenantRepositorySpec,
): TenantRepositoryDefinition<T, TableMutability>;
export function defineTenantRepository<T = Row>(
  spec: TenantRepositorySpec,
): TenantRepositoryDefinition<T, TableMutability> {
  const table = assertIdentifier(spec?.table, 'table');
  const tableSpec = spec.spec;
  if (typeof tableSpec !== 'object' || tableSpec === null) {
    throw new TenantAccessError('INVALID_SPEC', `${table}: a TableSpec is required`);
  }
  if (tableSpec.name !== table) {
    throw new TenantAccessError(
      'INVALID_SPEC',
      `${table}: the TableSpec names ${JSON.stringify(tableSpec.name)}; ` +
        'a mismatch would scope a different table than the one queried',
    );
  }
  const required = tableSpec.requiredColumns ?? [];
  if (!required.includes('id')) {
    throw new TenantAccessError(
      'INVALID_SPEC',
      `${table}: a repository addresses rows by \`id\`, which is not in requiredColumns`,
    );
  }
  if (tableSpec.scope === 'TENANT' && !required.includes('organization_id')) {
    // PRD §15.4: "Every tenant-owned row MUST include organization_id". A tenant repository over a
    // table without that column could not scope anything, so it is refused rather than built.
    throw new TenantAccessError(
      'INVALID_SPEC',
      `${table}: a TENANT-scoped table must declare organization_id in requiredColumns (PRD §15.4)`,
    );
  }

  const kind = spec.kind ?? table;
  const scoped = tableSpec.scope === 'TENANT';
  const mutable = tableSpec.mutability === 'MUTABLE_METADATA';

  return Object.freeze({
    table,
    spec: tableSpec,
    for(db: AppDatabaseHandle, ctx: TenantContext): TenantRepository<T, TableMutability> {
      assertTenantContext(ctx);
      if (db === null || typeof db !== 'object' || typeof db.close !== 'function') {
        throw new TenantAccessError('INVALID_SPEC', `${table}: an AppDatabaseHandle is required`);
      }
      if (scoped && isSystemContext(ctx)) {
        throw new TenantAccessError(
          'SCOPE_MISMATCH',
          `${table} is TENANT-scoped; systemContext() cannot read or write it`,
        );
      }
      if (!scoped && !isSystemContext(ctx)) {
        throw new TenantAccessError(
          'SCOPE_MISMATCH',
          `${table} is GLOBAL-scoped (PRD §35.6); it takes a systemContext(), not a tenant context`,
        );
      }
      return bind<T>({ db, ctx, table, kind, scoped, mutable });
    },
  });
}

interface Binding {
  readonly db: AppDatabaseHandle;
  readonly ctx: TenantContext;
  readonly table: string;
  readonly kind: string;
  /** `false` for a `GLOBAL` table: there is no tenant to scope to. */
  readonly scoped: boolean;
  readonly mutable: boolean;
}

/** Compiles, checks, executes. The single path every statement in this package takes. */
function run(binding: Binding, sql: string, parameters: readonly unknown[], reads: true): Row[];
function run(binding: Binding, sql: string, parameters: readonly unknown[], reads: false): number;
function run(
  binding: Binding,
  sql: string,
  parameters: readonly unknown[],
  reads: boolean,
): Row[] | number {
  if (binding.scoped) {
    assertTenantScoped(sql, parameters, binding.ctx);
  }
  const statement = binding.db.sqlite.prepare(sql);
  const bound = parameters as unknown[];
  if (reads) return statement.all(...bound) as Row[];
  return statement.run(...bound).changes;
}

function requireWriteTx(binding: Binding, tx: Tx, operation: string): void {
  const internal = requireOpenTx(tx, binding.db);
  if (isSystemContext(internal.ctx) !== isSystemContext(binding.ctx)) {
    // Scope before organisation: comparing a real org id against the system sentinel would report
    // "elevation required", which is wrong and, worse, suggests an elevation would fix it. Nothing
    // bridges the two scopes — a GLOBAL table is written inside withSystemTransaction() and a TENANT
    // table inside withTenantTransaction().
    throw new TenantAccessError(
      'SCOPE_MISMATCH',
      `${binding.table}: a ${binding.scoped ? 'TENANT' : 'GLOBAL'}-scoped ${operation} needs ` +
        `${binding.scoped ? 'withTenantTransaction()' : 'withSystemTransaction()'}`,
    );
  }
  if (internal.ctx.organizationId === binding.ctx.organizationId) return;
  if (binding.ctx.elevation !== undefined || internal.ctx.elevation !== undefined) return;
  emitTenantAudit({
    event: 'CROSS_TENANT_ACCESS_REFUSED',
    actorId: binding.ctx.actorId,
    organizationId: binding.ctx.organizationId,
    requestId: binding.ctx.requestId,
    reason: `${operation} on ${binding.table} inside another organisation's transaction`,
  });
  throw new TenantAccessError(
    'ELEVATION_REQUIRED',
    `${binding.table}: this repository's organisation is not the transaction's organisation`,
  );
}

/**
 * Appends to the change set the pre-commit invariants will see.
 *
 * `recordTxChange` — not `requireOpenTx(...).changeSet.push(...)` — because the level that will keep
 * the row is the innermost open savepoint, which is not necessarily the handle this call was given.
 * See the note on `recordTxChange` in `transaction.ts`.
 */
function recordChange(
  binding: Binding,
  tx: Tx,
  operation: 'insert' | 'update' | 'delete',
  id: string,
): void {
  recordTxChange(binding.db, tx, {
    table: binding.table,
    operation,
    organizationId: binding.ctx.organizationId,
    id,
  });
}

function bind<T>(binding: Binding): TenantRepository<T, TableMutability> {
  const { db, ctx, table, kind, scoped } = binding;
  const qb = db.qb;

  /** Adds the tenant predicate for a `TENANT` table; a `GLOBAL` table has none to add. */
  const scopeWhere = <Q extends { where: (...args: never[]) => Q }>(query: Q): Q =>
    scoped
      ? (query.where as unknown as (a: string, b: string, c: unknown) => Q)(
          'organization_id',
          '=',
          ctx.organizationId,
        )
      : query;

  const find = (id: string): T | undefined => {
    assertIdentifierValue(id);
    const compiled = scopeWhere(
      qb.selectFrom(table).selectAll().where('id', '=', id) as never,
    ) as unknown as { compile(): { sql: string; parameters: readonly unknown[] } };
    const { sql, parameters } = compiled.compile();
    const rows = run(binding, sql, parameters, true);
    return rows[0] as T | undefined;
  };

  const get = (id: string): T => {
    const row = find(id);
    if (row === undefined) throw new ResourceNotFound(kind);
    return row;
  };

  const list = (options?: { readonly limit?: number; readonly offset?: number }): T[] => {
    let query = qb.selectFrom(table).selectAll().orderBy('id') as never;
    query = scopeWhere(query);
    let built = query as unknown as {
      limit(n: number): unknown;
      offset(n: number): unknown;
      compile(): { sql: string; parameters: readonly unknown[] };
    };
    if (options?.limit !== undefined) built = built.limit(options.limit) as typeof built;
    if (options?.offset !== undefined) built = built.offset(options.offset) as typeof built;
    const { sql, parameters } = built.compile();
    return run(binding, sql, parameters, true) as T[];
  };

  const insert = (tx: Tx, values: Row): T => {
    requireWriteTx(binding, tx, 'insert');
    const id = values?.['id'];
    assertIdentifierValue(id);
    const record: Row = {};
    if (scoped) record['organization_id'] = ctx.organizationId;
    for (const [column, value] of Object.entries(values ?? {})) {
      assertIdentifier(column, `${table} column`);
      if (column === 'organization_id') {
        // The organisation is the context's, always. A caller-supplied value is either redundant or
        // an attempt to write into another tenant, and neither is worth guessing about.
        if (value !== ctx.organizationId) {
          throw new TenantAccessError(
            'ORGANIZATION_MISMATCH',
            `${table}: organization_id comes from the TenantContext and cannot be set by the caller`,
          );
        }
        continue;
      }
      record[column] = value;
    }
    const { sql, parameters } = qb
      .insertInto(table)
      .values(record as never)
      .compile();
    run(binding, sql, parameters, false);
    recordChange(binding, tx, 'insert', id as string);
    return get(id as string);
  };

  const update = (tx: Tx, id: string, values: Row): T => {
    requireWriteTx(binding, tx, 'update');
    assertIdentifierValue(id);
    const patch: Row = {};
    for (const [column, value] of Object.entries(values ?? {})) {
      assertIdentifier(column, `${table} column`);
      if (column === 'id' || column === 'organization_id') {
        throw new TenantAccessError(
          'INVALID_SPEC',
          `${table}: ${column} identifies the row and cannot be updated`,
        );
      }
      patch[column] = value;
    }
    if (Object.keys(patch).length === 0) {
      throw new TenantAccessError('INVALID_SPEC', `${table}: update() needs at least one column`);
    }
    const compiled = scopeWhere(
      qb.updateTable(table).set(patch as never).where('id', '=', id) as never,
    ) as unknown as { compile(): { sql: string; parameters: readonly unknown[] } };
    const { sql, parameters } = compiled.compile();
    if (run(binding, sql, parameters, false) === 0) throw new ResourceNotFound(kind);
    recordChange(binding, tx, 'update', id);
    return get(id);
  };

  const remove = (tx: Tx, id: string): void => {
    requireWriteTx(binding, tx, 'delete');
    assertIdentifierValue(id);
    const compiled = scopeWhere(
      qb.deleteFrom(table).where('id', '=', id) as never,
    ) as unknown as { compile(): { sql: string; parameters: readonly unknown[] } };
    const { sql, parameters } = compiled.compile();
    if (run(binding, sql, parameters, false) === 0) throw new ResourceNotFound(kind);
    recordChange(binding, tx, 'delete', id);
  };

  const repository: ReadOps<T> & InsertOps<T> & Partial<MutateOps<T>> = { find, get, list, insert };
  if (binding.mutable) {
    // Attached only for MUTABLE_METADATA. For IMMUTABLE/APPEND_ONLY the members are genuinely
    // absent, so `repo.update` is `undefined` for a JavaScript caller as well as a type error.
    repository.update = update;
    repository.delete = remove;
  }
  return Object.freeze(repository) as TenantRepository<T, TableMutability>;
}

/** Row ids are opaque strings (PRD §35.1 "globally random primary ID"). */
function assertIdentifierValue(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new TenantAccessError('INVALID_SPEC', 'a row id must be a non-empty string');
  }
}
