import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { openEphemeralDatabase, internalSqlite } from '../../src/ephemeral/connection.js';
import { EPHEMERAL_TABLE_NAMES } from '../../src/ephemeral/schema.js';
import { withTempEphemeralDatabase, withTempDir } from './helpers.js';
import { join } from 'node:path';

function tableNames(handle: Parameters<typeof internalSqlite>[0]): string[] {
  return handle
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((row) => row.name)
    .filter((name) => !name.startsWith('sqlite_'));
}

describe('openEphemeralDatabase', () => {
  it('creates the file at the given path, distinct from a sibling app.sqlite', async () => {
    await withTempEphemeralDatabase(({ handle, ephemeralPath, appPath }) => {
      expect(existsSync(ephemeralPath)).toBe(true);
      expect(existsSync(appPath)).toBe(false);
      expect(handle.path).not.toBe(appPath);
    });
  });

  it('contains exactly the three ephemeral tables and no app table', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      expect(tableNames(handle)).toEqual([...EPHEMERAL_TABLE_NAMES]);
    });
  });

  it('applies APP_SQLITE_PRAGMAS (wal journal mode, foreign keys on)', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      const journal = handle.get<{ journal_mode: string }>('PRAGMA journal_mode');
      expect(journal?.journal_mode.toLowerCase()).toBe('wal');
      const foreignKeys = handle.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
      expect(foreignKeys?.foreign_keys).toBe(1);
    });
  });

  it('is idempotent: reopening the same path adds no table and does not throw', async () => {
    await withTempDir((dir) => {
      const path = join(dir, 'ephemeral.sqlite');
      const first = openEphemeralDatabase({ path });
      try {
        first.run("INSERT INTO ephemeral_result (job_id, organization_ref, created_at) VALUES ('j','o','2026-03-01T12:00:00.000Z')");
      } finally {
        first.close();
      }
      const second = openEphemeralDatabase({ path });
      try {
        expect(tableNames(second)).toEqual([...EPHEMERAL_TABLE_NAMES]);
        const row = second.get<{ n: number }>('SELECT COUNT(*) AS n FROM ephemeral_result');
        expect(row?.n).toBe(1);
      } finally {
        second.close();
      }
    });
  });

  it('rejects an empty path', () => {
    expect(() => openEphemeralDatabase({ path: '' })).toThrowError(/EPHEMERAL_INPUT_INVALID/);
  });

  it('close() is idempotent and further use throws EPHEMERAL_STORE_CLOSED', async () => {
    await withTempDir((dir) => {
      const handle = openEphemeralDatabase({ path: join(dir, 'ephemeral.sqlite') });
      handle.close();
      handle.close();
      expect(() => handle.run('SELECT 1')).toThrowError(/EPHEMERAL_STORE_CLOSED/);
      expect(() => internalSqlite(handle)).toThrowError(/EPHEMERAL_STORE_CLOSED/);
    });
  });
});
