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

  describe('DROP INDEX is conditioned on uniqueness (ticket deliverable 6)', () => {
    const dropIndex = (target: string): string =>
      ['-- aer:phase expand', `DROP INDEX ${target};`, ''].join('\n');

    const check = (target: string, uniqueIndexNames?: ReadonlySet<string>): void => {
      const sql = dropIndex(target);
      assertExpandOnly(sql, { name: 'd.sql', phase: 'expand', uniqueIndexNames });
    };

    it('rejects a DROP INDEX naming a uniqueness-carrying index', () => {
      let thrown: unknown;
      try {
        check('alpha_email_uidx', new Set(['alpha_email_uidx']));
      } catch (error) {
        thrown = error;
      }
      const error = thrown as MigrationError;
      expect(error.code).toBe('DESTRUCTIVE_STATEMENT');
      expect(error.message).toContain('DROP INDEX alpha_email_uidx (unique index)');
    });

    it('allows a DROP INDEX naming a non-unique index', () => {
      expect(() => check('alpha_created_at_idx', new Set(['alpha_email_uidx']))).not.toThrow();
    });

    it('allows a DROP INDEX when the database carries no unique index at all', () => {
      expect(() => check('alpha_created_at_idx', new Set())).not.toThrow();
    });

    it('fails closed when uniqueIndexNames is absent — "unknown" is not "not unique"', () => {
      let thrown: unknown;
      try {
        check('alpha_created_at_idx');
      } catch (error) {
        thrown = error;
      }
      const error = thrown as MigrationError;
      expect(error.code).toBe('DESTRUCTIVE_STATEMENT');
      expect(error.message).toContain('index uniqueness unknown');
    });

    it.each([
      ['"alpha_email_uidx"', 'double-quoted'],
      ['[alpha_email_uidx]', 'bracket-quoted'],
      ['`alpha_email_uidx`', 'backtick-quoted'],
      ['main.alpha_email_uidx', 'schema-qualified'],
      ['ALPHA_EMAIL_UIDX', 'differently-cased'],
      ['IF EXISTS alpha_email_uidx', 'IF EXISTS'],
      ['main."ALPHA_EMAIL_UIDX"', 'schema-qualified and quoted'],
    ])('still matches a %s target (%s)', (target) => {
      expect(() => check(target, new Set(['alpha_email_uidx']))).toThrowError(
        expect.objectContaining({ code: 'DESTRUCTIVE_STATEMENT' }),
      );
    });

    it('does not confuse a similarly-named non-unique index for the unique one', () => {
      expect(() => check('alpha_email_uidx_old', new Set(['alpha_email_uidx']))).not.toThrow();
    });

    it('lets a contract migration drop a unique index', () => {
      const sql = [
        '-- aer:phase contract',
        '-- aer:expanded-in 20260803120000_alpha',
        'DROP INDEX alpha_email_uidx;',
        '',
      ].join('\n');
      expect(() =>
        assertExpandOnly(sql, {
          name: 'c.sql',
          ...parseMigrationHeader(sql, 'c.sql'),
          uniqueIndexNames: new Set(['alpha_email_uidx']),
        }),
      ).not.toThrow();
    });

    it('does not false-positive on DROP INDEX inside a comment or string literal', () => {
      const sql = [
        '-- aer:phase expand',
        '-- we will never DROP INDEX alpha_email_uidx here',
        "INSERT INTO note (body) VALUES ('DROP INDEX alpha_email_uidx');",
        '',
      ].join('\n');
      expect(() =>
        assertExpandOnly(sql, { name: 'n.sql', phase: 'expand', uniqueIndexNames: new Set() }),
      ).not.toThrow();
    });

    it('rejects the destructive fixture, whose index is unique in the live database', () => {
      const name = '20260803120500_drop-index.sql';
      const sql = read('destructive', name);
      let thrown: unknown;
      try {
        assertExpandOnly(sql, {
          name,
          ...parseMigrationHeader(sql, name),
          uniqueIndexNames: new Set(['fixture_alpha_created_at_idx']),
        });
      } catch (error) {
        thrown = error;
      }
      expect((thrown as MigrationError).code).toBe('DESTRUCTIVE_STATEMENT');
    });
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
      assertExpandOnly(sql, {
        name: 'multi.sql',
        phase: 'expand',
        uniqueIndexNames: new Set(['b']),
      });
    } catch (error) {
      thrown = error;
    }
    const error = thrown as MigrationError;
    expect(error.violations).toEqual(['line 2: DROP TABLE', 'line 3: DROP INDEX b (unique index)']);
  });
});
