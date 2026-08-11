import { afterEach, describe, expect, it } from 'vitest';

import { resetTenantAuditSink, setTenantAuditSink } from '../../src/tenant/audit.js';
import type { TenantAuditEvent } from '../../src/tenant/audit.js';
import { TenantAccessError } from '../../src/tenant/errors.js';
import { assertTenantScoped } from '../../src/tenant/scoped-sql.js';
import { ORG_A, ORG_B, contextFor, withTenantDatabase } from './helpers.js';

const ctx = contextFor(ORG_A);

afterEach(() => {
  resetTenantAuditSink();
});

function codeOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    return (error as TenantAccessError).code;
  }
  throw new Error('expected a throw');
}

describe('assertTenantScoped — accepts a correctly scoped statement', () => {
  it('accepts SELECT / UPDATE / DELETE with a bound predicate', () => {
    expect(() =>
      assertTenantScoped('select * from t where id = ? and organization_id = ?', ['p1', ORG_A], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('update t set label = ? where organization_id = ? and id = ?', ['x', ORG_A, 'p1'], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('delete from t where organization_id = ?', [ORG_A], ctx),
    ).not.toThrow();
  });

  it('accepts a quoted or table-qualified column, and the reversed spelling', () => {
    expect(() =>
      assertTenantScoped('select * from t where "organization_id" = ?', [ORG_A], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('select * from t where t.organization_id = ?', [ORG_A], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('select * from t where ? = organization_id', [ORG_A], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('select * from t where `organization_id` = ?', [ORG_A], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('select * from t where [organization_id] = ?', [ORG_A], ctx),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped('select * from t where "t"."organization_id" = ?', [ORG_A], ctx),
    ).not.toThrow();
  });

  it('accepts an INSERT that binds organization_id', () => {
    expect(() =>
      assertTenantScoped(
        'insert into t ("organization_id", "id", "label") values (?, ?, ?)',
        [ORG_A, 'p1', 'x'],
        ctx,
      ),
    ).not.toThrow();
    expect(() =>
      assertTenantScoped(
        'insert into t ("id", "organization_id") values (?, ?)',
        ['p1', ORG_A],
        ctx,
      ),
    ).not.toThrow();
  });
});

describe('assertTenantScoped — rejections', () => {
  it('rejects a statement with no organization_id predicate', () => {
    expect(codeOf(() => assertTenantScoped('select * from t where id = ?', ['p1'], ctx))).toBe(
      'UNSCOPED_STATEMENT',
    );
  });

  it('rejects a statement with no WHERE clause at all', () => {
    expect(codeOf(() => assertTenantScoped('select * from t', [], ctx))).toBe('UNSCOPED_STATEMENT');
  });

  it('rejects a bound organization_id that is not the context organisation', () => {
    expect(
      codeOf(() => assertTenantScoped('select * from t where organization_id = ?', [ORG_B], ctx)),
    ).toBe('ORGANIZATION_MISMATCH');
  });

  it('rejects a predicate that exists only inside a string literal (bypass a)', () => {
    expect(
      codeOf(() =>
        assertTenantScoped("select * from t where label = 'organization_id = ?'", [ORG_A], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
  });

  it('rejects a predicate that exists only inside a quoted identifier (bypass a, review round 2)', () => {
    // SQLite silently treats a double-quoted token that resolves to no column as a string literal, so
    // this statement carries no tenant predicate at all — and the `?` inside the token is part of the
    // token, not a bind parameter, so accepting it would also have validated the wrong bind.
    expect(
      codeOf(() =>
        assertTenantScoped(
          'select * from t where "organization_id = ?" is not null and label = ?',
          [ORG_A],
          ctx,
        ),
      ),
    ).toBe('UNSCOPED_STATEMENT');
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where `organization_id = ?` is not null', [ORG_A], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where [organization_id = ?] is not null', [ORG_A], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
    // The same shape as an INSERT column name.
    expect(
      codeOf(() =>
        assertTenantScoped('insert into t ("id", "organization_id, x") values (?, ?)', ['p1', ORG_A], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
  });

  it('counts a ? inside a quoted token as part of the token, not as a placeholder', () => {
    // The real predicate binds parameter index 1. If the `?` inside the quoted identifier were
    // counted, the check would look at index 2 (out of range) or at `'p1'` and reject a legitimate
    // statement — the arithmetic blanking exists to protect.
    expect(() =>
      assertTenantScoped(
        'select * from t where "an odd ? column" = ? and "organization_id" = ?',
        ['p1', ORG_A],
        ctx,
      ),
    ).not.toThrow();
    expect(
      codeOf(() =>
        assertTenantScoped(
          'select * from t where "an odd ? column" = ? and "organization_id" = ?',
          [ORG_A, 'p1'],
          ctx,
        ),
      ),
    ).toBe('ORGANIZATION_MISMATCH');
  });

  it('rejects a half-quoted or run-together spelling of the column', () => {
    expect(
      codeOf(() => assertTenantScoped('select * from t where my_organization_id = ?', [ORG_A], ctx)),
    ).toBe('UNSCOPED_STATEMENT');
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where id = ? and "unterminated', ['p1'], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
  });

  it('rejects a predicate that exists only inside a comment (bypass a)', () => {
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where id = ? -- and organization_id = ?', ['p1'], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where id = ? /* organization_id = ? */', ['p1'], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
  });

  it('counts placeholders rather than searching the parameters (bypass b)', () => {
    // `label` coincidentally equals the organisation id. A scan of the parameter array for a
    // matching value would find it and pass; positional counting does not.
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where label = ? and id = ?', [ORG_A, 'p1'], ctx),
      ),
    ).toBe('UNSCOPED_STATEMENT');
    expect(
      codeOf(() =>
        assertTenantScoped(
          'select * from t where label = ? and organization_id = ?',
          [ORG_A, ORG_B],
          ctx,
        ),
      ),
    ).toBe('ORGANIZATION_MISMATCH');
  });

  it('rejects multi-statement SQL where only the first statement is scoped (bypass c)', () => {
    expect(
      codeOf(() =>
        assertTenantScoped(
          'select * from t where organization_id = ?; select * from t',
          [ORG_A],
          ctx,
        ),
      ),
    ).toBe('UNSCOPED_STATEMENT');
  });

  it('tolerates a single trailing semicolon', () => {
    expect(() =>
      assertTenantScoped('select * from t where organization_id = ?;', [ORG_A], ctx),
    ).not.toThrow();
  });

  it('rejects an INSERT without an organization_id column or binding', () => {
    expect(
      codeOf(() => assertTenantScoped('insert into t ("id") values (?)', ['p1'], ctx)),
    ).toBe('UNSCOPED_STATEMENT');
    expect(
      codeOf(() =>
        assertTenantScoped(
          "insert into t (\"id\", \"organization_id\") values (?, 'org-literal')",
          ['p1'],
          ctx,
        ),
      ),
    ).toBe('UNSCOPED_STATEMENT');
  });

  it('rejects an INSERT binding another organisation', () => {
    expect(
      codeOf(() =>
        assertTenantScoped('insert into t ("id", "organization_id") values (?, ?)', ['p1', ORG_B], ctx),
      ),
    ).toBe('ORGANIZATION_MISMATCH');
  });

  it('rejects DDL and anything that is not a plain CRUD statement', () => {
    expect(codeOf(() => assertTenantScoped('drop table t', [], ctx))).toBe('UNSCOPED_STATEMENT');
    expect(codeOf(() => assertTenantScoped('pragma foreign_keys = OFF', [], ctx))).toBe(
      'UNSCOPED_STATEMENT',
    );
  });

  it('honours an explicit scopeIndex without trusting it blindly', () => {
    // The predicate must still exist; naming an index does not excuse an unscoped statement.
    expect(codeOf(() => assertTenantScoped('select * from t where id = ?', [ORG_A], ctx, 0))).toBe(
      'UNSCOPED_STATEMENT',
    );
    expect(
      codeOf(() =>
        assertTenantScoped('select * from t where organization_id = ? and id = ?', [ORG_B, 'p'], ctx, 0),
      ),
    ).toBe('ORGANIZATION_MISMATCH');
    expect(() =>
      assertTenantScoped('select * from t where organization_id = ? and id = ?', [ORG_A, 'p'], ctx, 0),
    ).not.toThrow();
  });

  it('emits an audit event on every rejection', () => {
    const events: TenantAuditEvent[] = [];
    setTenantAuditSink((event) => events.push(event));
    expect(() => assertTenantScoped('select * from t', [], ctx)).toThrow();
    expect(() =>
      assertTenantScoped('select * from t where organization_id = ?', [ORG_B], ctx),
    ).toThrow();
    expect(events.map((event) => event.event)).toEqual([
      'UNSCOPED_STATEMENT_REFUSED',
      'CROSS_TENANT_ACCESS_REFUSED',
    ]);
  });
});

describe('a compiled Kysely query is not exempt', () => {
  it('rejects a typed query that omits the tenant predicate', async () => {
    await withTenantDatabase(({ db }) => {
      const unscoped = db.qb.selectFrom('t_parent').selectAll().where('id', '=', 'p1').compile();
      expect(codeOf(() => assertTenantScoped(unscoped.sql, unscoped.parameters, ctx))).toBe(
        'UNSCOPED_STATEMENT',
      );
    });
  });

  it('rejects a typed query bound to another organisation', async () => {
    await withTenantDatabase(({ db }) => {
      const wrongOrg = db.qb
        .selectFrom('t_parent')
        .selectAll()
        .where('organization_id', '=', ORG_B)
        .compile();
      expect(codeOf(() => assertTenantScoped(wrongOrg.sql, wrongOrg.parameters, ctx))).toBe(
        'ORGANIZATION_MISMATCH',
      );
    });
  });

  it('accepts the query the repository actually builds', async () => {
    await withTenantDatabase(({ db }) => {
      const scoped = db.qb
        .selectFrom('t_parent')
        .selectAll()
        .where('id', '=', 'p1')
        .where('organization_id', '=', ORG_A)
        .compile();
      expect(() => assertTenantScoped(scoped.sql, scoped.parameters, ctx)).not.toThrow();
    });
  });
});
