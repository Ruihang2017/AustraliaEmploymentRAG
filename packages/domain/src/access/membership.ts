/**
 * FND-06 deliverable 5 — the two PRD §8.1 membership invariants as standalone pure predicates:
 *
 * > The last Owner MUST NOT be removable.
 * > Developer MUST NOT automatically gain Research Record content access.
 *
 * They exist as named predicates as well as inside `evaluate()` because `DATA-04` (membership
 * storage) and `13-identity-surface` need to grey out a button or reject a write without building a
 * whole `AccessInput`. They agree with `evaluate()` by construction — the same last-Owner helper backs
 * both, and `test/access/last-owner.test.ts` asserts the two answers never diverge.
 *
 * PRD §38.1 rows 7 and 8 supply the actor half: Owner is unrestricted, Admin is restricted
 * ("✓ except Owner constraints" on invitations/membership, "✓ cannot remove/change last Owner" on
 * role changes and removals), and no other role may act at all. Sub-PRD **D37b** records the
 * fail-closed reading of "Owner constraints": an Admin never acts on an Owner's membership.
 */
import { isLastOwnerTarget } from './conditions.js';
import type { Permission, Role } from './contracts.js';

/** PRD §38.1 rows 7-8: only these two roles act on membership at all. */
const MEMBERSHIP_ACTOR_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];

export interface RemoveMemberInput {
  readonly actorRole: Role;
  readonly targetRole: Role;
  /** Owners remaining in the organisation. Absent reads as 0 — the fail-closed direction. */
  readonly ownerCount?: number | undefined;
}

export interface ChangeRoleInput {
  readonly actorRole: Role;
  readonly targetRole: Role;
  readonly targetIsLastOwner: boolean;
}

/**
 * PRD §38.1 "Change roles/remove members" plus PRD §8.1's last-Owner MUST.
 *
 * The last-Owner denial comes FIRST and applies to every actor, the Owner included: §8.1 states the
 * invariant of the organisation, not of the Admin cell that happens to spell it out (sub-PRD D37a).
 */
export function canRemoveMember(input: RemoveMemberInput): boolean {
  if (isLastOwnerTarget({ targetRole: input.targetRole, ownerCount: input.ownerCount })) return false;
  return MEMBERSHIP_ACTOR_ROLES.includes(input.actorRole);
}

/** PRD §38.1 "Change roles/remove members"; the caller supplies the last-Owner fact it already knows. */
export function canChangeRole(input: ChangeRoleInput): boolean {
  if (input.targetIsLastOwner) return false;
  return MEMBERSHIP_ACTOR_ROLES.includes(input.actorRole);
}

/**
 * PRD §8.1 — "Developer MUST NOT automatically gain Research Record content access."
 *
 * False for the empty grant set, which IS the invariant: the denial is for the absence of a grant,
 * never for the Developer role as such (PRD §38.1's "— by default").
 */
export function developerHasRecordAccess(grants: readonly Permission[]): boolean {
  return Array.isArray(grants) && grants.includes('RESEARCH_RECORD_READ_WRITE_OWN');
}
