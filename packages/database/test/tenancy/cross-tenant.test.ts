/**
 * DATA-04 acceptance item 6 — **AUTH-002**'s cross-tenant matrix.
 *
 * Two fully seeded organisations, and for every tenant-owned repository **every operation that
 * repository exposes which resolves a caller-supplied identifier of an existing tenant-owned row**.
 * That per-repository surface — not a fixed `{get, list, update, delete}` tuple — is what the
 * ticket's acceptance item 6 enumerates, so that no exposed operation escapes the property and none
 * is demanded that the design does not have. `organization`, `service_account` and `sso_connection`
 * have no delete-equivalent **by design**: PRD §10.3's closure blocks writes rather than deleting
 * rows, and a delete path here would be a write that bypasses `assertOrganizationOpen`.
 *
 * The enumerated surface, from the ticket:
 *
 *   organizations   .{find, get, updateWithVersion, close}
 *   memberships     .{find, get, findByUser, updateWithVersion, demote, suspend, remove}
 *   invitations     .{find, get, accept}
 *   serviceAccounts .{find, get, updateWithVersion}
 *   apiCredentials  .{find, get, findVerifiable, revoke, rotate, touchLastUsed}
 *   ssoConnections  .{find, get, readConfiguration, recordTest, enforce}
 *
 * Where the operation throws, the assertion is deep equality on the two errors' **wire form**,
 * after asserting each call raised at all — without that guard a silently-succeeding operation
 * satisfies the equality trivially. Comparing `toJSON()` rather than the instances compares exactly
 * what a route layer would put on the wire; two `Error` instances differ in their stacks.
 *
 * Where the operation reports a miss without throwing, it must return the **identical** miss value
 * for both identifiers — asserted against that exact value (`undefined`, `{ status: 'NOT_FOUND' }`),
 * never a truthiness check. A leg that only asserted "something falsy came back" would prove nothing
 * about AUTH-002 while looking like coverage.
 *
 * This is what PRD §16.5 asks for, and what "cross-tenant ID matrix returns indistinguishable 404"
 * in the §30.2 AUTH-002 row means at the persistence layer.
 */
import { describe, expect, it } from 'vitest';

