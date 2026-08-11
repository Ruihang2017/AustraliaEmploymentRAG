import { afterEach, describe, expect, it } from 'vitest';

import { resetTenantAuditSink, setTenantAuditSink } from '../../src/tenant/audit.js';
import type { TenantAuditEvent } from '../../src/tenant/audit.js';
import { crossTenantElevatedContext, systemContext } from '../../src/tenant/context.js';
import { TenantAccessError } from '../../src/tenant/errors.js';
import { defineTenantRepository } from '../../src/tenant/repository.js';
import { withSystemTransaction, withTenantTransaction } from '../../src/tenant/transaction.js';
import {
  CHILD_SPEC,
  ORG_A,
  ORG_B,
  PARENT_SPEC,
  contextFor,
  withTenantDatabase,
} from './helpers.js';

const parent = defineTenantRepository({ table: 't_parent', spec: PARENT_SPEC });
const child = defineTenantRepository({ table: 't_child', spec: CHILD_SPEC });

afterEach(() => {
  resetTenantAuditSink();
});

function countRows(db: { sqlite: { prepare(sql: string): { get(): unknown } } }, table: string): number {
  return (db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('withTenantTransaction — atomicity across repositories (PRD §34.3)', () => {
  it('commits a multi-repository write as one unit', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      const children = child.for(db, ctx);

      const result = withTenantTransaction(db, ctx, (tx) => {
        parents.insert(tx, { id: 'p1', label: 'record' });
        children.insert(tx, { id: 'c1', parent_id: 'p1', note: 'job admitted' });
        return 'done';
      });

      expect(result).toBe('done');
      expect(countRows(db, 't_parent')).toBe(1);
      expect(countRows(db, 't_child')).toBe(1);
    });
  });

  it('leaves no row from any participating repository when the callback throws', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      const children = child.for(db, ctx);

      expect(() =>
        withTenantTransaction(db, ctx, (tx) => {
          parents.insert(tx, { id: 'p1', label: 'record' });
          children.insert(tx, { id: 'c1', parent_id: 'p1' });
          throw new Error('job admission failed');
        }),
      ).toThrow(/job admission failed/);

      expect(countRows(db, 't_parent')).toBe(0);
      expect(countRows(db, 't_child')).toBe(0);
    });
  });

  it('invalidates the Tx handle once the transaction has ended', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      let captured: unknown;
      withTenantTransaction(db, ctx, (tx) => {
        captured = tx;
      });
      expect(() =>
        parents.insert(captured as Parameters<typeof parents.insert>[0], { id: 'p1', label: 'x' }),
      ).toThrow(/already ended/);
    });
  });

  it('refuses a Tx minted against a different connection', async () => {
    await withTenantDatabase(({ db }) =>
      withTenantDatabase(({ db: other }) => {
        const ctx = contextFor(ORG_A);
        const parents = parent.for(db, ctx);
        withTenantTransaction(other, ctx, (tx) => {
          expect(() => parents.insert(tx, { id: 'p1', label: 'x' })).toThrow(
            /different database connection/,
          );
        });
      }),
    );
  });
});

describe('withTenantTransaction — the opaque handle', () => {
  it('exposes neither the connection nor the query builder', async () => {
    await withTenantDatabase(({ db }) => {
      withTenantTransaction(db, contextFor(ORG_A), (tx) => {
        const keys = [
          ...Object.keys(tx),
          ...Object.getOwnPropertySymbols(tx).map((symbol) => symbol.toString()),
        ];
        expect(keys.sort()).toEqual(['organizationId', 'requestId']);
        for (const value of Object.values(tx)) {
          expect(typeof value).toBe('string');
        }
        expect(Object.isFrozen(tx)).toBe(true);
      });
    });
  });

  it('rejects a fabricated handle', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      const forged = { organizationId: ORG_A, requestId: 'req-1' };
      expect(() =>
        parents.insert(forged as unknown as Parameters<typeof parents.insert>[0], {
          id: 'p1',
          label: 'x',
        }),
      ).toThrow(/fabricated object/);
    });
  });
});

