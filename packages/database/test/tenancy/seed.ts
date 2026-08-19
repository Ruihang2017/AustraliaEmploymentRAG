/**
 * One full row set per organisation, built through the real repositories.
 *
 * Seeding through the repositories rather than raw SQL is deliberate: it means the cross-tenant and
 * closure suites are exercising the same write paths the product uses, and a seed that the tenant
 * layer would refuse cannot silently become test data.
 *
 * The GLOBAL rows (`user`, `actor`) are written in a `withSystemTransaction` and the TENANT rows in
 * a `withTenantTransaction`, in that order — the two scopes cannot share a transaction
 * (`SCOPE_MISMATCH`), which is exactly the constraint `ensureActor`'s idempotence exists for.
 */
import type { KeyRegistry } from '../../src/crypto/keys.js';
import { identityRepositories, tenancyRepositories } from '../../src/repos/tenancy/index.js';
import type { AppDatabaseHandle } from '../../src/tenant/connection.js';
import type { TenantContext } from '../../src/tenant/context.js';
import {
  withSystemTransaction,
  withTenantTransaction,
} from '../../src/tenant/transaction.js';

import {
  makeApiCredential,
  makeInvitation,
  makeMembership,
  makeOrganization,
  makeServiceAccount,
  makeSsoConnection,
  makeUser,
} from './factories.js';
import { contextFor, globalContext } from './helpers.js';

export interface SeededOrganization {
  readonly organizationId: string;
  readonly ctx: TenantContext;
  readonly ownerUserId: string;
  readonly ownerActorId: string;
  readonly membershipId: string;
  readonly serviceAccountId: string;
  readonly credentialId: string;
  readonly credentialPrefix: string;
  readonly invitationId: string;
  readonly invitationTokenHash: string;
  readonly ssoConnectionId: string;
}

export function seedOrganization(
  db: AppDatabaseHandle,
  organizationId: string,
  registry: KeyRegistry,
): SeededOrganization {
  const systemCtx = globalContext(`req-seed-${organizationId}`);
  const identity = identityRepositories(db, systemCtx);

  const user = makeUser();
  const owner = withSystemTransaction(db, systemCtx, (tx) => {
    const created = identity.users.create(tx, user);
    const actor = identity.actors.ensureActor(tx, {
      type: 'USER',
      userId: created['id'] as string,
    });
    return { userId: created['id'] as string, actorId: actor['id'] as string };
  });

  const ctx = contextFor(organizationId, `req-seed-${organizationId}`);
  const repos = tenancyRepositories(db, ctx, { registry });

  const serviceAccount = makeServiceAccount();
  const credential = makeApiCredential(serviceAccount['id'] as string);
  const invitation = makeInvitation(owner.actorId);
  const sso = makeSsoConnection();

  const seeded = withTenantTransaction(db, ctx, (tx) => {
    repos.organizations.create(tx, makeOrganization(organizationId));
    const membership = repos.memberships.create(tx, makeMembership(owner.userId));
    repos.serviceAccounts.create(tx, serviceAccount);
    repos.apiCredentials.create(tx, credential);
    // Order matters: `invitations.create` verifies unconditionally that the inviting actor belongs
    // to this organisation, and for a USER actor that means the membership above must already exist
    // in this transaction. That is the compensating control for the composite FK `actor` cannot
    // have — seeding through the repositories is what keeps the seed honest about it.
    repos.invitations.create(tx, invitation);
    repos.ssoConnections.create(tx, sso);
    return { membershipId: membership['id'] as string };
  });

  return {
    organizationId,
    ctx,
    ownerUserId: owner.userId,
    ownerActorId: owner.actorId,
    membershipId: seeded.membershipId,
    serviceAccountId: serviceAccount['id'] as string,
    credentialId: credential.id,
    credentialPrefix: credential.prefix,
    invitationId: invitation.id,
    invitationTokenHash: invitation.tokenHash,
    ssoConnectionId: sso.id,
  };
}
