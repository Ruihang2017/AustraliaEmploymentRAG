import Database from 'better-sqlite3';
import { appendFileSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MigrationError } from '../../src/migrate/errors.js';
import {
  assertSchemaUpToDate,
  migrationChecksum,
  migrationStatus,
  runMigrations,
} from '../../src/migrate/runner.js';
import { REPO_MIGRATIONS_DIR, fixture, withTempDatabase, withTempMigrations } from './helpers.js';

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
  it('migrates a clean temp database from empty to head and records the ledger row', async () => {
    await withTempDatabase(async (databasePath) => {
      const report = await runMigrations({
        databasePath,
        migrationsDir: REPO_MIGRATIONS_DIR,
      });

      expect(report.applied.map((migration) => migration.name)).toEqual(['0001_baseline.sql']);
      expect(report.head).toBe('0001_baseline.sql');
      expect(report.outOfOrder).toEqual([]);
      expect(report.recoveryPoint).toBeNull();
      expect(report.runId).toMatch(UUID);

      const rows = ledger(databasePath);
      expect(rows).toHaveLength(1);
      const row = rows[0] as LedgerRow;
      expect(row.name).toBe('0001_baseline.sql');
      expect(row.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(row.checksum).toBe(
        migrationChecksum(readFileSync(join(REPO_MIGRATIONS_DIR, '0001_baseline.sql'), 'utf8')),
      );
      expect(row.applied_at).toMatch(ISO_UTC);
      expect(Number.isInteger(row.duration_ms)).toBe(true);
      expect(row.duration_ms).toBeGreaterThanOrEqual(0);
      expect(row.run_id).toBe(report.runId);
      expect(row.phase).toBe('expand');
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

      expect(second.applied).toEqual([]);
      expect(second.head).toBe('0001_baseline.sql');
      expect(ledger(databasePath)).toHaveLength(1);
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
      let thrown: unknown;
      try {
        await runMigrations({ databasePath, migrationsDir });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(MigrationError);
      expect((thrown as MigrationError).code).toBe('CONTRACT_IN_SAME_RUN');

      // The expand half committed; the contract half did not.
      expect(ledger(databasePath).map((row) => row.name)).toEqual([
        '0001_baseline.sql',
        '20260803120000_alpha.sql',
      ]);
      expect(tableNames(databasePath)).toContain('fixture_alpha');
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
    await withTempMigrations(
      'contract',
      async ({ migrationsDir, databasePath }) => {
        rmSync(join(migrationsDir, '20260803120000_alpha.sql'));
        await expect(runMigrations({ databasePath, migrationsDir })).rejects.toThrowError(
          expect.objectContaining({ code: 'CONTRACT_EXPAND_NOT_APPLIED' }),
        );
      },
    );
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
      expect(report.applied).toHaveLength(1);
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

  it('leaves fixtures/ out of the shipped migrations directory', () => {
    expect(fixture('good')).toContain('fixtures');
    expect(REPO_MIGRATIONS_DIR).not.toContain('fixtures');
  });
});
