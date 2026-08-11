/**
 * DATA-02 deliverable 3's chokepoint — `assertTenantScoped`.
 *
 * Every statement this package executes passes through here, including one compiled from a Kysely
 * builder. The ticket says so twice: "this applies equally to a compiled Kysely query, so a typed
 * query is not exempt from the check". Kysely's typing is a correctness aid, not a security control.
 *
 * # What this proves, and what it does not
 *
 * It proves that the statement carries a bound `organization_id` predicate (or, for an INSERT, a
 * bound `organization_id` column) **and** that the value bound there is the context's organisation.
 * It cannot prove logical containment from SQL text alone: `WHERE id = ? OR organization_id = ?`, or
 * a scope predicate buried in an OR branch, satisfies this check while still being able to return
 * another tenant's rows.
 *
 * That limit is acceptable because this is the *second* line of defence, not the first. The first is
 * that nothing outside `src/tenant/**` can obtain a connection at all, and that the repository
 * factory — the only thing that builds statements — always appends its own scope predicate with
 * `AND`. This function exists to catch the hand-written statement and the future refactor, so it is
 * written to be hard to fool rather than to be a SQL semantic analyser.
 *
 * Three concrete bypasses it is written against, each with a test:
 *   (a) the predicate appears only inside a string literal, a quoted identifier, or a `--` comment;
 *   (b) the bound value is positionally wrong but coincidentally equal to some other bound value;
 *   (c) a multi-statement string where only the first statement is scoped.
 *
 * Bypass (a) covers double quotes, backticks and brackets as well as single quotes (review round 2).
 * In SQLite a double-quoted token that resolves to no column is *silently* treated as a string
 * literal, so `WHERE "organization_id = ?" IS NOT NULL` is the same class of input as the single-quoted
 * form — and a `?` inside such a token is part of the token, not a bind parameter, so counting it
 * would misalign the placeholder arithmetic the whole check rests on.
 */
import { emitTenantAudit } from './audit.js';
import type { TenantContext } from './context.js';
import { TenantAccessError } from './errors.js';

/** The closing delimiter for each opening one SQLite accepts around a token. */
const QUOTE_CLOSE: Readonly<Record<string, string>> = { "'": "'", '"': '"', '`': '`', '[': ']' };

/**
 * Blanks comments and quoted-token *contents* while preserving every source offset.
 *
 * Offsets must survive because the placeholder index is derived by counting `?` up to the
 * predicate's position — bypass (b). Blanking rather than deleting keeps that arithmetic honest.
 *
 * Every quoting form is blanked, not only `'…'`: SQLite silently degrades a double-quoted token that
 * matches no column into a string literal, so `"organization_id = ?"` is a literal wearing a
 * predicate's clothes. The single exception is a token whose content is *exactly* `organization_id`
 * — the legitimate quoted spelling of the column, and the one Kysely emits — which is passed through
 * verbatim so the predicate regex can still see it. Anything else inside the quotes, `?` included,
 * becomes blanks; a `?` inside a quoted token is part of the token and never a bind parameter, so
 * blanking it is also what keeps the placeholder count equal to the driver's.
 *
 * An unterminated quote is blanked to the end of the string: a statement that cannot be tokenised is
 * not a statement this layer will vouch for, and failing closed here means the predicate disappears.
 */
function blankLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  const blank = (ch: string): string => (ch === '\n' || ch === '\r' ? ch : ' ');
  const blankAll = (text: string): string => [...text].map(blank).join('');

  while (i < sql.length) {
    const ch = sql[i] as string;

    const closer = QUOTE_CLOSE[ch];
    if (closer !== undefined) {
      const open = ch;
      // Locate the end of the token, honouring the doubled-delimiter escape (`''`, `""`, ` `` `).
      let j = i + 1;
      let end: number | undefined;
      while (j < sql.length) {
        if (sql[j] !== closer) {
          j += 1;
          continue;
        }
        if (open !== '[' && sql[j + 1] === closer) {
          j += 2;
          continue;
        }
        end = j;
        break;
      }
      const stop = end ?? sql.length;
      const content = sql.slice(i + 1, stop);
      const keepDelimiters = open !== "'";
      if (keepDelimiters && end !== undefined && content.toLowerCase() === 'organization_id') {
        out += open + content + closer;
      } else {
        out += keepDelimiters && end !== undefined ? open : ' ';
        out += blankAll(content);
        if (end !== undefined) out += keepDelimiters ? closer : ' ';
      }
      i = end === undefined ? sql.length : end + 1;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        out += blank(sql[i] as string);
        i += 1;
      }
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          out += '  ';
          i += 2;
          break;
        }
        out += blank(sql[i] as string);
        i += 1;
      }
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/**
 * The column, bare or quoted — and the quotes must *bracket* it, not merely neighbour it.
 *
 * The earlier `["`[]?organization_id["`\]]?` accepted a half-quoted spelling, which after blanking is
 * the tail of some other token rather than a column reference. Requiring balanced delimiters means the
 * only things that match are the four real spellings.
 */
