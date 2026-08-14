/**
 * DATA-08 test harness (ticket Test plan step 2).
 *
 * Wraps DATA-01's `withTempDir` and opens the ephemeral database at `<dir>/ephemeral.sqlite`, while
 * also handing the test an `<dir>/app.sqlite` path in the *same* directory so the attach and glob
 * tests are realistic. The handle is closed in a `finally` before the directory is removed —
 * on Windows an unlink of a file still held open fails with EBUSY.
 *
 * No key literal is written to any file: the registry is built from `randomKeyConfig`.
 */
import { loadKeyRegistry, type KeyRegistry } from '../../src/crypto/keys.js';
import { openEphemeralDatabase, type EphemeralDatabaseHandle } from '../../src/ephemeral/connection.js';
import { withTempDir } from '../migrate/helpers.js';
import { canary, randomKeyConfig } from '../crypto/helpers.js';
import { join } from 'node:path';

export { canary, randomKeyConfig };
export { withTempDir };

export interface EphemeralFixture {
  readonly handle: EphemeralDatabaseHandle;
  readonly registry: KeyRegistry;
  readonly ephemeralPath: string;
  /** A sibling path in the same directory. The file is NOT created unless a test creates it. */
  readonly appPath: string;
  readonly dir: string;
}

export async function withTempEphemeralDatabase<T>(
  fn: (fixture: EphemeralFixture) => Promise<T> | T,
): Promise<T> {
  return withTempDir(async (dir) => {
    const ephemeralPath = join(dir, 'ephemeral.sqlite');
    const handle = openEphemeralDatabase({ path: ephemeralPath });
    try {
      return await fn({
        handle,
        registry: loadKeyRegistry(randomKeyConfig('ACTIVE')),
        ephemeralPath,
        appPath: join(dir, 'app.sqlite'),
        dir,
      });
    } finally {
      handle.close();
    }
  });
}

/** A fixed base instant, so every expiry assertion is exact and no test sleeps. */
export const BASE_INSTANT = Date.parse('2026-03-01T12:00:00.000Z');

export function at(offsetMs: number): Date {
  return new Date(BASE_INSTANT + offsetMs);
}
