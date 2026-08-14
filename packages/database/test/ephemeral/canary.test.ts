import { existsSync, readFileSync } from 'node:fs';
import { inspect } from 'node:util';

import { describe, expect, it } from 'vitest';

import { EPHEMERAL_KINDS } from '../../src/ephemeral/schema.js';
import { createEphemeralStore } from '../../src/ephemeral/store.js';
import { at, canary, withTempEphemeralDatabase } from './helpers.js';

/**
 * PRD §37.3: no plaintext research content may be recoverable from the file bytes. The database is
 * checkpointed and **closed** before the bytes are read — on Windows a still-open handle also makes
 * the temp-directory cleanup fail with EBUSY.
 */
describe('canary', () => {
  it('never appears in the raw ephemeral.sqlite / -wal / -shm bytes', async () => {
    await withTempEphemeralDatabase(({ handle, registry, ephemeralPath }) => {
      const store = createEphemeralStore({ handle, registry });
      const canaries = EPHEMERAL_KINDS.map((kind) => {
        const value = canary();
        store.putEphemeral(kind, {
          jobId: `job-${kind}`,
          organizationRef: 'org-ref-1',
          payload: value,
          createdAt: at(0),
        });
        return value;
      });

      // Sanity: the payloads really are readable through the store, so the test is not vacuous.
      for (const [index, kind] of EPHEMERAL_KINDS.entries()) {
        expect(store.getEphemeral(kind, `job-${kind}`, at(60_000))).toEqual({
          status: 'PRESENT',
          payload: canaries[index],
        });
      }

      handle.checkpoint();
      handle.close();

      for (const suffix of ['', '-wal', '-shm']) {
        const path = `${ephemeralPath}${suffix}`;
        // After a TRUNCATE checkpoint the WAL siblings may be absent or zero-length.
        if (!existsSync(path)) continue;
        const bytes = readFileSync(path);
        for (const value of canaries) {
          expect(bytes.includes(Buffer.from(value, 'utf8'))).toBe(false);
        }
      }
    });
  });

  it('never appears in any error this module throws', async () => {
    await withTempEphemeralDatabase(({ handle, registry }) => {
      const store = createEphemeralStore({ handle, registry });
      const value = canary();
      const errors: unknown[] = [];
      const capture = (fn: () => unknown): void => {
        try {
          fn();
        } catch (error) {
          errors.push(error);
        }
      };

      capture(() =>
        store.putEphemeral('RESULT', {
          jobId: '',
          organizationRef: 'org',
          payload: value,
          createdAt: at(0),
        }),
      );
      capture(() =>
        store.putEphemeral('RESULT', {
          jobId: 'j',
          organizationRef: 'org',
          payload: value,
          createdAt: new Date('nope'),
        }),
      );
      capture(() => handle.run(`ATTACH DATABASE '${value}' AS x`));
      capture(() => handle.run(`SELECT :p`, { p: value }));

      expect(errors.length).toBeGreaterThanOrEqual(3);
      for (const error of errors) {
        expect(JSON.stringify(error)).not.toContain(value);
        expect(String(error)).not.toContain(value);
        expect(inspect(error, { depth: 8 })).not.toContain(value);
      }
    });
  });
});
