/**
 * DATA-01 test harness (ticket Test plan step 3).
 *
 * Every test gets a fresh SQLite file under the OS temp directory. Never `:memory:`: WAL and
 * locking — the two things the concurrency and pragma criteria are actually about — do not exist for
 * an in-memory database, so an in-memory shortcut would make those tests pass without testing
 * anything. Later DATA tickets copy this construction pattern.
 */
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/database/test/migrate` — resolved from this file, never from the runner's cwd. */
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
/** `packages/database` */
export const PACKAGE_ROOT = join(THIS_DIR, '..', '..');
/** `packages/database/migrations` — the real, shipped migration directory. */
export const REPO_MIGRATIONS_DIR = join(PACKAGE_ROOT, 'migrations');
/** `packages/database/test/migrate/fixtures` */
export const FIXTURES_DIR = join(THIS_DIR, 'fixtures');
/** The ledger bootstrap — the one migration every fixture-based test starts from. */
export const BASELINE_MIGRATION = '0001_baseline.sql';
/** `packages/database/src/migrate/cli.mjs` */
export const CLI_PATH = join(PACKAGE_ROOT, 'src', 'migrate', 'cli.mjs');

export function fixture(name: string): string {
  return join(FIXTURES_DIR, name);
}

/**
 * Runs `fn` against a fresh temp directory and removes it afterwards.
 *
 * Removal is `force: true` because WAL leaves `-wal`/`-shm` siblings and, on Windows, an unlink of a
 * file still held open fails with EBUSY. Every `Database` handle must therefore be closed before
 * `fn` returns — `runMigrations` and `migrationStatus` both close in a `finally`, so only a test
 * that opens its own handle has to remember.
 */
export async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'taxrag-migrate-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

/** A temp directory plus the path of a database file inside it (the file is not created). */
export async function withTempDatabase<T>(
  fn: (databasePath: string, dir: string) => Promise<T> | T,
): Promise<T> {
  return withTempDir((dir) => fn(join(dir, 'app.sqlite'), dir));
}

export interface TempMigrations {
  /** A writable copy of the fixture's migration files. */
  migrationsDir: string;
  /** A path inside the same temp directory; the database file is not created up front. */
  databasePath: string;
  dir: string;
}

export interface TempMigrationsOptions {
  /**
   * Copy the repository's real `migrations/0001_baseline.sql` in first (default `true`).
   *
   * The fixtures deliberately do NOT carry their own copy of the baseline: a copy would drift, and
   * then the whole suite would be migrating a ledger that is not the one the product ships.
   */
  withBaseline?: boolean;
}

/**
 * Copies `fixtures/<name>/` into a temp directory so a test can tamper with the files (append a
 * byte, drop a late-arriving migration in) without touching the repository.
 */
export async function withTempMigrations<T>(
  name: string,
  fn: (context: TempMigrations) => Promise<T> | T,
  options: TempMigrationsOptions = {},
): Promise<T> {
  return withTempDir((dir) => {
    const migrationsDir = join(dir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });
    if (options.withBaseline !== false) {
      // The BASELINE only — not the whole shipped directory. Copying the directory made every
      // fixture-based test inherit each table group's migration as it landed (DATA-04's
      // `*_tenancy.sql` was the first), which turned this harness's "baseline plus these fixtures"
      // contract into "baseline plus these fixtures plus whatever the product ships today" and made
      // thirteen DATA-01 assertions fail for a reason that had nothing to do with DATA-01.
      cpSync(join(REPO_MIGRATIONS_DIR, BASELINE_MIGRATION), join(migrationsDir, BASELINE_MIGRATION));
    }
    cpSync(fixture(name), migrationsDir, { recursive: true });
    return fn({ migrationsDir, databasePath: join(dir, 'app.sqlite'), dir });
  });
}
