/**
 * DATA-02's test harness (ticket Test plan steps 2 and 3).
 *
 * Construction pattern copied from `test/migrate/helpers.ts` rather than reinvented: a real temp file
 * (never `:memory:` — WAL and locking, which the concurrency criterion is actually about, do not
 * exist for an in-memory database), and every handle closed before the temp directory is removed or
 * Windows fails the unlink with EBUSY.
 *
 * No application table exists yet — `DATA-04`…`DATA-07` own the schema — so the repository tests run
 * against three throwaway tables created here, each with a hand-built `TableSpec`. The composite
 * foreign key in `t_child` is built **from the shipped `tenantForeignKey()`**, not hand-typed, so the
 * cross-tenant FK test proves the helper `DATA-04`…`DATA-07` will actually use.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TableSpec } from '../../src/migrate/manifest.js';
import { runMigrations } from '../../src/migrate/runner.js';
import { openAppDatabase } from '../../src/tenant/connection.js';
import type { AppDatabaseHandle } from '../../src/tenant/connection.js';
import { tenantContextFromSession } from '../../src/tenant/context.js';
import type { TenantContext } from '../../src/tenant/context.js';
import { tenantForeignKey, tenantUnique } from '../../src/tenant/keys.js';
import type { Principal } from '../../src/tenant/domain.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
/** `packages/database` */
export const PACKAGE_ROOT = join(THIS_DIR, '..', '..');
/** `packages/database/migrations` — the real, shipped directory. */
export const REPO_MIGRATIONS_DIR = join(PACKAGE_ROOT, 'migrations');

export const ORG_A = 'org-aaaaaaaaaaaaaaaaaaaa';
export const ORG_B = 'org-bbbbbbbbbbbbbbbbbbbb';

/** TENANT, mutable — the ordinary case. */
export const PARENT_SPEC = {
  name: 't_parent',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: ['id', 'organization_id', 'label'],
} satisfies TableSpec;

/** TENANT, append-only — PRD §35.8 invariant 5, and the child half of the composite FK. */
export const CHILD_SPEC = {
  name: 't_child',
  scope: 'TENANT',
  mutability: 'APPEND_ONLY',
  requiredColumns: ['id', 'organization_id', 'parent_id'],
} satisfies TableSpec;

/** GLOBAL — the `detected_change` shape of PRD §35.6: a public-source event, not tenant content. */
export const GLOBAL_SPEC = {
  name: 't_global',
  scope: 'GLOBAL',
  mutability: 'APPEND_ONLY',
  requiredColumns: ['id', 'source'],
} satisfies TableSpec;

/** A TENANT table declared without `organization_id` — the shape the factory must refuse. */
export const UNSCOPED_SPEC = {
  name: 't_unscoped',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: ['id', 'label'],
} satisfies TableSpec;

export const CHILD_FOREIGN_KEY = tenantForeignKey({
  childTable: 't_child',
  parentTable: 't_parent',
  column: 'parent_id',
});

/**
 * The throwaway schema, built from the shipped key helpers.
 *
 * `t_parent` carries the parent-side `UNIQUE (organization_id, id)` that SQLite requires before it
 * will accept the composite reference at all — without it the child insert fails with "foreign key
 * mismatch" regardless of the organisations involved, which would make the FK test pass for the
 * wrong reason.
 */
export const THROWAWAY_SCHEMA = `
CREATE TABLE t_parent (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  ${CHILD_FOREIGN_KEY.parentConstraint},
  ${tenantUnique(['label'])}
);
CREATE TABLE t_child (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  note TEXT,
  ${CHILD_FOREIGN_KEY.childConstraint}
);
CREATE TABLE t_global (
  id TEXT NOT NULL PRIMARY KEY,
  source TEXT NOT NULL
);
`;

export interface TenantHarness {
  readonly db: AppDatabaseHandle;
  readonly databasePath: string;
  readonly dir: string;
}

/**
 * Migrates a fresh database, opens it through the real `openAppDatabase`, adds the throwaway tables
 * and hands the handle to `fn`.
 *
 * `openAppDatabase` — not a bare `new Database(...)` — because the pragmas it applies (`foreign_keys`
 * above all) are part of what is under test.
 */
export async function withTenantDatabase<T>(
  fn: (harness: TenantHarness) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'taxrag-tenant-'));
  const databasePath = join(dir, 'app.sqlite');
  try {
    await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
    const db = openAppDatabase({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
    try {
      db.sqlite.exec(THROWAWAY_SCHEMA);
      return await fn({ db, databasePath, dir });
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
