import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MigrationError } from '../../src/migrate/errors.js';
import {
  assertExpandOnly,
  parseMigrationHeader,
  stripSqlNoise,
} from '../../src/migrate/policy.js';
import { fixture } from './helpers.js';

function read(dir: string, name: string): string {
  return readFileSync(join(fixture(dir), name), 'utf8');
}

function expectRejected(dir: string, name: string, code: string): MigrationError {
  const sql = read(dir, name);
  const header = parseMigrationHeader(sql, name);
  let thrown: unknown;
  try {
    assertExpandOnly(sql, { name, ...header });
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `${name} was accepted but must be rejected`).toBeInstanceOf(MigrationError);
  const error = thrown as MigrationError;
  expect(error.code).toBe(code);
  // A rejection that does not say where is a bad rejection: DATA-04…DATA-07 read these messages.
  expect(error.name_).toBe(name);
  expect(error.line, `${name}: no line number in the error`).toBeGreaterThan(0);
  return error;
}

describe('parseMigrationHeader', () => {
  it('defaults to the expand phase', () => {
    expect(parseMigrationHeader('CREATE TABLE t (id TEXT PRIMARY KEY);')).toEqual({
      phase: 'expand',
    });
  });

  it('reads the contract opt-in and normalises expanded-in to a .sql filename', () => {
    expect(
      parseMigrationHeader('-- aer:phase contract\n-- aer:expanded-in 20260803120000_tenancy\n'),
    ).toEqual({ phase: 'contract', expandedIn: '20260803120000_tenancy.sql' });
  });

  it('accepts expanded-in already carrying .sql', () => {
    expect(
      parseMigrationHeader('-- aer:phase contract\n-- aer:expanded-in 20260803120000_tenancy.sql'),
    ).toEqual({ phase: 'contract', expandedIn: '20260803120000_tenancy.sql' });
  });

  it('refuses a contract migration with no expanded-in', () => {
    expect(() => parseMigrationHeader('-- aer:phase contract\nDROP TABLE t;', 'x.sql')).toThrowError(
      expect.objectContaining({ code: 'CONTRACT_MISSING_EXPANDED_IN' }),
    );
  });

  it('refuses an unknown phase', () => {
    expect(() => parseMigrationHeader('-- aer:phase destroy\n', 'x.sql')).toThrowError(
      expect.objectContaining({ code: 'INVALID_MIGRATION_PHASE' }),
    );
  });

  it('ignores a directive that is not in the leading comment block', () => {
    const sql = ['CREATE TABLE t (id TEXT PRIMARY KEY);', '-- aer:phase contract', ''].join('\n');
    expect(parseMigrationHeader(sql)).toEqual({ phase: 'expand' });
  });
});

describe('stripSqlNoise', () => {
  it('blanks comments and string literals while preserving line structure', () => {
    const sql = "-- DROP TABLE a\nSELECT 'DROP TABLE b';\n/* DROP TABLE c */\n";
    const stripped = stripSqlNoise(sql);
    expect(stripped).not.toMatch(/drop\s+table/i);
    expect(stripped.split('\n')).toHaveLength(sql.split('\n').length);
    expect(stripped).toContain('SELECT');
  });

  it("treats the doubled-quote escape '' as part of the literal, not its end", () => {
    expect(stripSqlNoise("SELECT 'it''s DROP TABLE x';")).not.toMatch(/drop\s+table/i);
  });

  it('does not let a -- inside a literal start a comment', () => {
    expect(stripSqlNoise("SELECT '-- x', DROP_ME;")).toContain('DROP_ME');
  });
});

