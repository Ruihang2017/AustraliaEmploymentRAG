/**
 * DATA-01 deliverable 6 — the expand-only policy (PRD §20.4, §39.7 step 4).
 *
 * Migrations are expand-only by default. A destructive change opts in with a header block:
 *
 * ```sql
 * -- aer:phase contract
 * -- aer:expanded-in 20260803120000_tenancy
 * ```
 *
 * and the runner then refuses to apply it unless `<expanded-in>` is already in `schema_migration`
 * with a *different* `run_id` — the mechanical form of "destructive/contract changes are not
 * permitted in the same release that removes old readers".
 */
import { MigrationError } from './errors.js';

export type MigrationPhase = 'expand' | 'contract';

export interface MigrationHeader {
  phase: MigrationPhase;
  /**
   * The migration this one contracts, as a full `*.sql` filename so it compares directly against
   * `schema_migration.name`. Present only on `contract` migrations.
   */
  expandedIn?: string | undefined;
}

const PHASE_DIRECTIVE = /^--\s*aer:phase\s+(\S+)\s*$/i;
const EXPANDED_IN_DIRECTIVE = /^--\s*aer:expanded-in\s+(\S+)\s*$/i;

/**
 * Reads the `aer:` directives out of the **raw** text — the directives are themselves comments, so
 * they must be read before any comment stripping.
 *
 * Only the leading run of blank and `--` comment lines counts as the header. A directive further
 * down the file is an ordinary comment and is ignored; putting it there would otherwise let a
 * contract migration hide its opt-in below a screen of DDL.
 */
export function parseMigrationHeader(sql: string, name = '<sql>'): MigrationHeader {
  let phase: MigrationPhase | undefined;
  let expandedIn: string | undefined;

  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (!line.startsWith('--')) break;

    const phaseMatch = PHASE_DIRECTIVE.exec(line);
    if (phaseMatch) {
      const value = phaseMatch[1]?.toLowerCase();
      if (value !== 'expand' && value !== 'contract') {
        throw new MigrationError(
          'INVALID_MIGRATION_PHASE',
          `${name}: "-- aer:phase ${phaseMatch[1]}" is not a phase; use "expand" or "contract"`,
          { name },
        );
      }
      phase = value;
      continue;
    }

    const expandedMatch = EXPANDED_IN_DIRECTIVE.exec(line);
    if (expandedMatch?.[1] !== undefined) {
      const target = expandedMatch[1];
      expandedIn = target.endsWith('.sql') ? target : `${target}.sql`;
    }
  }

  const resolved: MigrationPhase = phase ?? 'expand';
  if (resolved === 'contract' && expandedIn === undefined) {
    throw new MigrationError(
      'CONTRACT_MISSING_EXPANDED_IN',
      `${name}: a "-- aer:phase contract" migration must also declare ` +
        '"-- aer:expanded-in <migration>" (PRD §39.7 step 4)',
      { name },
    );
  }
  return resolved === 'contract' ? { phase: resolved, expandedIn } : { phase: resolved };
}

/**
 * Blanks out `--` line comments, `/* … *\/` block comments and `'…'` string literals, replacing each
 * removed character with a space and **keeping every newline**, so byte offsets and therefore line
 * numbers still line up with the original text.
 *
 * One left-to-right scan, not three independent regexes: a `--` inside a string literal and a `'`
 * inside a comment both have to be handled by whatever state the scanner is already in, which is
 * exactly what makes `SELECT 'DROP TABLE x'` and `-- we will never DROP TABLE here` safe.
 *
 * Double-quoted and backtick-quoted text is left alone: in SQLite those are identifiers, not
 * strings, and a table literally named `drop table` is not something to be lenient about.
 */
export function stripSqlNoise(sql: string): string {
  const out: string[] = [];
  let index = 0;

  const blank = (text: string): void => {
    for (const char of text) out.push(char === '\n' ? '\n' : ' ');
  };

  while (index < sql.length) {
    const char = sql[index] as string;
    const next = sql[index + 1];

    if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index);
      const stop = end === -1 ? sql.length : end;
      blank(sql.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(sql.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === "'") {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'") {
          if (sql[cursor + 1] === "'") {
            cursor += 2; // '' is an escaped quote, the literal continues
            continue;
          }
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      blank(sql.slice(index, cursor));
      index = cursor;
      continue;
    }

    out.push(char);
    index += 1;
  }

  return out.join('');
}

