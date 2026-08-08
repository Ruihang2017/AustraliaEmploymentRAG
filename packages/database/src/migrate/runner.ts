/**
 * DATA-01 deliverable 4 — the forward-only expand/contract migration runner.
 *
 * Raw `.sql` files, checked into git, executed through `better-sqlite3`. No query builder, no
 * generated DDL and no third-party migration tool: breakdown plan §8 Q13 clauses (c)–(e) make this
 * runner the whole migration mechanism.
 */
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { MigrationError, type MigrationErrorCode } from './errors.js';
import { assertUniquePrefixes, parseMigrationFilename, sortMigrationNames } from './naming.js';
import { APP_SQLITE_BUSY_TIMEOUT_MS, applyAppPragmas } from './pragmas.js';
import { assertExpandOnly, parseMigrationHeader, type MigrationPhase } from './policy.js';

/**
 * `packages/database/migrations` — resolved from this module, never from the process working
 * directory: `pnpm db:migrate`, `vitest` and a deployed worker do not share a cwd.
 */
export const DEFAULT_MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
);

/**
 * PRD §23.1 — "Force a confirmed recovery point before migrations". The implementation is RLSE-05's
 * (Litestream); this is the seam, and it fails closed.
 */
export type RecoveryPointProvider = () => Promise<{ id: string; takenAt: string }>;

export interface AppliedMigration {
  name: string;
  checksum: string;
  appliedAt: string;
  durationMs: number;
  runId: string;
  phase: MigrationPhase;
}

/**
 * A pending contract migration this run refused to apply.
 *
 * `reason` is the `MigrationErrorCode` the refusal would have carried had it been thrown, so a caller
 * branches on the same constant either way.
 */
export interface DeferredMigration {
  name: string;
  reason: Extract<MigrationErrorCode, 'CONTRACT_IN_SAME_RUN' | 'CONTRACT_EXPAND_NOT_APPLIED'>;
  /** The `-- aer:expanded-in` target the refusal is about. */
  expandedIn: string;
  detail: string;
}

export interface MigrationReport {
  runId: string;
  databasePath: string;
  applied: AppliedMigration[];
  head: string | null;
  /** Files applied in this run that sort *before* a migration already applied (breakdown plan A5). */
  outOfOrder: string[];
  /**
   * Contract migrations the expand/contract gate refused (PRD §39.7 step 4). Non-empty means the
   * database is deliberately **not** at head, and `pnpm db:migrate` exits non-zero.
   */
  deferred: DeferredMigration[];
  recoveryPoint: { id: string; takenAt: string } | null;
  durationMs: number;
}

export interface RunMigrationsOptions {
  databasePath: string;
  migrationsDir?: string | undefined;
  requireRecoveryPoint?: boolean | undefined;
  recoveryPoint?: RecoveryPointProvider | undefined;
}

interface LedgerRow {
  name: string;
  checksum: string;
  applied_at: string;
  duration_ms: number;
  run_id: string;
  phase: MigrationPhase;
}

const LEDGER_TABLE = 'schema_migration';

/**
 * `sha256:<lowercase hex>` over the file text, with a leading BOM stripped and CRLF normalised to LF
 * **before** hashing.
 *
 * This normalisation is not cosmetic. git's `core.autocrlf=true` gives a Windows working tree CRLF
 * while CI checks the same commit out as LF; a byte-literal hash would therefore make every database
 * migrated on one platform look tampered-with on the other, and the tamper check — the one thing
 * standing between an edited migration and a silently divergent schema — would be dismissed as
 * flaky.
 */
export function migrationChecksum(text: string): string {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalised = withoutBom.split('\r\n').join('\n');
  return `sha256:${createHash('sha256').update(normalised, 'utf8').digest('hex')}`;
}

function readMigrationDir(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new MigrationError('MIGRATIONS_DIR_MISSING', `migrations directory not found: ${dir}`, {
      name: dir,
    });
  }
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  // A non-matching file is a hard error, never a silent skip: a migration nobody applies because the
  // runner quietly ignored its name is the worst possible outcome here.
  for (const name of names) parseMigrationFilename(name);
  assertUniquePrefixes(names);
  return sortMigrationNames(names);
}

function ledgerExists(db: Database.Database): boolean {
  const row = db
    .prepare<[string], { name: string }>(
      "select name from sqlite_master where type = 'table' and name = ?",
    )
    .get(LEDGER_TABLE);
  return row !== undefined;
}

function readLedger(db: Database.Database): LedgerRow[] {
  if (!ledgerExists(db)) return [];
  return db
    .prepare<[], LedgerRow>(
      `select name, checksum, applied_at, duration_ms, run_id, phase from ${LEDGER_TABLE} order by name`,
    )
    .all();
}

function toApplied(row: LedgerRow): AppliedMigration {
  return {
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
    durationMs: row.duration_ms,
    runId: row.run_id,
    phase: row.phase,
  };
}

