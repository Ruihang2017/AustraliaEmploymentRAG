/**
 * DATA-04 acceptance item 14 — `row_version` compare-and-swap on all four mutable-metadata tables
 * (PRD §34.1 "Concurrency", §34.9).
 *
 * The CAS lives in the WHERE clause, so a stale-version writer changes zero rows and is told so —
 * rather than overwriting a value computed from a stale read. The `CONCURRENT_MODIFICATION` code is
 * spelled as the canonical `packages/contracts` `ErrorCode` member so `RCRD-01`/`IDNT-*` map it to
 * 409 without a translation table.
 */
import { describe, expect, it } from 'vitest';

import { getEnumValues } from '../../src/migrate/contracts.js';
import { TenancyError, tenancyRepositories, identityRepositories } from '../../src/repos/tenancy/index.js';
import { ResourceNotFound } from '../../src/tenant/errors.js';
import { withSystemTransaction, withTenantTransaction } from '../../src/tenant/transaction.js';

import { makeUser } from './factories.js';
import { ORG_A, globalContext, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

const ABSENT_ID = 'absent_00000000-0000-4000-8000-000000000000';

describe('row_version compare-and-swap (PRD §34.1, §34.9)', () => {
  it('increments on a fresh version and refuses a stale one, on every mutable-metadata table', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      // `membership` is covered by its own case below: its write path also runs the last-Owner
      // guard, and mixing the two would make a CAS failure and an invariant refusal look alike.
      type Reader = { get(id: string): Record<string, unknown> };
      const cases: Array<
        [string, Reader, string, (id: string, version: number) => Record<string, unknown>]
      > = [
        [
          'organization',
          repos.organizations,
          a.organizationId,
          (id, version) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.organizations.updateWithVersion(tx, id, version, { name: 'renamed' }),
            ),
        ],
        [
          'service_account',
          repos.serviceAccounts,
          a.serviceAccountId,
          (id, version) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.serviceAccounts.updateWithVersion(tx, id, version, { name: 'renamed' }),
            ),
        ],
        [
          'sso_connection',
          repos.ssoConnections,
          a.ssoConnectionId,
          (id, version) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.ssoConnections.recordTest(tx, id, version, 'TESTING'),
            ),
        ],
      ];

      for (const [label, reader, id, update] of cases) {
        const before = reader.get(id);
        const version = before['row_version'] as number;

        const after = update(id, version);
        expect(after['row_version'], `${label} did not increment row_version`).toBe(version + 1);

        let thrown: unknown;
        try {
          update(id, version); // the same, now stale, version
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${label} accepted a stale row_version`).toBeInstanceOf(TenancyError);
        expect((thrown as TenancyError).code, label).toBe('CONCURRENT_MODIFICATION');
      }
    });
  });

  it('applies the same CAS to membership (whose guard is separate)', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.memberships.get(a.membershipId);
      const version = before['row_version'] as number;

      const after = withTenantTransaction(db, a.ctx, (tx) =>
        repos.memberships.updateWithVersion(tx, a.membershipId, version, {
          joined_at: '2026-01-01T00:00:00.000Z',
        }),
      );
      expect(after['row_version']).toBe(version + 1);

      expect(() =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.memberships.updateWithVersion(tx, a.membershipId, version, {
            joined_at: '2026-02-01T00:00:00.000Z',
          }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'CONCURRENT_MODIFICATION' }));
    });
  });

  it('applies the same CAS to the GLOBAL user table', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);
      const before = identity.users.get(a.ownerUserId);
      const version = before['row_version'] as number;

      const after = withSystemTransaction(db, systemCtx, (tx) =>
        identity.users.updateWithVersion(tx, a.ownerUserId, version, { display_name: 'Renamed' }),
      );
      expect(after['row_version']).toBe(version + 1);
      expect(after['display_name']).toBe('Renamed');

      expect(() =>
        withSystemTransaction(db, systemCtx, (tx) =>
          identity.users.updateWithVersion(tx, a.ownerUserId, version, { display_name: 'Again' }),
        ),
      ).toThrowError(expect.objectContaining({ code: 'CONCURRENT_MODIFICATION' }));
    });
  });

  it('reports ResourceNotFound — not a conflict — for a CAS against an absent id', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.serviceAccounts.updateWithVersion(tx, ABSENT_ID, 1, { name: 'x' }),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ResourceNotFound);
      expect(thrown).not.toBeInstanceOf(TenancyError);
    });
  });

  it('creates a user whose row_version starts at 1 (the CAS has a defined starting point)', async () => {
    await withTenancyDatabase(({ db }) => {
      const systemCtx = globalContext();
      const identity = identityRepositories(db, systemCtx);
      const created = withSystemTransaction(db, systemCtx, (tx) =>
        identity.users.create(tx, makeUser()),
      );
      expect(created['row_version']).toBe(1);
    });
  });

  it('spells CONCURRENT_MODIFICATION exactly as the canonical contracts ErrorCode member', () => {
    // The mapping RCRD-01/IDNT-* rely on is "same string, no translation table" (PRD §34.9).
    expect(getEnumValues('ErrorCode')).toContain('CONCURRENT_MODIFICATION');
  });
});