describe('withTenantTransaction — one organisation per transaction (PRD §21.2)', () => {
  it('refuses a second organisation in a nested transaction', async () => {
    await withTenantDatabase(({ db }) => {
      const ctxA = contextFor(ORG_A);
      const ctxB = contextFor(ORG_B);
      expect(() =>
        withTenantTransaction(db, ctxA, () =>
          withTenantTransaction(db, ctxB, () => 'inner'),
        ),
      ).toThrow(/two organisations/);
    });
  });

  it('allows it when the context is elevated', async () => {
    await withTenantDatabase(({ db }) => {
      const ctxA = contextFor(ORG_A);
      const elevated = crossTenantElevatedContext({
        organizationId: ORG_B,
        actorId: 'support-1',
        reason: 'incident triage',
        incidentId: 'INC-42',
        recentAuthAt: Date.now(),
        requestId: 'req-1',
      });
      const result = withTenantTransaction(db, ctxA, () =>
        withTenantTransaction(db, elevated, () => 'inner'),
      );
      expect(result).toBe('inner');
    });
  });

  it('refuses an unelevated context joining an elevated transaction', async () => {
    // Review round 2, finding 3. The grant was audited for one operator against one organisation. If
    // *either* side's elevation sufficed, ordinary unaudited org-A work could be composed into a
    // break-glass org-B transaction and committed atomically with it, under someone else's grant.
    await withTenantDatabase(({ db }) => {
      const elevated = crossTenantElevatedContext({
        organizationId: ORG_B,
        actorId: 'support-1',
        reason: 'incident triage',
        incidentId: 'INC-42',
        recentAuthAt: Date.now(),
        requestId: 'req-1',
      });
      expect(() =>
        withTenantTransaction(db, elevated, () =>
          withTenantTransaction(db, contextFor(ORG_A), () => 'inner'),
        ),
      ).toThrow(/elevation of its own/);
      try {
        withTenantTransaction(db, elevated, () =>
          withTenantTransaction(db, contextFor(ORG_A), () => 'inner'),
        );
      } catch (error) {
        expect((error as TenantAccessError).code).toBe('ELEVATION_REQUIRED');
      }
    });
  });

  it('review round 2, finding 4: the transaction-boundary refusal emits CROSS_TENANT_ACCESS_REFUSED', async () => {
    // Deliverable 8 requires that "every rejected cross-tenant access" emits an audit event.
    // requireWriteTx (repository.ts) already does; assertSameOrganization (this file) did not, so the
    // two halves of the same rule disagreed. This is the attempt at the transaction boundary.
    await withTenantDatabase(({ db }) => {
      const elevated = crossTenantElevatedContext({
        organizationId: ORG_B,
        actorId: 'support-1',
        reason: 'incident triage',
        incidentId: 'INC-42',
        recentAuthAt: Date.now(),
        requestId: 'req-1',
      });
      const events: TenantAuditEvent[] = [];
      setTenantAuditSink((event) => events.push(event));
      expect(() =>
        withTenantTransaction(db, elevated, () =>
          withTenantTransaction(db, contextFor(ORG_A), () => 'inner'),
        ),
      ).toThrow(/elevation of its own/);
      expect(events).toHaveLength(1);
      expect(events[0]?.event).toBe('CROSS_TENANT_ACCESS_REFUSED');
      expect(events[0]?.organizationId).toBe(ORG_A);
    });
  });

  it('refuses an unelevated repository writing inside an elevated transaction', async () => {
    await withTenantDatabase(({ db }) => {
      const elevated = crossTenantElevatedContext({
        organizationId: ORG_B,
        actorId: 'support-1',
        reason: 'incident triage',
        incidentId: 'INC-42',
        recentAuthAt: Date.now(),
        requestId: 'req-1',
      });
      const parentsA = parent.for(db, contextFor(ORG_A));
      expect(() =>
        withTenantTransaction(db, elevated, (tx) => parentsA.insert(tx, { id: 'p1', label: 'x' })),
      ).toThrow(/not the transaction's organisation/);
      expect(countRows(db, 't_parent')).toBe(0);
    });
  });

  it('lets an elevated repository write inside another organisation transaction', async () => {
    await withTenantDatabase(({ db }) => {
      const elevated = crossTenantElevatedContext({
        organizationId: ORG_B,
        actorId: 'support-1',
        reason: 'incident triage',
        incidentId: 'INC-42',
        recentAuthAt: Date.now(),
        requestId: 'req-1',
      });
      const parentsB = parent.for(db, elevated);
      withTenantTransaction(db, contextFor(ORG_A), (tx) => {
        parentsB.insert(tx, { id: 'p1', label: 'break-glass' });
      });
      expect(countRows(db, 't_parent')).toBe(1);
    });
  });

  it('refuses a systemContext outright, and says where GLOBAL writes go', async () => {
    await withTenantDatabase(({ db }) => {
      expect(() => withTenantTransaction(db, systemContext('GLOBAL', 'req-1'), () => 1)).toThrow(
        /cannot open a tenant transaction.*withSystemTransaction/,
      );
    });
  });

  it('refuses a forged context', async () => {
    await withTenantDatabase(({ db }) => {
      const forged = { ...contextFor(ORG_A) };
      expect(() => withTenantTransaction(db, forged, () => 1)).toThrow(TenantAccessError);
    });
  });
});

describe('withTenantTransaction — nesting uses savepoints', () => {
  it('rolls the inner work back independently and keeps the outer work', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);

      withTenantTransaction(db, ctx, (tx) => {
        parents.insert(tx, { id: 'outer', label: 'outer' });
        expect(() =>
          withTenantTransaction(db, ctx, (inner) => {
            parents.insert(inner, { id: 'inner', label: 'inner' });
            throw new Error('inner failed');
          }),
        ).toThrow(/inner failed/);
      });

      expect(parents.find('outer')).toBeDefined();
      expect(parents.find('inner')).toBeUndefined();
    });
  });

  it('commits nested work that succeeds', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      withTenantTransaction(db, ctx, (tx) => {
        parents.insert(tx, { id: 'outer', label: 'outer' });
        withTenantTransaction(db, ctx, (inner) => {
          parents.insert(inner, { id: 'inner', label: 'inner' });
        });
      });
      expect(parents.list()).toHaveLength(2);
    });
  });

  it('rolls the whole transaction back when the outer level throws after a released savepoint', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      const parents = parent.for(db, ctx);
      expect(() =>
        withTenantTransaction(db, ctx, (tx) => {
          withTenantTransaction(db, ctx, (inner) => {
            parents.insert(inner, { id: 'inner', label: 'inner' });
          });
          parents.insert(tx, { id: 'outer', label: 'outer' });
          throw new Error('outer failed');
        }),
      ).toThrow(/outer failed/);
      expect(countRows(db, 't_parent')).toBe(0);
    });
  });
});

