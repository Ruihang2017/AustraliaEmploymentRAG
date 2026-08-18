/**
 * DATA-04's test harness.
 *
 * Construction pattern copied from `test/tenant/helpers.ts` rather than reinvented — a real temp
 * file (never `:memory:`: WAL and file locking, which the last-Owner concurrency criterion is
 * actually about, do not exist for an in-memory database), every handle closed before the temp
 * directory is removed or Windows fails the unlink with EBUSY.
 *
 * The difference from DATA-02's harness is that there is no throwaway schema any more: the eight
 * PRD §35.4 tables are real, created by `migrations/*_tenancy.sql`, and every test runs against the
 * shipped migration sequence.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadKeyRegistry } from '../../src/crypto/keys.js';
import type { KeyRegistry } from '../../src/crypto/keys.js';
import { runMigrations } from '../../src/migrate/runner.js';
import { openAppDatabase } from '../../src/tenant/connection.js';
import type { AppDatabaseHandle } from '../../src/tenant/connection.js';
import { systemContext, tenantContextFromSession } from '../../src/tenant/context.js';
import type { TenantContext } from '../../src/tenant/context.js';
import type { Principal } from '../../src/tenant/domain.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
/** `packages/database` */
export const PACKAGE_ROOT = join(THIS_DIR, '..', '..');
/** `packages/database/migrations` — the real, shipped directory. */
export const REPO_MIGRATIONS_DIR = join(PACKAGE_ROOT, 'migrations');
/** `packages/database/test/tenancy` */
export const TENANCY_TEST_DIR = THIS_DIR;

export const ORG_A = 'org-aaaaaaaaaaaaaaaaaaaa';
export const ORG_B = 'org-bbbbbbbbbbbbbbbbbbbb';

export interface TenancyHarness {
  readonly db: AppDatabaseHandle;
  readonly databasePath: string;
  readonly dir: string;
  readonly registry: KeyRegistry;
}

/** A deterministic 32-byte key. Test material only; never a production secret shape. */
const TEST_KEY_MATERIAL = Buffer.alloc(32, 7).toString('base64');

export function testKeyRegistry(): KeyRegistry {
  return loadKeyRegistry({ keys: [{ keyId: 'k1', material: TEST_KEY_MATERIAL, state: 'ACTIVE' }] });
}

/**
 * Migrates a fresh database to head, opens it through the real `openAppDatabase` and hands the
 * handle to `fn`.
 *
 * `openAppDatabase` rather than a bare `new Database(...)` because the pragmas it applies —
 * `foreign_keys` above all — are part of what several of these tests assert.
 */
export async function withTenancyDatabase<T>(
  fn: (harness: TenancyHarness) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'taxrag-tenancy-'));
  const databasePath = join(dir, 'app.sqlite');
  try {
    await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
    const db = openAppDatabase({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
    try {
      return await fn({ db, databasePath, dir, registry: testKeyRegistry() });
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

export function principal(organizationId: string, id = 'user-1'): Principal {
  return {
    kind: 'USER',
    id,
    organizationId,
    role: 'ADMIN',
    grants: ['RESEARCH_RECORD_READ_WRITE_OWN', 'ANSWER_CREATE'],
    scopes: [],
  };
}

/** A tenant context for `organizationId`, built through the real PRD §16.5 factory. */
export function contextFor(organizationId: string, requestId = 'req-1'): TenantContext {
  return tenantContextFromSession(principal(organizationId), organizationId, requestId);
}

/** The GLOBAL-table context (`user`, `actor`). */
export function globalContext(requestId = 'req-1'): TenantContext {
  return systemContext('GLOBAL', requestId);
}