import { tenancyRepositories } from '../../src/repos/tenancy/index.js';
import type { AppDatabaseHandle } from '../../src/tenant/connection.js';
import { ResourceNotFound } from '../../src/tenant/errors.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { makeApiCredential } from './factories.js';
import { ORG_A, ORG_B, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';
import type { SeededOrganization } from './seed.js';

/** An id of the right shape that was never issued to any organisation. */
const ABSENT_ID = 'absent_00000000-0000-4000-8000-000000000000';
const ABSENT_USER_ID = 'absent_user_00000000-0000-4000-8000-000000000000';
const ABSENT_PREFIX = 'absent_pfx_00000000';
const ABSENT_TOKEN_HASH = 'sha256:no-such-token';

/**
 * The number of legs the ticket's enumeration adds up to: 4 + 7 + 3 + 3 + 6 + 5. Pinned against a
 * literal so a future edit that quietly drops a leg fails here rather than silently shrinking the
 * property — a missing leg, invisible because nothing pointed at the total, is what sent this
 * ticket back for a third round.
 */
const ENUMERATED_LEG_COUNT = 28;

type Repos = ReturnType<typeof tenancyRepositories>;

function captured(run: () => unknown): { name: string; json: unknown } {
  try {
    run();
    return { name: '<no error>', json: null };
  } catch (error) {
    const value = error as ResourceNotFound;
    return { name: value.name, json: value.toJSON?.() ?? { message: value.message } };
  }
}

/** The wire form every miss in this group must collapse to (`ResourceNotFound.toJSON()`). */
function notFound(kind: string): { name: string; json: unknown } {
  return {
    name: 'ResourceNotFound',
    json: { name: 'ResourceNotFound', code: 'RESOURCE_NOT_FOUND', kind },
  };
}

/** An operation that signals a miss by throwing. */
interface ThrowingLeg {
  readonly label: string;
  /** The `ResourceNotFound.kind` both identifiers must produce. */
  readonly kind: string;
  readonly otherTenantId: string;
  readonly run: (id: string) => unknown;
}

/** An operation that signals a miss by returning a value. */
interface MissLeg {
  readonly label: string;
  readonly otherTenantIdentifier: string;
  readonly absentIdentifier: string;
  readonly expected: unknown;
  readonly run: (identifier: string) => unknown;
}

/**
 * Every miss-resolving operation that reports by throwing.
 *
 * Each write leg runs in its own `withTenantTransaction`: the throw rolls that transaction back,
 * which is what keeps the legs independent of one another.
 */
function throwingLegs(
  db: AppDatabaseHandle,
  a: SeededOrganization,
  b: SeededOrganization,
  repos: Repos,
): ThrowingLeg[] {
  return [
    // ---- organization ------------------------------------------------------------------------
    {
      label: 'organizations.get',
      kind: 'organization',
      otherTenantId: b.organizationId,
      run: (id) => repos.organizations.get(id),
    },
    {
      label: 'organizations.updateWithVersion',
      kind: 'organization',
      otherTenantId: b.organizationId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.organizations.updateWithVersion(tx, id, 1, { name: 'x' }),
        ),
    },
    // `close` is only ever called with a miss id in this file. Calling it with A's own id would
    // close organisation A and make every later assertion here meaningless.
    {
      label: 'organizations.close',
      kind: 'organization',
      otherTenantId: b.organizationId,
      run: (id) => withTenantTransaction(db, a.ctx, (tx) => repos.organizations.close(tx, id, 1)),
    },

    // ---- membership --------------------------------------------------------------------------
    {
      label: 'memberships.get',
      kind: 'membership',
      otherTenantId: b.membershipId,
      run: (id) => repos.memberships.get(id),
    },
    {
      label: 'memberships.updateWithVersion',
      kind: 'membership',
      otherTenantId: b.membershipId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.memberships.updateWithVersion(tx, id, 1, { role: 'VIEWER' }),
        ),
    },
    // demote/suspend/remove are likewise only ever called with a miss id here. A's single
    // membership is its last ACTIVE Owner, so a hit would raise LAST_OWNER — a different property,
    // owned by memberships.test.ts. With a miss, assertNotLastOwner raises ResourceNotFound before
    // it can reach the owner count, and that ordering is exactly what these legs assert.
    {
      label: 'memberships.demote',
      kind: 'membership',
      otherTenantId: b.membershipId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) => repos.memberships.demote(tx, id, 1, 'VIEWER')),
    },
    {
      label: 'memberships.suspend',
      kind: 'membership',
      otherTenantId: b.membershipId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) => repos.memberships.suspend(tx, id, 1, 'SUSPENDED')),
    },
    {
      label: 'memberships.remove',
      kind: 'membership',
      otherTenantId: b.membershipId,
      run: (id) => withTenantTransaction(db, a.ctx, (tx) => repos.memberships.remove(tx, id)),
    },

    // ---- invitation --------------------------------------------------------------------------
    {
      label: 'invitations.get',
      kind: 'invitation',
      otherTenantId: b.invitationId,
      run: (id) => repos.invitations.get(id),
    },

    // ---- service_account ---------------------------------------------------------------------
    {
      label: 'serviceAccounts.get',
      kind: 'service_account',
      otherTenantId: b.serviceAccountId,
      run: (id) => repos.serviceAccounts.get(id),
    },
    {
      label: 'serviceAccounts.updateWithVersion',
      kind: 'service_account',
      otherTenantId: b.serviceAccountId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.serviceAccounts.updateWithVersion(tx, id, 1, { name: 'x' }),
        ),
    },

    // ---- api_credential ----------------------------------------------------------------------
    {
      label: 'apiCredentials.get',
      kind: 'api_credential',
      otherTenantId: b.credentialId,
      run: (id) => repos.apiCredentials.get(id),
    },
    {
      label: 'apiCredentials.revoke',
      kind: 'api_credential',
      otherTenantId: b.credentialId,
      run: (id) => withTenantTransaction(db, a.ctx, (tx) => repos.apiCredentials.revoke(tx, id)),
    },
    {
      label: 'apiCredentials.touchLastUsed',
      kind: 'api_credential',
      otherTenantId: b.credentialId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) => repos.apiCredentials.touchLastUsed(tx, id)),
    },
    // A *valid* replacement request, so the only thing that can fail is the old id.
    {
      label: 'apiCredentials.rotate',
      kind: 'api_credential',
      otherTenantId: b.credentialId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.apiCredentials.rotate(tx, id, makeApiCredential(a.serviceAccountId)),
        ),
    },

    // ---- sso_connection ----------------------------------------------------------------------
    {
      label: 'ssoConnections.get',
      kind: 'sso_connection',
      otherTenantId: b.ssoConnectionId,
      run: (id) => repos.ssoConnections.get(id),
    },
    // readConfiguration and enforce both resolve the row before any other validation, so a miss
    // surfaces as ResourceNotFound and never as SSO_TEST_REQUIRED — which would be a distinguishing
    // signal about another tenant's connection state.
    {
      label: 'ssoConnections.readConfiguration',
      kind: 'sso_connection',
      otherTenantId: b.ssoConnectionId,
      run: (id) => repos.ssoConnections.readConfiguration(id),
    },
    {
      label: 'ssoConnections.recordTest',
      kind: 'sso_connection',
      otherTenantId: b.ssoConnectionId,
      run: (id) =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.ssoConnections.recordTest(tx, id, 1, 'ACTIVE'),
        ),
    },
    {
      label: 'ssoConnections.enforce',
      kind: 'sso_connection',
      otherTenantId: b.ssoConnectionId,
      run: (id) => withTenantTransaction(db, a.ctx, (tx) => repos.ssoConnections.enforce(tx, id, 1)),
    },
  ];
}

