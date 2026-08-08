/**
 * DATA-01 deliverable 10 — the PRD §35.1 convention linter.
 *
 * Walks `sqlite_master` (for the stored `CREATE TABLE` text) and `pragma table_info` (for column
 * names, types and primary keys) and asserts §35.1 for every table a manifest declares.
 *
 * It passes vacuously against head today, because the only table is `schema_migration` and no
 * manifest declares it. Its test therefore carries deliberately non-conforming fixture tables — a
 * green check that cannot go red is worthless. It becomes load-bearing as DATA-04…DATA-07 land, and
 * under breakdown plan §8 Q13 it is also the drift check between the `.sql` schema and the
 * hand-maintained Kysely type surface DATA-02 builds.
 *
 * Every violation is collected and reported in one throw: a linter that stops at the first problem
 * makes four table-group tickets iterate one error at a time.
 */
import type Database from 'better-sqlite3';

import { getEnumValues } from './contracts.js';
import { LEGAL_DATE_GLOB, SNAKE_CASE } from './conventions.js';
import { MigrationError } from './errors.js';
import type { TableManifest, TableSpec } from './manifest.js';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

/**
 * SQLite cannot parameterise an identifier, so `pragma table_info(<t>)` has to interpolate. Manifest
 * data is repo-authored, but this linter is the surface DATA-04…DATA-07 feed, so the name is treated
 * as untrusted and validated against the §35.1 snake_case rule before it reaches the string.
 */
function tableInfo(db: Database.Database, table: string): ColumnInfo[] {
  if (!SNAKE_CASE.test(table)) {
    throw new MigrationError(
      'INVALID_TABLE_NAME',
      `refusing to inspect table ${JSON.stringify(table)}: not snake_case (PRD §35.1)`,
      { name: table },
    );
  }
  return db.pragma(`table_info(${table})`) as ColumnInfo[];
}

function storedDdl(db: Database.Database, table: string): string | null {
  const row = db
    .prepare<[string], { sql: string | null }>(
      "select sql from sqlite_master where type = 'table' and name = ?",
    )
    .get(table);
  return row?.sql ?? null;
}

/** Parses `CHECK (<column> IN ('a','b'))` out of the stored DDL, returning the literal value set. */
function checkValueSet(ddl: string, column: string): Set<string> | null {
  const pattern = new RegExp(`check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)`, 'i');
  const match = pattern.exec(ddl);
  if (!match?.[1]) return null;
  const values = new Set<string>();
  for (const raw of match[1].split(',')) {
    const token = raw.trim();
    if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) {
      values.add(token.slice(1, -1).replace(/''/g, "'"));
    } else {
      values.add(token);
    }
  }
  return values;
}

function sorted(values: Iterable<string>): string {
  return [...values].sort().join(', ');
}

