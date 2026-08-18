import Database from 'better-sqlite3';
import { appendFileSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MigrationError } from '../../src/migrate/errors.js';
import { parseMigrationHeader } from '../../src/migrate/policy.js';
import {
  assertSchemaUpToDate,
  migrationChecksum,
  migrationStatus,
  runMigrations,
} from '../../src/migrate/runner.js';
import {
  REPO_MIGRATIONS_DIR,
  fixture,
  repoMigrationNames,
  withTempDatabase,
  withTempMigrations,
} from './helpers.js';

/*
 * DATA-10 — this suite asserts the migration framework's properties, not the repository's
 * inventory. Two rules, and they are the whole of it:
 *
 *   1. A test that runs against REPO_MIGRATIONS_DIR derives its expectation from the directory
 *      listing at run time (`repoMigrationNames()`), so it holds for one migration and for fifty.
 *   2. Every other test runs against `withTempMigrations`, whose corpus is `0001_baseline.sql`
 *      plus `fixtures/<name>/` and nothing else — closed by construction since DATA-10. Its
 *      filename literals are therefore exact by construction and must NOT be loosened.
 *
 * Properties this file proves, and the `it(` that proves each (ticket deliverable 5):
 *
 *   | Property                                                   | Test                          |
 *   |------------------------------------------------------------|-------------------------------|
 *   | Shipped corpus applied in order; head is the last entry     | 'migrates a clean temp …'     |
 *   | Ledger: one row per migration, checksum of that file's      | 'migrates a clean temp …'     |
 *   |   bytes, ISO applied_at, integer duration, run_id, phase    |                               |
 *   | WAL journal mode                                            | 'applies the WAL journal …'   |
 *   | Idempotence: second run applies nothing, head+ledger stand  | 'is idempotent …'             |
 *   | Tamper detection (CHECKSUM_MISMATCH) before applying        | 'aborts with CHECKSUM_… '     |
 *   | CRLF/LF and BOM insensitivity of the checksum               | 'ignores a CRLF/LF …'         |
 *   | Missing already-applied migration refused                   | 'refuses to run when …'       |
 *   | Out-of-order arrival applied and flagged                    | 'applies a late-arriving …'   |
 *   | Bad filename rejected, not skipped                          | 'rejects a directory entry …' |
 *   | Duplicate ordering prefix rejected                          | 'rejects two migrations …'    |
 *   | Expand/contract same-run refusal; mixed batch; later run;    | the four 'refuses/applies …'  |
 *   |   expand-never-applied                                      |   tests in that describe      |
 *   | `deferred` empty when nothing is refused                    | 'leaves `deferred` empty …'   |
 *   | Destructive construct rejected in an expand migration       | 'refuses an expand migration…'|
 *   | Recovery point required / recorded / provider failure       | the three 'recovery point'    |
 *   | migrationStatus pending list; partial-run head;              | the three 'migrationStatus'   |
 *   |   assertSchemaUpToDate names the pending file                |   tests                       |
 *   | DROP INDEX uniqueness read from the live database (4 cases) | the 'DROP INDEX' describe     |
 *   | Fixtures kept out of the shipped migrations directory       | 'leaves fixtures/ out …'      |
 */

interface LedgerRow {
  name: string;
  checksum: string;
  applied_at: string;
  duration_ms: number;
  run_id: string;
  phase: string;
}

/** Opens, reads and immediately closes — Windows refuses to unlink a file that is still open. */
function ledger(databasePath: string): LedgerRow[] {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db
      .prepare<[], LedgerRow>('select * from schema_migration order by name')
      .all();
  } finally {
    db.close();
  }
}

