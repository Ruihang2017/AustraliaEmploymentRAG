/**
 * FND-06 — the public surface of the `access` rule family (PRD §38.1, §16.5, §21.2; sub-PRD **D10**).
 *
 * **THIS IS THE CONSUMER ENTRY POINT.** `DATA-02` and `RUNT-02` import from
 * `packages/domain/src/access/index.js`, not from `packages/domain/src/index.ts`: that root barrel is
 * frozen at `export {};` by `tools/tests/skeleton.test.mjs` (sub-PRD D2), so the `@taxrag/domain` path
 * alias resolves to an empty module until a ticket owns it — open question **Q-F10**.
 *
 * This leaf imports `packages/contracts` and nothing else, and never a sibling leaf
 * (`answers`, `workflow`, `budget`, `legal`) — sub-PRD **D10**, asserted by
 * `test/access/package-purity.test.ts`.
 */
export type {
  ActionSpec,
  AuditView,
  CellEffect,
  ConditionName,
  ConditionPredicate,
  Decision,
  DenyReason,
  EvaluationContext,
  EvaluationInput,
  Grant,
  Intent,
  MatrixCell,
  MembershipTarget,
  Principal,
  PrincipalKey,
  Resource,
  UsageView,
} from './types.js';
export { CONDITION_NAMES, PRINCIPAL_KEYS, isConditionName } from './types.js';

export { ACTION_SPECS, ROLE_MATRIX, cellFor } from './matrix.js';
export { CONDITION_PREDICATES } from './conditions.js';
export { PERMISSION_TO_API_SCOPES, hasRequiredScope } from './scopes.js';
export type { ChangeRoleInput, RemoveMemberInput } from './membership.js';
export {
  canChangeRole,
  canRemoveMember,
  developerHasRecordAccess,
  hasGrant,
  isLastOwnerTarget,
  isResourceMember,
} from './membership.js';
export { evaluate, isIndistinguishableNotFound } from './evaluate.js';
