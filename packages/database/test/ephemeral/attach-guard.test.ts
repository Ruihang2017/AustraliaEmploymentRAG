import DatabaseConstructor from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { assertNoAttachedDatabases } from '../../src/ephemeral/connection.js';
import { assertNoAttach } from '../../src/ephemeral/sql-guard.js';
import { withTempEphemeralDatabase } from './helpers.js';

describe('attach guard — static screen', () => {
  it('refuses ATTACH of the sibling app.sqlite through the ephemeral connection', async () => {
    await withTempEphemeralDatabase(({ handle, appPath }) => {
      expect(() => handle.run(`ATTACH DATABASE '${appPath.replace(/\\/g, '/')}' AS app`)).toThrowError(
        /EPHEMERAL_ATTACH_FORBIDDEN/,
      );
    });
  });

  it.each([
    ['DETACH DATABASE app'],
    ['aTtAcH database "x" as y'],
    ["/* harmless */ attach database 'x' as y"],
    ['-- comment\nATTACH DATABASE \'x\' AS y'],
    ["SELECT 1; ATTACH DATABASE 'x' AS y"],
    ["SELECT 1 /* multi\nline */ ; detach database y"],
  ])('rejects %j', (sql) => {
    expect(() => assertNoAttach(sql)).toThrowError(/EPHEMERAL_ATTACH_FORBIDDEN/);
  });

  it.each([
    ['SELECT * FROM ephemeral_result WHERE job_id = :jobId'],
    ["SELECT 'the word attach inside a literal'"],
    ['SELECT 1 -- attach is only mentioned in a comment'],
    ['SELECT 1 /* attach */'],
    ['SELECT detached_column FROM ephemeral_result'],
  ])('permits %j', (sql) => {
    expect(() => assertNoAttach(sql)).not.toThrow();
  });

  it('does not trip on a bound parameter value containing the word attach', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      expect(() =>
        handle.run(
          'INSERT INTO ephemeral_result (job_id, organization_ref, created_at) VALUES (:j, :o, :c)',
          { j: "ATTACH DATABASE 'x' AS y", o: 'org', c: '2026-03-01T12:00:00.000Z' },
        ),
      ).not.toThrow();
      const row = handle.get<{ n: number }>('SELECT COUNT(*) AS n FROM ephemeral_result');
      expect(row?.n).toBe(1);
    });
  });
});

describe('attach guard — dynamic PRAGMA database_list check', () => {
  it('passes on a clean connection', async () => {
    await withTempEphemeralDatabase(({ ephemeralPath }) => {
      const raw = new DatabaseConstructor(ephemeralPath);
      try {
        expect(() => assertNoAttachedDatabases(raw)).not.toThrow();
      } finally {
        raw.close();
      }
    });
  });

  it('rejects a connection that really has another database attached', async () => {
    await withTempEphemeralDatabase(({ ephemeralPath, appPath }) => {
      const raw = new DatabaseConstructor(ephemeralPath);
      try {
        raw.exec(`ATTACH DATABASE '${appPath.replace(/\\/g, '/')}' AS app`);
        expect(() => assertNoAttachedDatabases(raw)).toThrowError(/EPHEMERAL_ATTACHED_DATABASE/);
      } finally {
        raw.close();
      }
    });
  });
});

describe('the public handle exposes no raw connection', () => {
  it('has no sqlite/prepare/exec property', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      expect('sqlite' in handle).toBe(false);
      expect('prepare' in handle).toBe(false);
      expect('exec' in handle).toBe(false);
      expect(Object.keys(handle).sort()).toEqual(['all', 'checkpoint', 'close', 'get', 'path', 'run']);
    });
  });
});