interface Statement {
  /** The statement text with comments and string literals already blanked out. */
  text: string;
  /** Offset of the statement's first character within the stripped (and original) text. */
  offset: number;
}

/** Splits stripped SQL on `;`. Fragments are analysed individually; see the checks below. */
function splitStatements(stripped: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  for (let index = 0; index <= stripped.length; index += 1) {
    if (index === stripped.length || stripped[index] === ';') {
      const text = stripped.slice(start, index);
      if (text.trim().length > 0) statements.push({ text, offset: start });
      start = index + 1;
    }
  }
  return statements;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') line += 1;
  }
  return line;
}

/** Offset of the first non-whitespace character of a statement, for a useful line number. */
function statementStart(statement: Statement): number {
  const leading = statement.text.length - statement.text.trimStart().length;
  return statement.offset + leading;
}

interface Violation {
  construct: string;
  offset: number;
}

const ALTER_TABLE = /\balter\s+table\b/i;

/** A bare, `"…"`, `[…]` or `` `…` `` quoted SQLite identifier. */
const IDENTIFIER = String.raw`(?:"[^"]*"|\[[^\]]*\]|` + '`[^`]*`' + String.raw`|[A-Za-z_][A-Za-z0-9_$]*)`;

const DROP_INDEX = new RegExp(
  String.raw`\bdrop\s+index\s+(?:if\s+exists\s+)?(${IDENTIFIER}(?:\s*\.\s*${IDENTIFIER})?)`,
  'i',
);

/**
 * Normalises an index name for comparison against `uniqueIndexNames`: drops any `schema.` qualifier,
 * removes the quoting, and lower-cases. SQLite identifiers are case-insensitive, and `main.foo`,
 * `"foo"` and `foo` all name the same index.
 */
function normaliseIndexName(raw: string): string {
  const last = raw.split('.').at(-1)?.trim() ?? raw.trim();
  const unquoted =
    (last.startsWith('"') && last.endsWith('"')) ||
    (last.startsWith('[') && last.endsWith(']')) ||
    (last.startsWith('`') && last.endsWith('`'))
      ? last.slice(1, -1)
      : last;
  return unquoted.toLowerCase();
}

function findViolations(
  statements: readonly Statement[],
  uniqueIndexNames: ReadonlySet<string> | undefined,
): Violation[] {
  const violations: Violation[] = [];

  for (const statement of statements) {
    const { text } = statement;
    const trimmed = text.trimStart();

    const dropTable = /\bdrop\s+table\b/i.exec(text);
    if (dropTable) {
      violations.push({ construct: 'DROP TABLE', offset: statement.offset + dropTable.index });
    }

    // `DROP INDEX` is rejected only for a *uniqueness-carrying* index (ticket deliverable 6):
    // dropping and rebuilding a plain lookup index is a legitimate expand-phase change, whereas
    // dropping a unique index silently removes a constraint old readers still rely on.
    //
    // Uniqueness is not decidable from one file's text — the `CREATE UNIQUE INDEX` may be months of
    // migrations away — so the *runner* supplies the live set from `pragma index_list` before each
    // apply. When that set is absent (a caller with no database in hand) the check **fails closed**
    // and rejects, because "unknown" must never read as "not unique".
    const dropIndex = DROP_INDEX.exec(text);
    if (dropIndex) {
      const raw = dropIndex[1] as string;
      const indexName = normaliseIndexName(raw);
      if (uniqueIndexNames === undefined) {
        violations.push({
          construct: `DROP INDEX ${raw.trim()} (index uniqueness unknown — no live database to check against)`,
          offset: statement.offset + dropIndex.index,
        });
      } else if (uniqueIndexNames.has(indexName)) {
        violations.push({
          construct: `DROP INDEX ${raw.trim()} (unique index)`,
          offset: statement.offset + dropIndex.index,
        });
      }
    } else if (/\bdrop\s+index\b/i.test(text)) {
      // `DROP INDEX` whose target this scanner could not parse. Fail closed rather than wave it
      // through — an unparseable target is exactly the case where a mistake would be invisible.
      const fallback = /\bdrop\s+index\b/i.exec(text) as RegExpExecArray;
      violations.push({
        construct: 'DROP INDEX (target index name could not be parsed)',
        offset: statement.offset + fallback.index,
      });
    }

    if (ALTER_TABLE.test(text)) {
      // Any DROP inside ALTER TABLE is a column drop: SQLite accepts both
      // `ALTER TABLE t DROP COLUMN c` and `ALTER TABLE t DROP c`.
      const drop = /\bdrop\b/i.exec(text);
      if (drop) {
        violations.push({
          construct: 'ALTER TABLE … DROP COLUMN',
          offset: statement.offset + drop.index,
        });
      }
      const rename = /\brename\b/i.exec(text);
      if (rename) {
        violations.push({
          construct: 'ALTER TABLE … RENAME',
          offset: statement.offset + rename.index,
        });
      }
    }

    // Whole-statement shapes. Anchored at the statement start so a `DELETE`/`UPDATE` inside a
    // `CREATE TRIGGER … BEGIN … END` body is not mistaken for a top-level unqualified write.
    if (/^delete\s+from\b/i.test(trimmed) && !/\bwhere\b/i.test(text)) {
      violations.push({ construct: 'DELETE FROM without WHERE', offset: statementStart(statement) });
    }
    if (/^update\b/i.test(trimmed) && /\bset\b/i.test(text) && !/\bwhere\b/i.test(text)) {
      violations.push({ construct: 'UPDATE without WHERE', offset: statementStart(statement) });
    }
  }

  return violations;
}

