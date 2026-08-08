/**
 * The public surface of the role/permission matrix and resource membership (FND-06).
 *
 * PRD §45.2 puts pure permissions in `packages/domain`; this leaf owns the PRD §38.1 matrix, the
 * §16.5/§21.2 authorise-before-lookup ordering and the §8.1 membership invariants. No framework,
 * database or network code, no clock and no randomness (PRD §39.1).
 *
 * It ENFORCES nothing. `RUNT-02` maps a `Decision` to §34.9 codes and HTTP status, `DATA-02` scopes
 * repositories, `DATA-07` audits. The value here is that the rule exists once, as data, and is
 * unit-testable against the PRD's own words.
 *
 * Consumers (`01-app-data`/DATA-02, `03-app-runtime`/RUNT-02) import this barrel. It is reachable
 * today only as `packages/domain/src/access/index.js`: the package entry `packages/domain/src/index.ts`
 * is still FND-01's empty skeleton file and re-exporting these leaves from it is unallocated work
 * (FND-03 open question Q1, shared with FND-08).
 *
 * Sub-PRD D10: this leaf imports no sibling leaf (`answers`, `workflow`, `budget`, `legal`).
 */
export {
  API_SCOPE_VALUES,
  PERMISSION_VALUES,
  ROLE_VALUES,
  isApiScope,
  isPermission,
  isRole,
} from './contracts.js';
export type { ApiScope, Permission, Role } from './contracts.js';

export { deepFreeze } from './deep-freeze.js';

export {
  PRINCIPAL_KIND_VALUES,
  PRINCIPAL_COLUMN_VALUES,
  isPrincipalKind,
  isPrincipalColumn,
  principalColumn,
} from './principal.js';
export type { Principal, PrincipalKind, PrincipalColumn } from './principal.js';

export {
  CONDITION_VALUES,
  CONDITION_PREDICATES,
  CONDITION_DENY_REASON,
  isConditionName,
  isLastOwnerTarget,
} from './conditions.js';
export type { ConditionName } from './conditions.js';

export { ROLE_MATRIX, MATRIX_ACTIONS, MATRIX_COLUMNS, cell, MatrixLookupError } from './matrix.js';
export type { Cell, AllowCell, DenyCell, ConditionalCell } from './matrix.js';

export { PERMISSION_REQUIRED_SCOPES, serviceAccountHasScope } from './scopes.js';

export {
  PERMISSION_RESOURCE_REQUIREMENT,
  RESOURCE_REQUIREMENT_VALUES,
  isResourceMember,
} from './resource.js';
export type { Resource, ResourceRequirement } from './resource.js';

export { canRemoveMember, canChangeRole, developerHasRecordAccess } from './membership.js';
export type { RemoveMemberInput, ChangeRoleInput } from './membership.js';

export { evaluate, EVALUATION_ORDER, DENY_REASON_VALUES, isDenyReason } from './evaluate.js';
export type {
  AccessInput,
  AccessContext,
  Decision,
  Allowed,
  Denied,
  DenyReason,
  EvaluationStage,
  Intent,
  UsageScope,
  AuditScope,
} from './evaluate.js';

export {
  INDISTINGUISHABLE_NOT_FOUND_REASONS,
  NOT_FOUND_PROJECTION,
  isIndistinguishableNotFound,
  describeForBoundary,
} from './not-found.js';
export type {
  BoundaryProjection,
  NotFoundProjection,
  DeniedProjection,
  AllowedProjection,
} from './not-found.js';
