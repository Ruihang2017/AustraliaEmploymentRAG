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

// clearPreCommitInvariants is deliberately NOT exported here (review round 2, finding 3): the
// registry's own doc (invariants.ts) states there is "no way for a caller to opt out" of a
// registered PRD §35.8 pre-commit invariant, and re-exporting the test-only reset seam on this
// public surface would let any consumer erase every invariant for the rest of the process. Its one
// legitimate caller, test/tenant/invariants.test.ts, imports it directly from ../../src/tenant/
// invariants.js instead.
export { listPreCommitInvariants, registerPreCommitInvariant } from './invariants.js';
export type { ChangeSetEntry, PreCommitInvariant, RegisteredInvariant } from './invariants.js';

export { resetTenantAuditSink, setTenantAuditSink } from './audit.js';
export type { TenantAuditEvent, TenantAuditEventName, TenantAuditSink } from './audit.js';
