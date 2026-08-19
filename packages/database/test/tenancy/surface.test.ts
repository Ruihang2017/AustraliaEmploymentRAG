/**
 * DATA-04 — the tenancy group's **exported surface**, pinned against sub-PRD decision **D12**:
 * `DATA-04…DATA-07` export concrete, pre-bound repositories, *never the factory*.
 *
 * Why this file exists (bounce finding, round 2). `src/repos/tenancy/index.ts` used to re-export
 * every table's raw `TenantRepositoryDefinition` alongside the guarded builders. A raw definition's
 * `.for(db, ctx)` returns `defineTenantRepository`'s unguarded CRUD, so a consumer holding one could
 * `update` the last ACTIVE Owner, rewrite a CLOSED organisation, or insert an invitation whose
 * inviter belongs to another organisation — every guard in this directory becomes optional the
 * moment that value is reachable. The definitions are now module-private in their own files.
 *
 * The check is structural rather than behavioural on purpose: enumerating "which bypasses exist"
 * would have to be re-derived every time a guard is added, whereas "the unguarded object never
 * leaves the directory" stays true by construction. §2 below is the non-vacuity control — it builds
 * a raw definition *inside the test* and demonstrates the two bypasses concretely, so §1 cannot
 * quietly become a tautology.
 */
import { describe, expect, it } from 'vitest';

import * as tenancyIndex from '../../src/repos/tenancy/index.js';
import * as actorsModule from '../../src/repos/tenancy/actors.js';
import * as apiCredentialsModule from '../../src/repos/tenancy/api-credentials.js';
import * as invitationsModule from '../../src/repos/tenancy/invitations.js';
import * as membershipsModule from '../../src/repos/tenancy/memberships.js';
import * as organizationsModule from '../../src/repos/tenancy/organizations.js';
import * as serviceAccountsModule from '../../src/repos/tenancy/service-accounts.js';
import * as ssoConnectionsModule from '../../src/repos/tenancy/sso-connections.js';
import * as usersModule from '../../src/repos/tenancy/users.js';

import { TENANCY_TABLE_SPECS } from '../../src/schema/tenancy.js';
import { defineTenantRepository } from '../../src/tenant/repository.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { ORG_A, contextFor, globalContext, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

const MODULES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['index.ts', tenancyIndex as unknown as Record<string, unknown>],
  ['actors.ts', actorsModule as unknown as Record<string, unknown>],
  ['api-credentials.ts', apiCredentialsModule as unknown as Record<string, unknown>],
  ['invitations.ts', invitationsModule as unknown as Record<string, unknown>],
  ['memberships.ts', membershipsModule as unknown as Record<string, unknown>],
  ['organizations.ts', organizationsModule as unknown as Record<string, unknown>],
  ['service-accounts.ts', serviceAccountsModule as unknown as Record<string, unknown>],
  ['sso-connections.ts', ssoConnectionsModule as unknown as Record<string, unknown>],
  ['users.ts', usersModule as unknown as Record<string, unknown>],
];

/**
 * The runtime shape of a `TenantRepositoryDefinition`: an object carrying a `for` binder. Matching
 * on shape rather than on the `*Definition` name means re-exporting one under a different name — a
 * `repository`, a `raw`, a `def` — is caught too.
 */
function isRepositoryDefinition(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'for' in value &&
    typeof (value as { for?: unknown }).for === 'function'
  );
}

/** The unguarded member names `defineTenantRepository` produces. */
const UNGUARDED_MEMBERS = ['insert', 'update', 'delete'] as const;

