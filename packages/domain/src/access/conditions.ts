/**
 * FND-06 deliverable 1 — every conditional cell of PRD §38.1 as a **named predicate over the decision
 * input**, never a comment and never a `TODO`. Each entry quotes the cell wording it encodes.
 *
 * ALL PREDICATES ARE FAIL-CLOSED. A condition whose input is absent (no `usageView`, no `target`, no
 * resource, no grant) is **not** satisfied. There is no `?? true` in this file, by design: a default
 * that leans "allowed" turns a missing field at the boundary into a silent authorisation.
 */
import type { ConditionName, ConditionPredicate } from './types.js';
import { hasGrant, isLastOwnerTarget } from './membership.js';
import { hasRequiredScope } from './scopes.js';
import { deepFreeze } from './freeze.js';

export const CONDITION_PREDICATES: Readonly<Record<ConditionName, ConditionPredicate>> = deepFreeze({
  /**
   * "✓ except Owner constraints" (Admin, "Manage members/invitations"). An Admin manages members,
   * but not an Owner. No target named ⇒ not satisfied.
   */
  OWNER_CONSTRAINTS: ({ context }) =>
    context.target !== undefined && context.target.role !== 'OWNER',

  /**
   * "✓ cannot remove/change last Owner" (Admin, "Change roles/remove members"). Shares
   * `isLastOwnerTarget` with `evaluate()`'s universal last-Owner step, so the two can never disagree.
   * No target named ⇒ not satisfied.
   */
  LAST_OWNER_IMMUTABLE: ({ context }) =>
    context.target !== undefined && !isLastOwnerTarget(context),

  /** "✓ if assigned" (Researcher, "Review/comment shared records"). */
  ASSIGNED_REVIEWER: ({ principal, resource }) =>
    principal.id !== '' && resource != null && resource.assignedReviewerId === principal.id,

  /** "read shared" (Viewer, "Create/read own Research Records"). The read-only cap is the cell's `maxIntent`. */
  SHARED_WITH_MEMBER: ({ principal, resource }) =>
    principal.id !== '' && resource != null && resource.sharedWith?.includes(principal.id) === true,

  /**
   * "comment if granted", "read-only export if granted", "scoped if granted" — an explicit grant row
   * for the action being evaluated. For a service account this is *additional* to the scope gate.
   */
  GRANT_REQUIRED: ({ principal, action, resource }) =>
    hasGrant(principal.grants, action, resource),

  /**
   * "— by default" (Developer, answer creation and record access). Off unless granted: the same
   * lookup as `GRANT_REQUIRED`, kept as its own name because the cell wording — and therefore the
   * denial a caller audits — is different (PRD §8.1).
   */
  OFF_BY_DEFAULT_GRANTABLE: ({ principal, action, resource }) =>
    hasGrant(principal.grants, action, resource),

  /**
   * "scoped" (service account). A credential reaches a cell only with a scope the action demands
   * (PRD §16.3 vocabulary, mapped in `scopes.ts`). `evaluate()` also applies this as a universal step
   * for service accounts, so an `ALLOW`-shaped cell can never bypass it.
   */
  SCOPED_CREDENTIAL_REQUIRED: ({ principal, action }) =>
    principal.kind === 'SERVICE_ACCOUNT' && hasRequiredScope(principal.scopes, action),

  /** "own usage" (Researcher and service account, "View organisation usage"). */
  OWN_RESOURCE_ONLY: ({ context }) => context.usageView === 'OWN',

  /** "API/service usage subset" (Developer, "View organisation usage"). */
  USAGE_SUBSET: ({ context }) => context.usageView === 'API_SERVICE',

  /** "✓ limited" (Admin, "View audit/security events") — anything narrower than the full log. */
  LIMITED_SUBSET: ({ context }) =>
    context.auditView === 'LIMITED' || context.auditView === 'CREDENTIAL_ONLY',

  /** "credential events only" (Developer, "View audit/security events"). */
  CREDENTIAL_EVENTS_ONLY: ({ context }) => context.auditView === 'CREDENTIAL_ONLY',

  /**
   * "✓ within granted developer permission" (Developer, "Manage service accounts/webhooks/widget") —
   * an explicit grant for that action, never the Developer role by itself.
   */
  DEVELOPER_PERMISSION_GRANTED: ({ principal, resource }) =>
    hasGrant(principal.grants, 'SERVICE_ACCOUNT_MANAGE', resource),

  /**
   * "separate internal identity only" (§38.1 final row). Constantly `false`: no organisation
   * principal and no service account of an organisation is ever an internal administrator — that
   * identity belongs to `22-internal-admin`. A predicate rather than a comment so the fixture replay
   * has something to assert against.
   */
  SEPARATE_INTERNAL_IDENTITY: () => false,
} satisfies Record<ConditionName, ConditionPredicate>);