/**
 * Statements that cannot run inside the runner's per-migration transaction.
 *
 * Each migration body is executed inside one `BEGIN IMMEDIATE` so that its ledger row commits with
 * it. `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`, `VACUUM` and `PRAGMA journal_mode` all fail in that
 * position; rejecting them here produces an error naming the migration and line instead of SQLite's
 * context-free "cannot start a transaction within a transaction".
 *
 * Matched only at a statement start, so the `BEGIN … END` of a `CREATE TRIGGER` body is untouched.
 */
function findTransactionControl(statements: readonly Statement[]): Violation[] {
  const violations: Violation[] = [];
  for (const statement of statements) {
    const trimmed = statement.text.trimStart();
    const control = /^(begin|commit|end\s+transaction|rollback|savepoint|release|vacuum)\b/i.exec(
      trimmed,
    );
    if (control) {
      violations.push({
        construct: (control[1] as string).toUpperCase(),
        offset: statementStart(statement),
      });
      continue;
    }
    if (/^pragma\s+journal_mode\b/i.test(trimmed)) {
      violations.push({ construct: 'PRAGMA journal_mode', offset: statementStart(statement) });
    }
  }
  return violations;
}

export interface ExpandOnlyMeta extends MigrationHeader {
  name: string;
  /**
   * Names of the indexes that currently carry uniqueness, lower-cased, as read from the live
   * database by the runner (`pragma index_list` filtered on `unique = 1`) immediately before this
   * migration is applied.
   *
   * Omitting it is **not** a way to opt out of the check: an absent set makes every `DROP INDEX` a
   * violation (fail closed), because a caller with no database in hand cannot show that the index
   * is safe to drop.
   */
  uniqueIndexNames?: ReadonlySet<string> | undefined;
}

/**
 * Rejects destructive constructs in an `expand` migration, and transaction-control statements in
 * any migration.
 *
 * A `contract` migration is allowed its destructive constructs — that is the whole point of the
 * opt-in — but the *runner* still refuses to apply it in the same run as the expand it supersedes.
 */
export function assertExpandOnly(sql: string, meta: ExpandOnlyMeta): void {
  const stripped = stripSqlNoise(sql);
  const statements = splitStatements(stripped);

  const control = findTransactionControl(statements);
  if (control.length > 0) {
    const first = control[0] as Violation;
    throw new MigrationError(
      'TRANSACTION_CONTROL_IN_MIGRATION',
      `${meta.name}:${lineOf(stripped, first.offset)}: ${first.construct} cannot appear in a ` +
        'migration body — the runner already wraps each migration in one BEGIN IMMEDIATE ' +
        'transaction together with its ledger row',
      { name: meta.name, line: lineOf(stripped, first.offset) },
    );
  }

  if (meta.phase === 'contract') return;

  const violations = findViolations(statements, meta.uniqueIndexNames);
  if (violations.length === 0) return;

  const described = violations.map(
    (violation) => `line ${lineOf(stripped, violation.offset)}: ${violation.construct}`,
  );
  const first = violations[0] as Violation;
  throw new MigrationError(
    'DESTRUCTIVE_STATEMENT',
    `${meta.name} is an expand migration but contains ${described.join('; ')} — declare ` +
      '"-- aer:phase contract" plus "-- aer:expanded-in <migration>" and ship it in a later ' +
      'release (PRD §20.4, §39.7 step 4)',
    { name: meta.name, line: lineOf(stripped, first.offset), violations: described },
  );
}
