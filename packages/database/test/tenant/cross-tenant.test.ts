/**
 * The acceptance matrix for PRD §16.5 / §21.2 / AUTH-002: for read, write, delete and list,
 * organisation B reaching for organisation A's row must be **indistinguishable** from reaching for an
 * id that never existed.
 *
 * The assertion is deep equality between the two error values, not "both threw ResourceNotFound" —
 * an error that carried the id, or the owning organisation, or a different message for the two cases
 * would satisfy the weaker check while still leaking the existence of another tenant's record.
 */
import { deepStrictEqual } from 'node:assert/strict';
import { describe, expect, it } from 'vitest';

import { ResourceNotFound } from '../../src/tenant/errors.js';
import { defineTenantRepository } from '../../src/tenant/repository.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';
import { ORG_A, ORG_B, PARENT_SPEC, contextFor, withTenantDatabase } from './helpers.js';

const parent = defineTenantRepository({ table: 't_parent', spec: PARENT_SPEC });

/** The id org A owns, and an id nobody has ever used. */
const OWNED_BY_A = 'p-owned-by-a';
const NEVER_EXISTED = 'p-never-existed';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('cross-tenant matrix', () => {
  it('yields the identical not-found value for every verb', async () => {
    await withTenantDatabase(({ db }) => {
      const ctxA = contextFor(ORG_A, 'req-a');
      const ctxB = contextFor(ORG_B, 'req-b');
      const repoA = parent.for(db, ctxA);
      const repoB = parent.for(db, ctxB);

      withTenantTransaction(db, ctxA, (tx) => {
        repoA.insert(tx, { id: OWNED_BY_A, label: 'a-secret' });
      });

      const cases: ReadonlyArray<readonly [string, (id: string) => unknown]> = [
        ['read', (id) => repoB.get(id)],
        [
          'write',
          (id) =>
            withTenantTransaction(db, ctxB, (tx) => repoB.update(tx, id, { label: 'overwritten' })),
        ],
        ['delete', (id) => withTenantTransaction(db, ctxB, (tx) => repoB.delete(tx, id))],
      ];

      for (const [verb, run] of cases) {
        const otherTenant = thrown(() => run(OWNED_BY_A));
        const absent = thrown(() => run(NEVER_EXISTED));

        expect(otherTenant, verb).toBeInstanceOf(ResourceNotFound);
        expect(absent, verb).toBeInstanceOf(ResourceNotFound);
        // Structural equality of the whole payload, both directions.
        deepStrictEqual(
          (otherTenant as ResourceNotFound).toJSON(),
          (absent as ResourceNotFound).toJSON(),
        );
        expect((otherTenant as Error).message).toBe((absent as Error).message);
      }

      // `list` has no not-found: the indistinguishability requirement for it is that another
      // tenant's rows are simply not there.
      expect(repoB.list()).toEqual([]);
      expect(repoA.list()).toHaveLength(1);
    });
  });

  it('leaks neither the id nor the organisation in the error payload', async () => {
    await withTenantDatabase(({ db }) => {
      const ctxA = contextFor(ORG_A);
      const ctxB = contextFor(ORG_B);
      const repoA = parent.for(db, ctxA);
      const repoB = parent.for(db, ctxB);
      withTenantTransaction(db, ctxA, (tx) => {
        repoA.insert(tx, { id: OWNED_BY_A, label: 'a-secret' });
      });

      const error = thrown(() => repoB.get(OWNED_BY_A)) as ResourceNotFound;
      const serialised = `${error.message} ${JSON.stringify(error.toJSON())} ${JSON.stringify({ ...error })}`;
      expect(serialised).not.toContain(OWNED_BY_A);
      expect(serialised).not.toContain(ORG_A);
      expect(serialised).not.toContain(ORG_B);
      expect(serialised).not.toContain('a-secret');
      expect(error.kind).toBe('t_parent');
    });
  });

  it('makes find() return undefined for both cases, not just for the absent one', async () => {
    await withTenantDatabase(({ db }) => {
      const ctxA = contextFor(ORG_A);
      const repoA = parent.for(db, ctxA);
      withTenantTransaction(db, ctxA, (tx) => {
        repoA.insert(tx, { id: OWNED_BY_A, label: 'a-secret' });
      });
      const repoB = parent.for(db, contextFor(ORG_B));
      expect(repoB.find(OWNED_BY_A)).toBeUndefined();
      expect(repoB.find(NEVER_EXISTED)).toBeUndefined();
    });
  });

  it('does not let organisation B write over organisation A\'s row', async () => {
    await withTenantDatabase(({ db }) => {
      const ctxA = contextFor(ORG_A);
      const repoA = parent.for(db, ctxA);
      withTenantTransaction(db, ctxA, (tx) => {
        repoA.insert(tx, { id: OWNED_BY_A, label: 'a-secret' });
      });

      const ctxB = contextFor(ORG_B);
      const repoB = parent.for(db, ctxB);
      expect(() =>
        withTenantTransaction(db, ctxB, (tx) => repoB.update(tx, OWNED_BY_A, { label: 'x' })),
      ).toThrow(ResourceNotFound);

      expect((repoA.get(OWNED_BY_A) as Record<string, unknown>)['label']).toBe('a-secret');
    });
  });
});
