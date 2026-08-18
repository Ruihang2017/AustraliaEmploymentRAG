/**
 * DATA-04 acceptance item 6 — **AUTH-002**'s cross-tenant matrix.
 *
 * Two fully seeded organisations; every tenant-owned repository × {get, list, update, delete}. The
 * assertion is `deepStrictEqual` between the error raised for *another tenant's* id and the error
 * raised for an id that never existed: the two must be indistinguishable, which is what PRD §16.5
 * asks for and what "returns indistinguishable 404" in the §30.2 register means at this layer.
 *
 * Comparing `toJSON()` rather than the instances compares exactly what a route layer would put on
 * the wire — an error that differed only in a stack or a private field would still be equal here,
 * and rightly so, but one that differed in kind or message would not.
 */
import { describe, expect, it } from 'vitest';

import { tenancyRepositories } from '../../src/repos/tenancy/index.js';
import { ResourceNotFound } from '../../src/tenant/errors.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { ORG_A, ORG_B, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

const ABSENT_ID = 'absent_00000000-0000-4000-8000-000000000000';

function captured(run: () => unknown): { name: string; json: unknown } {
  try {
    run();
    return { name: '<no error>', json: null };
  } catch (error) {
    const value = error as ResourceNotFound;
    return { name: value.name, json: value.toJSON?.() ?? { message: value.message } };
  }
}

describe('AUTH-002 — the cross-tenant matrix (PRD §16.5, §30.2)', () => {
  it('returns the same not-found for another tenant id and an absent id, on every table', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const b = seedOrganization(db, ORG_B, registry);

      const repos = tenancyRepositories(db, a.ctx, { registry });

      /** `[label, id-from-B, operation]` — the four operations over the six tenant-owned tables. */
      const cases: Array<[string, string, (id: string) => unknown]> = [
        ['organization.get', b.organizationId, (id) => repos.organizations.get(id)],
        [
          'organization.updateWithVersion',
          b.organizationId,
          (id) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.organizations.updateWithVersion(tx, id, 1, { name: 'x' }),
            ),
        ],
        ['membership.get', b.membershipId, (id) => repos.memberships.get(id)],
        [
          'membership.updateWithVersion',
          b.membershipId,
          (id) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.memberships.updateWithVersion(tx, id, 1, { role: 'VIEWER' }),
            ),
        ],
        [
          'membership.remove',
          b.membershipId,
          (id) => withTenantTransaction(db, a.ctx, (tx) => repos.memberships.remove(tx, id)),
        ],
        ['service_account.get', b.serviceAccountId, (id) => repos.serviceAccounts.get(id)],
        [
          'service_account.updateWithVersion',
          b.serviceAccountId,
          (id) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.serviceAccounts.updateWithVersion(tx, id, 1, { name: 'x' }),
            ),
        ],
        ['api_credential.get', b.credentialId, (id) => repos.apiCredentials.get(id)],
        [
          'api_credential.revoke',
          b.credentialId,
          (id) => withTenantTransaction(db, a.ctx, (tx) => repos.apiCredentials.revoke(tx, id)),
        ],
        ['invitation.get', b.invitationId, (id) => repos.invitations.get(id)],
        ['sso_connection.get', b.ssoConnectionId, (id) => repos.ssoConnections.get(id)],
        [
          'sso_connection.recordTest',
          b.ssoConnectionId,
          (id) =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.ssoConnections.recordTest(tx, id, 1, 'ACTIVE'),
            ),
        ],
      ];

      for (const [label, otherTenantId, operation] of cases) {
        const other = captured(() => operation(otherTenantId));
        const absent = captured(() => operation(ABSENT_ID));
        expect(other.name, `${label}: other-tenant id must raise, not succeed`).not.toBe(
          '<no error>',
        );
        expect(absent.name, `${label}: absent id must raise, not succeed`).not.toBe('<no error>');
        expect(other, `${label}: other-tenant and absent errors must be indistinguishable`).toEqual(
          absent,
        );
      }
    });
  });

  it('never returns another tenant row from list()', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      seedOrganization(db, ORG_B, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      const lists: Array<[string, Record<string, unknown>[]]> = [
        ['organizations', repos.organizations.list()],
        ['memberships', repos.memberships.list()],
        ['serviceAccounts', repos.serviceAccounts.list()],
        ['apiCredentials', repos.apiCredentials.list()],
        ['invitations', repos.invitations.list()],
        ['ssoConnections', repos.ssoConnections.list()],
      ];

      for (const [label, rows] of lists) {
        expect(rows.length, `${label} seeded nothing — the assertion below would be vacuous`)
          .toBeGreaterThan(0);
        for (const row of rows) {
          expect(row['organization_id'], `${label} leaked a row`).toBe(ORG_A);
        }
      }
    });
  });

  it('cannot reach another tenant through a scoped lookup by a non-id column either', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const b = seedOrganization(db, ORG_B, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      // B's credential prefix and B's invitation token hash are globally unique, so an unscoped
      // implementation would find them.
      expect(repos.apiCredentials.findVerifiable(b.credentialPrefix)).toBeUndefined();
      expect(repos.apiCredentials.findVerifiable(a.credentialPrefix)).toBeDefined();

      const foreignAccept = withTenantTransaction(db, a.ctx, (tx) =>
        repos.invitations.accept(tx, b.invitationTokenHash),
      );
      const absentAccept = withTenantTransaction(db, a.ctx, (tx) =>
        repos.invitations.accept(tx, 'sha256:no-such-token'),
      );
      expect(foreignAccept).toEqual({ status: 'NOT_FOUND' });
      expect(foreignAccept).toEqual(absentAccept);
    });
  });
});
