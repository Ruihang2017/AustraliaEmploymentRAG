/**
 * The one error type the migration surface throws.
 *
 * Every failure carries a machine-readable `code`. Tests, the CLI and RUNT-08's readiness probe
 * branch on `code`, never on message text — message wording is free to improve, the code is the
 * contract.
 */

export type MigrationErrorCode =
  /** `requireRecoveryPoint` was set and no provider was supplied (PRD §23.1). */
  | 'RECOVERY_POINT_REQUIRED'
  /** An entry in the migrations directory does not match `MIGRATION_FILENAME`. */
  | 'INVALID_MIGRATION_FILENAME'
  /** Two migration files share the same ordering prefix (breakdown plan §2.1 A5). */
  | 'DUPLICATE_MIGRATION_PREFIX'
  /** `nextMigrationFilename` was given a group that is not `[a-z0-9]+(-[a-z0-9]+)*`. */
  | 'INVALID_MIGRATION_GROUP'
  /** The migrations directory does not exist. */
  | 'MIGRATIONS_DIR_MISSING'
  /** An already-applied migration file differs from the checksum recorded in the ledger. */
  | 'CHECKSUM_MISMATCH'
  /** The ledger names a migration that is no longer on disk. */
  | 'MIGRATION_FILE_MISSING'
  /** A `-- aer:phase contract` migration carries no `-- aer:expanded-in`. */
  | 'CONTRACT_MISSING_EXPANDED_IN'
  /** A contract migration's `expanded-in` target has never been applied. */
  | 'CONTRACT_EXPAND_NOT_APPLIED'
  /** A contract migration's `expanded-in` target was applied by this same run (PRD §39.7 step 4). */
  | 'CONTRACT_IN_SAME_RUN'
  /** An expand migration contains a destructive construct (PRD §20.4). */
  | 'DESTRUCTIVE_STATEMENT'
  /** A migration body drives its own transaction, or contains a statement that cannot run in one. */
  | 'TRANSACTION_CONTROL_IN_MIGRATION'
  /** A `-- aer:phase` directive names something other than `expand` or `contract`. */
  | 'INVALID_MIGRATION_PHASE'
  /** The baseline ran but `schema_migration` still does not exist. */
  | 'LEDGER_TABLE_MISSING'
  /** SQLite stayed busy for longer than `APP_SQLITE_BUSY_TIMEOUT_MS`. */
  | 'SQLITE_BUSY'
  /** `assertSchemaUpToDate` found pending migrations (RUNT-08 readiness, PRD §42.1). */
  | 'SCHEMA_OUT_OF_DATE'
  /** A table or column name is not the `snake_case` PRD §35.1 requires. */
  | 'INVALID_TABLE_NAME'
  /** A `src/schema/*.ts` file does not export a well-formed `tableManifest`. */
  | 'MANIFEST_INVALID'
  /** `assertSchemaConventions` found at least one PRD §35.1 violation. */
  | 'CONVENTION_VIOLATION';

export interface MigrationErrorDetails {
  /** The migration filename or table the failure is about, when there is one. */
  readonly name?: string | undefined;
  /** 1-based line number inside that file, when the failure is locatable. */
  readonly line?: number | undefined;
  /** Every individual problem, when the failure aggregates more than one. */
  readonly violations?: readonly string[] | undefined;
}

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly name_: string | undefined;
  readonly line: number | undefined;
  readonly violations: readonly string[] | undefined;

  constructor(code: MigrationErrorCode, message: string, details: MigrationErrorDetails = {}) {
    super(message);
    // `Error.name` is the class name by convention; the migration/table name lives in `name_` so the
    // two never collide.
    this.name = 'MigrationError';
    this.code = code;
    this.name_ = details.name;
    this.line = details.line;
    this.violations = details.violations;
  }
}

/** Narrowing helper for callers that catch broadly. */
export function isMigrationError(value: unknown): value is MigrationError {
  return value instanceof MigrationError;
}
