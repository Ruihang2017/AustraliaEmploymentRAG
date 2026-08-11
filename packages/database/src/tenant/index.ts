/**
 * The public tenant surface — everything reachable as `@taxrag/database/tenant`.
 *
 * What is deliberately **absent** is the point of this file: `connection.ts`, the
 * `AppDatabaseHandle`, the `Kysely` instance and every `better-sqlite3` type. A business module can
 * obtain a repository, a context and the key helpers, and cannot obtain a database handle — which is
 * SEC-001 ("Static/architecture test forbids unscoped repository import") and breakdown plan §8 Q13's
 * last clause ("an unscoped Kysely or database handle must never be spread into feature modules").
 *
 * `test/architecture/no-unscoped-access.test.ts` asserts both the `exports` map and this surface.
 * `src/index.ts` stays `export {};` — FND-01 asserts it byte-for-byte — so the entry point is the
 * `./tenant` subpath, never a re-export from the package root.
 */
export {
  ELEVATION_MAX_AGE_MS,
  SYSTEM_ORGANIZATION_ID,
  assertTenantContext,
  crossTenantElevatedContext,
  isSystemContext,
  isTenantContext,
  systemContext,
  tenantContextFromJobLease,
  tenantContextFromSession,
} from './context.js';
export type {
  ActorType,
  CrossTenantElevation,
  CrossTenantElevationRequest,
  JobLease,
  PermissionSet,
  TenantContext,
} from './context.js';

export { ResourceNotFound, TenantAccessError, isResourceNotFound } from './errors.js';
export type { TenantAccessErrorCode } from './errors.js';

export { defineTenantRepository } from './repository.js';
export type {
  InsertOps,
  MutateOps,
  ReadOps,
  Row,
  TenantRepository,
  TenantRepositoryDefinition,
  TenantRepositorySpec,
} from './repository.js';

export { assertTenantScoped } from './scoped-sql.js';

export { tenantForeignKey, tenantUnique } from './keys.js';
export type { TenantForeignKey, TenantForeignKeySpec } from './keys.js';

export { withSystemTransaction, withTenantTransaction } from './transaction.js';
export type { Tx } from './tx-internal.js';

export {
  clearPreCommitInvariants,
  listPreCommitInvariants,
  registerPreCommitInvariant,
} from './invariants.js';
export type { ChangeSetEntry, PreCommitInvariant, RegisteredInvariant } from './invariants.js';

export { resetTenantAuditSink, setTenantAuditSink } from './audit.js';
export type { TenantAuditEvent, TenantAuditEventName, TenantAuditSink } from './audit.js';