function tableNames(databasePath: string): string[] {
  const db = new Database(databasePath, { readonly: true });
  try {
    return db
      .prepare<[], { name: string }>(
        "select name from sqlite_master where type = 'table' order by name",
      )
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('runMigrations against the shipped migrations directory', () => {
  it('migrates a clean temp database from empty to head and records a ledger row per migration', async () => {
    await withTempDatabase(async (databasePath) => {
      // The expectation is the directory listing, computed independently of the runner (see
      // `repoMigrationNames`). Ordered equality: order IS the property here.
      const names = repoMigrationNames();
      const report = await runMigrations({
        databasePath,
        migrationsDir: REPO_MIGRATIONS_DIR,
      });

      expect(report.applied.map((migration) => migration.name)).toEqual(names);
      expect(report.head).toBe(names.at(-1));
      expect(report.outOfOrder).toEqual([]);
      // Nothing is deferred on a fresh database today. A repository contract migration whose expand
      // landed in this SAME run would legitimately defer and make `applied` a strict prefix of the
      // listing; none exists, and the `contract` / `contract-mixed` fixtures are what prove the
      // deferral behaviour. If that day comes, derive this from the phases — do not loosen it now.
      expect(report.deferred).toEqual([]);
      expect(report.recoveryPoint).toBeNull();
      expect(report.runId).toMatch(UUID);

      const rows = ledger(databasePath);
      // One row per file, in order — strictly stronger than the row count this used to assert.
      expect(rows.map((row) => row.name)).toEqual(names);
      for (const row of rows) {
        const sql = readFileSync(join(REPO_MIGRATIONS_DIR, row.name), 'utf8');
        expect(row.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(row.checksum).toBe(migrationChecksum(sql));
        expect(row.applied_at).toMatch(ISO_UTC);
        expect(Number.isInteger(row.duration_ms)).toBe(true);
        expect(row.duration_ms).toBeGreaterThanOrEqual(0);
        expect(row.run_id).toBe(report.runId);
        // Derived from the file's own header, not the literal 'expand' — which would re-pin the
        // repository to containing no contract migration.
        expect(row.phase).toBe(parseMigrationHeader(sql, row.name).phase);
      }
    });
  });

  it('applies the WAL journal mode the pragmas define', async () => {
    await withTempDatabase(async (databasePath) => {
      await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
      const db = new Database(databasePath);
      try {
        expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
      } finally {
        db.close();
      }
    });
  });

  it('is idempotent — a second run applies nothing', async () => {
    await withTempDatabase(async (databasePath) => {
      await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
      const second = await runMigrations({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });

      const names = repoMigrationNames();
      expect(second.applied).toEqual([]);
      expect(second.head).toBe(names.at(-1));
      // The second run changed neither the head nor the ledger — compared by the whole ordered
      // name list, not by a row count.
      expect(ledger(databasePath).map((row) => row.name)).toEqual(names);
    });
  });
});

describe('tamper detection', () => {
  it('aborts with CHECKSUM_MISMATCH before applying any pending migration', async () => {
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      // Apply baseline + alpha, leaving beta out of the first run.
      const betaName = '20260803130000_beta.sql';
      const betaPath = join(migrationsDir, betaName);
      const beta = readFileSync(betaPath, 'utf8');
      rmSync(betaPath);

      const first = await runMigrations({ databasePath, migrationsDir });
      expect(first.applied.map((migration) => migration.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);

      // Tamper with an already-applied file, and make a genuinely pending one available.
      appendFileSync(join(migrationsDir, '20260803120000_alpha.sql'), '\n-- tampered\n', 'utf8');
      writeFileSync(betaPath, beta, 'utf8');

      let thrown: unknown;
      try {
        await runMigrations({ databasePath, migrationsDir });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(MigrationError);
      expect((thrown as MigrationError).code).toBe('CHECKSUM_MISMATCH');
      expect((thrown as MigrationError).name_).toBe('20260803120000_alpha.sql');

      // The pending migration must NOT have been applied.
      expect(ledger(databasePath).map((row) => row.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);
      expect(tableNames(databasePath)).not.toContain('fixture_beta');
    });
  });

  it('ignores a CRLF/LF difference, which is a checkout artifact and not tampering', () => {
    const lf = '-- aer:phase expand\nCREATE TABLE t (id TEXT PRIMARY KEY);\n';
    const crlf = lf.split('\n').join('\r\n');
    const bom = String.fromCharCode(0xfeff) + lf;
    expect(migrationChecksum(crlf)).toBe(migrationChecksum(lf));
    expect(migrationChecksum(bom)).toBe(migrationChecksum(lf));
    expect(migrationChecksum(`${lf}-- different\n`)).not.toBe(migrationChecksum(lf));
  });

  it('refuses to run when an applied migration file has disappeared', async () => {
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      await runMigrations({ databasePath, migrationsDir });
      rmSync(join(migrationsDir, '20260803120000_alpha.sql'));
      await expect(runMigrations({ databasePath, migrationsDir })).rejects.toThrowError(
        expect.objectContaining({ code: 'MIGRATION_FILE_MISSING' }),
      );
    });
  });
});

describe('ordering and out-of-order arrival (breakdown plan A5)', () => {
  it('applies a late-arriving earlier migration and flags it in the report', async () => {
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      const alphaName = '20260803120000_alpha.sql';
      const alphaPath = join(migrationsDir, alphaName);
      const alpha = readFileSync(alphaPath, 'utf8');
      rmSync(alphaPath);

      const first = await runMigrations({ databasePath, migrationsDir });
      expect(first.applied.map((migration) => migration.name)).toEqual([
        '0001_baseline.sql',
        '20260803130000_beta.sql',
      ]);
      expect(first.outOfOrder).toEqual([]);
      expect(first.head).toBe('20260803130000_beta.sql');

      // DATA-04 and DATA-06 author concurrently; the earlier-stamped file can land second.
      writeFileSync(alphaPath, alpha, 'utf8');
      const second = await runMigrations({ databasePath, migrationsDir });

      expect(second.applied.map((migration) => migration.name)).toEqual([alphaName]);
      expect(second.outOfOrder).toEqual([alphaName]);
      expect(second.head).toBe('20260803130000_beta.sql');
      expect(tableNames(databasePath)).toEqual(
        expect.arrayContaining(['fixture_alpha', 'fixture_beta', 'schema_migration']),
      );
    });
  });

  it('rejects a directory entry whose name breaks the policy, rather than skipping it', async () => {
    await withTempMigrations('bad-name', async ({ migrationsDir, databasePath }) => {
      await expect(runMigrations({ databasePath, migrationsDir })).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_MIGRATION_FILENAME' }),
      );
      expect(existsSync(databasePath)).toBe(false);
    });
  });

  it('rejects two migrations sharing an ordering prefix', async () => {
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      copyFileSync(
        join(migrationsDir, '20260803120000_alpha.sql'),
        join(migrationsDir, '20260803120000_clash.sql'),
      );
      await expect(runMigrations({ databasePath, migrationsDir })).rejects.toThrowError(
        expect.objectContaining({ code: 'DUPLICATE_MIGRATION_PREFIX' }),
      );
    });
  });
});