const ORG_COLUMN = '(?:"organization_id"|`organization_id`|\\[organization_id\\]|organization_id)';
/** An optional `table.` qualifier, itself bare or quoted (its content is blanked by then). */
const QUALIFIER = '(?:(?:"[^"]*"|`[^`]*`|\\[[^\\]]*\\]|\\w+)\\s*\\.\\s*)?';
/** Nothing may run into the column name from the left: `my_organization_id` is a different column. */
const LEFT_EDGE = '(?<![A-Za-z0-9_])';

/** `organization_id = ?`, allowing a quoted identifier and an optional table qualifier. */
const SCOPE_PREDICATE = new RegExp(`${LEFT_EDGE}${QUALIFIER}${ORG_COLUMN}\\s*=\\s*\\?`, 'i');
/** The reversed spelling, `? = organization_id`, which is equally valid SQL. */
const SCOPE_PREDICATE_REVERSED = new RegExp(
  `\\?\\s*=\\s*${LEFT_EDGE}${QUALIFIER}${ORG_COLUMN}`,
  'i',
);

/** Which `?` (0-based) sits at `position` in the blanked SQL. */
function placeholderIndexAt(code: string, position: number): number {
  let count = 0;
  for (let i = 0; i < position; i += 1) if (code[i] === '?') count += 1;
  return count;
}

/** Absolute offset of the `?` belonging to the scope predicate, or `undefined`. */
function scopePlaceholderPosition(code: string, from: number): number | undefined {
  const region = code.slice(from);
  const direct = SCOPE_PREDICATE.exec(region);
  if (direct !== null) return from + direct.index + direct[0].lastIndexOf('?');
  const reversed = SCOPE_PREDICATE_REVERSED.exec(region);
  if (reversed !== null) return from + reversed.index + reversed[0].indexOf('?');
  return undefined;
}

function reject(code: 'UNSCOPED_STATEMENT' | 'ORGANIZATION_MISMATCH', message: string, ctx: TenantContext): never {
  emitTenantAudit({
    event: code === 'ORGANIZATION_MISMATCH' ? 'CROSS_TENANT_ACCESS_REFUSED' : 'UNSCOPED_STATEMENT_REFUSED',
    actorId: ctx.actorId,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    reason: message,
  });
  throw new TenantAccessError(code, message);
}

/** Index of the matching `)` for the `(` at `open`, or `undefined`. */
function matchingParen(code: string, open: number): number | undefined {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

/**
 * Rejects a string carrying more than one statement — bypass (c).
 *
 * `better-sqlite3`'s `prepare()` already refuses trailing statements, but relying on that would make
 * the guarantee a property of the driver rather than of this layer, and the check is one line.
 * A single trailing `;` is fine.
 */
function assertSingleStatement(code: string, ctx: TenantContext): void {
  const withoutTrailing = code.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    reject('UNSCOPED_STATEMENT', 'multi-statement SQL is not accepted by the tenant layer', ctx);
  }
}

function assertBoundOrganization(
  parameters: readonly unknown[],
  index: number,
  ctx: TenantContext,
): void {
  if (parameters[index] !== ctx.organizationId) {
    reject(
      'ORGANIZATION_MISMATCH',
      'the statement binds an organization_id that is not the context organisation',
      ctx,
    );
  }
}

