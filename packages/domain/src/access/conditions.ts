/**
 * FND-06 deliverable 1 — every conditional cell of PRD §38.1 as a NAMED PREDICATE over the decision
 * input. Never a comment, never a TODO: a rule that lives in prose is a rule nothing enforces.
 *
 * The names are the ticket's, taken from the table's own words. `SCOPE_GRANTED` is the one rename
 * (sub-PRD D35): the ticket's original spelling matched the `credential` pattern of
 * `tools/fixtures/secret-patterns.json` and failed the PRD §20.3 secret-scan gate outside `docs/**`.
 * The PRD's own cell word ("scoped") is unchanged.
 *
 * EVERY PREDICATE IS FAIL-CLOSED. The optional fields of the input (sub-PRD D35) are optional because
 * a caller may not have them, not because their absence is permissive: absent means the condition does
 * NOT hold. The dangerous inversion is `intent` — absent must mean `WRITE`, so a Viewer holding a
 * "read shared" cell is denied rather than allowed by omission.
 *
 * Every predicate is total and pure: same input, same answer, no clock, no randomness, no I/O.
 */
import type { Permission } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import type { AccessContext, AccessInput, DenyReason } from './evaluate.js';
import { serviceAccountHasScope } from './scopes.js';

/** The thirteen conditional cell kinds of PRD §38.1 (FND-06 deliverable 1). */
export const CONDITION_VALUES = deepFreeze([
  'OWNER_CONSTRAINTS',
  'LAST_OWNER_IMMUTABLE',
  'ASSIGNED_REVIEWER',
  'SHARED_WITH_MEMBER',
  'GRANT_REQUIRED',
  'OFF_BY_DEFAULT_GRANTABLE',
  'SCOPE_GRANTED',
  'OWN_RESOURCE_ONLY',
  'USAGE_SUBSET',
  'LIMITED_SUBSET',
  'CREDENTIAL_EVENTS_ONLY',
  'DEVELOPER_PERMISSION_GRANTED',
  'SEPARATE_INTERNAL_IDENTITY',
] as const);

export type ConditionName = (typeof CONDITION_VALUES)[number];

export const isConditionName = (value: unknown): value is ConditionName =>
  typeof value === 'string' && (CONDITION_VALUES as readonly string[]).includes(value);

/** An explicitly granted permission (sub-PRD D35: a grant IS a `Permission`). Fail-closed. */
function hasGrant(input: AccessInput, permission: Permission): boolean {
  const grants = input.principal.grants;
  return Array.isArray(grants) && grants.includes(permission);
}

