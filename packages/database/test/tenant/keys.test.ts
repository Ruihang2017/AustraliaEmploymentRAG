import { describe, expect, it } from 'vitest';

import { TenantAccessError } from '../../src/tenant/errors.js';
import { tenantForeignKey, tenantUnique } from '../../src/tenant/keys.js';
import { ORG_A, ORG_B, withTenantDatabase } from './helpers.js';

describe('tenantForeignKey / tenantUnique — emitted SQL text', () => {
  it('carries organization_id into both sides of the reference', () => {
    const key = tenantForeignKey({ childTable: 't_child', parentTable: 't_parent', column: 'parent_id' });
    expect(key.childConstraint).toBe(
      'FOREIGN KEY (organization_id, parent_id) REFERENCES t_parent(organization_id, id)',
    );
    expect(key.parentConstraint).toBe('UNIQUE (organization_id, id)');
  });

  it('prepends organization_id to a unique key (PRD §35.1)', () => {
    expect(tenantUnique(['label'])).toBe('UNIQUE (organization_id, label)');
    expect(tenantUnique(['a', 'b'])).toBe('UNIQUE (organization_id, a, b)');
  });

  it('refuses malformed input rather than emitting unusable SQL', () => {
    expect(() => tenantForeignKey({ childTable: 'x; drop table y', parentTable: 'p', column: 'c' })).toThrow(
      TenantAccessError,
    );
    expect(() =>
      tenantForeignKey({ childTable: 'c', parentTable: 'p', column: 'organization_id' }),
    ).toThrow(/tenant discriminator/);
    expect(() => tenantUnique([])).toThrow(/at least one column/);
    expect(() => tenantUnique(['organization_id'])).toThrow(/prepended automatically/);
    expect(() => tenantUnique(['a', 'a'])).toThrow(/duplicate/);
  });
});

describe('the composite key blocks a cross-tenant child at the database level', () => {
  it('rejects a child row pointing at another organisation\'s parent (PRD §35.8 invariant 4)', async () => {
    await withTenantDatabase(({ db }) => {
      // Assert the pragma first: `foreign_keys` is per connection and NOT persisted, so a silently
      // disabled pragma would make the insert below succeed and this test pass for the wrong reason.
      expect(db.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

      db.sqlite
        .prepare('INSERT INTO t_parent (id, organization_id, label) VALUES (?, ?, ?)')
        .run('p-a', ORG_A, 'a');
      db.sqlite
        .prepare('INSERT INTO t_parent (id, organization_id, label) VALUES (?, ?, ?)')
        .run('p-b', ORG_B, 'b');

      const insertChild = db.sqlite.prepare(
        'INSERT INTO t_child (id, organization_id, parent_id) VALUES (?, ?, ?)',
      );

      // Same organisation: allowed.
      expect(() => insertChild.run('c-a', ORG_A, 'p-a')).not.toThrow();

      // Organisation B's child pointing at organisation A's parent: refused by SQLite itself.
      let code: unknown;
      try {
        insertChild.run('c-x', ORG_B, 'p-a');
      } catch (error) {
        code = (error as { code?: unknown }).code;
      }
      expect(code).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');

      // And the row is not there.
      const rows = db.sqlite.prepare('SELECT id FROM t_child').all() as { id: string }[];
      expect(rows.map((row) => row.id)).toEqual(['c-a']);
    });
  });

  it('enforces the tenant-prefixed unique key', async () => {
    await withTenantDatabase(({ db }) => {
      const insert = db.sqlite.prepare(
        'INSERT INTO t_parent (id, organization_id, label) VALUES (?, ?, ?)',
      );
      insert.run('p1', ORG_A, 'shared-label');
      // The same label in a different organisation is fine — that is the point of prepending
      // organization_id rather than declaring UNIQUE (label).
      expect(() => insert.run('p2', ORG_B, 'shared-label')).not.toThrow();
      // The same label twice in one organisation is not.
      expect(() => insert.run('p3', ORG_A, 'shared-label')).toThrow(/UNIQUE/);
    });
  });
});
