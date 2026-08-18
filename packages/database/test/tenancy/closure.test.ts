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

      const closed = repos.organizations.get(ORG_A);

      const writes: Array<[string, () => unknown]> = [
        [
          // Regression — bounce finding 1. This path used to skip the guard entirely, which left the
          // organisation's own name/slug/plan/default_legal_date_policy/retention_policy_json
          // rewritable after closure: the one table where that matters most, because the closed
          // status itself lives on it.
          'organization.updateWithVersion',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.organizations.updateWithVersion(tx, ORG_A, closed['row_version'] as number, {
                name: 'renamed after closure',
              }),
            ),
        ],
        [
          // Regression — bounce finding 2. A usage stamp is still a write.
          'apiCredential.touchLastUsed',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.apiCredentials.touchLastUsed(tx, a.credentialId),
            ),
        ],
        [
          'apiCredential.rotate',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              repos.apiCredentials.rotate(tx, a.credentialId, makeApiCredential(a.serviceAccountId)),
            ),
        ],
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

      // …and nothing landed. A refusal that still wrote would satisfy the loop above and fail the
      // requirement.
      const after = repos.organizations.get(ORG_A);
      expect(after['name']).toBe(closed['name']);
      expect(after['row_version']).toBe(closed['row_version']);
      expect(repos.apiCredentials.get(a.credentialId)['last_used_at']).toBeNull();
      expect(repos.apiCredentials.get(a.credentialId)['revoked_at']).toBeNull();
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

      // The allowlist is what the guard consults, so assert it directly too — and pin the exact set,
      // because "which writes survive closure" is a product decision from §10.3 and an entry added
      // without a ticket is a silent widening of it.
      expect([...CLOSURE_EXEMPT_OPERATIONS]).toEqual([
        'export',
        'delete',
        'close',
        'api_credential.revoke',
      ]);
      for (const operation of CLOSURE_EXEMPT_OPERATIONS) {
        expect(isClosureExempt(operation)).toBe(true);
        withTenantTransaction(db, a.ctx, (tx) => {
          expect(() => assertOrganizationOpen(db, a.ctx, tx, operation)).not.toThrow();
        });
      }
      // The two paths the bounce found unguarded are named here so a future "just add it to the
      // allowlist" fix has to argue with a test rather than with a comment.
      for (const operation of [
        'membership.create',
        'organization.updateWithVersion',
        'api_credential.touchLastUsed',
        'api_credential.create',
        'api_credential.rotate',
      ]) {
        expect(isClosureExempt(operation), operation).toBe(false);
      }

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
