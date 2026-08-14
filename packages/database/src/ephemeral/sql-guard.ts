/**
 * DATA-08 deliverable 1 — the *static* half of the attach guard.
 *
 * PRD §10.4 requires ephemeral content to live only in `ephemeral.sqlite`, never `app.sqlite`. An
 * `ATTACH` from this connection would let one transaction span both files and defeat that
 * separation, so no statement this module executes may contain `ATTACH`/`DETACH`.
 *
 * `better-sqlite3` 13 exposes no `sqlite3_set_authorizer` binding, so a C-level refusal is not
 * available. The guard is therefore three cooperating layers, all required:
 *
 *  1. this static screen on every SQL string the module executes;
 *  2. `assertNoAttachedDatabases` (`connection.ts`), a `PRAGMA database_list` check that does not
 *     depend on string matching, run on open, on startup cleanup and on every sweep;
 *  3. never handing out the raw `better-sqlite3` handle — see `internalSqlite` in `connection.ts`.
 *
 * Any one of the three alone is defeatable.
 */
import { EphemeralError } from './errors.js';

const ATTACH_KEYWORD = /\b(?:attach|detach)\b/i;

/**
 * Removes `--` line comments, `/* *\/` block comments and single/double-quoted literals, so a
 * literal containing the word "attach" cannot be mistaken for the keyword and a comment cannot hide
 * one. Parameters are always bound, never interpolated, so a *value* containing "attach" never
 * reaches this function at all.
 */
export function stripSqlNoise(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === ch) {
          // Doubled quote inside a literal is an escaped quote, not the end of the literal.
          if (sql[i + 1] === ch) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    if (ch === '[') {
      const end = sql.indexOf(']', i);
      i = end === -1 ? sql.length : end + 1;
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Throws `EPHEMERAL_ATTACH_FORBIDDEN` when `sql` contains an `ATTACH`/`DETACH` keyword. */
export function assertNoAttach(sql: string): void {
  if (typeof sql !== 'string') {
    throw new EphemeralError('EPHEMERAL_INPUT_INVALID', { detail: 'sql must be a string' });
  }
  if (ATTACH_KEYWORD.test(stripSqlNoise(sql))) {
    throw new EphemeralError('EPHEMERAL_ATTACH_FORBIDDEN');
  }
}
