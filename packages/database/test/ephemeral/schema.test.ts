import { describe, expect, it } from 'vitest';

import {
  EPHEMERAL_COLUMNS,
  EPHEMERAL_TABLES,
  EPHEMERAL_TABLE_NAMES,
} from '../../src/ephemeral/schema.js';
import { withTempEphemeralDatabase } from './helpers.js';

/**
 * PRD §35.7: "It contains no identity beyond an opaque job/organisation reference." Asserted as a
 * literal expectation, not as a rule derived from the code under test.
 */
const IDENTITY_DENYLIST = [
  'organization_id',
  'user_id',
  'email',
  'actor_id',
  'ip_address',
  'ip',
  'record_id',
  'record_version_id',
  'session_id',
  'api_key_id',
];

describe('ensureEphemeralSchema', () => {
  it('creates exactly the three PRD §35.7 tables', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      const names = handle
        .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((row) => row.name)
        .filter((name) => !name.startsWith('sqlite_'))
        .sort();
      expect(names).toEqual([
        'ephemeral_evidence',
        'ephemeral_job_content',
        'ephemeral_result',
      ]);
      expect([...EPHEMERAL_TABLE_NAMES]).toEqual(names);
      expect(Object.values(EPHEMERAL_TABLES).slice().sort()).toEqual(names);
    });
  });

  for (const table of ['ephemeral_job_content', 'ephemeral_evidence', 'ephemeral_result']) {
    it(`${table} has exactly the literal column set and no identity column`, async () => {
      await withTempEphemeralDatabase(({ handle }) => {
        const columns = handle
          .all<{ name: string }>(`PRAGMA table_info(${table})`)
          .map((row) => row.name)
          .sort();
        expect(columns).toEqual([
          'created_at',
          'expires_at',
          'job_id',
          'organization_ref',
          'payload_ciphertext',
          'terminal_at',
        ]);
        expect(columns).toEqual([...EPHEMERAL_COLUMNS]);
        expect(columns.filter((name) => IDENTITY_DENYLIST.includes(name))).toEqual([]);
      });
    });
  }

  it('keys every table by job_id and stores the payload as a nullable BLOB', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      for (const table of EPHEMERAL_TABLE_NAMES) {
        const info = handle.all<{ name: string; type: string; pk: number; notnull: number }>(
          `PRAGMA table_info(${table})`,
        );
        const byName = new Map(info.map((row) => [row.name, row]));
        expect(byName.get('job_id')?.pk).toBe(1);
        expect(byName.get('organization_ref')?.notnull).toBe(1);
        expect(byName.get('payload_ciphertext')?.type).toBe('BLOB');
        // NULL is the tombstone: the payload column must be nullable.
        expect(byName.get('payload_ciphertext')?.notnull).toBe(0);
        expect(byName.get('created_at')?.notnull).toBe(1);
        expect(byName.get('terminal_at')?.notnull).toBe(0);
        expect(byName.get('expires_at')?.notnull).toBe(0);
      }
    });
  });

  it('rejects a non-UTC-ISO created_at through the column CHECK', async () => {
    await withTempEphemeralDatabase(({ handle }) => {
      expect(() =>
        handle.run(
          'INSERT INTO ephemeral_result (job_id, organization_ref, created_at) VALUES (:j, :o, :c)',
          { j: 'j1', o: 'o1', c: 'not-a-timestamp' },
        ),
      ).toThrowError();
    });
  });
});
