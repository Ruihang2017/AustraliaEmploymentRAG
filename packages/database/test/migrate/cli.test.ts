import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MIGRATION_FILENAME } from '../../src/migrate/naming.js';
import { CLI_PATH, PACKAGE_ROOT, withTempDir, withTempMigrations } from './helpers.js';

function cli(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/*
 * DATA-10 — this file asserts the CLI's output shape, not the repository's inventory. Every test
 * below runs against `withTempMigrations`, whose corpus is `0001_baseline.sql` plus
 * `fixtures/<name>/` and nothing else — closed by construction since DATA-10, when the harness
 * stopped copying the whole real `migrations/` directory in. The exact counts and filenames here
 * (`pending:  3`, `head:     20260803130000_beta.sql`) are therefore facts about that fixture, and
 * adding a migration to the repository cannot move them. They are exact on purpose: do not loosen
 * them to ranges or substrings.
 */
describe('the db:* scripts (DATA-01 deliverable 11, PRD §20.3)', () => {
  it('db:migrate applies the pending migrations and prints the head', async () => {
    await withTempMigrations('good', ({ migrationsDir, databasePath }) => {
      const result = cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('+ 0001_baseline.sql [expand]');
      expect(result.stdout).toContain('+ 20260803120000_alpha.sql [expand]');
      expect(result.stdout).toContain('head:     20260803130000_beta.sql');
      expect(existsSync(databasePath)).toBe(true);
    });
  });

  it('db:migrate is a no-op on a second invocation', async () => {
    await withTempMigrations('good', ({ migrationsDir, databasePath }) => {
      expect(cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]).status).toBe(
        0,
      );
      const second = cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain('applied:  none (already up to date)');
    });
  });

  it('db:status prints head, applied count and the pending list', async () => {
    await withTempMigrations('good', ({ migrationsDir, databasePath }) => {
      const before = cli(['status', '--database', databasePath, '--migrations', migrationsDir]);
      expect(before.status, before.stderr).toBe(0);
      expect(before.stdout).toContain('head:     <none>');
      expect(before.stdout).toContain('pending:  3');

      cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);

      const after = cli(['status', '--database', databasePath, '--migrations', migrationsDir]);
      expect(after.status, after.stderr).toBe(0);
      expect(after.stdout).toContain('applied:  3');
      expect(after.stdout).toContain('pending:  none');
      expect(after.stdout).toContain('head:     20260803130000_beta.sql');
    });
  });

  it('db:new tenancy prints and creates a policy-conforming filename', async () => {
    await withTempMigrations(
      'good',
      ({ migrationsDir }) => {
        const result = cli(['new', 'tenancy', '--migrations', migrationsDir]);
        expect(result.status, result.stderr).toBe(0);
        const [name] = result.stdout.split(/\r?\n/);
        expect(name, result.stdout).toBeTruthy();
        expect(MIGRATION_FILENAME.test(name as string)).toBe(true);
        expect(name).toMatch(/^\d{14}_tenancy\.sql$/);

        const created = readFileSync(join(migrationsDir, name as string), 'utf8');
        expect(created).toContain('-- aer:phase expand');
      },
      { withBaseline: false },
    );
  });

  it('db:new refuses a group that breaks the filename policy', async () => {
    await withTempDir((dir) => {
      const result = cli(['new', 'Tenancy', '--migrations', dir]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('INVALID_MIGRATION_GROUP');
    });
  });

  it('exits non-zero and names the code when a migration is tampered with', async () => {
    await withTempMigrations('good', ({ migrationsDir, databasePath }) => {
      cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);
      const alpha = join(migrationsDir, '20260803120000_alpha.sql');
      const text = readFileSync(alpha, 'utf8');
      writeFileSync(alpha, `${text}\n-- tampered\n`, 'utf8');
      const result = cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CHECKSUM_MISMATCH');
    });
  });

  it('exits non-zero when the expand/contract gate defers a migration, and still applies the rest', async () => {
    // The runner reports a refused contract migration instead of throwing, so that an unrelated
    // migration in the same batch still lands. The exit code is therefore the ONLY thing standing
    // between "one migration was deliberately withheld" and a release script reporting success.
    await withTempMigrations('contract-mixed', ({ migrationsDir, databasePath }) => {
      const result = cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CONTRACT_IN_SAME_RUN');
      expect(result.stderr).toContain('database is NOT at head');
      // The unrelated expand migration was still applied.
      expect(result.stdout).toContain('+ 20260803140000_gamma.sql [expand]');

      // The second invocation clears the deferral and therefore exits 0.
      const second = cli(['migrate', '--database', databasePath, '--migrations', migrationsDir]);
      expect(second.status, second.stderr).toBe(0);
      expect(second.stdout).toContain('+ 20260803130000_alpha-contract.sql [contract]');
    });
  });

  it('exits 2 on an unknown command and 0 on --help', () => {
    expect(cli(['no-such-command']).status).toBe(2);
    expect(cli(['--help']).status).toBe(0);
  });
});
