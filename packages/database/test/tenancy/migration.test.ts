/**
 * DATA-04 acceptance item 15 — migration hygiene for the new file.
 *
 * Its name matches DATA-01's `MIGRATION_FILENAME` with the `tenancy` group suffix, it declares the
 * expand phase, it passes `assertExpandOnly`, it adds exactly one ledger row, and re-running the
 * runner is a no-op.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIGRATION_FILENAME, parseMigrationFilename } from '../../src/migrate/naming.js';
import { assertExpandOnly, parseMigrationHeader } from '../../src/migrate/policy.js';
import { migrationStatus, runMigrations } from '../../src/migrate/runner.js';

import { REPO_MIGRATIONS_DIR } from './helpers.js';
import { withTempDatabase } from '../migrate/helpers.js';

function tenancyMigrations(): string[] {
  return readdirSync(REPO_MIGRATIONS_DIR).filter((name) => name.endsWith('_tenancy.sql'));
}

describe('DATA-04 migration hygiene', () => {
  it('ships exactly one tenancy migration, correctly named', () => {
    const files = tenancyMigrations();
    expect(files).toHaveLength(1);
    const name = files[0] as string;
    expect(MIGRATION_FILENAME.test(name)).toBe(true);
    expect(parseMigrationFilename(name).group).toBe('tenancy');
  });

  it('declares the expand phase and passes assertExpandOnly', () => {
    const name = tenancyMigrations()[0] as string;
    const sql = readFileSync(join(REPO_MIGRATIONS_DIR, name), 'utf8');
    const header = parseMigrationHeader(sql, name);
    expect(header.phase).toBe('expand');
    expect(header.expandedIn).toBeUndefined();
    expect(() => assertExpandOnly(sql, { name, phase: 'expand' })).not.toThrow();
  });

  it('adds exactly one ledger row and is idempotent on a second run', async () => {
    await withTempDatabase(async (databasePath) => {
      const first = await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
      const applied = first.applied.map((entry) => entry.name);
      expect(applied.filter((name) => name.endsWith('_tenancy.sql'))).toHaveLength(1);

      const status = migrationStatus(databasePath, REPO_MIGRATIONS_DIR);
      expect(status.pending).toEqual([]);
      expect(status.applied.filter((entry) => entry.name.endsWith('_tenancy.sql'))).toHaveLength(1);

      const second = await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
      expect(second.applied).toEqual([]);
    });
  });
});
