import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import { MigrationError } from '../../src/migrate/errors.js';
import {
  APP_SQLITE_BUSY_TIMEOUT_MS,
  APP_SQLITE_PRAGMAS,
  applyAppPragmas,
  applyJournalModeWal,
} from '../../src/migrate/pragmas.js';
import { PACKAGE_ROOT, withTempDatabase } from './helpers.js';

/**
 * Opens a write transaction against argv[1], announces it, and releases it after
 * {@link HOLDER_HOLD_MS} — comfortably inside `APP_SQLITE_BUSY_TIMEOUT_MS`, so a correct retry loop
 * outlives the contention and a missing one fails. CommonJS: run with `node -e`.
 */
const HOLDER_HOLD_MS = 1000;
const HOLDER_SCRIPT = [
  "const Database = require('better-sqlite3');",
  'const db = new Database(process.argv[1]);',
  "db.exec('create table probe (id integer primary key)');",
  "db.exec('begin immediate');",
  "db.exec('insert into probe (id) values (1)');",
  "process.stdout.write('holding\\n');",
  `setTimeout(() => { db.exec('commit'); }, ${HOLDER_HOLD_MS});`,
  'setInterval(() => {}, 1000);',
].join('\n');

describe('APP_SQLITE_PRAGMAS (sub-PRD D10)', () => {
  it('arms busy_timeout before the journal-mode switch', () => {
    // Order regression: `journal_mode = WAL` is the only pragma here that contends for a
    // database-wide lock, so the busy handler has to exist before it runs.
    expect(APP_SQLITE_PRAGMAS[0]).toBe(`busy_timeout = ${APP_SQLITE_BUSY_TIMEOUT_MS}`);
    expect(APP_SQLITE_PRAGMAS.indexOf('journal_mode = WAL')).toBeGreaterThan(0);
    expect(APP_SQLITE_PRAGMAS).toContain('foreign_keys = ON');
  });

  it('leaves a fresh connection in WAL with foreign keys on and the timeout set', async () => {
    await withTempDatabase((databasePath) => {
      const db = new Database(databasePath);
      try {
        applyAppPragmas(db);
        expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
        expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
        expect(db.pragma('busy_timeout', { simple: true })).toBe(APP_SQLITE_BUSY_TIMEOUT_MS);
      } finally {
        db.close();
      }
    });
  });

  it('is idempotent — re-asserting WAL on a WAL database is a no-op', async () => {
    await withTempDatabase((databasePath) => {
      const first = new Database(databasePath);
      try {
        applyAppPragmas(first);
        applyJournalModeWal(first);
        applyJournalModeWal(first);
        expect(String(first.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
      } finally {
        first.close();
      }
    });
  });
});

describe('the journal-mode switch waits out a competing connection', () => {
  /**
   * Regression for a real flake: two migrators started together against a brand-new database both
   * ran `PRAGMA journal_mode = WAL`, and the loser failed the whole run — `busy_timeout` does not
   * cover the lock that statement needs. This drives the same collision deterministically by holding
   * a write transaction open on a second connection while the first switches to WAL.
   */
  it('switches to WAL while another process holds the write lock', async () => {
    await withTempDatabase(async (databasePath) => {
      // The competing writer must be a separate *process*: `applyJournalModeWal` is synchronous and
      // blocks this thread while it waits, so an in-thread timer could never release the lock — which
      // is exactly the situation in production, where the competitor is another migrator, apps/api or
      // Litestream (PRD §39.1/§39.4).
      const holder = spawn(process.execPath, ['-e', HOLDER_SCRIPT, databasePath], {
        cwd: PACKAGE_ROOT,
      });
      try {
        await once(holder.stdout, 'data'); // the child prints once its write transaction is open

        const switcher = new Database(databasePath, { timeout: APP_SQLITE_BUSY_TIMEOUT_MS });
        try {
          applyJournalModeWal(switcher);
          expect(String(switcher.pragma('journal_mode', { simple: true })).toLowerCase()).toBe(
            'wal',
          );
        } finally {
          switcher.close();
        }
      } finally {
        holder.kill();
        await once(holder, 'close');
      }
    });
  }, 60_000);

  it('reports a MigrationError with code SQLITE_BUSY rather than a raw SQLite error', () => {
    // A stub whose journal-mode switch never takes effect stands in for a permanently contended
    // database: the loop must give up with the migration-surface error type, not hang forever and not
    // leak SQLite's own error shape to callers that branch on `code`.
    const stalled = {
      pragma(statement: string): unknown {
        return statement.startsWith('journal_mode =') ? undefined : 'delete';
      },
    } as unknown as Database.Database;

    let thrown: unknown;
    try {
      applyJournalModeWal(stalled);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MigrationError);
    expect((thrown as MigrationError).code).toBe('SQLITE_BUSY');
  }, 60_000);
});
