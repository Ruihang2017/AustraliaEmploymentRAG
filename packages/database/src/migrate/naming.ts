/**
 * DATA-01 deliverable 5 — the migration filename and ordering policy.
 *
 * Ordering is plain lexicographic on the whole filename. `0001_baseline.sql` sorts before every
 * `2026…` prefix, so the baseline is always first with no special case, and four table-group tickets
 * (DATA-04…DATA-07) can author files concurrently without a shared counter (breakdown plan §2.1 A5).
 */
import { MigrationError } from './errors.js';

/**
 * The only two shapes a migration file may take: the single baseline, or a 14-digit UTC timestamp
 * followed by a lowercase kebab-case group.
 */
export const MIGRATION_FILENAME = /^(0001_baseline|\d{14}_[a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/;

/** A group is lowercase alphanumerics separated by single hyphens — the same rule as the filename. */
export const MIGRATION_GROUP = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ParsedMigrationName {
  /** The full filename, including `.sql`. */
  name: string;
  /** The ordering prefix: `0001` for the baseline, otherwise the 14-digit UTC timestamp. */
  prefix: string;
  /** The table group: `baseline`, or the kebab-case suffix. */
  group: string;
  /** True only for `0001_baseline.sql`. */
  baseline: boolean;
}

export function parseMigrationFilename(name: string): ParsedMigrationName {
  if (!MIGRATION_FILENAME.test(name)) {
    throw new MigrationError(
      'INVALID_MIGRATION_FILENAME',
      `migration filename ${JSON.stringify(name)} is not "0001_baseline.sql" or ` +
        '"<UTC YYYYMMDDHHMMSS>_<lowercase-group>.sql"',
      { name },
    );
  }
  if (name === '0001_baseline.sql') {
    return { name, prefix: '0001', group: 'baseline', baseline: true };
  }
  const stem = name.slice(0, -'.sql'.length);
  const prefix = stem.slice(0, 14);
  const group = stem.slice(15);
  return { name, prefix, group, baseline: false };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * `<UTC YYYYMMDDHHMMSS>_<group>.sql`.
 *
 * Always formatted from `Date.getUTC*`. Local time would make the ordering of two files authored in
 * different timezones depend on where the author happened to be sitting.
 */
export function nextMigrationFilename(group: string, now: Date = new Date()): string {
  if (!MIGRATION_GROUP.test(group)) {
    throw new MigrationError(
      'INVALID_MIGRATION_GROUP',
      `migration group ${JSON.stringify(group)} must match ${MIGRATION_GROUP.source}`,
      { name: group },
    );
  }
  const stamp =
    `${pad(now.getUTCFullYear(), 4)}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}` +
    `${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(now.getUTCSeconds(), 2)}`;
  return `${stamp}_${group}.sql`;
}

/**
 * Plain lexicographic sort.
 *
 * Deliberately the default string comparison and **not** `localeCompare`: `localeCompare` is
 * locale-dependent, so the applied order could differ between a developer machine and a CI runner.
 */
export function sortMigrationNames(names: readonly string[]): string[] {
  return [...names].sort();
}

/**
 * Two files sharing an ordering prefix is a hard error (breakdown plan §2.1 A5): concurrent authoring
 * is only safe while the prefix totally orders the set.
 */
export function assertUniquePrefixes(names: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const name of sortMigrationNames(names)) {
    const { prefix } = parseMigrationFilename(name);
    const previous = seen.get(prefix);
    if (previous !== undefined) {
      throw new MigrationError(
        'DUPLICATE_MIGRATION_PREFIX',
        `migrations ${previous} and ${name} share the ordering prefix ${prefix}; rename one with ` +
          '`pnpm db:new <group>`',
        { name },
      );
    }
    seen.set(prefix, name);
  }
}
