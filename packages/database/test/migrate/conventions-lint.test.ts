import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { getEnumValues } from '../../src/migrate/contracts.js';

import {
  booleanColumn,
  createdUpdatedColumns,
  enumCheck,
  idColumn,
  legalDateColumn,
  rowVersionColumn,
} from '../../src/migrate/conventions.js';
import { assertSchemaConventions } from '../../src/migrate/conventions-lint.js';
import type { MigrationError } from '../../src/migrate/errors.js';
import { discoverTableManifests } from '../../src/migrate/manifest.js';
import type { TableManifest } from '../../src/migrate/manifest.js';
import { runMigrations } from '../../src/migrate/runner.js';
import { REPO_MIGRATIONS_DIR, withTempDatabase } from './helpers.js';

/** Migrates a temp database to head, runs `body` against the open handle, then closes it. */
async function atHead<T>(body: (db: Database.Database) => T): Promise<T> {
  return withTempDatabase(async (databasePath) => {
    await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
    const db = new Database(databasePath);
    try {
      return body(db);
    } finally {
      db.close();
    }
  });
}

function violationsOf(fn: () => void): string[] {
  try {
    fn();
  } catch (error) {
    return [...((error as MigrationError).violations ?? [])];
  }
  throw new Error('expected assertSchemaConventions to throw, it did not');
}

const conforming: TableManifest = {
  group: 'fixture',
  tables: [
    {
      name: 'lint_good',
      scope: 'TENANT',
      mutability: 'MUTABLE_METADATA',
      requiredColumns: ['id', 'organization_id', 'created_at', 'updated_at', 'row_version'],
      booleanColumns: ['is_active'],
      legalDateColumns: ['effective_on'],
      enumColumns: { status: 'AnswerStatus' },
    },
  ],
};

function createConformingTable(db: Database.Database): void {
  db.exec(
    `CREATE TABLE lint_good (
       ${idColumn('id')},
       ${idColumn('organization_id', { primaryKey: false })},
       ${createdUpdatedColumns().join(',\n       ')},
       ${rowVersionColumn()},
       ${booleanColumn('is_active')},
       ${legalDateColumn('effective_on')},
       status TEXT NOT NULL,
       ${enumCheck('status', 'AnswerStatus')}
     );`,
  );
}

