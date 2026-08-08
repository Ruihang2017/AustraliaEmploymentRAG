/**
 * FND-06 deliverables 2, 3, 4 and 6 — the pure access decision.
 *
 * ORDER (deliverable 6), mirroring PRD §16.5's request flow so `RUNT-02` implements the chain instead
 * of re-deriving it:
 *
 *   1. organisation match (and "the request named a resource that does not exist")
 *   2. membership / principal validity
 *   3. permission lookup in the PRD §38.1 matrix (+ the service-account scope gate)
 *   4. condition predicate (+ the read-only cap and the universal last-Owner invariant)
 *   5. resource membership
 *
 * The function is a straight-line sequence of early returns, one per step. **No later step may turn a
 * denial into an allow**: there is exactly one `allowed: true` return and it is the last statement.
 * Step 1 is therefore unreachable-past, which is the SEC-001 invariant (PRD §21.2 "Authorise before
 * lookup"; PRD §38.1 "a role alone never authorises a record from another organisation").
 *
 * Purity (deliverable 7): no clock, no randomness, no environment, no I/O, no mutation of the input.
 */
import type { Permission } from '../../../contracts/src/enums/index.js';
import { isPermission, isRole } from '../../../contracts/src/enums/index.js';
import type { Decision, DenyReason, EvaluationInput, PrincipalKey } from './types.js';
import { ACTION_SPECS, cellFor } from './matrix.js';
import { CONDITION_PREDICATES } from './conditions.js';
import { isLastOwnerTarget, isResourceMember } from './membership.js';
import { hasRequiredScope } from './scopes.js';

/** The two reasons PRD §16.5 requires the boundary to render identically. */
const NOT_FOUND_REASONS: readonly DenyReason[] = Object.freeze([
  'CROSS_ORGANIZATION',
  'RESOURCE_ABSENT',
]);

const denyFor = (reason: DenyReason): Decision => ({ allowed: false, reason });

export function evaluate(input: EvaluationInput): Decision {
  const { principal, action, resource, context } = input;

  // An action is chosen by code, never by a user: an unknown one is a wiring bug, and denying
  // silently would hide it.
  if (!isPermission(action)) {
    throw new Error(`unknown action ${String(action)} — not a PRD §38.1 row`);
  }

  // --- Step 1. Organisation match, before any role is consulted. -----------------------------
  // `null` means "the request named an opaque id and nothing was found". The domain answers it, so
  // the boundary cannot answer the two not-found cases differently (PRD §16.5).
  if (resource === null) return denyFor('RESOURCE_ABSENT');
  if (resource !== undefined && resource.organizationId !== principal.organizationId) {
    return denyFor('CROSS_ORGANIZATION');
  }

  // --- Step 2. Membership / principal validity. ----------------------------------------------
  // An absent or unknown role is *data*, so it denies here; it never throws.
  if (principal.organizationId === '' || principal.id === '') return denyFor('NOT_A_MEMBER');
  let principalKey: PrincipalKey;
  if (principal.kind === 'USER') {
    if (!isRole(principal.role)) return denyFor('NOT_A_MEMBER');
    principalKey = principal.role;
  } else if (principal.kind === 'SERVICE_ACCOUNT') {
    // A service account carrying a role is a malformed principal, not a privileged one.
    if (principal.role !== undefined) return denyFor('NOT_A_MEMBER');
    principalKey = 'SERVICE_ACCOUNT';
  } else {
    return denyFor('NOT_A_MEMBER');
  }

  // --- Step 3. Permission lookup. -------------------------------------------------------------
  const spec = ACTION_SPECS[action];
  // PRD §38.1 final row: internal administration uses a separate internal identity. Every
  // organisation principal is denied, Owner included.
  if (spec.internalIdentityOnly) return denyFor('SEPARATE_INTERNAL_IDENTITY_REQUIRED');

  const cell = cellFor(action, principalKey);
  if (cell.effect === 'DENY') return denyFor('ROLE_LACKS_PERMISSION');

  // Universal service-account scope gate (PRD §16.3 vocabulary → §38.1 "scoped" cells). Applied as a
  // step, not only as a cell condition, so a credential can never reach a cell whose §38.1 text
  // names a second gate ("scoped if granted", "own usage") without also holding the scope.
  if (principalKey === 'SERVICE_ACCOUNT' && !hasRequiredScope(principal.scopes, action)) {
    return { allowed: false, reason: 'CONDITION_NOT_MET', condition: 'SCOPED_CREDENTIAL_REQUIRED' };
  }

  // --- Step 4. Conditions. --------------------------------------------------------------------
  // 4a — the read-only cap two §38.1 cells impose ("read shared", "read-only export if granted").
  if (cell.maxIntent === 'READ' && context.intent === 'WRITE') {
    return denyFor('WRITE_INTENT_NOT_PERMITTED');
  }

  // 4b — the cell's own named condition.
  if (cell.effect === 'CONDITIONAL') {
    const condition = cell.condition;
    if (condition === undefined) {
      throw new Error(`conditional cell for ${action} × ${principalKey} names no condition`);
    }
    if (!CONDITION_PREDICATES[condition](input)) {
      return { allowed: false, reason: 'CONDITION_NOT_MET', condition };
    }
  }

  // 4c — PRD §8.1: "The last Owner MUST NOT be removable." Universal, so an Owner cannot remove or
  // demote themselves while they are the last one, and no `ALLOW` cell can bypass it.
  if (spec.membershipMutating && isLastOwnerTarget(context)) {
    return { allowed: false, reason: 'CONDITION_NOT_MET', condition: 'LAST_OWNER_IMMUTABLE' };
  }

  // --- Step 5. Resource membership. -----------------------------------------------------------
  // PRD §38.1's closing rule is "permission checks **plus** resource membership", so this runs for
  // `ALLOW` cells too: even an Owner is denied a record neither owned by, shared with, nor assigned
  // to them.
  if (spec.resourceScoped && resource !== undefined && !isResourceMember(principal, resource)) {
    return denyFor('NOT_A_RESOURCE_MEMBER');
  }

  const via: Permission = action;
  return { allowed: true, via };
}

/**
 * FND-06 deliverable 4 — PRD §16.5: *"Other-tenant and absent opaque IDs return the same not-found
 * response."* True for exactly the two not-found denials, which are byte-identical apart from the
 * `reason` the caller audits: neither carries a `via` or a `condition`, so there is nothing for the
 * boundary to leak.
 */
export function isIndistinguishableNotFound(decision: Decision): boolean {
  return decision.allowed === false && NOT_FOUND_REASONS.includes(decision.reason);
}