describe('withSystemTransaction — the GLOBAL half (PRD §35.6)', () => {
  it('refuses a tenant context and points at the tenant entry point', async () => {
    await withTenantDatabase(({ db }) => {
      expect(() => withSystemTransaction(db, contextFor(ORG_A), () => 1)).toThrow(
        /takes a systemContext/,
      );
      try {
        withSystemTransaction(db, contextFor(ORG_A), () => 1);
      } catch (error) {
        expect((error as TenantAccessError).code).toBe('SCOPE_MISMATCH');
      }
    });
  });

  it('refuses a forged context and a missing callback like its tenant twin', async () => {
    await withTenantDatabase(({ db }) => {
      const forged = { ...systemContext('GLOBAL', 'req-1') };
      expect(() => withSystemTransaction(db, forged, () => 1)).toThrow(TenantAccessError);
      const run = withSystemTransaction as unknown as (a: unknown, b: unknown, c: unknown) => unknown;
      expect(() => run(db, systemContext('GLOBAL', 'req-1'), undefined)).toThrow(
        /withSystemTransaction\(\) needs a callback/,
      );
    });
  });

  it('nests system transactions on savepoints', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = systemContext('GLOBAL', 'req-1');
      const result = withSystemTransaction(db, ctx, () =>
        withSystemTransaction(db, ctx, () => 'inner'),
      );
      expect(result).toBe('inner');
    });
  });

  it('never nests across the scope boundary, in either direction', async () => {
    await withTenantDatabase(({ db }) => {
      const system = systemContext('GLOBAL', 'req-1');
      expect(() =>
        withTenantTransaction(db, contextFor(ORG_A), () =>
          withSystemTransaction(db, system, () => 'inner'),
        ),
      ).toThrow(/cannot nest/);
      expect(() =>
        withSystemTransaction(db, system, () =>
          withTenantTransaction(db, contextFor(ORG_A), () => 'inner'),
        ),
      ).toThrow(/cannot nest/);
    });
  });

  it('does not let an elevation bridge the scope boundary', async () => {
    // Elevation is a cross-organisation grant (PRD §21.2). It must not read as permission to mix a
    // GLOBAL unit of work with a tenant one.
    await withTenantDatabase(({ db }) => {
      const elevated = crossTenantElevatedContext({
        organizationId: ORG_B,
        actorId: 'support-1',
        reason: 'incident triage',
        incidentId: 'INC-42',
        recentAuthAt: Date.now(),
        requestId: 'req-1',
      });
      expect(() =>
        withSystemTransaction(db, systemContext('GLOBAL', 'req-1'), () =>
          withTenantTransaction(db, elevated, () => 'inner'),
        ),
      ).toThrow(/cannot nest/);
    });
  });
});

describe('withTenantTransaction — asynchronous callbacks are refused', () => {
  it('rejects a thenable return value rather than racing the connection', async () => {
    await withTenantDatabase(({ db }) => {
      const ctx = contextFor(ORG_A);
      expect(() =>
        withTenantTransaction(db, ctx, () => Promise.resolve('nope') as never),
      ).toThrow(/must be synchronous/);
      // The refusal must also have rolled the transaction back, so the connection is usable.
      expect(() => withTenantTransaction(db, ctx, () => 'ok')).not.toThrow();
    });
  });

  it('refuses a missing callback', async () => {
    await withTenantDatabase(({ db }) => {
      const run = withTenantTransaction as unknown as (a: unknown, b: unknown, c: unknown) => unknown;
      expect(() => run(db, contextFor(ORG_A), undefined)).toThrow(/needs a callback/);
    });
  });
});
