/**
 * `actor` — deliverable 5's `ensureActor({type, userId?, serviceAccountId?})` returning a stable id,
 * with exactly one linkage for `USER`/`SERVICE_ACCOUNT` and none for `SYSTEM` (PRD §35.4).
 */
import { describe, expect, it } from 'vitest';

import { TenancyError, identityRepositories } from '../../src/repos/tenancy/index.js';
import { withSystemTransaction } from '../../src/tenant/transaction.js';

import { makeUser } from './factories.js';
import { ORG_A, globalContext, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

describe('actors (PRD §35.4 "stable audit identity")', () => {
  it('returns the same id for the same linkage — ensureActor is idempotent', async () => {
    await withTenancyDatabase(({ db }) => {
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);

      const { userId, first, second } = withSystemTransaction(db, systemCtx, (tx) => {
        const user = identity.users.create(tx, makeUser());
        const id = user['id'] as string;
        return {
          userId: id,
          first: identity.actors.ensureActor(tx, { type: 'USER', userId: id }),
          second: identity.actors.ensureActor(tx, { type: 'USER', userId: id }),
        };
      });

      expect(second['id']).toBe(first['id']);
      expect(identity.actors.findByUser(userId)?.['id']).toBe(first['id']);
      expect(identity.actors.list().filter((row) => row['user_id'] === userId)).toHaveLength(1);
    });
  });

  it('refuses a linkage that is not exactly one for USER/SERVICE_ACCOUNT, or any for SYSTEM', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);

      const bad: Array<[string, Parameters<typeof identity.actors.ensureActor>[1]]> = [
        ['USER with no userId', { type: 'USER' }],
        ['USER with both', { type: 'USER', userId: a.ownerUserId, serviceAccountId: 'svc' }],
        ['SERVICE_ACCOUNT with no id', { type: 'SERVICE_ACCOUNT' }],
        ['SYSTEM with a userId', { type: 'SYSTEM', userId: a.ownerUserId }],
      ];

      for (const [label, request] of bad) {
        let thrown: unknown;
        try {
          withSystemTransaction(db, systemCtx, (tx) => identity.actors.ensureActor(tx, request));
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${label} was accepted`).toBeInstanceOf(TenancyError);
        expect((thrown as TenancyError).code, label).toBe('INVALID_ACTOR_LINKAGE');
      }
    });
  });

  it('creates a SYSTEM actor with no linkage at all', async () => {
    await withTenancyDatabase(({ db }) => {
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);
      const actor = withSystemTransaction(db, systemCtx, (tx) =>
        identity.actors.ensureActor(tx, { type: 'SYSTEM' }),
      );
      expect(actor['actor_type']).toBe('SYSTEM');
      expect(actor['user_id']).toBeNull();
      expect(actor['service_account_id']).toBeNull();
    });
  });

  it('is append-only: the repository exposes no update or delete (PRD §35.8 invariant 5)', async () => {
    await withTenancyDatabase(({ db }) => {
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);
      const surface = identity.actors as unknown as Record<string, unknown>;
      expect(surface['update']).toBeUndefined();
      expect(surface['delete']).toBeUndefined();
    });
  });

  it('links a SERVICE_ACCOUNT actor to a tenant service account', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);
      const actor = withSystemTransaction(db, systemCtx, (tx) =>
        identity.actors.ensureActor(tx, {
          type: 'SERVICE_ACCOUNT',
          serviceAccountId: a.serviceAccountId,
        }),
      );
      expect(actor['service_account_id']).toBe(a.serviceAccountId);
      expect(identity.actors.findByServiceAccount(a.serviceAccountId)?.['id']).toBe(actor['id']);
    });
  });
});
