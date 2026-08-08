/**
 * FND-06 — the resource half of PRD §38.1's closing rule:
 *
 * > All checks are permission checks plus resource membership; a role alone never authorises a record
 * > from another organisation.
 *
 * and its definition of `Own`:
 *
 * > `Own` below means a record owned by or explicitly shared with the member inside the same
 * > organisation; the MVP has no external/public sharing.
 *
 * `isResourceMember` is that sentence, executable. The assigned reviewer counts as a member because
 * PRD §38.1's "Review/comment shared records" row grants a Researcher the record *when assigned* —
 * an assignment is an explicit share. Leaving the reviewer out would also break the Owner-dominance
 * property for that row: an Owner would lose an access a Researcher had.
 *
 * `PERMISSION_RESOURCE_REQUIREMENT` says which actions are about a record at all. `USAGE_VIEW` is
 * deliberately `NONE`: Owner and Admin read organisation-wide usage with no resource in hand, and the
 * Researcher / service-account restriction is carried by the `OWN_RESOURCE_ONLY` condition, not by
 * this stage. Making it `RECORD` would deny an Owner the organisation usage view the table grants.
 */
import type { Permission } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import type { Principal } from './principal.js';

/** The resource under evaluation (sub-PRD D35). All fields but the organisation are optional. */
export interface Resource {
  readonly organizationId: string;
  readonly ownerId?: string | undefined;
  readonly sharedWith?: readonly string[] | undefined;
  readonly assignedReviewerId?: string | undefined;
}

export const RESOURCE_REQUIREMENT_VALUES = deepFreeze(['NONE', 'RECORD'] as const);
export type ResourceRequirement = (typeof RESOURCE_REQUIREMENT_VALUES)[number];

/** Total over FND-03's fourteen permissions, in PRD §38.1 row order. */
export const PERMISSION_RESOURCE_REQUIREMENT: Readonly<Record<Permission, ResourceRequirement>> =
  deepFreeze({
    CORPUS_SEARCH_READ: 'NONE',
    ANSWER_CREATE: 'NONE',
    RESEARCH_RECORD_READ_WRITE_OWN: 'RECORD',
    RESEARCH_RECORD_REVIEW_COMMENT: 'RECORD',
    EXPORT_CREATE: 'RECORD',
    WATCHLIST_CREATE: 'NONE',
    MEMBERSHIP_MANAGE: 'NONE',
    MEMBERSHIP_ROLE_CHANGE: 'NONE',
    ORGANIZATION_RETENTION_CONFIGURE: 'NONE',
    ORGANIZATION_SECURITY_CONFIGURE: 'NONE',
    SERVICE_ACCOUNT_MANAGE: 'NONE',
    USAGE_VIEW: 'NONE',
    AUDIT_EVENT_VIEW: 'NONE',
    INTERNAL_ADMIN: 'NONE',
  } as const);

/**
 * PRD §38.1 `Own`: owned by, explicitly shared with, or assigned for review to this principal.
 *
 * This function never compares organisations — the cross-organisation short-circuit has already run
 * by the time it is reached, and duplicating the check here would invite someone to "optimise" the
 * short-circuit away later.
 */
export function isResourceMember(principal: Principal, resource: Resource): boolean {
  const id = principal.id;
  if (typeof id !== 'string' || id.length === 0) return false;
  if (resource.ownerId === id) return true;
  if (resource.assignedReviewerId === id) return true;
  const shared = resource.sharedWith;
  return Array.isArray(shared) && shared.includes(id);
}
