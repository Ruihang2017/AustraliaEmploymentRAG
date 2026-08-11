/**
 * DATA-02 deliverable 5 — composite tenant key SQL text for `DATA-04`…`DATA-07`.
 *
 * PRD §15.4: "Organisation-scoped composite keys/foreign keys MUST prevent cross-tenant
 * relationships where feasible." PRD §35.8 invariant 4: "Tenant child rows cannot point to another
 * tenant's parent rows." A plain `FOREIGN KEY (parent_id) REFERENCES parent(id)` satisfies neither —
 * it happily lets organisation B's child point at organisation A's parent. Carrying
 * `organization_id` into the key makes that a database-level error rather than a convention.
 *
 * These helpers emit **SQL text only**. Nothing here writes, generates or runs a migration:
 * breakdown plan §8 Q13 keeps constraints "expressed explicitly in SQL" and the `.sql` files stay the
 * authoring format owned by the table-group tickets.
 *
 * The return value is a named-field object rather than a bare string on purpose. The child clause and
 * the parent-side `UNIQUE` go in two *different* tables, and a single string invites pasting the
 * child clause where the parent constraint belongs — which produces a schema that looks right and
 * enforces nothing.
 */
import { TenantAccessError } from './errors.js';

/** SQLite identifiers this layer accepts: unquoted, lower snake case. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string, what: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new TenantAccessError(
      'INVALID_SPEC',
      `${what} must match ${String(IDENTIFIER)}; got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export interface TenantForeignKeySpec {
  /** The table carrying the reference. */
  readonly childTable: string;
  /** The referenced table. */
  readonly parentTable: string;
  /** The child column holding the parent's `id`. */
  readonly column: string;
}

export interface TenantForeignKey {
  /** Goes in the CREATE TABLE of `childTable`. */
  readonly childConstraint: string;
  /**
   * Goes in the CREATE TABLE of `parentTable` (or as a separate CREATE UNIQUE INDEX).
   *
   * SQLite requires the parent columns of a foreign key to be a declared unique key. Without this
   * the composite reference is rejected at *insert* time with "foreign key mismatch", which reads
   * like a data bug and is really a missing constraint.
   */
  readonly parentConstraint: string;
  readonly childTable: string;
  readonly parentTable: string;
  readonly column: string;
}

/**
 * `FOREIGN KEY (organization_id, <column>) REFERENCES <parent>(organization_id, id)` plus the
 * parent-side `UNIQUE (organization_id, id)` it requires.
 *
 * Because `organization_id` appears on both sides of the reference, SQLite itself rejects a child row
 * whose organisation differs from its parent's — PRD §35.8 invariant 4 becomes structural. It only
 * holds with `foreign_keys = ON`, which is per connection and not persisted; `APP_SQLITE_PRAGMAS`
 * sets it on every connection, and `test/tenant/keys.test.ts` asserts the pragma is on before it
 * asserts the constraint bites, so a silently disabled pragma cannot fake a pass.
 */
export function tenantForeignKey(spec: TenantForeignKeySpec): TenantForeignKey {
  const childTable = assertIdentifier(spec?.childTable, 'childTable');
  const parentTable = assertIdentifier(spec?.parentTable, 'parentTable');
  const column = assertIdentifier(spec?.column, 'column');
  if (column === 'organization_id') {
    throw new TenantAccessError(
      'INVALID_SPEC',
      'the referencing column cannot be organization_id; it is the tenant discriminator, not the link',
    );
  }
  return {
    childConstraint:
      `FOREIGN KEY (organization_id, ${column}) ` +
      `REFERENCES ${parentTable}(organization_id, id)`,
    parentConstraint: 'UNIQUE (organization_id, id)',
    childTable,
    parentTable,
    column,
  };
}

/**
 * `UNIQUE (organization_id, ...columns)` — PRD §35.1: "Every tenant-owned unique key includes
 * `organization_id`".
 *
 * Prepending rather than appending matters for the index prefix: `(organization_id, x)` also serves
 * lookups scoped by organisation alone, which is every lookup this layer makes.
 */
export function tenantUnique(columns: readonly string[]): string {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TenantAccessError('INVALID_SPEC', 'tenantUnique() needs at least one column');
  }
  const checked = columns.map((column, index) => assertIdentifier(column, `columns[${index}]`));
  if (checked.includes('organization_id')) {
    throw new TenantAccessError(
      'INVALID_SPEC',
      'organization_id is prepended automatically; do not list it',
    );
  }
  if (new Set(checked).size !== checked.length) {
    throw new TenantAccessError('INVALID_SPEC', 'tenantUnique() column list has a duplicate');
  }
  return `UNIQUE (organization_id, ${checked.join(', ')})`;
}
