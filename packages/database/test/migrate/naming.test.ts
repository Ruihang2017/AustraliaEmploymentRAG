import { describe, expect, it } from 'vitest';

import { MigrationError } from '../../src/migrate/errors.js';
import {
  MIGRATION_FILENAME,
  assertUniquePrefixes,
  nextMigrationFilename,
  parseMigrationFilename,
  sortMigrationNames,
} from '../../src/migrate/naming.js';

describe('MIGRATION_FILENAME (DATA-01 deliverable 5)', () => {
  it.each(['0001_baseline.sql', '20260803120000_tenancy.sql', '20260803120000_answer-snapshot.sql'])(
    'accepts %s',
    (name) => {
      expect(MIGRATION_FILENAME.test(name)).toBe(true);
    },
  );

  it.each([
    ['2_foo.sql', 'prefix is not 14 digits'],
    ['0002_bar.sql', '0001_baseline is the only 000N name'],
    ['20260803120000_Tenancy.sql', 'group must be lowercase'],
    ['20260803120000_tenancy.SQL', 'extension must be lowercase .sql'],
    ['20260803120000_tenancy', 'no extension'],
    ['20260803120000_.sql', 'empty group'],
    ['20260803120000_a--b.sql', 'double hyphen'],
    ['20260803120000_a_b.sql', 'underscore inside the group'],
    ['0001_baseline.sql.bak', 'trailing junk'],
  ])('rejects %s (%s)', (name) => {
    expect(MIGRATION_FILENAME.test(name)).toBe(false);
    expect(() => parseMigrationFilename(name)).toThrowError(
      expect.objectContaining({ code: 'INVALID_MIGRATION_FILENAME' }),
    );
  });
});

describe('parseMigrationFilename', () => {
  it('reports the baseline', () => {
    expect(parseMigrationFilename('0001_baseline.sql')).toEqual({
      name: '0001_baseline.sql',
      prefix: '0001',
      group: 'baseline',
      baseline: true,
    });
  });

  it('splits a timestamped migration into prefix and group', () => {
    expect(parseMigrationFilename('20260803120000_answer-snapshot.sql')).toEqual({
      name: '20260803120000_answer-snapshot.sql',
      prefix: '20260803120000',
      group: 'answer-snapshot',
      baseline: false,
    });
  });
});

describe('ordering (breakdown plan A5)', () => {
  it('sorts 0001_baseline.sql first for every timestamped sibling', () => {
    const siblings = [
      '20260803120000_tenancy.sql',
      '19700101000000_ancient.sql',
      '99991231235959_far-future.sql',
      '20260803130000_execution.sql',
      '0001_baseline.sql',
    ];
    expect(sortMigrationNames(siblings)[0]).toBe('0001_baseline.sql');
  });

  it('is a pure lexicographic sort and does not mutate its input', () => {
    const input = Object.freeze(['20260803130000_b.sql', '20260803120000_a.sql']);
    expect(sortMigrationNames(input)).toEqual([
      '20260803120000_a.sql',
      '20260803130000_b.sql',
    ]);
    expect(input).toEqual(['20260803130000_b.sql', '20260803120000_a.sql']);
  });
});

describe('assertUniquePrefixes', () => {
  it('accepts distinct prefixes', () => {
    expect(() =>
      assertUniquePrefixes(['0001_baseline.sql', '20260803120000_a.sql', '20260803120001_b.sql']),
    ).not.toThrow();
  });

  it('treats two files sharing a prefix as a hard error naming both', () => {
    let thrown: unknown;
    try {
      assertUniquePrefixes(['20260803120000_a.sql', '20260803120000_b.sql']);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MigrationError);
    expect((thrown as MigrationError).code).toBe('DUPLICATE_MIGRATION_PREFIX');
    expect((thrown as MigrationError).message).toContain('20260803120000_a.sql');
    expect((thrown as MigrationError).message).toContain('20260803120000_b.sql');
  });
});

describe('nextMigrationFilename', () => {
  it('formats from UTC, never local time', () => {
    // 2026-08-03T12:00:00Z is 2026-08-03T22:00:00 in Australia/Sydney; a local-time formatter would
    // produce a different (and, across a date boundary, differently sorting) prefix.
    const name = nextMigrationFilename('tenancy', new Date('2026-08-03T12:00:00.000Z'));
    expect(name).toBe('20260803120000_tenancy.sql');
  });

  it('zero-pads every field', () => {
    expect(nextMigrationFilename('a', new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '20260102030405_a.sql',
    );
  });

  it('produces a name its own policy accepts', () => {
    expect(MIGRATION_FILENAME.test(nextMigrationFilename('answer-snapshot'))).toBe(true);
  });

  it.each(['Tenancy', 'tenancy_v2', 'ten ancy', '-tenancy', 'tenancy-', ''])(
    'rejects the group %o',
    (group) => {
      expect(() => nextMigrationFilename(group)).toThrowError(
        expect.objectContaining({ code: 'INVALID_MIGRATION_GROUP' }),
      );
    },
  );
});
