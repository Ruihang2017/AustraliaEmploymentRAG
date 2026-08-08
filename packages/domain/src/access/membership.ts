/**
 * FND-06 deliverable 5 — the membership invariants as pure predicates, plus the two helpers
 * `evaluate()` and the conditions share so a rule has exactly one implementation.
 *
 * PRD §8.1: *"The last Owner MUST NOT be removable."* and *"Developer MUST NOT automatically gain
 * Research Record content access."* PRD §38.1 rows 7 and 8 give Admin the two membership cells.
 *
 * WHY THE GRANT LOOKUP LIVES HERE: `developerHasRecordAccess` and the grant-based §38.1 conditions
 * (`OFF_BY_DEFAULT_GRANTABLE`, `GRANT_REQUIRED`, `DEVELOPER_PERMISSION_GRANTED`) must never drift
 * apart — two copies of "is this granted?" is exactly how PRD §8.1's Developer rule breaks silently.
 * `conditions.ts` imports `hasGrant` from here; nothing here imports `conditions.ts`.
 */
import type { Permission, Role } from '../../../contracts/src/enums/index.js';
import type { EvaluationContext, Grant, Principal, Resource } from './types.js';

/** The roles PRD §38.1 rows 7 and 8 give a non-`—` membership cell. */
const MEMBERSHIP_ACTOR_ROLES: readonly Role[] = Object.freeze(['OWNER', 'ADMIN']);

/**
 * The record-content actions a Developer must not reach without an explicit grant
 * (PRD §38.1 rows 3 and 4, both "— by default" / "—" for Developer).
 */
const RECORD_ACCESS_PERMISSIONS: readonly Permission[] = Object.freeze([
  'RESEARCH_RECORD_READ_WRITE_OWN',
  'RESEARCH_RECORD_REVIEW_COMMENT',
]);

/**
 * Is there an explicit grant row for `permission`? A grant with no `resourceId` is organisation-wide;
 * a grant with one matches only that resource, and only when the request actually names a resource
 * with an id (fail-closed: an unidentified resource matches no resource-scoped grant).
 */
export function hasGrant(
  grants: readonly Grant[],
  permission: Permission,
  resource?: Resource | null,
): boolean {
  return grants.some((grant) => {
    if (grant.permission !== permission) return false;
    if (grant.resourceId === undefined) return true;
    return resource != null && resource.id !== undefined && resource.id === grant.resourceId;
  });
}

/**
 * PRD §8.1 — a Developer reaches Research Record content only through an explicit grant, never
 * through the role. Shares `hasGrant` with the §38.1 conditions by construction.
 */
export function developerHasRecordAccess(grants: readonly Grant[]): boolean {
  return RECORD_ACCESS_PERMISSIONS.some((permission) => hasGrant(grants, permission));
}

/**
 * Is the member being acted on the organisation's last Owner? Fail-closed twice over: no target at
 * all is not a last Owner (the caller is not managing anyone), but a target Owner with an **unknown**
 * `ownerCount` is treated as the last one rather than assumed safe.
 */
export function isLastOwnerTarget(context: EvaluationContext): boolean {
  if (context.target === undefined) return false;
  if (context.target.role !== 'OWNER') return false;
  return (context.ownerCount ?? 0) <= 1;
}

/**
 * PRD §38.1 closing rule — "`Own` means a record owned by or explicitly shared with the member inside
 * the same organisation". An assigned reviewer is a member of the record by the same table's
 * "✓ if assigned" cell; without that, row 4 could never be satisfied.
 *
 * An empty principal id matches nothing, so a malformed principal cannot become everyone's owner.
 */
export function isResourceMember(principal: Principal, resource: Resource): boolean {
  if (principal.id === '') return false;
  if (resource.ownerId === principal.id) return true;
  if (resource.assignedReviewerId === principal.id) return true;
  return resource.sharedWith?.includes(principal.id) === true;
}

export interface RemoveMemberInput {
  readonly actorRole: Role;
  readonly targetRole: Role;
  readonly ownerCount: number;
}

export interface ChangeRoleInput {
  readonly actorRole: Role;
  readonly targetRole: Role;
  readonly targetIsLastOwner: boolean;
}

/**
 * PRD §38.1 row 8 ("Change roles/remove members": Owner `✓`, Admin *"✓ cannot remove/change last
 * Owner"*, everyone else `—`) and PRD §8.1's last-Owner invariant.
 *
 * The last-Owner denial applies to **every** actor, Owner included — an Owner may not remove
 * themselves while they are the last one.
 *
 * Note the deliberate difference from row 7's `OWNER_CONSTRAINTS` (an Admin is blocked from *any*
 * Owner target when managing members/invitations): the two cells say different things and are
 * transcribed literally. Whether that asymmetry is intended is open question **Q-F8**.
 */
export function canRemoveMember({ actorRole, targetRole, ownerCount }: RemoveMemberInput): boolean {
  if (targetRole === 'OWNER' && ownerCount <= 1) return false;
  return MEMBERSHIP_ACTOR_ROLES.includes(actorRole);
}

/** PRD §38.1 row 8 and PRD §8.1, for a role change rather than a removal. */
export function canChangeRole({
  actorRole,
  targetRole,
  targetIsLastOwner,
}: ChangeRoleInput): boolean {
  if (targetRole === 'OWNER' && targetIsLastOwner) return false;
  return MEMBERSHIP_ACTOR_ROLES.includes(actorRole);
}