function principalId(input: AccessInput): string | undefined {
  const id = input.principal.id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * PRD §8.1 — "The last Owner MUST NOT be removable."
 *
 * Fail-closed twice over: an absent `ownerCount` reads as 0, and a target whose role is not stated is
 * not treated as a safe target by any caller of this helper.
 */
export function isLastOwnerTarget(context: AccessContext | undefined): boolean {
  if (context === undefined) return false;
  return context.targetRole === 'OWNER' && (context.ownerCount ?? 0) <= 1;
}

/**
 * The predicates, keyed by condition name. Total over `CONDITION_VALUES`; a new condition without a
 * predicate is a type error.
 */
export const CONDITION_PREDICATES: Readonly<
  Record<ConditionName, (input: AccessInput) => boolean>
> = deepFreeze({
  /** "✓ except Owner constraints" — an Admin never acts on an Owner's membership (sub-PRD D37b). */
  OWNER_CONSTRAINTS: (input: AccessInput) => {
    const target = input.context?.targetRole;
    return target !== undefined && target !== 'OWNER';
  },

  /** "✓ cannot remove/change last Owner" — PRD §8.1. */
  LAST_OWNER_IMMUTABLE: (input: AccessInput) => {
    const context = input.context;
    if (context === undefined || context.targetRole === undefined) return false;
    return !isLastOwnerTarget(context);
  },

  /** "✓ if assigned" — the Researcher is the record's assigned reviewer. */
  ASSIGNED_REVIEWER: (input: AccessInput) => {
    const id = principalId(input);
    return id !== undefined && input.resource?.assignedReviewerId === id;
  },

  /** "read shared" — a READ, of a record explicitly shared with this member. */
  SHARED_WITH_MEMBER: (input: AccessInput) => {
    const id = principalId(input);
    if (id === undefined) return false;
    if (input.intent !== 'READ') return false;
    const shared = input.resource?.sharedWith;
    return Array.isArray(shared) && shared.includes(id);
  },

  /**
   * "comment if granted", "read-only export if granted", "scoped if granted" — an explicit grant, and
   * for a service account the credential scope on top of it (that is what "scoped if granted" says).
   */
  GRANT_REQUIRED: (input: AccessInput) =>
    hasGrant(input, input.action) &&
    (input.principal.kind !== 'SERVICE_ACCOUNT' ||
      serviceAccountHasScope(input.principal, input.action)),

  /** "— by default" — off unless explicitly granted (PRD §8.1, the Developer invariant). */
  OFF_BY_DEFAULT_GRANTABLE: (input: AccessInput) => hasGrant(input, input.action),

  /** "scoped" — a service-account credential carrying a scope this action accepts (sub-PRD D36). */
  SCOPE_GRANTED: (input: AccessInput) => serviceAccountHasScope(input.principal, input.action),

  /** "own usage" — the caller asked for its own usage, and any resource in hand is its own. */
  OWN_RESOURCE_ONLY: (input: AccessInput) => {
    if (input.context?.usageScope !== 'OWN') return false;
    const resource = input.resource;
    if (resource === undefined) return true;
    const id = principalId(input);
    return id !== undefined && resource.ownerId === id;
  },

  /** "API/service usage subset" — the Developer's usage view. */
  USAGE_SUBSET: (input: AccessInput) => input.context?.usageScope === 'API_SERVICE',

  /** "✓ limited" — anything but the full audit view. */
  LIMITED_SUBSET: (input: AccessInput) => {
    const scope = input.context?.auditScope;
    return scope !== undefined && scope !== 'FULL';
  },

  /** "credential events only" — the Developer's audit view. */
  CREDENTIAL_EVENTS_ONLY: (input: AccessInput) => input.context?.auditScope === 'CREDENTIAL_EVENTS',

  /** "✓ within granted developer permission" — the service-account management grant. */
  DEVELOPER_PERMISSION_GRANTED: (input: AccessInput) => hasGrant(input, 'SERVICE_ACCOUNT_MANAGE'),

  /**
   * "separate internal identity only" — never satisfiable by an organisation principal. A constant
   * `false`, not an omission: PRD §38.1's last row denies every column, and the internal identity that
   * CAN do this work belongs to `22-internal-admin`, not to this matrix.
   */
  SEPARATE_INTERNAL_IDENTITY: () => false,
} as const);

/**
 * The deny reason each unmet condition produces.
 *
 * All but one are `CONDITION_NOT_MET`, which is what the ticket's matrix-replay acceptance item
 * requires of a `CONDITIONAL` cell. `SEPARATE_INTERNAL_IDENTITY` is the exception the internal-admin
 * acceptance item requires, and carrying it as DATA here — rather than as an `if` inside `evaluate()`
 * — is what keeps the whole rule visible in the fixture.
 */
export const CONDITION_DENY_REASON: Readonly<Record<ConditionName, DenyReason>> = deepFreeze({
  OWNER_CONSTRAINTS: 'CONDITION_NOT_MET',
  LAST_OWNER_IMMUTABLE: 'CONDITION_NOT_MET',
  ASSIGNED_REVIEWER: 'CONDITION_NOT_MET',
  SHARED_WITH_MEMBER: 'CONDITION_NOT_MET',
  GRANT_REQUIRED: 'CONDITION_NOT_MET',
  OFF_BY_DEFAULT_GRANTABLE: 'CONDITION_NOT_MET',
  SCOPE_GRANTED: 'CONDITION_NOT_MET',
  OWN_RESOURCE_ONLY: 'CONDITION_NOT_MET',
  USAGE_SUBSET: 'CONDITION_NOT_MET',
  LIMITED_SUBSET: 'CONDITION_NOT_MET',
  CREDENTIAL_EVENTS_ONLY: 'CONDITION_NOT_MET',
  DEVELOPER_PERMISSION_GRANTED: 'CONDITION_NOT_MET',
  SEPARATE_INTERNAL_IDENTITY: 'SEPARATE_INTERNAL_IDENTITY_REQUIRED',
} as const);