describe('expand/contract same-release rule (PRD §39.7 step 4)', () => {
  const contractName = '20260803130000_alpha-contract.sql';

  it('refuses a contract migration whose expand ran in the SAME run', async () => {
    await withTempMigrations('contract', async ({ migrationsDir, databasePath }) => {
      const report = await runMigrations({ databasePath, migrationsDir });

      // Refusal is reported, not thrown: see the mixed-batch test below for why.
      expect(report.deferred).toEqual([
        expect.objectContaining({ name: contractName, reason: 'CONTRACT_IN_SAME_RUN' }),
      ]);
      expect(report.deferred[0]?.expandedIn).toBe('20260803120000_alpha.sql');

      // The expand half committed; the contract half did not.
      expect(report.applied.map((migration) => migration.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);
      expect(ledger(databasePath).map((row) => row.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);
      expect(tableNames(databasePath)).toContain('fixture_alpha');
    });
  });

  it('applies an unrelated later expand in the same batch as a refused contract migration', async () => {
    // Breakdown plan §2.1 A5 lets DATA-04…DATA-07 author migrations concurrently, so a run is
    // routinely a MIXED batch. Aborting the run on the first ungated contract migration would stop
    // every unrelated migration sorting after it — re-serialising exactly what A5 exists to keep
    // parallel. The refusal must be scoped to the file it is about.
    await withTempMigrations('contract-mixed', async ({ migrationsDir, databasePath }) => {
      const report = await runMigrations({ databasePath, migrationsDir });

      expect(report.deferred.map((migration) => migration.name)).toEqual([contractName]);
      expect(report.applied.map((migration) => migration.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
        '20260803140000_gamma.sql',
      ]);

      const tables = tableNames(databasePath);
      expect(tables).toContain('fixture_alpha'); // the contract migration did NOT drop it
      expect(tables).toContain('fixture_gamma'); // the unrelated expand still landed
      expect(report.head).toBe('20260803140000_gamma.sql');

      // Still pending, so a status call and RUNT-08 readiness both keep saying so.
      expect(migrationStatus(databasePath, migrationsDir).pending).toEqual([contractName]);

      // ...and the next run, under a new run id, applies it without any file changing.
      const second = await runMigrations({ databasePath, migrationsDir });
      expect(second.deferred).toEqual([]);
      expect(second.applied.map((migration) => migration.name)).toEqual([contractName]);
      expect(tableNames(databasePath)).not.toContain('fixture_alpha');
    });
  });

  it('applies the same contract migration in a LATER run', async () => {
    await withTempMigrations('contract', async ({ migrationsDir, databasePath }) => {
      const contractPath = join(migrationsDir, contractName);
      const contractSql = readFileSync(contractPath, 'utf8');
      rmSync(contractPath);

      const first = await runMigrations({ databasePath, migrationsDir });
      expect(first.applied.map((migration) => migration.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);

      writeFileSync(contractPath, contractSql, 'utf8');
      const second = await runMigrations({ databasePath, migrationsDir });

      expect(second.applied.map((migration) => migration.name)).toEqual([contractName]);
      expect(second.applied[0]?.phase).toBe('contract');
      const row = ledger(databasePath).find((entry) => entry.name === contractName);
      expect(row?.phase).toBe('contract');
      expect(row?.run_id).toBe(second.runId);
      expect(tableNames(databasePath)).not.toContain('fixture_alpha');
    });
  });

  it('refuses a contract migration whose expand was never applied', async () => {
    await withTempMigrations('contract', async ({ migrationsDir, databasePath }) => {
      rmSync(join(migrationsDir, '20260803120000_alpha.sql'));
      const report = await runMigrations({ databasePath, migrationsDir });

      expect(report.deferred).toEqual([
        expect.objectContaining({ name: contractName, reason: 'CONTRACT_EXPAND_NOT_APPLIED' }),
      ]);
      expect(report.applied.map((migration) => migration.name)).toEqual(['0001_baseline.sql']);
      // Refusing must never look like success to a caller that only checks `applied`.
      expect(migrationStatus(databasePath, migrationsDir).pending).toEqual([contractName]);
    });
  });

  it('leaves `deferred` empty on every run that has nothing to refuse', async () => {
    // The negative control for the two tests above: `deferred` is a signal, so it must not be
    // permanently non-empty (or permanently empty) by construction.
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      const first = await runMigrations({ databasePath, migrationsDir });
      expect(first.deferred).toEqual([]);
      const second = await runMigrations({ databasePath, migrationsDir });
      expect(second.deferred).toEqual([]);
      expect(second.applied).toEqual([]);
    });
  });

  it('refuses an expand migration containing a destructive construct', async () => {
    await withTempMigrations('destructive', async ({ migrationsDir, databasePath }) => {
      await expect(runMigrations({ databasePath, migrationsDir })).rejects.toThrowError(
        expect.objectContaining({ code: 'DESTRUCTIVE_STATEMENT' }),
      );
    });
  });
});

describe('recovery point (PRD §23.1)', () => {
  it('throws RECOVERY_POINT_REQUIRED and leaves the database untouched', async () => {
    await withTempDatabase(async (databasePath) => {
      let thrown: unknown;
      try {
        await runMigrations({
          databasePath,
          migrationsDir: REPO_MIGRATIONS_DIR,
          requireRecoveryPoint: true,
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(MigrationError);
      expect((thrown as MigrationError).code).toBe('RECOVERY_POINT_REQUIRED');
      // better-sqlite3 creates the file on open, so "untouched" means the file must not exist.
      expect(existsSync(databasePath)).toBe(false);
    });
  });

  it('records the provider-supplied recovery point in the report', async () => {
    await withTempDatabase(async (databasePath) => {
      const report = await runMigrations({
        databasePath,
        migrationsDir: REPO_MIGRATIONS_DIR,
        requireRecoveryPoint: true,
        recoveryPoint: async () => ({ id: 'rp-42', takenAt: '2026-08-03T12:00:00.000Z' }),
      });
      expect(report.recoveryPoint).toEqual({ id: 'rp-42', takenAt: '2026-08-03T12:00:00.000Z' });
      expect(report.applied.map((migration) => migration.name)).toEqual(repoMigrationNames());
    });
  });

  it('propagates a provider failure without opening the database', async () => {
    await withTempDatabase(async (databasePath) => {
      await expect(
        runMigrations({
          databasePath,
          migrationsDir: REPO_MIGRATIONS_DIR,
          requireRecoveryPoint: true,
          recoveryPoint: async () => {
            throw new Error('litestream snapshot failed');
          },
        }),
      ).rejects.toThrow('litestream snapshot failed');
      expect(existsSync(databasePath)).toBe(false);
    });
  });
});

describe('migrationStatus and assertSchemaUpToDate', () => {
  it('reports everything pending against a database that does not exist, without creating it', async () => {
    await withTempMigrations('good', ({ migrationsDir, databasePath }) => {
      const status = migrationStatus(databasePath, migrationsDir);
      expect(status.head).toBeNull();
      expect(status.applied).toEqual([]);
      expect(status.pending).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
        '20260803130000_beta.sql',
      ]);
      expect(existsSync(databasePath)).toBe(false);
    });
  });

  it('reports head and the pending remainder after a partial run', async () => {
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      const betaPath = join(migrationsDir, '20260803130000_beta.sql');
      const beta = readFileSync(betaPath, 'utf8');
      rmSync(betaPath);
      await runMigrations({ databasePath, migrationsDir });
      writeFileSync(betaPath, beta, 'utf8');

      const status = migrationStatus(databasePath, migrationsDir);
      expect(status.head).toBe('20260803120000_alpha.sql');
      expect(status.applied.map((migration) => migration.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);
      expect(status.pending).toEqual(['20260803130000_beta.sql']);
    });
  });

  it('assertSchemaUpToDate throws SCHEMA_OUT_OF_DATE naming the pending files', async () => {
    await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
      const betaPath = join(migrationsDir, '20260803130000_beta.sql');
      const beta = readFileSync(betaPath, 'utf8');
      rmSync(betaPath);
      await runMigrations({ databasePath, migrationsDir });
      writeFileSync(betaPath, beta, 'utf8');

      const db = new Database(databasePath);
      try {
        let thrown: unknown;
        try {
          assertSchemaUpToDate(db, migrationsDir);
        } catch (error) {
          thrown = error;
        }
        expect((thrown as MigrationError).code).toBe('SCHEMA_OUT_OF_DATE');
        expect((thrown as MigrationError).message).toContain('20260803130000_beta.sql');

        rmSync(betaPath);
        expect(() => assertSchemaUpToDate(db, migrationsDir)).not.toThrow();
      } finally {
        db.close();
      }
    });
  });

});

