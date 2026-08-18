/**
 * The tenancy group's consumer surface — sub-PRD **D12**'s shape: concrete, **pre-bound**
 * repositories, built from a passed `AppDatabaseHandle` and a `TenantContext`.
 *
 * # Why nothing is added to `package.json`'s `exports` map
 *
 * That map is closed at four entries (`.`, `./crypto`, `./migrate`, `./tenant`) and **two** merged
 * tests assert exactly that set — `test/architecture/no-unscoped-access.test.ts` and
 * `test/ephemeral/file-scope.test.ts`. Adding `./repos` here would fail another ticket's test, so
 * this ticket adds nothing to it and records the surfacing question as sub-PRD **M-Q10**: the first
 * consuming ticket (`AUTC-01`/`IDNT-02`) takes that edge, with a coordinated update to both
 * asserting tests.
 *
 * # The two scopes are separate on purpose
 *
 * `user` and `actor` are `GLOBAL` (PRD §35.4/§35.6), so they bind under `systemContext('GLOBAL', …)`
 * and write inside `withSystemTransaction`; everything else is `TENANT` and writes inside
 * `withTenantTransaction`. The two cannot mix — `SCOPE_MISMATCH` is raised at bind time and again
 * inside the transaction — so a flow that creates a user *and* a membership is two sequenced
 * transactions. That is why `ensureActor` is idempotent.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';

import { actorsRepository } from './actors.js';
import { apiCredentialsRepository } from './api-credentials.js';
import { invitationsRepository } from './invitations.js';
import { membershipsRepository } from './memberships.js';
import { organizationsRepository } from './organizations.js';
import { serviceAccountsRepository } from './service-accounts.js';
import { ssoConnectionsRepository } from './sso-connections.js';
import { usersRepository } from './users.js';

import type { ActorsRepository } from './actors.js';
import type { ApiCredentialsRepository } from './api-credentials.js';
import type { InvitationsRepository, InvitationsRepositoryOptions } from './invitations.js';
import type { MembershipsRepository } from './memberships.js';
import type { OrganizationsRepository } from './organizations.js';
import type { ServiceAccountsRepository } from './service-accounts.js';
import type { SsoConnectionsRepository, SsoRepositoryOptions } from './sso-connections.js';
import type { UsersRepository } from './users.js';

export {
  CLOSURE_EXEMPT_OPERATIONS,
  assertOrganizationOpen,
  isClosureExempt,
} from './closure.js';
export type { ClosureExemptOperation } from './closure.js';

export { TenancyError, isTenancyError } from './errors.js';
export type { TenancyErrorCode } from './errors.js';

export { nowIso } from './internal/support.js';
export type { RepositoryOptions } from './internal/support.js';

export { actorsRepository, actorDefinition } from './actors.js';
export { apiCredentialsRepository, apiCredentialDefinition } from './api-credentials.js';
export { invitationsRepository, invitationDefinition } from './invitations.js';
export { membershipsRepository, membershipDefinition } from './memberships.js';
export { organizationsRepository, organizationDefinition } from './organizations.js';
export {
  serviceAccountsRepository,
  serviceAccountDefinition,
  assertValidScopesJson,
} from './service-accounts.js';
export {
  ssoConnectionsRepository,
  ssoConnectionDefinition,
  SSO_TEST_FRESHNESS_MS,
  SSO_STATE_TESTED_OK,
} from './sso-connections.js';
export { usersRepository, userDefinition } from './users.js';

export type { ActorsRepository, EnsureActorRequest } from './actors.js';
export type { ApiCredentialsRepository, CreateCredentialRequest } from './api-credentials.js';
export type {
  AcceptResult,
  CreateInvitationRequest,
  InvitationsRepository,
  InvitationsRepositoryOptions,
} from './invitations.js';
export type { MembershipsRepository } from './memberships.js';
export type { OrganizationsRepository } from './organizations.js';
export type { ServiceAccountsRepository } from './service-accounts.js';
export type {
  CreateSsoConnectionRequest,
  SsoConnectionsRepository,
  SsoRepositoryOptions,
} from './sso-connections.js';
export type { UsersRepository } from './users.js';

/** The six TENANT-scoped repositories of this group, pre-bound to one connection and context. */
export interface TenancyRepositories {
  readonly organizations: OrganizationsRepository;
  readonly memberships: MembershipsRepository;
  readonly invitations: InvitationsRepository;
  readonly serviceAccounts: ServiceAccountsRepository;
  readonly apiCredentials: ApiCredentialsRepository;
  readonly ssoConnections: SsoConnectionsRepository;
}

/** The two GLOBAL repositories of this group. */
export interface IdentityRepositories {
  readonly users: UsersRepository;
  readonly actors: ActorsRepository;
}

export type TenancyRepositoriesOptions = SsoRepositoryOptions & InvitationsRepositoryOptions;

export function tenancyRepositories(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options: TenancyRepositoriesOptions,
): TenancyRepositories {
  return {
    organizations: organizationsRepository(db, ctx, options),
    memberships: membershipsRepository(db, ctx, options),
    invitations: invitationsRepository(db, ctx, options),
    serviceAccounts: serviceAccountsRepository(db, ctx, options),
    apiCredentials: apiCredentialsRepository(db, ctx, options),
    ssoConnections: ssoConnectionsRepository(db, ctx, options),
  };
}

export function identityRepositories(
  db: AppDatabaseHandle,
  systemCtx: TenantContext,
  options?: import('./internal/support.js').RepositoryOptions,
): IdentityRepositories {
  return {
    users: usersRepository(db, systemCtx, options),
    actors: actorsRepository(db, systemCtx, options),
  };
}
