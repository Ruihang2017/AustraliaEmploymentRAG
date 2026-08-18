/**
 * DATA-04 acceptance item 9 — "closure blocks writes" (PRD §35.4, §10.3).
 *
 * With `organization.status` closed, every tenancy write refuses with `ORGANIZATION_CLOSED`, while
 * the allowlisted export/delete operations still run — PRD §10.3 is "export followed by deletion
 * within 30 days", so a closure that blocked those too would make its own sequence impossible.
 */
import { describe, expect, it } from 'vitest';

import {
  CLOSURE_EXEMPT_OPERATIONS,
  TenancyError,
  assertOrganizationOpen,
  isClosureExempt,
  tenancyRepositories,
} from '../../src/repos/tenancy/index.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import {
  makeApiCredential,
  makeInvitation,
  makeMembership,
  makeServiceAccount,
  makeSsoConnection,
} from './factories.js';
import { ORG_A, ORG_B, contextFor, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

describe('organisation closure blocks writes (PRD §10.3, §35.4)', () => {
  it('refuses every tenancy write with ORGANIZATION_CLOSED once the organisation is closed', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      const organization = repos.organizations.get(ORG_A);
      withTenantTransaction(db, a.ctx, (tx) =>
        repos.organizations.close(tx, ORG_A, organization['row_version'] as number),
      );
      expect(repos.organizations.get(ORG_A)['status']).toBe('CLOSED');

      const writes: Array<[string, () => unknown]> = [
        [
          'membership.create',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.memberships.create(tx, makeMembership(a.ownerUserId)),
            ),
        ],
        [
          'membership.demote',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.memberships.demote(tx, a.membershipId, 1, 'VIEWER'),
            ),
        ],
        [
          'serviceAccount.create',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.serviceAccounts.create(tx, makeServiceAccount()),
            ),
        ],
        [
          'apiCredential.create',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.apiCredentials.create(tx, makeApiCredential(a.serviceAccountId)),
            ),
        ],
        [
          'invitation.create',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.invitations.create(tx, makeInvitation(a.ownerActorId)),
            ),
        ],
        [
          'invitation.accept',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.invitations.accept(tx, a.invitationTokenHash),
            ),
        ],
        [
          'ssoConnection.create',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.ssoConnections.create(tx, makeSsoConnection({ protocol: 'OIDC' })),
            ),
        ],
      ];

      for (const [label, write] of writes) {
        let thrown: unknown;
        try {
          write();
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${label} succeeded against a closed organisation`).toBeInstanceOf(
          TenancyError,
        );
        expect((thrown as TenancyError).code, label).toBe('ORGANIZATION_CLOSED');
      }
    });
  });

  it('still allows the PRD §10.3 export/delete path and credential revocation', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const organization = repos.organizations.get(ORG_A);
      withTenantTransaction(db, a.ctx, (tx) =>
        repos.organizations.close(tx, ORG_A, organization['row_version'] as number),
      );

      // Export: reads keep working — an organisation that could not be read could not be exported.
      expect(repos.organizations.get(ORG_A)['id']).toBe(ORG_A);
      expect(repos.memberships.list().length).toBeGreaterThan(0);

      // The allowlist is what the guard consults, so assert it directly too.
      expect([...CLOSURE_EXEMPT_OPERATIONS]).toEqual(['export', 'delete', 'close']);
      for (const operation of CLOSURE_EXEMPT_OPERATIONS) {
        expect(isClosureExempt(operation)).toBe(true);
        withTenantTransaction(db, a.ctx, (tx) => {
          expect(() => assertOrganizationOpen(db, a.ctx, tx, operation)).not.toThrow();
        });
      }
      expect(isClosureExempt('membership.create')).toBe(false);

      // Deletion: removing rows must remain possible for the 30-day deletion half of §10.3.
      withTenantTransaction(db, a.ctx, (tx) => {
        repos.apiCredentials.revoke(tx, a.credentialId);
      });
      expect(repos.apiCredentials.get(a.credentialId)['revoked_at']).not.toBeNull();
    });
  });

  it('fails closed for an organisation that does not exist', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      seedOrganization(db, ORG_A, registry);
      // A context for an organisation that was never created. The guard must refuse rather than
      // treat 'no status row' as 'not closed' — otherwise a context minted for an unknown
      // organisation would carry more privilege than one for a closed organisation.
      const ghost = contextFor(ORG_B);
      const repos = tenancyRepositories(db, ghost, { registry });
      expect(() =>
        withTenantTransaction(db, ghost, (tx) =>
          repos.serviceAccounts.create(tx, makeServiceAccount()),
        ),
      ).toThrowError(/organization/i);
    });
  });
});
