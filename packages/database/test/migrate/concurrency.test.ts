import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { runMigrations } from '../../src/migrate/runner.js';
import { CLI_PATH, PACKAGE_ROOT, withTempMigrations } from './helpers.js';

interface Finished {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Starts a CLI migrate; the promise settles when the process exits. Never awaited before both start. */
function startMigrate(databasePath: string, migrationsDir: string): Promise<Finished> {
  const child = spawn(
    process.execPath,
    [CLI_PATH, 'migrate', '--database', databasePath, '--migrations', migrationsDir],
    { cwd: PACKAGE_ROOT },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function ledgerNames(databasePath: string): string[] {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db
      .prepare<[], { name: string }>('select name from schema_migration order by name')
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

/*
 * DATA-10 — this file asserts the framework's locking behaviour, not the repository's inventory.
 * Both tests run against the `slow` fixture through `withTempMigrations`, whose corpus is
 * `0001_baseline.sql` plus `fixtures/slow/` and nothing else — closed by construction since
 * DATA-10, when the harness stopped copying the whole real `migrations/` directory in. The
 * four-name ledger and the length-4 assertion below are therefore exact facts about that fixture,
 * and adding a repository migration cannot move them. Keep them exact.
 */
describe('two migrators starting together (PRD §39.1/§39.4)', () => {
  it(
    'produces exactly one ledger row per migration and no unhandled SQLITE_BUSY',
    async () => {
      await withTempMigrations('slow', async ({ migrationsDir, databasePath }) => {
        // Both processes are started before either is awaited, so they genuinely overlap. The
        // fixture migrations each insert 40k rows precisely so the window is real: a "second run
        // returns empty" assertion would pass even when the two runs never met.
        const first = startMigrate(databasePath, migrationsDir);
        const second = startMigrate(databasePath, migrationsDir);
        const results = await Promise.all([first, second]);

        for (const [index, result] of results.entries()) {
          expect(result.status, `process ${index} stderr: ${result.stderr}`).toBe(0);
          expect(result.stderr).not.toContain('SQLITE_BUSY');
          expect(result.stderr).not.toContain('already exists');
        }

        const names = ledgerNames(databasePath);
        expect(names).toEqual([
          '0001_baseline.sql',
          '20260803120001_bulk-one.sql',
          '20260803120002_bulk-two.sql',
          '20260803120003_bulk-three.sql',
        ]);
        // One row per migration — not two, which is what a check performed outside the transaction
        // would produce.
        expect(new Set(names).size).toBe(names.length);

        // Between them, the two runs applied each migration exactly once.
        const appliedCount = results
          .map((result) => (result.stdout.match(/^ {2}\+ /gm) ?? []).length)
          .reduce((total, count) => total + count, 0);
        expect(appliedCount).toBe(names.length);

        // And the schema really is at head, not merely recorded as such.
        const db = new Database(databasePath, { readonly: true });
        try {
          for (const table of ['fixture_bulk_one', 'fixture_bulk_two', 'fixture_bulk_three']) {
            expect(
              db.prepare<[], { n: number }>(`select count(*) as n from ${table}`).get()?.n,
            ).toBe(40000);
          }
        } finally {
          db.close();
        }
      });
    },
    120_000,
  );

  it(
    'an in-process second run against an already-migrating database still converges',
    async () => {
      await withTempMigrations('slow', async ({ migrationsDir, databasePath }) => {
        const child = startMigrate(databasePath, migrationsDir);
        const local = runMigrations({ databasePath, migrationsDir });
        const [childResult, report] = await Promise.all([child, local]);

        expect(childResult.status, childResult.stderr).toBe(0);
        expect(ledgerNames(databasePath)).toHaveLength(4);
        expect(report.head).toBe('20260803120003_bulk-three.sql');
      });
    },
    120_000,
  );
});
