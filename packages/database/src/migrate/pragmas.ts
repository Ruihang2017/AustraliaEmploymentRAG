/**
 * DATA-01 deliverable 2 — the single definition of the pragmas every `app.sqlite` connection sets.
 *
 * DATA-02's connection factory and DATA-08's ephemeral factory import `APP_SQLITE_PRAGMAS` from here
 * rather than restating it. Restating it is how two connections end up with different durability and
 * foreign-key behaviour against the same file.
 */
import type Database from 'better-sqlite3';

import { MigrationError } from './errors.js';

/**
 * How long SQLite waits for a competing writer before raising `SQLITE_BUSY`.
 *
 * `app.sqlite` is opened concurrently by `apps/api`, `apps/worker` and Litestream (PRD §39.1/§39.4)
 * and SQLite allows exactly one writer, so a non-zero timeout is what turns lock contention into a
 * short wait instead of an error.
 */
export const APP_SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * Applied in this order on every connection. The order is load-bearing.
 *
 * - `busy_timeout` is per connection and comes **first**, so the busy handler is armed before the
 *   journal-mode switch below — which is the only statement here that contends for a database-wide
 *   lock.
 * - `journal_mode = WAL` (PRD §23.1) is *persisted in the database file*, so it is set once and then
 *   re-asserted harmlessly. It must be issued outside any transaction — SQLite refuses to change the
 *   journal mode inside one. See {@link applyJournalModeWal} for why it needs its own retry.
 * - `foreign_keys = ON` is **per connection** and is NOT persisted. SQLite defaults it to OFF for
 *   backwards compatibility, so every single connection has to set it again. This repetition looks
 *   redundant and is not: dropping it silently disables every foreign key in the schema, including
 *   the composite tenant keys PRD §35.8 invariants 4 and 5 rely on. Do not "optimise" it away.
 */
export const APP_SQLITE_PRAGMAS: readonly string[] = Object.freeze([
  `busy_timeout = ${APP_SQLITE_BUSY_TIMEOUT_MS}`,
  'journal_mode = WAL',
  'foreign_keys = ON',
]);

/** How long to wait between journal-mode attempts while another connection holds the lock. */
const JOURNAL_MODE_RETRY_DELAY_MS = 20;

/** Blocking sleep. `applyAppPragmas` is synchronous because every caller of it is. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBusyError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('SQLITE_BUSY');
}

/**
 * Switches the database to WAL, waiting out a competing connection.
 *
 * `busy_timeout` does not cover this statement. Changing the journal mode needs a lock no ordinary
 * write needs, and SQLite reports the conflict immediately — either by raising `SQLITE_BUSY` or, more
 * confusingly, by succeeding and returning the *unchanged* mode. Two migrators started together
 * against a brand-new file hit exactly that window, which is why this retries rather than trusting a
 * single `db.pragma()` call. Observed as a one-in-several flake in the concurrency test before this
 * loop existed; a bare `db.pragma('journal_mode = WAL')` is not safe here.
 *
 * Re-asserting WAL on a database that is already in WAL takes no lock at all, so the fast path (the
 * overwhelmingly common one) costs a single read.
 */
export function applyJournalModeWal(db: Database.Database): void {
  const deadline = Date.now() + APP_SQLITE_BUSY_TIMEOUT_MS;
  let lastError: unknown;

  for (;;) {
    if (currentJournalMode(db) === 'wal') return;
    try {
      db.pragma('journal_mode = WAL');
      if (currentJournalMode(db) === 'wal') return;
      lastError = undefined;
    } catch (error) {
      if (!isBusyError(error)) throw error;
      lastError = error;
    }
    if (Date.now() >= deadline) {
      throw new MigrationError(
        'SQLITE_BUSY',
        `could not switch the database to WAL within APP_SQLITE_BUSY_TIMEOUT_MS ` +
          `(${APP_SQLITE_BUSY_TIMEOUT_MS}ms); another connection is holding a conflicting lock` +
          (lastError instanceof Error ? `: ${lastError.message}` : ''),
      );
    }
    sleepSync(JOURNAL_MODE_RETRY_DELAY_MS);
  }
}

function currentJournalMode(db: Database.Database): string {
  const mode: unknown = db.pragma('journal_mode', { simple: true });
  return typeof mode === 'string' ? mode.toLowerCase() : '';
}

/** Applies {@link APP_SQLITE_PRAGMAS} to `db`, in order. Must be called outside any transaction. */
export function applyAppPragmas(db: Database.Database): void {
  for (const pragma of APP_SQLITE_PRAGMAS) {
    if (pragma.startsWith('journal_mode')) {
      applyJournalModeWal(db);
      continue;
    }
    db.pragma(pragma);
  }
}
