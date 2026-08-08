/**
 * DATA-01 deliverable 8 — PRD §35.1 column conventions as reusable DDL **text**.
 *
 * These emit fragments to be pasted into hand-authored `.sql` migrations. They are deliberately NOT
 * a schema-definition DSL, and nothing in this repository generates a migration from them
 * (breakdown plan §8 Q13 clauses (c) and (f) — raw `.sql` checked into git is the only authoring
 * format). The value they add is that the CHECK constraint text has exactly one definition, so
 * `conventions-lint.ts` can assert against the same strings the author pasted.
 */
import { getEnumValues } from './contracts.js';
import { MigrationError } from './errors.js';

/** PRD §35.1: SQLite table and column names use `snake_case`. */
export const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

/** PRD §35.1: legal dates are `TEXT` with a `YYYY-MM-DD` check. */
export const LEGAL_DATE_GLOB = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

/**
 * PRD §35.1: timestamps are UTC ISO text. The GLOB pins the shape `YYYY-MM-DDTHH:MM:SS*Z`; the
 * trailing `*` admits the optional fractional seconds `Date#toISOString` emits.
 */
export const UTC_TIMESTAMP_GLOB =
  '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*Z';

function assertColumnName(name: string): string {
  if (!SNAKE_CASE.test(name)) {
    throw new MigrationError(
      'INVALID_TABLE_NAME',
      `column name ${JSON.stringify(name)} is not snake_case (PRD §35.1)`,
      { name },
    );
  }
  return name;
}

export interface IdColumnOptions {
  /** Defaults to `true`. Set `false` for `organization_id` and other foreign-key columns. */
  primaryKey?: boolean | undefined;
}

/** PRD §35.1: IDs are `TEXT PRIMARY KEY`. A non-primary id column is still `TEXT NOT NULL`. */
export function idColumn(name: string, options: IdColumnOptions = {}): string {
  const column = assertColumnName(name);
  return options.primaryKey === false ? `${column} TEXT NOT NULL` : `${column} TEXT PRIMARY KEY`;
}

/** PRD §35.1: timestamps are UTC ISO text. */
export function timestampColumn(name: string): string {
  const column = assertColumnName(name);
  return `${column} TEXT NOT NULL CHECK (${column} GLOB '${UTC_TIMESTAMP_GLOB}')`;
}

/** PRD §35.1: legal dates are `TEXT` with a `YYYY-MM-DD` check. Nullable by design. */
export function legalDateColumn(name: string): string {
  const column = assertColumnName(name);
  return `${column} TEXT CHECK (${column} GLOB '${LEGAL_DATE_GLOB}')`;
}

/** PRD §35.1: booleans are `INTEGER CHECK (value IN (0,1))`. */
export function booleanColumn(name: string): string {
  const column = assertColumnName(name);
  return `${column} INTEGER NOT NULL CHECK (${column} IN (0,1))`;
}

/** PRD §35.1: mutable metadata tables carry an integer `row_version`. */
export function rowVersionColumn(): string {
  return 'row_version INTEGER NOT NULL DEFAULT 1';
}

/** PRD §35.1: every mutable table has `created_at`; mutable metadata also has `updated_at`. */
export function createdUpdatedColumns(): string[] {
  return [timestampColumn('created_at'), timestampColumn('updated_at')];
}

/**
 * PRD §35.1: "Enumerations use checked text values generated from `packages/contracts`."
 *
 * The values are read from the FND-03 registry at call time and are never hand-copied here —
 * hand-copying would duplicate a serial-owned artifact (breakdown plan §4.1) and reintroduce exactly
 * the drift this constraint exists to prevent. An unknown family throws inside `getEnumValues`.
 */
export function enumCheck(column: string, contractsEnum: string): string {
  const name = assertColumnName(column);
  const values = getEnumValues(contractsEnum);
  // Escape `'` as `''`. No current PRD enum member contains an apostrophe; a future one must not be
  // able to close the literal and rewrite the constraint.
  const literals = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(',');
  return `CHECK (${name} IN (${literals}))`;
}

/**
 * PRD §15.4/§35.1: the composite tenant foreign key. DDL text only — the repository-side helper that
 * enforces the same boundary in TypeScript is DATA-02's.
 */
export function tenantForeignKey(
  columns: readonly string[],
  parentTable: string,
  parentColumns: readonly string[],
): string {
  if (columns.length === 0 || columns.length !== parentColumns.length) {
    throw new MigrationError(
      'INVALID_TABLE_NAME',
      `tenantForeignKey needs a non-empty, equal-length column pair, got ` +
        `${columns.length} -> ${parentColumns.length}`,
      { name: parentTable },
    );
  }
  const child = columns.map(assertColumnName).join(', ');
  const parent = parentColumns.map(assertColumnName).join(', ');
  if (!SNAKE_CASE.test(parentTable)) {
    throw new MigrationError(
      'INVALID_TABLE_NAME',
      `table name ${JSON.stringify(parentTable)} is not snake_case (PRD §35.1)`,
      { name: parentTable },
    );
  }
  return `FOREIGN KEY (${child}) REFERENCES ${parentTable} (${parent})`;
}