function openDatabase(databasePath: string): Database.Database {
  // The constructor timeout and the busy_timeout pragma set the same knob; both are set so a
  // connection is never briefly live without one.
  const db = new Database(databasePath, { timeout: APP_SQLITE_BUSY_TIMEOUT_MS });
  applyAppPragmas(db);
  return db;
}

function isBusy(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ((error as { code: string }).code === 'SQLITE_BUSY' ||
      (error as { code: string }).code === 'SQLITE_BUSY_SNAPSHOT')
  );
}

/**
 * Applies every pending migration in `migrationsDir` to `databasePath`.
 *
 * Order of operations matters and is asserted by the test suite:
 *
 *  1. the recovery point is settled **before** anything touches the filesystem or the database —
 *     `better-sqlite3` creates the database file on open, so opening first would already have
 *     violated "leaves the database untouched" (PRD §23.1);
 *  2. the directory is validated and sorted;
 *  3. every already-applied row is checksum-verified against the file on disk before *any* pending
 *     migration is applied;
 *  4. each pending migration is applied inside its own `BEGIN IMMEDIATE` transaction together with
 *     its ledger row.
 *
 * A contract migration whose `-- aer:expanded-in` gate is not satisfied is **skipped and reported in
 * `report.deferred`**, not thrown. Throwing would abort the whole run, and under breakdown plan §2.1
 * A5 a run is a *mixed batch*: `DATA-04`…`DATA-07` author independently, so one module's
 * not-yet-releasable contract migration would otherwise block every unrelated expand migration that
 * happens to sort after it — turning concurrent authoring back into a chain. Skipping is safe because
 * each migration commits in its own transaction (nothing to roll back) and a contract migration only
 * *removes* what an already-applied expand superseded, so no later migration can depend on it having
 * run. The refusal is not silent: `report.deferred` carries the reason and `pnpm db:migrate` exits
 * non-zero, and the next invocation — a new `run_id` — applies it.
 */
