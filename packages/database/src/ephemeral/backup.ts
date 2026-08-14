/**
 * DATA-08 deliverable 8 — the backup-exclusion contract `RLSE-05` and `ASSR-08` consume.
 *
 * PRD §39.3: `/srv/aer/data/ephemeral.sqlite*` is **explicitly excluded** from backup, and "the app
 * database, ephemeral database and corpus cannot share a wildcard backup rule". PRD §10.4: ephemeral
 * content "MUST NOT enter Litestream, daily/weekly backups, exports or support tools".
 *
 * # Matching rule — leaf-pattern intersection, failing closed
 *
 * A candidate backup glob is reduced to its **last path segment** and tested as a glob against each
 * of {@link EPHEMERAL_FILE_GLOBS}. The directory part is deliberately ignored, so
 * `some/other/dir/*` is rejected too. That is a known and intentional false positive: a backup rule
 * whose leaf pattern *could* match an ephemeral file is refused wherever it points. `RLSE-05`
 * responds by writing leaf-specific patterns such as `data/app.sqlite*`, which is the desired
 * outcome rather than a workaround.
 *
 * Glob→RegExp conversion is hand-written here on purpose: `packages/database`'s declared dependency
 * set is asserted elsewhere in this package, so adding `minimatch`/`picomatch` would turn another
 * ticket's test red.
 *
 * This module configures nothing. `infra/backup/**` is `RLSE-05`'s file-scope.
 */
import { EphemeralError } from './errors.js';

/**
 * The file names to exclude, as basenames relative to the data directory (PRD §39.3's
 * `/srv/aer/data/`). WAL is on (`APP_SQLITE_PRAGMAS`), so `-wal` and `-shm` are the journal
 * siblings that pragma choice implies.
 */
export const EPHEMERAL_FILE_GLOBS: readonly string[] = Object.freeze([
  'ephemeral.sqlite',
  'ephemeral.sqlite-wal',
  'ephemeral.sqlite-shm',
]);

function leafOf(candidate: string): string {
  const separator = Math.max(candidate.lastIndexOf('/'), candidate.lastIndexOf('\\'));
  return separator === -1 ? candidate : candidate.slice(separator + 1);
}

/** `*` = any run of characters, `?` = one character, `[...]` = a character class. */
function globToRegExp(pattern: string): RegExp {
  let source = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] as string;
    if (ch === '*') {
      source += '.*';
      i += 1;
      continue;
    }
    if (ch === '?') {
      source += '.';
      i += 1;
      continue;
    }
    if (ch === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end !== -1) {
        let body = pattern.slice(i + 1, end);
        let negated = '';
        if (body.startsWith('!') || body.startsWith('^')) {
          negated = '^';
          body = body.slice(1);
        }
        source += `[${negated}${body.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')}]`;
        i = end + 1;
        continue;
      }
    }
    source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return new RegExp(`${source}$`);
}

/** The ephemeral file names a candidate backup glob would match. Empty means it is safe. */
export function matchesEphemeralFile(candidateGlob: string): readonly string[] {
  if (typeof candidateGlob !== 'string') {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'candidate glob must be a string' });
  }
  const leaf = globToRegExp(leafOf(candidateGlob));
  return EPHEMERAL_FILE_GLOBS.filter((name) => leaf.test(name));
}

/**
 * Throws when any candidate backup glob would match an ephemeral file.
 *
 * The error names **every** offending candidate and the names each one matched, so a configuration
 * with several bad rules is fixed in one pass rather than one line per CI run.
 */
export function assertNotBackedUp(candidateGlobs: readonly string[]): void {
  if (!Array.isArray(candidateGlobs) || candidateGlobs.some((g) => typeof g !== 'string')) {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', {
      detail: 'candidateGlobs must be an array of strings',
    });
  }
  const offenders = candidateGlobs
    .map((candidate) => ({ candidate, matched: matchesEphemeralFile(candidate) }))
    .filter((entry) => entry.matched.length > 0);
  if (offenders.length === 0) return;

  const detail = offenders
    .map((entry) => `${entry.candidate} -> ${entry.matched.join(', ')}`)
    .join('; ');
  throw new EphemeralError('EPHEMERAL_BACKUP_GLOB_CONFLICT', {
    detail:
      `backup glob(s) would include the ephemeral database, which PRD §10.4/§39.3 excludes: ${detail}`,
  });
}