/** Every miss-resolving operation that reports by returning a value rather than throwing. */
function missLegs(
  db: AppDatabaseHandle,
  a: SeededOrganization,
  b: SeededOrganization,
  repos: Repos,
): MissLeg[] {
  const undefinedMiss = (
    label: string,
    otherTenantIdentifier: string,
    run: (identifier: string) => unknown,
    absentIdentifier = ABSENT_ID,
  ): MissLeg => ({ label, otherTenantIdentifier, absentIdentifier, expected: undefined, run });

  return [
    undefinedMiss('organizations.find', b.organizationId, (id) => repos.organizations.find(id)),
    undefinedMiss('memberships.find', b.membershipId, (id) => repos.memberships.find(id)),
    // The identifier here is a *user* id, not a membership id.
    undefinedMiss(
      'memberships.findByUser',
      b.ownerUserId,
      (id) => repos.memberships.findByUser(id),
      ABSENT_USER_ID,
    ),
    undefinedMiss('invitations.find', b.invitationId, (id) => repos.invitations.find(id)),
    undefinedMiss('serviceAccounts.find', b.serviceAccountId, (id) =>
      repos.serviceAccounts.find(id),
    ),
    undefinedMiss('apiCredentials.find', b.credentialId, (id) => repos.apiCredentials.find(id)),
    // B's credential prefix is globally unique, so an unscoped implementation would find it.
    undefinedMiss(
      'apiCredentials.findVerifiable',
      b.credentialPrefix,
      (prefix) => repos.apiCredentials.findVerifiable(prefix),
      ABSENT_PREFIX,
    ),
    undefinedMiss('ssoConnections.find', b.ssoConnectionId, (id) => repos.ssoConnections.find(id)),
    // The token-keyed path: it must not be usable to probe another tenant's invitations either.
    {
      label: 'invitations.accept',
      otherTenantIdentifier: b.invitationTokenHash,
      absentIdentifier: ABSENT_TOKEN_HASH,
      expected: { status: 'NOT_FOUND' },
      run: (tokenHash) =>
        withTenantTransaction(db, a.ctx, (tx) => repos.invitations.accept(tx, tokenHash)),
    },
  ];
}

describe('AUTH-002 — the cross-tenant matrix (PRD §16.5, §30.2)', () => {
  it('covers exactly the operation surface the ticket enumerates', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const b = seedOrganization(db, ORG_B, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      const labels = [
        ...throwingLegs(db, a, b, repos).map((leg) => leg.label),
        ...missLegs(db, a, b, repos).map((leg) => leg.label),
      ];
      expect(labels.length, 'the matrix lost or gained a leg').toBe(ENUMERATED_LEG_COUNT);
      expect(new Set(labels).size, 'a leg label is duplicated').toBe(ENUMERATED_LEG_COUNT);
    });
  });

  it('raises the same not-found for another tenant id and for an absent id, on every throwing operation', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const b = seedOrganization(db, ORG_B, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      const credentialsBefore = repos.apiCredentials.list().length;

      for (const { label, kind, otherTenantId, run } of throwingLegs(db, a, b, repos)) {
        const other = captured(() => run(otherTenantId));
        const absent = captured(() => run(ABSENT_ID));

        expect(other.name, `${label}: other-tenant id must raise, not succeed`).not.toBe(
          '<no error>',
        );
        expect(absent.name, `${label}: absent id must raise, not succeed`).not.toBe('<no error>');
        expect(other, `${label}: other-tenant and absent errors must be indistinguishable`).toEqual(
          absent,
        );
        // Stronger than "the two matched each other": both must be *the* not-found value for this
        // table. Two operations that agreed on some other error would satisfy the equality above.
        expect(other, `${label}: must be ResourceNotFound(${kind})`).toEqual(notFound(kind));
      }

      // A structural control for the one leg that writes after it resolves the id: `rotate` stamps
      // the old row and then inserts the replacement, so a rotate that resolved the miss *after*
      // the insert would leave an orphan credential in A. The current order makes this pass; it is
      // a regression guard, not a suspicion.
      expect(
        repos.apiCredentials.list().length,
        'a failed matrix leg left a row behind in the calling tenant',
      ).toBe(credentialsBefore);
    });
  });

  it('returns the identical miss value for another tenant id and for an absent id, on every non-throwing lookup', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const b = seedOrganization(db, ORG_B, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      // Non-vacuity control: the two lookups keyed by something other than the row id do find A's
      // own row, so the assertions below cannot pass merely because the lookup is broken.
      expect(repos.apiCredentials.findVerifiable(a.credentialPrefix)).toBeDefined();
      expect(repos.memberships.findByUser(a.ownerUserId)).toBeDefined();

      for (const leg of missLegs(db, a, b, repos)) {
        const other = leg.run(leg.otherTenantIdentifier);
        const absent = leg.run(leg.absentIdentifier);
        expect(
          other,
          `${leg.label}: another tenant's identifier must report the miss value`,
        ).toStrictEqual(leg.expected);
        expect(
          absent,
          `${leg.label}: an absent identifier must report the miss value`,
        ).toStrictEqual(leg.expected);
        expect(other, `${leg.label}: the two miss values must be identical`).toStrictEqual(absent);
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
});