export async function runMigrations(options: RunMigrationsOptions): Promise<MigrationReport> {
  const startedAt = performance.now();
  const runId = randomUUID();
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  // 1. Recovery point — fails closed, before the database file can be created.
  let recoveryPoint: { id: string; takenAt: string } | null = null;
  if (options.recoveryPoint) {
    recoveryPoint = await options.recoveryPoint();
  } else if (options.requireRecoveryPoint === true) {
    throw new MigrationError(
      'RECOVERY_POINT_REQUIRED',
      'requireRecoveryPoint is set but no recoveryPoint provider was supplied; PRD §23.1 forces a ' +
        'confirmed recovery point before migrations run',
      { name: options.databasePath },
    );
  }

  // 2. Directory.
  const names = readMigrationDir(migrationsDir);
  const sources = new Map<string, string>();
  for (const name of names) sources.set(name, readFileSync(join(migrationsDir, name), 'utf8'));

  const db = openDatabase(options.databasePath);
  const applied: AppliedMigration[] = [];
  const outOfOrder: string[] = [];
  const deferred: DeferredMigration[] = [];

  try {
    // 3. Ledger + tamper check.
    const ledger = new Map<string, LedgerRow>();
    for (const row of readLedger(db)) ledger.set(row.name, row);

    for (const row of ledger.values()) {
      const source = sources.get(row.name);
      if (source === undefined) {
        throw new MigrationError(
          'MIGRATION_FILE_MISSING',
          `${row.name} is recorded in ${LEDGER_TABLE} but is not present in ${migrationsDir}`,
          { name: row.name },
        );
      }
      const actual = migrationChecksum(source);
      if (actual !== row.checksum) {
        throw new MigrationError(
          'CHECKSUM_MISMATCH',
          `${row.name} has changed since it was applied (ledger ${row.checksum}, file ${actual}); ` +
            'migrations are immutable once applied — add a new forward migration instead. No ' +
            'pending migration was applied.',
          { name: row.name },
        );
      }
    }

    const highestBefore = [...ledger.keys()].sort().at(-1) ?? null;

    // 4. Apply.
    for (const name of names) {
      if (ledger.has(name)) continue;

      const sql = sources.get(name) as string;
      const header = parseMigrationHeader(sql, name);

      if (header.phase === 'contract') {
        const target = header.expandedIn as string;
        const expandRow = ledger.get(target);
        if (!expandRow) {
          deferred.push({
            name,
            reason: 'CONTRACT_EXPAND_NOT_APPLIED',
            expandedIn: target,
            detail: `${name} contracts ${target}, which has never been applied`,
          });
          continue;
        }
        if (expandRow.run_id === runId) {
          deferred.push({
            name,
            reason: 'CONTRACT_IN_SAME_RUN',
            expandedIn: target,
            detail:
              `${name} contracts ${target}, which this same run (${runId}) applied; a contract ` +
              'migration must ship in a later release than the expand it supersedes (PRD §39.7 ' +
              'step 4). Re-run `pnpm db:migrate` to apply it under a new run id.',
          });
          continue;
        }
      }

      assertExpandOnly(sql, { name, ...header });

      const checksum = migrationChecksum(sql);
      const row = applyOne(db, { name, sql, checksum, phase: header.phase, runId });
      ledger.set(row.name, row);

      if (row.run_id === runId) {
        applied.push(toApplied(row));
        if (highestBefore !== null && name < highestBefore) outOfOrder.push(name);
      }
    }

    const head = [...ledger.keys()].sort().at(-1) ?? null;

    return {
      runId,
      databasePath: options.databasePath,
      applied,
      head,
      outOfOrder,
      deferred,
      recoveryPoint,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    db.close();
  }
}

interface ApplyInput {
  name: string;
  sql: string;
  checksum: string;
  phase: MigrationPhase;
  runId: string;
}

/**
 * Applies one migration and writes its ledger row in a single `BEGIN IMMEDIATE` transaction.
 *
 * `BEGIN IMMEDIATE` takes SQLite's write lock *before* the transaction's first read, which is the
 * whole mechanism: two processes starting together are serialised by SQLite itself, and the loser
 * observes the winner's committed ledger row rather than re-running the migration. Every one of the
 * three steps below has to be inside the transaction —
 *
 *  - re-checking that `schema_migration` exists, because on a fresh database both processes saw it
 *    absent and the loser would otherwise run `CREATE TABLE schema_migration` a second time;
 *  - re-checking that the row is absent, because the winner may have applied this migration in the
 *    gap between the pending list being computed and the lock being taken;
 *  - inserting the ledger row, so a crash can never leave a schema change without its record.
 *
 * Move any of them outside and the design is silently broken while the tests may still pass on a
 * fast machine.
 */
function applyOne(db: Database.Database, input: ApplyInput): LedgerRow {
  const transaction = db.transaction((): LedgerRow => {
    const hadLedger = ledgerExists(db);
    if (hadLedger) {
      const existing = db
        .prepare<[string], LedgerRow>(
          `select name, checksum, applied_at, duration_ms, run_id, phase from ${LEDGER_TABLE} where name = ?`,
        )
        .get(input.name);
      if (existing) return existing; // another process applied it while we waited for the lock
    }

    const startedAt = performance.now();
    db.exec(input.sql);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

    if (!ledgerExists(db)) {
      throw new MigrationError(
        'LEDGER_TABLE_MISSING',
        `${input.name} ran but ${LEDGER_TABLE} still does not exist; the baseline migration is the ` +
          'only thing that may create it and it must be applied first',
        { name: input.name },
      );
    }

    const row: LedgerRow = {
      name: input.name,
      checksum: input.checksum,
      applied_at: new Date().toISOString(),
      duration_ms: durationMs,
      run_id: input.runId,
      phase: input.phase,
    };
    db.prepare(
      `insert into ${LEDGER_TABLE} (name, checksum, applied_at, duration_ms, run_id, phase) ` +
        'values (?, ?, ?, ?, ?, ?)',
    ).run(row.name, row.checksum, row.applied_at, row.duration_ms, row.run_id, row.phase);
    return row;
  });

  try {
    return transaction.immediate();
  } catch (error) {
    if (isBusy(error)) {
      throw new MigrationError(
        'SQLITE_BUSY',
        `${input.name}: SQLite stayed busy for longer than APP_SQLITE_BUSY_TIMEOUT_MS ` +
          `(${APP_SQLITE_BUSY_TIMEOUT_MS}ms) waiting for the write lock; another process is ` +
          'migrating or holding a long write transaction against this database',
        { name: input.name },
      );
    }
    throw error;
  }
}

/**
 * Applied rows, pending filenames and the current head.
 *
 * Does not create the database: a status call against a path that does not exist yet answers
 * "nothing applied, everything pending" rather than leaving an empty file behind.
 */
export function migrationStatus(
  databasePath: string,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): { applied: AppliedMigration[]; pending: string[]; head: string | null } {
  const names = readMigrationDir(migrationsDir);
  if (!existsSync(databasePath)) {
    return { applied: [], pending: names, head: null };
  }

  const db = openDatabase(databasePath);
  try {
    const rows = readLedger(db);
    const appliedNames = new Set(rows.map((row) => row.name));
    return {
      applied: rows.map(toApplied),
      pending: names.filter((name) => !appliedNames.has(name)),
      head: [...appliedNames].sort().at(-1) ?? null,
    };
  } finally {
    db.close();
  }
}

/**
 * Throws when any migration on disk is not yet applied to `db`.
 *
 * RUNT-08's readiness probe (PRD §42.1) and DATA-02's connection factory call this on an already-open
 * connection, so it takes the handle rather than a path.
 */
export function assertSchemaUpToDate(
  db: Database.Database,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): void {
  const names = readMigrationDir(migrationsDir);
  const appliedNames = new Set(readLedger(db).map((row) => row.name));
  const pending = names.filter((name) => !appliedNames.has(name));
  if (pending.length > 0) {
    throw new MigrationError(
      'SCHEMA_OUT_OF_DATE',
      `${pending.length} migration(s) pending: ${pending.join(', ')} — run \`pnpm db:migrate\``,
      { violations: pending },
    );
  }
}