describe('DROP INDEX uniqueness is read from the live database (ticket deliverable 6)', () => {
    /** Creates one table carrying both a unique and a plain index, as migration 1 of the run. */
    const SETUP = [
      '-- aer:phase expand',
      'CREATE TABLE widget (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL);',
      'CREATE UNIQUE INDEX widget_email_uidx ON widget (email);',
      'CREATE INDEX widget_created_at_idx ON widget (created_at);',
      '',
    ].join('\n');

    it('applies an expand migration that drops a NON-unique index', async () => {
      await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
        writeFileSync(join(migrationsDir, '20260803140000_widget.sql'), SETUP);
        writeFileSync(
          join(migrationsDir, '20260803150000_widget-reindex.sql'),
          ['-- aer:phase expand', 'DROP INDEX widget_created_at_idx;', ''].join('\n'),
        );

        const report = await runMigrations({ databasePath, migrationsDir });
        expect(report.applied.map((row) => row.name)).toContain(
          '20260803150000_widget-reindex.sql',
        );

        const db = new Database(databasePath, { readonly: true });
        try {
          const indexes = db
            .prepare<[], { name: string }>("select name from sqlite_master where type = 'index'")
            .all()
            .map((row) => row.name);
          expect(indexes).not.toContain('widget_created_at_idx');
          expect(indexes).toContain('widget_email_uidx');
        } finally {
          db.close();
        }
      });
    });

    it('refuses an expand migration that drops a UNIQUE index created by an earlier run', async () => {
      await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
        const setupPath = join(migrationsDir, '20260803140000_widget.sql');
        writeFileSync(setupPath, SETUP);
        await runMigrations({ databasePath, migrationsDir });

        writeFileSync(
          join(migrationsDir, '20260803150000_widget-dropuidx.sql'),
          ['-- aer:phase expand', 'DROP INDEX widget_email_uidx;', ''].join('\n'),
        );

        let thrown: unknown;
        try {
          await runMigrations({ databasePath, migrationsDir });
        } catch (error) {
          thrown = error;
        }
        const error = thrown as MigrationError;
        expect(error.code).toBe('DESTRUCTIVE_STATEMENT');
        expect(error.message).toContain('widget_email_uidx');
        expect(error.message).toContain('unique index');

        // The unique index is still there, and the refused migration is not in the ledger.
        expect(ledger(databasePath).map((row) => row.name)).not.toContain(
          '20260803150000_widget-dropuidx.sql',
        );
      });
    });

    it('refuses a unique index created EARLIER IN THE SAME RUN — the set is re-read per migration', async () => {
      await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
        writeFileSync(join(migrationsDir, '20260803140000_widget.sql'), SETUP);
        writeFileSync(
          join(migrationsDir, '20260803150000_widget-dropuidx.sql'),
          ['-- aer:phase expand', 'DROP INDEX widget_email_uidx;', ''].join('\n'),
        );

        let thrown: unknown;
        try {
          await runMigrations({ databasePath, migrationsDir });
        } catch (error) {
          thrown = error;
        }
        expect((thrown as MigrationError).code).toBe('DESTRUCTIVE_STATEMENT');
        expect((thrown as MigrationError).message).toContain('widget_email_uidx');
      });
    });

    it('lets a contract migration drop the unique index in a later run', async () => {
      await withTempMigrations('good', async ({ migrationsDir, databasePath }) => {
        writeFileSync(join(migrationsDir, '20260803140000_widget.sql'), SETUP);
        await runMigrations({ databasePath, migrationsDir });

        writeFileSync(
          join(migrationsDir, '20260803150000_widget-dropuidx.sql'),
          [
            '-- aer:phase contract',
            '-- aer:expanded-in 20260803140000_widget',
            'DROP INDEX widget_email_uidx;',
            '',
          ].join('\n'),
        );

        const report = await runMigrations({ databasePath, migrationsDir });
        expect(report.deferred).toEqual([]);
        expect(report.applied.map((row) => row.name)).toContain(
          '20260803150000_widget-dropuidx.sql',
        );
      });
    });
});

describe('fixture hygiene', () => {
  it('leaves fixtures/ out of the shipped migrations directory', () => {
    expect(fixture('good')).toContain('fixtures');
    expect(REPO_MIGRATIONS_DIR).not.toContain('fixtures');
  });
});
