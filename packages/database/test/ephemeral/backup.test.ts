import { describe, expect, it } from 'vitest';

import {
  EPHEMERAL_FILE_GLOBS,
  assertNotBackedUp,
  matchesEphemeralFile,
} from '../../src/ephemeral/backup.js';

describe('EPHEMERAL_FILE_GLOBS', () => {
  it('is exactly the three PRD §39.3 names and is frozen', () => {
    expect([...EPHEMERAL_FILE_GLOBS]).toEqual([
      'ephemeral.sqlite',
      'ephemeral.sqlite-wal',
      'ephemeral.sqlite-shm',
    ]);
    expect(Object.isFrozen(EPHEMERAL_FILE_GLOBS)).toBe(true);
  });
});

describe('matchesEphemeralFile', () => {
  it('reports every ephemeral name a wildcard would sweep up', () => {
    expect(matchesEphemeralFile('*.sqlite*')).toEqual([
      'ephemeral.sqlite',
      'ephemeral.sqlite-wal',
      'ephemeral.sqlite-shm',
    ]);
    expect(matchesEphemeralFile('*.sqlite')).toEqual(['ephemeral.sqlite']);
    expect(matchesEphemeralFile('app.sqlite')).toEqual([]);
  });
});

describe('assertNotBackedUp', () => {
  it.each([
    ['*.sqlite'],
    ['*.sqlite*'],
    ['data/*'],
    ['/srv/aer/data/*'],
    ['**'],
    ['ephemeral.sqlite'],
    ['ephemeral.sqlite-wal'],
    ['ephemeral.sqlite-shm'],
    ['ephemeral.sqlite?wal'],
    ['data\\*'],
    // Deliberate, documented false positive: the rule ignores the directory part and fails closed.
    ['some/other/dir/*'],
  ])('throws for %s', (candidate) => {
    expect(() => assertNotBackedUp([candidate])).toThrowError(/EPHEMERAL_BACKUP_GLOB_CONFLICT/);
  });

  it.each([
    [['app.sqlite', 'app.sqlite-wal']],
    [['app.sqlite*']],
    [['corpus/*.parquet']],
    [['data/app.sqlite*']],
    [[]],
  ])('passes for %j', (candidates) => {
    expect(() => assertNotBackedUp(candidates)).not.toThrow();
  });

  it('names every offending candidate and what it matched', () => {
    let thrown: Error | undefined;
    try {
      assertNotBackedUp(['app.sqlite', '*.sqlite', 'data/*', 'corpus/*.parquet']);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown?.message).toContain('*.sqlite');
    expect(thrown?.message).toContain('data/*');
    expect(thrown?.message).toContain('ephemeral.sqlite-wal');
    expect(thrown?.message).not.toContain('corpus/*.parquet');
  });

  it('rejects a non-array or non-string argument', () => {
    expect(() => assertNotBackedUp('*.sqlite' as unknown as string[])).toThrowError(
      /EPHEMERAL_INPUT_INVALID/,
    );
    expect(() => assertNotBackedUp([42] as unknown as string[])).toThrowError(
      /EPHEMERAL_INPUT_INVALID/,
    );
  });
});