function lintTable(
  db: Database.Database,
  group: string,
  table: TableSpec,
  problems: string[],
): void {
  const where = `${group}/${table.name}`;

  if (!SNAKE_CASE.test(table.name)) {
    problems.push(`${where}: table name is not snake_case (PRD §35.1)`);
    return;
  }

  const ddlRaw = storedDdl(db, table.name);
  if (ddlRaw === null) {
    problems.push(`${where}: declared in a manifest but no such table exists in the database`);
    return;
  }
  const ddl = ddlRaw.replace(/\s+/g, ' ');
  const columns = tableInfo(db, table.name);
  const byName = new Map(columns.map((column) => [column.name, column]));

  for (const column of columns) {
    if (!SNAKE_CASE.test(column.name)) {
      problems.push(`${where}.${column.name}: column name is not snake_case (PRD §35.1)`);
    }
  }

  // PRD §35.1 — "IDs are TEXT PRIMARY KEY".
  const primaryKey = columns.filter((column) => column.pk > 0);
  if (primaryKey.length === 0) {
    problems.push(`${where}: no PRIMARY KEY; PRD §35.1 requires a TEXT PRIMARY KEY`);
  }
  for (const column of primaryKey) {
    if (column.type.toUpperCase() !== 'TEXT') {
      problems.push(
        `${where}.${column.name}: PRIMARY KEY column is ${column.type || '<untyped>'}; ` +
          'PRD §35.1 requires TEXT PRIMARY KEY',
      );
    }
  }

  // PRD §35.1 — "Every mutable table has created_at; mutable metadata tables also have updated_at
  // and integer row_version."
  if (table.mutability !== 'IMMUTABLE' && !byName.has('created_at')) {
    problems.push(`${where}: mutable table is missing created_at (PRD §35.1)`);
  }
  if (table.mutability === 'MUTABLE_METADATA') {
    if (!byName.has('updated_at')) {
      problems.push(`${where}: MUTABLE_METADATA table is missing updated_at (PRD §35.1)`);
    }
    const rowVersion = byName.get('row_version');
    if (!rowVersion) {
      problems.push(`${where}: MUTABLE_METADATA table is missing row_version (PRD §35.1)`);
    } else if (rowVersion.type.toUpperCase() !== 'INTEGER') {
      problems.push(
        `${where}.row_version: is ${rowVersion.type || '<untyped>'}; PRD §35.1 requires integer ` +
          'row_version',
      );
    }
  }

  // PRD §35.1 — "Every tenant-owned unique key includes organization_id".
  if (table.scope === 'TENANT' && !byName.has('organization_id')) {
    problems.push(`${where}: TENANT-scoped table is missing organization_id (PRD §35.1)`);
  }

  for (const required of table.requiredColumns) {
    if (!byName.has(required)) {
      problems.push(`${where}: manifest requires column ${required}, which the table does not have`);
    }
  }

  // PRD §35.1 — "booleans are INTEGER CHECK (value IN (0,1))".
  for (const column of table.booleanColumns ?? []) {
    const info = byName.get(column);
    if (!info) {
      problems.push(`${where}: manifest declares boolean column ${column}, which does not exist`);
      continue;
    }
    if (info.type.toUpperCase() !== 'INTEGER') {
      problems.push(
        `${where}.${column}: boolean column is ${info.type || '<untyped>'}; PRD §35.1 requires ` +
          'INTEGER',
      );
    }
    const values = checkValueSet(ddl, column);
    if (!values || sorted(values) !== '0, 1') {
      problems.push(
        `${where}.${column}: boolean column has no CHECK (${column} IN (0,1)) (PRD §35.1)`,
      );
    }
  }

  // PRD §35.1 — "legal dates are TEXT with YYYY-MM-DD checks".
  for (const column of table.legalDateColumns ?? []) {
    if (!byName.has(column)) {
      problems.push(`${where}: manifest declares legal-date column ${column}, which does not exist`);
      continue;
    }
    if (!ddl.includes(`${column} GLOB '${LEGAL_DATE_GLOB}'`)) {
      problems.push(
        `${where}.${column}: legal-date column has no CHECK (${column} GLOB ` +
          `'${LEGAL_DATE_GLOB}') (PRD §35.1)`,
      );
    }
  }

  // PRD §35.1 — "Enumerations use checked text values generated from packages/contracts".
  for (const [column, family] of Object.entries(table.enumColumns ?? {})) {
    if (!byName.has(column)) {
      problems.push(`${where}: manifest declares enum column ${column}, which does not exist`);
      continue;
    }
    const actual = checkValueSet(ddl, column);
    if (!actual) {
      problems.push(
        `${where}.${column}: no CHECK (${column} IN (…)) for enum family ${family} (PRD §35.1)`,
      );
      continue;
    }
    const expected = new Set(getEnumValues(family));
    if (sorted(actual) !== sorted(expected)) {
      problems.push(
        `${where}.${column}: enum CHECK drifted from packages/contracts ${family} — database has ` +
          `[${sorted(actual)}], contracts has [${sorted(expected)}] (PRD §35.1, FND-03)`,
      );
    }
  }
}

/**
 * Asserts PRD §35.1 for every table declared by `manifests`. Throws once, listing every violation.
 */
export function assertSchemaConventions(
  db: Database.Database,
  manifests: readonly TableManifest[],
): void {
  const problems: string[] = [];
  for (const manifest of manifests) {
    for (const table of manifest.tables) {
      lintTable(db, manifest.group, table, problems);
    }
  }
  if (problems.length === 0) return;
  throw new MigrationError(
    'CONVENTION_VIOLATION',
    `${problems.length} PRD §35.1 convention violation(s):\n  - ${problems.join('\n  - ')}`,
    { violations: problems },
  );
}