describe('assertExpandOnly (DATA-01 deliverable 6, PRD §20.4)', () => {
  const destructive = readdirSync(fixture('destructive')).sort();

  it('has a fixture per forbidden construct', () => {
    expect(destructive).toEqual([
      '20260803120000_drop-table.sql',
      '20260803120100_alter-drop-column.sql',
      '20260803120200_alter-rename.sql',
      '20260803120300_delete-unqualified.sql',
      '20260803120400_update-unqualified.sql',
      '20260803120500_drop-index.sql',
      '20260803120600_transaction-control.sql',
    ]);
  });

  it('rejects DROP TABLE', () => {
    expect(
      expectRejected('destructive', '20260803120000_drop-table.sql', 'DESTRUCTIVE_STATEMENT').message,
    ).toContain('DROP TABLE');
  });

  it('rejects ALTER TABLE … DROP COLUMN', () => {
    expect(
      expectRejected('destructive', '20260803120100_alter-drop-column.sql', 'DESTRUCTIVE_STATEMENT')
        .message,
    ).toContain('DROP COLUMN');
  });

  it('rejects ALTER TABLE … RENAME', () => {
    expect(
      expectRejected('destructive', '20260803120200_alter-rename.sql', 'DESTRUCTIVE_STATEMENT')
        .message,
    ).toContain('RENAME');
  });

  it('rejects an unqualified DELETE FROM', () => {
    expect(
      expectRejected('destructive', '20260803120300_delete-unqualified.sql', 'DESTRUCTIVE_STATEMENT')
        .message,
    ).toContain('DELETE FROM without WHERE');
  });

  it('rejects an unqualified UPDATE', () => {
    expect(
      expectRejected('destructive', '20260803120400_update-unqualified.sql', 'DESTRUCTIVE_STATEMENT')
        .message,
    ).toContain('UPDATE without WHERE');
  });

  it('rejects every DROP INDEX in an expand migration, not only a unique one', () => {
    // Whether an index carries uniqueness is not decidable from one file's text — the
    // `CREATE UNIQUE INDEX` may be months of migrations away. The rejection is therefore a strict
    // superset of the ticket's rule, and the escape hatch is the ticket's own `-- aer:phase
    // contract` opt-in.
    expect(
      expectRejected('destructive', '20260803120500_drop-index.sql', 'DESTRUCTIVE_STATEMENT').message,
    ).toContain('DROP INDEX');
  });

  it('rejects a migration body that drives its own transaction', () => {
    expectRejected(
      'destructive',
      '20260803120600_transaction-control.sql',
      'TRANSACTION_CONTROL_IN_MIGRATION',
    );
  });

  it('does NOT false-positive on comments, string literals or a trigger body', () => {
    const name = '20260803120000_decoy.sql';
    const sql = read('decoy', name);
    expect(sql).toContain('DROP TABLE');
    expect(() => assertExpandOnly(sql, { name, ...parseMigrationHeader(sql, name) })).not.toThrow();
  });

  it('lets a contract migration carry its destructive construct', () => {
    const name = '20260803130000_alpha-contract.sql';
    const sql = read('contract', name);
    expect(() => assertExpandOnly(sql, { name, ...parseMigrationHeader(sql, name) })).not.toThrow();
  });

  it('still refuses transaction control inside a contract migration', () => {
    const sql = '-- aer:phase contract\n-- aer:expanded-in 20260803120000_a\nVACUUM;\n';
    expect(() =>
      assertExpandOnly(sql, { name: 'c.sql', ...parseMigrationHeader(sql, 'c.sql') }),
    ).toThrowError(expect.objectContaining({ code: 'TRANSACTION_CONTROL_IN_MIGRATION' }));
  });

  it('reports every violation in one throw, each with its line', () => {
    const sql = ['-- aer:phase expand', 'DROP TABLE a;', 'DROP INDEX b;', ''].join('\n');
    let thrown: unknown;
    try {
      assertExpandOnly(sql, { name: 'multi.sql', phase: 'expand' });
    } catch (error) {
      thrown = error;
    }
    const error = thrown as MigrationError;
    expect(error.violations).toEqual(['line 2: DROP TABLE', 'line 3: DROP INDEX']);
  });
});