describe('assertSchemaConventions (DATA-01 deliverable 10, PRD §35.1)', () => {
  it('runs green against head with the manifests actually discovered today', async () => {
    // DATA-10: this used to assert `manifests` is empty first, i.e. that the repository contains
    // zero schema modules — a premise DATA-04…DATA-07 each falsify. What is permanent, and what
    // this test is for, is the coherence property: the real migrations at head and the real schema
    // modules must agree, however many of each there are. It is vacuous only while `src/schema/` is
    // empty, and becomes a genuine check the moment DATA-04 lands. The fixture-driven negatives
    // below are what keep this criterion able to go red in the meantime.
    const manifests = discoverTableManifests();
    await atHead((db) => {
      expect(() => assertSchemaConventions(db, manifests)).not.toThrow();
    });
  });

  it('accepts a table built entirely out of the convention helpers', async () => {
    await atHead((db) => {
      createConformingTable(db);
      expect(() => assertSchemaConventions(db, [conforming])).not.toThrow();
    });
  });

  it('fails a table that omits created_at, naming the table and the rule', async () => {
    await atHead((db) => {
      db.exec('CREATE TABLE lint_no_created (id TEXT PRIMARY KEY);');
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_no_created',
                scope: 'GLOBAL',
                mutability: 'APPEND_ONLY',
                requiredColumns: ['id'],
              },
            ],
          },
        ]),
      );
      expect(violations).toEqual(['fixture/lint_no_created: mutable table is missing created_at (PRD §35.1)']);
    });
  });

  it('fails a non-TEXT primary key', async () => {
    await atHead((db) => {
      db.exec("CREATE TABLE lint_int_pk (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);");
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_int_pk',
                scope: 'GLOBAL',
                mutability: 'APPEND_ONLY',
                requiredColumns: ['id'],
              },
            ],
          },
        ]),
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('lint_int_pk.id');
      expect(violations[0]).toContain('TEXT PRIMARY KEY');
    });
  });

  it('fails a boolean declared without the IN (0,1) CHECK', async () => {
    await atHead((db) => {
      db.exec(
        'CREATE TABLE lint_bool (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, is_active INTEGER NOT NULL);',
      );
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_bool',
                scope: 'GLOBAL',
                mutability: 'APPEND_ONLY',
                requiredColumns: ['id'],
                booleanColumns: ['is_active'],
              },
            ],
          },
        ]),
      );
      expect(violations).toEqual([
        'fixture/lint_bool.is_active: boolean column has no CHECK (is_active IN (0,1)) (PRD §35.1)',
      ]);
    });
  });

  it('fails a TENANT table with no organization_id and a MUTABLE_METADATA table with no row_version', async () => {
    await atHead((db) => {
      db.exec(
        'CREATE TABLE lint_tenant (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);',
      );
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_tenant',
                scope: 'TENANT',
                mutability: 'MUTABLE_METADATA',
                requiredColumns: ['id'],
              },
            ],
          },
        ]),
      );
      expect(violations).toEqual([
        'fixture/lint_tenant: MUTABLE_METADATA table is missing row_version (PRD §35.1)',
        'fixture/lint_tenant: TENANT-scoped table is missing organization_id (PRD §35.1)',
      ]);
    });
  });

  it('fails an enum CHECK that has drifted from packages/contracts', async () => {
    await atHead((db) => {
      db.exec(
        "CREATE TABLE lint_enum (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, " +
          "status TEXT NOT NULL CHECK (status IN ('SUPPORTED','CONDITIONAL')));",
      );
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_enum',
                scope: 'GLOBAL',
                mutability: 'APPEND_ONLY',
                requiredColumns: ['id'],
                enumColumns: { status: 'AnswerStatus' },
              },
            ],
          },
        ]),
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('drifted from packages/contracts AnswerStatus');
      for (const value of getEnumValues('AnswerStatus')) {
        expect(violations[0]).toContain(value);
      }
    });
  });

  it('collects every violation into one throw rather than stopping at the first', async () => {
    await atHead((db) => {
      db.exec('CREATE TABLE lint_many (id INTEGER PRIMARY KEY);');
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_many',
                scope: 'TENANT',
                mutability: 'MUTABLE_METADATA',
                requiredColumns: ['id', 'name'],
              },
            ],
          },
        ]),
      );
      expect(violations.length).toBeGreaterThan(4);
    });
  });

  it('reports a manifest table that does not exist in the database at all', async () => {
    await atHead((db) => {
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_absent',
                scope: 'GLOBAL',
                mutability: 'IMMUTABLE',
                requiredColumns: [],
              },
            ],
          },
        ]),
      );
      expect(violations).toEqual([
        'fixture/lint_absent: declared in a manifest but no such table exists in the database',
      ]);
    });
  });

  it('refuses to interpolate a table name that is not snake_case', async () => {
    await atHead((db) => {
      const violations = violationsOf(() =>
        assertSchemaConventions(db, [
          {
            group: 'fixture',
            tables: [
              {
                name: 'lint_good); DROP TABLE schema_migration; --',
                scope: 'GLOBAL',
                mutability: 'IMMUTABLE',
                requiredColumns: [],
              },
            ],
          },
        ]),
      );
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('table name is not snake_case');
      // The injected statement must not have run.
      expect(
        db
          .prepare<[], { n: number }>(
            "select count(*) as n from sqlite_master where name = 'schema_migration'",
          )
          .get()?.n,
      ).toBe(1);
    });
  });
});
