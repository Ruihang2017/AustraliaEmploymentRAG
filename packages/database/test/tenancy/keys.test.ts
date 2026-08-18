/**
 * DATA-04 acceptance items 4, 5 and 7 — typed uniqueness conflicts, the GLOBAL/TENANT scope split,
 * and the composite tenant foreign key biting at the database level.
 */
import { describe, expect, it } from 'vitest';

import { TenancyError } from '../../src/repos/tenancy/errors.js';
import {
  actorsRepository,
  identityRepositories,
  organizationsRepository,
  tenancyRepositories,
  usersRepository,
} from '../../src/repos/tenancy/index.js';
import { withSystemTransaction, withTenantTransaction } from '../../src/tenant/transaction.js';

import { makeApiCredential, makeOrganization, makeServiceAccount, makeUser } from './factories.js';
import { ORG_A, ORG_B, contextFor, globalContext, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

describe('DATA-04 uniqueness and scope (PRD §35.4, §15.4)', () => {
  it('surfaces a duplicate organization.slug as a typed conflict, not a driver error', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      seedOrganization(db, ORG_A, registry);

      // A second organisation whose slug collides with A's. It is its own tenant, so it needs its
      // own context — the CHECK (organization_id = id) makes the context's organisation the id.
      const otherId = 'org-cccccccccccccccccccc';
      const ctx = contextFor(otherId);
      const repos = tenancyRepositories(db, ctx, { registry });

      const thrown = (() => {
        try {
          withTenantTransaction(db, ctx, (tx) => {
            repos.organizations.create(tx, makeOrganization(otherId, { slug: `slug-${ORG_A}` }));
          });
          return undefined;
        } catch (error) {
          return error;
        }
      })();

      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('SLUG_CONFLICT');
      // Non-vacuity: a raw better-sqlite3 error would carry SQLITE_CONSTRAINT_UNIQUE instead.
      expect((thrown as { code?: string }).code).not.toContain('SQLITE');
    });
  });

  it('surfaces a duplicate user.email_normalized as a typed conflict', async () => {
    await withTenancyDatabase(({ db }) => {
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);
      const first = makeUser();

      withSystemTransaction(db, systemCtx, (tx) => identity.users.create(tx, first));

      const thrown = (() => {
        try {
          withSystemTransaction(db, systemCtx, (tx) =>
            identity.users.create(
              tx,
              makeUser({ email_normalized: first['email_normalized'] as string }),
            ),
          );
          return undefined;
        } catch (error) {
          return error;
        }
      })();

      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('EMAIL_CONFLICT');
    });
  });

  it('refuses a tenant repository for the GLOBAL tables, and a system one for a TENANT table', async () => {
    await withTenancyDatabase(({ db }) => {
      const tenantCtx = contextFor(ORG_A);
      const systemCtx = globalContext();

      // Asserted through the guarded builders, which are the only surface this group exports
      // (D12) — the raw definitions are module-private, so the scope refusal has to survive on the
      // path a consumer can actually reach.
      for (const build of [usersRepository, actorsRepository]) {
        expect(() => build(db, tenantCtx)).toThrowError(
          expect.objectContaining({ code: 'SCOPE_MISMATCH' }),
        );
      }
      expect(() => organizationsRepository(db, systemCtx)).toThrowError(
        expect.objectContaining({ code: 'SCOPE_MISMATCH' }),
      );
    });
  });

  it('rejects a cross-tenant composite child insert at the database level', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      // Asserted FIRST: the composite key only bites with foreign_keys ON, and that pragma is per
      // connection and not persisted. A silently disabled pragma would make this test pass for the
      // wrong reason.
      expect(db.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

      const a = seedOrganization(db, ORG_A, registry);
      seedOrganization(db, ORG_B, registry);

      const ctxB = contextFor(ORG_B);
      const reposB = tenancyRepositories(db, ctxB, { registry });

      // Organisation B inserting a credential that points at organisation A's service account. The
      // repository supplies organization_id from B's context, so the composite reference
      // (B, A's service account) has no parent row and SQLite refuses it.
      const thrown = (() => {
        try {
          withTenantTransaction(db, ctxB, (tx) => {
            reposB.apiCredentials.create(tx, makeApiCredential(a.serviceAccountId));
          });
          return undefined;
        } catch (error) {
          return error;
        }
      })();

      expect(thrown).toBeDefined();
      expect(String((thrown as { code?: string }).code ?? '')).toContain('SQLITE_CONSTRAINT');
      expect(String((thrown as Error).message)).toMatch(/FOREIGN KEY|foreign key/i);
    });
  });

  it('accepts the same-tenant composite child insert (the FK is not simply broken)', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const created = withTenantTransaction(db, a.ctx, (tx) =>
        repos.apiCredentials.create(tx, makeApiCredential(a.serviceAccountId)),
      );
      expect(created['service_account_id']).toBe(a.serviceAccountId);
      expect(created['organization_id']).toBe(ORG_A);
    });
  });

  it('refuses a service account whose organisation is not the context organisation', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      expect(() =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.serviceAccounts.create(tx, {
            ...makeServiceAccount(),
            organization_id: ORG_B,
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'ORGANIZATION_MISMATCH' }));
    });
  });
});