describe('DATA-04 exported surface — pre-bound repositories only (sub-PRD D12)', () => {
  it('exports no raw TenantRepositoryDefinition from any module of the group', () => {
    const leaked: string[] = [];
    for (const [name, namespace] of MODULES) {
      for (const [exportName, value] of Object.entries(namespace)) {
        if (exportName.endsWith('Definition') || isRepositoryDefinition(value)) {
          leaked.push(`${name}#${exportName}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });

  it('still exports the guarded builders it is supposed to', () => {
    // Non-vacuity for the assertion above: an empty or misspelled namespace would satisfy it.
    for (const builder of [
      'tenancyRepositories',
      'identityRepositories',
      'organizationsRepository',
      'membershipsRepository',
      'invitationsRepository',
      'serviceAccountsRepository',
      'apiCredentialsRepository',
      'ssoConnectionsRepository',
      'usersRepository',
      'actorsRepository',
      'assertOrganizationOpen',
    ]) {
      expect(typeof (tenancyIndex as unknown as Record<string, unknown>)[builder]).toBe('function');
    }
  });

  it('gives no pre-bound repository an unguarded insert/update/delete member', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const ctx = contextFor(ORG_A);
      const repositories: Record<string, object> = {
        ...tenancyIndex.tenancyRepositories(db, ctx, { registry }),
        ...tenancyIndex.identityRepositories(db, globalContext()),
      };

      const leaked: string[] = [];
      for (const [name, repository] of Object.entries(repositories)) {
        for (const member of UNGUARDED_MEMBERS) {
          if (typeof (repository as Record<string, unknown>)[member] === 'function') {
            leaked.push(`${name}.${member}`);
          }
        }
      }
      expect(leaked).toEqual([]);
    });
  });
});

describe('DATA-04 surface — non-vacuity: what a leaked definition would allow', () => {
  it('demonstrates that a raw definition bypasses LAST_OWNER and ORGANIZATION_CLOSED', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyIndex.tenancyRepositories(db, a.ctx, { registry });

      // Built here, from the same TableSpec the group uses. This is exactly the value that used to
      // be exported from index.ts — the point of the test is that it can no longer be obtained
      // from the group's modules, only reconstructed by a test that means to.
      const rawMemberships = defineTenantRepository({
        table: 'membership',
        spec: TENANCY_TABLE_SPECS.membership,
      }).for(db, a.ctx);
      const rawOrganizations = defineTenantRepository({
        table: 'organization',
        spec: TENANCY_TABLE_SPECS.organization,
      }).for(db, a.ctx);

      // The guarded path refuses: this is the organisation's only ACTIVE OWNER.
      const membership = repos.memberships.get(a.membershipId);
      expect(() =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.memberships.demote(
            tx,
            a.membershipId,
            membership['row_version'] as number,
            'VIEWER',
          ),
        ),
      ).toThrowError(expect.objectContaining({ code: 'LAST_OWNER' }));

      // The raw definition does not: it demotes the last Owner without a word. That is the harm the
      // structural assertion above prevents, shown rather than asserted from a doc comment.
      withTenantTransaction(db, a.ctx, (tx) =>
        rawMemberships.update(tx, a.membershipId, { role: 'VIEWER' }),
      );
      expect(repos.memberships.get(a.membershipId)['role']).toBe('VIEWER');

      // Same for closure: close the organisation through the guarded path, then show the raw one
      // still rewrites the row.
      const organization = repos.organizations.get(ORG_A);
      withTenantTransaction(db, a.ctx, (tx) =>
        repos.organizations.close(tx, ORG_A, organization['row_version'] as number),
      );
      expect(repos.organizations.get(ORG_A)['status']).toBe('CLOSED');

      expect(() =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.organizations.updateWithVersion(
            tx,
            ORG_A,
            repos.organizations.get(ORG_A)['row_version'] as number,
            { name: 'renamed after closure' },
          ),
        ),
      ).toThrowError(expect.objectContaining({ code: 'ORGANIZATION_CLOSED' }));

      withTenantTransaction(db, a.ctx, (tx) =>
        rawOrganizations.update(tx, ORG_A, { name: 'renamed by the raw definition' }),
      );
      expect(repos.organizations.get(ORG_A)['name']).toBe('renamed by the raw definition');
    });
  });
});
