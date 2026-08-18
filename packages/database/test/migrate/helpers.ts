/**
 * DATA-01 test harness (ticket Test plan step 3).
 *
 * Every test gets a fresh SQLite file under the OS temp directory. Never `:memory:`: WAL and
 * locking — the two things the concurrency and pragma criteria are actually about — do not exist for
 * an in-memory database, so an in-memory shortcut would make those tests pass without testing
 * anything. Later DATA tickets copy this construction pattern.
 *
 * DATA-10 — the rule this suite follows: **it asserts the migration framework's properties, not the
 * repository's inventory.** A fixture corpus is `0001_baseline.sql` plus `fixtures/<name>/`, closed
 * by construction; anything that must run against the real `migrations/` derives its expectation
 * from the directory listing at run time (`repoMigrationNames`). Adding a migration or a
 * `src/schema/*.ts` therefore leaves this suite green without a line of it changing.
 */
import { copyFileSync, cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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
/**
 * The one real migration filename this suite is allowed to name (DATA-10).
 *
 * It is the ledger's first row for every database the product ships, so a fixture corpus that did
 * not start from it would be migrating a ledger nobody runs. Every *other* real migration filename
 * belongs to the repository's inventory, which this suite must not encode.
 */
export const BASELINE_MIGRATION = '0001_baseline.sql';
/** `packages/database/src/migrate/cli.mjs` */
export const CLI_PATH = join(PACKAGE_ROOT, 'src', 'migrate', 'cli.mjs');

export function fixture(name: string): string {
  return join(FIXTURES_DIR, name);
}

/**
 * The repository's migration filenames, in the order the framework must apply them (DATA-10).
 *
 * Deliberately a plain `readdirSync(...).sort()` and NOT `sortMigrationNames`/`readMigrationDir`
 * from `src/migrate`: an expectation a test compares against must not be produced by the code under
 * test — the two agreeing is the property, not the premise. The ordering policy is plain
 * lexicographic (`src/migrate/naming.ts`), so the independent reimplementation is one line. No
 * policy filter either: a filename that breaks the policy must reach the runner and blow up there
 * (`q13-conformance.test.ts` owns the per-file naming property).
 */
export function repoMigrationNames(): string[] {
  return readdirSync(REPO_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
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
   * Copy the repository's real `migrations/0001_baseline.sql` — that one file, by name — in first
   * (default `true`).
   *
   * The fixtures deliberately do NOT carry their own copy of the baseline: a copy would drift, and
   * then the whole suite would be migrating a ledger that is not the one the product ships.
   *
   * DATA-10: until this ticket the implementation `cpSync`'d the **whole** real `migrations/`
   * directory here, which made every fixture corpus grow with the repository — so tests that never
   * mention `REPO_MIGRATIONS_DIR` (the pending list, the `db:status` counts, the concurrency
   * ledger) went red the moment a sibling ticket added the migration its own file-scope authorises.
   * A fixture corpus must be determined by the fixture name and this harness, never by whatever
   * `migrations/` happens to contain. If a test ever needs extra real migrations, that must be an
   * explicit, named option — never "everything present".
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
      // The baseline file, by name — not the directory. See TempMigrationsOptions (DATA-10).
      copyFileSync(
        join(REPO_MIGRATIONS_DIR, BASELINE_MIGRATION),
        join(migrationsDir, BASELINE_MIGRATION),
      );
    }
    cpSync(fixture(name), migrationsDir, { recursive: true });
    return fn({ migrationsDir, databasePath: join(dir, 'app.sqlite'), dir });
  });
}
