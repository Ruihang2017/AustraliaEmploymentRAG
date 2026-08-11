import { describe, expect, it } from 'vitest';

import { defineTenantRepository } from '../../src/tenant/repository.js';
import { systemContext } from '../../src/tenant/context.js';
import { TenantAccessError } from '../../src/tenant/errors.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';
import {
  CHILD_SPEC,
  GLOBAL_SPEC,
  ORG_A,
  PARENT_SPEC,
  UNSCOPED_SPEC,
  contextFor,
  withTenantDatabase,
} from './helpers.js';

const parent = defineTenantRepository({ table: 't_parent', spec: PARENT_SPEC });
const child = defineTenantRepository({ table: 't_child', spec: CHILD_SPEC });
const global = defineTenantRepository({ table: 't_global', spec: GLOBAL_SPEC });

describe('defineTenantRepository — construction-time refusals', () => {
  it('refuses a TENANT table whose requiredColumns lack organization_id (PRD §15.4)', () => {
    expect(() => defineTenantRepository({ table: 't_unscoped', spec: UNSCOPED_SPEC })).toThrow(
      /organization_id/,
    );
    try {
      defineTenantRepository({ table: 't_unscoped', spec: UNSCOPED_SPEC });
    } catch (error) {
      expect((error as TenantAccessError).code).toBe('INVALID_SPEC');
    }
  });

  it('refuses a table name that does not match its TableSpec', () => {
    expect(() => defineTenantRepository({ table: 't_other', spec: PARENT_SPEC })).toThrow(
      /scope a different table/,
    );
  });

  it('refuses a table whose requiredColumns lack id', () => {
    expect(() =>
      defineTenantRepository({
        table: 't_parent',
        spec: { ...PARENT_SPEC, requiredColumns: ['organization_id'] },
      }),
    ).toThrow(/id/);
  });
});

describe('defineTenantRepository — no callable without a TenantContext', () => {
  it('exposes no query member on the definition itself', () => {
    const surface = Object.keys(parent);
    expect(surface.sort()).toEqual(['for', 'spec', 'table']);
  });

  it('refuses to bind without a context, for a JavaScript caller', async () => {
    await withTenantDatabase(({ db }) => {
      const bind = parent.for as unknown as (a: unknown, b: unknown) => unknown;
      expect(() => bind(db, undefined)).toThrow(TenantAccessError);
      expect(() => bind(db, null)).toThrow(/TenantContext/);
    });
  });

  it('refuses a structurally-identical forged context', async () => {
    await withTenantDatabase(({ db }) => {
      const real = contextFor(ORG_A);
      // The classic forgery: a spread copy with a different organisation. The brand is
      // non-enumerable, so the spread drops it.
      const forged = { ...real, organizationId: 'org-attacker' };
      expect(() => parent.for(db, forged)).toThrow(/TenantContext/);
      expect(() => parent.for(db, { ...real })).toThrow(/TenantContext/);
    });
  });
});

describe('defineTenantRepository — scope pairing', () => {
  it('refuses a systemContext on a TENANT table', async () => {
    await withTenantDatabase(({ db }) => {
      expect(() => parent.for(db, systemContext('GLOBAL', 'req-1'))).toThrow(/TENANT-scoped/);
    });
  });

  it('refuses a tenant context on a GLOBAL table (PRD §35.6)', async () => {
    await withTenantDatabase(({ db }) => {
      expect(() => global.for(db, contextFor(ORG_A))).toThrow(/GLOBAL-scoped/);
    });
  });

  it('accepts the matching pairing in both directions', async () => {
    await withTenantDatabase(({ db }) => {
      expect(() => parent.for(db, contextFor(ORG_A))).not.toThrow();
      expect(() => global.for(db, systemContext('GLOBAL', 'req-1'))).not.toThrow();
    });
  });
});

describe('mutability removes the mutating members (PRD §35.8 invariant 5)', () => {
  it('leaves update/delete absent at runtime on an APPEND_ONLY repository', async () => {
    await withTenantDatabase(({ db }) => {
      const repo = child.for(db, contextFor(ORG_A)) as Record<string, unknown>;
      expect(repo['update']).toBeUndefined();
      expect(repo['delete']).toBeUndefined();
      expect('update' in repo).toBe(false);
      expect('delete' in repo).toBe(false);
      expect(typeof repo['insert']).toBe('function');
    });
  });

  it('keeps them on a MUTABLE_METADATA repository', async () => {
    await withTenantDatabase(({ db }) => {
      const repo = parent.for(db, contextFor(ORG_A)) as Record<string, unknown>;
      expect(typeof repo['update']).toBe('function');
      expect(typeof repo['delete']).toBe('function');
    });
  });
});

describe('repository reads and writes', () => {
  it('round-trips insert, get, list, update and delete', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const repo = parent.for(db, ctx);

      withTenantTransaction(db, ctx, (tx) => {
        repo.insert(tx, { id: 'p1', label: 'first' });
        repo.insert(tx, { id: 'p2', label: 'second' });
      });

      expect(repo.get('p1')).toMatchObject({ id: 'p1', label: 'first', organization_id: ORG_A });
      expect(repo.list().map((row) => (row as Record<string, unknown>)['id'])).toEqual(['p1', 'p2']);
      expect(repo.list({ limit: 1 })).toHaveLength(1);

      withTenantTransaction(db, ctx, (tx) => {
        repo.update(tx, 'p1', { label: 'renamed' });
      });
      expect((repo.get('p1') as Record<string, unknown>)['label']).toBe('renamed');

      withTenantTransaction(db, ctx, (tx) => {
        repo.delete(tx, 'p2');
      });
      expect(repo.find('p2')).toBeUndefined();
    });
  });

  it('supplies organization_id from the context and refuses a caller-supplied one', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const repo = parent.for(db, ctx);
      withTenantTransaction(db, ctx, (tx) => {
        const row = repo.insert(tx, { id: 'p1', label: 'first' }) as Record<string, unknown>;
        expect(row['organization_id']).toBe(ORG_A);
        expect(() => repo.insert(tx, { id: 'p2', label: 'x', organization_id: 'org-other' })).toThrow(
          /cannot be set by the caller/,
        );
      });
    });
  });

  it('refuses a write without an open transaction', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const repo = parent.for(db, ctx);
      const insert = repo.insert as unknown as (tx: unknown, values: unknown) => unknown;
      expect(() => insert(undefined, { id: 'p1', label: 'x' })).toThrow(/withTenantTransaction/);
      expect(() => insert({ organizationId: ORG_A, requestId: 'r' }, { id: 'p1', label: 'x' })).toThrow(
        TenantAccessError,
      );
    });
  });

  it('refuses to update the identifying columns', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const repo = parent.for(db, ctx);
      withTenantTransaction(db, ctx, (tx) => {
        repo.insert(tx, { id: 'p1', label: 'first' });
        expect(() => repo.update(tx, 'p1', { id: 'p2' })).toThrow(/cannot be updated/);
        expect(() => repo.update(tx, 'p1', { organization_id: 'org-other' })).toThrow(
          /cannot be updated/,
        );
      });
    });
  });

  it('reads a GLOBAL table with a systemContext and no organisation predicate', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = systemContext('GLOBAL', 'req-1');
      const repo = global.for(db, ctx);
      db.sqlite.prepare('INSERT INTO t_global (id, source) VALUES (?, ?)').run('g1', 'gazette');
      expect(repo.get('g1')).toMatchObject({ id: 'g1', source: 'gazette' });
    });
  });
});
