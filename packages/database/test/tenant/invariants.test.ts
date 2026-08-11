import { beforeEach, describe, expect, it } from 'vitest';

import { TenantAccessError } from '../../src/tenant/errors.js';
import {
  clearPreCommitInvariants,
  listPreCommitInvariants,
  registerPreCommitInvariant,
} from '../../src/tenant/invariants.js';
import type { ChangeSetEntry } from '../../src/tenant/invariants.js';
import { defineTenantRepository } from '../../src/tenant/repository.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';
import { ORG_A, PARENT_SPEC, contextFor, withTenantDatabase } from './helpers.js';

const parent = defineTenantRepository({ table: 't_parent', spec: PARENT_SPEC });

// The registry is module-level state shared by every test in this file.
beforeEach(() => {
  clearPreCommitInvariants();
});

describe('the pre-commit invariant registry (sub-PRD D5, consumed by DATA-09)', () => {
  it('lists registrations in registration order, frozen', () => {
    registerPreCommitInvariant('b', () => undefined);
    registerPreCommitInvariant('a', () => undefined);
    const listed = listPreCommitInvariants();
    expect(listed.map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(listPreCommitInvariants().map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('refuses a duplicate id', () => {
    registerPreCommitInvariant('dup', () => undefined);
    expect(() => registerPreCommitInvariant('dup', () => undefined)).toThrow(/already registered/);
    try {
      registerPreCommitInvariant('dup', () => undefined);
    } catch (error) {
      expect((error as TenantAccessError).code).toBe('DUPLICATE_INVARIANT');
    }
  });

  it('refuses a malformed registration', () => {
    expect(() => registerPreCommitInvariant('', () => undefined)).toThrow(/non-empty id/);
    expect(() =>
      registerPreCommitInvariant('x', undefined as unknown as () => void),
    ).toThrow(/not a function/);
  });
});

describe('invariants run inside the transaction, before COMMIT', () => {
  it('aborts the transaction when a hook throws', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      registerPreCommitInvariant('reject-everything', () => {
        throw new Error('invariant 4 violated');
      });

      expect(() =>
        withTenantTransaction(db, ctx, (tx) => {
          parents.insert(tx, { id: 'p1', label: 'x' });
        }),
      ).toThrow(/invariant 4 violated/);

      // Not merely reported: rolled back.
      expect(parents.find('p1')).toBeUndefined();
    });
  });

  it('sees the uncommitted rows and the whole change set', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      const seen: ChangeSetEntry[][] = [];
      let visibleDuringCheck: unknown;

      registerPreCommitInvariant('observe', (_tx, _ctx, changeSet) => {
        seen.push([...changeSet]);
        // The row is written but not yet committed; the hook can still read it.
        visibleDuringCheck = parents.find('p1');
      });

      withTenantTransaction(db, ctx, (tx) => {
        parents.insert(tx, { id: 'p1', label: 'x' });
        parents.update(tx, 'p1', { label: 'y' });
      });

      expect(visibleDuringCheck).toBeDefined();
      expect(seen).toHaveLength(1);
      expect(seen[0]?.map((entry) => `${entry.operation}:${entry.table}`)).toEqual([
        'insert:t_parent',
        'update:t_parent',
      ]);
      expect(seen[0]?.every((entry) => entry.organizationId === ORG_A)).toBe(true);
    });
  });

  it('runs every registered hook, in order, exactly once per transaction', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const calls: string[] = [];
      registerPreCommitInvariant('first', () => calls.push('first'));
      registerPreCommitInvariant('second', () => calls.push('second'));
      withTenantTransaction(db, ctx, () => undefined);
      expect(calls).toEqual(['first', 'second']);
    });
  });

  it('runs once at the outermost level, not once per savepoint', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      let runs = 0;
      let changes = 0;
      registerPreCommitInvariant('count', (_tx, _ctx, changeSet) => {
        runs += 1;
        changes = changeSet.length;
      });

      withTenantTransaction(db, ctx, (tx) => {
        parents.insert(tx, { id: 'outer', label: 'outer' });
        withTenantTransaction(db, ctx, (inner) => {
          parents.insert(inner, { id: 'inner', label: 'inner' });
        });
      });

      expect(runs).toBe(1);
      // The released savepoint's changes are part of what the outer level commits, so the hook must
      // see them: an invariant that judged only the outer statements would miss half the transaction.
      expect(changes).toBe(2);
    });
  });
});