/** SELECT / UPDATE / DELETE: the scope predicate must live in (or after) the WHERE clause. */
function assertPredicateStatement(
  code: string,
  parameters: readonly unknown[],
  ctx: TenantContext,
): void {
  const where = /\bwhere\b/i.exec(code);
  if (where === null) {
    reject('UNSCOPED_STATEMENT', 'the statement has no WHERE clause, so it is not tenant-scoped', ctx);
    return;
  }
  const position = scopePlaceholderPosition(code, where.index + where[0].length);
  if (position === undefined) {
    reject('UNSCOPED_STATEMENT', 'the WHERE clause has no bound organization_id predicate', ctx);
    return;
  }
  assertBoundOrganization(parameters, placeholderIndexAt(code, position), ctx);
}

/** INSERT: `organization_id` must be a named column bound to a placeholder in the VALUES tuple. */
function assertInsertStatement(
  code: string,
  parameters: readonly unknown[],
  ctx: TenantContext,
): void {
  const open = code.indexOf('(');
  const close = open < 0 ? undefined : matchingParen(code, open);
  if (open < 0 || close === undefined) {
    reject('UNSCOPED_STATEMENT', 'the INSERT has no explicit column list', ctx);
    return;
  }

  const columns = code
    .slice(open + 1, close)
    .split(',')
    .map((column) => column.trim().replace(/^["`[]|["`\]]$/g, '').toLowerCase());
  const columnIndex = columns.indexOf('organization_id');
  if (columnIndex < 0) {
    reject('UNSCOPED_STATEMENT', 'the INSERT column list does not include organization_id', ctx);
    return;
  }

  const values = /\bvalues\s*\(/i.exec(code.slice(close + 1));
  if (values === null) {
    reject('UNSCOPED_STATEMENT', 'the INSERT has no VALUES tuple', ctx);
    return;
  }
  const tupleOpen = close + 1 + values.index + values[0].lastIndexOf('(');
  const tupleClose = matchingParen(code, tupleOpen);
  if (tupleClose === undefined) {
    reject('UNSCOPED_STATEMENT', 'the INSERT VALUES tuple is unterminated', ctx);
    return;
  }

  const items = code.slice(tupleOpen + 1, tupleClose).split(',');
  const item = items[columnIndex];
  if (item === undefined || !item.includes('?')) {
    reject('UNSCOPED_STATEMENT', 'the INSERT does not bind organization_id to a placeholder', ctx);
    return;
  }
  // Absolute offset of that tuple item, so the `?` count is over the whole statement.
  let offset = tupleOpen + 1;
  for (let i = 0; i < columnIndex; i += 1) offset += (items[i]?.length ?? 0) + 1;
  assertBoundOrganization(parameters, placeholderIndexAt(code, offset + item.indexOf('?')), ctx);
}

/**
 * Throws unless `sql` is tenant-scoped to `ctx`.
 *
 * @param scopeIndex when the caller *built* the predicate it can say which parameter it bound;
 * the check then proves the predicate exists and that this exact binding matches, instead of
 * re-deriving the binding by counting placeholders. The repository always passes it; a hand-written
 * statement usually cannot, and takes the counting path.
 */
export function assertTenantScoped(
  sql: string,
  parameters: readonly unknown[],
  ctx: TenantContext,
  scopeIndex?: number,
): void {
  const code = blankLiteralsAndComments(sql);
  assertSingleStatement(code, ctx);

  if (scopeIndex !== undefined) {
    if (scopePlaceholderPosition(code, 0) === undefined) {
      reject('UNSCOPED_STATEMENT', 'the statement has no bound organization_id predicate', ctx);
    }
    assertBoundOrganization(parameters, scopeIndex, ctx);
    return;
  }

  if (/^\s*(?:select|update|delete)\b/i.test(code)) {
    assertPredicateStatement(code, parameters, ctx);
    return;
  }
  if (/^\s*insert\s+(?:or\s+\w+\s+)?into\b/i.test(code)) {
    assertInsertStatement(code, parameters, ctx);
    return;
  }
  reject(
    'UNSCOPED_STATEMENT',
    'only SELECT, INSERT, UPDATE and DELETE reach the tenant layer; DDL belongs in a .sql migration',
    ctx,
  );
}
