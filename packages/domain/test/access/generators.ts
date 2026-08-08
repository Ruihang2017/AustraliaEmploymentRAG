/**
 * FND-06 — builders for valid principals, resources and contexts, and the per-cell "satisfied" /
 * "unsatisfied" inputs the 84-cell replay and the property suites draw from.
 *
 * Not a `*.test.*` file, so Vitest does not collect it.
 *
 * Two rules this file exists to keep:
 *
 * 1. A cross-organisation property built from INVALID principals proves nothing — it is satisfied
 *    vacuously by the membership stage. `randomPrincipal` therefore always produces a principal that
 *    would pass stage 2, with a real role (or none, for a service account), real grants and real
 *    scopes.
 * 2. Owner dominance means "vary ONLY the role". `withColumn` changes the column and nothing else —
 *    in particular it never re-randomises `principal.id`, which would make a record shared with the
 *    Researcher stop being shared with the Owner and fail the property spuriously.
 */
import {
  API_SCOPE_VALUES,
  PERMISSION_VALUES,
  ROLE_VALUES,
} from '../../src/access/contracts.js';
import type { ApiScope, Permission, Role } from '../../src/access/contracts.js';
import type { ConditionName } from '../../src/access/conditions.js';
import type { AccessContext, AccessInput, Intent } from '../../src/access/evaluate.js';
import type { Principal, PrincipalColumn } from '../../src/access/principal.js';
import type { Resource } from '../../src/access/resource.js';
import type { Rng } from './rng.js';

export const ORGANIZATION_ID = 'org_0000000000000000000001';
export const OTHER_ORGANIZATION_ID = 'org_0000000000000000000002';
export const PRINCIPAL_ID = 'prn_0000000000000000000001';
export const STRANGER_ID = 'prn_0000000000000000000009';

export const COLUMNS: readonly PrincipalColumn[] = [...ROLE_VALUES, 'SERVICE_ACCOUNT'];
export const ROLE_COLUMNS: readonly Role[] = [...ROLE_VALUES];

/** A principal occupying `column`, with the grants and scopes given. Always stage-2 valid. */
export function principalFor(
  column: PrincipalColumn,
  grants: readonly Permission[] = [],
  scopes: readonly ApiScope[] = [],
  id: string = PRINCIPAL_ID,
  organizationId: string = ORGANIZATION_ID,
): Principal {
  if (column === 'SERVICE_ACCOUNT') {
    return { kind: 'SERVICE_ACCOUNT', id, organizationId, grants, scopes };
  }
  return { kind: 'USER', id, organizationId, role: column, grants, scopes };
}

/** The same principal in a different column — nothing else changes (Owner dominance, R3). */
export function withColumn(principal: Principal, column: PrincipalColumn): Principal {
  return principalFor(
    column,
    principal.grants,
    principal.scopes,
    principal.id,
    principal.organizationId,
  );
}

export function resourceFor(
  organizationId: string = ORGANIZATION_ID,
  memberId: string = PRINCIPAL_ID,
): Resource {
  return {
    organizationId,
    ownerId: memberId,
    sharedWith: [memberId],
    assignedReviewerId: memberId,
  };
}

/** A same-organisation resource this principal is NOT a member of. */
export function strangerResource(organizationId: string = ORGANIZATION_ID): Resource {
  return {
    organizationId,
    ownerId: STRANGER_ID,
    sharedWith: [STRANGER_ID],
    assignedReviewerId: STRANGER_ID,
  };
}

/**
 * The usage scope a condition needs. `OWN_RESOURCE_ONLY` and `USAGE_SUBSET` want different values,
 * so it is chosen per cell rather than globally.
 */
function usageScopeFor(condition: ConditionName | undefined): AccessContext['usageScope'] {
  return condition === 'USAGE_SUBSET' ? 'API_SERVICE' : 'OWN';
}

/**
 * An input under which the cell's condition HOLDS and the resource-membership stage passes.
 *
 * `SEPARATE_INTERNAL_IDENTITY` has no satisfying input by construction — PRD §38.1's last row is
 * never satisfiable by an organisation principal — and callers must not ask for one.
 */
export function satisfiedInput(
  action: Permission,
  column: PrincipalColumn,
  condition?: ConditionName,
): AccessInput {
  const principal = principalFor(column, [...PERMISSION_VALUES], [...API_SCOPE_VALUES]);
  return {
    principal,
    action,
    intent: 'READ',
    resource: resourceFor(),
    context: {
      ownerCount: 5,
      targetRole: 'RESEARCHER',
      usageScope: usageScopeFor(condition),
      auditScope: 'CREDENTIAL_EVENTS',
    },
  };
}

/**
 * An input under which EVERY condition fails: no grant, no scope, no intent, no context field, and a
 * same-organisation resource owned by somebody else. Used for the CONDITIONAL-denies half of the
 * replay and for the DENY cells.
 */
export function unsatisfiedInput(action: Permission, column: PrincipalColumn): AccessInput {
  return {
    principal: principalFor(column),
    action,
    resource: strangerResource(),
    context: {},
  };
}

/** Every input the replay tries against a DENY cell: the maximal one and the minimal one. */
export function denyProbes(action: Permission, column: PrincipalColumn): readonly AccessInput[] {
  return [
    satisfiedInput(action, column),
    { ...satisfiedInput(action, column), context: { ownerCount: 5, targetRole: 'OWNER' } },
    unsatisfiedInput(action, column),
    { ...unsatisfiedInput(action, column), resource: undefined },
  ];
}

const INTENTS: readonly (Intent | undefined)[] = ['READ', 'WRITE', undefined];
const USAGE_SCOPES: readonly (AccessContext['usageScope'])[] = [
  'ORGANIZATION',
  'OWN',
  'API_SERVICE',
  undefined,
];
const AUDIT_SCOPES: readonly (AccessContext['auditScope'])[] = [
  'FULL',
  'LIMITED',
  'CREDENTIAL_EVENTS',
  undefined,
];

function subset<T>(rng: Rng, values: readonly T[]): T[] {
  return values.filter(() => rng.bool());
}

/**
 * `Rng.pick` refuses to return `undefined` (it cannot tell an absent element from an empty array), so
 * the "sometimes absent" axes are drawn by INDEX. Absence is a case that must be generated: every
 * optional field of the input is fail-closed, and a generator that never omits one never tests that.
 */
function pickMaybe<T>(rng: Rng, values: readonly (T | undefined)[]): T | undefined {
  return values[rng.int(values.length)];
}

/** A valid, arbitrarily privileged principal — never a malformed one (R2). */
export function randomPrincipal(rng: Rng, organizationId = ORGANIZATION_ID): Principal {
  const column = rng.pick(COLUMNS);
  return principalFor(
    column,
    subset(rng, PERMISSION_VALUES),
    subset(rng, API_SCOPE_VALUES),
    PRINCIPAL_ID,
    organizationId,
  );
}

export function randomContext(rng: Rng): AccessContext {
  const context: {
    ownerCount?: number;
    targetRole?: Role;
    usageScope?: AccessContext['usageScope'];
    auditScope?: AccessContext['auditScope'];
  } = {};
  if (rng.bool()) context.ownerCount = rng.int(4);
  if (rng.bool()) context.targetRole = rng.pick(ROLE_COLUMNS);
  const usage = pickMaybe(rng, USAGE_SCOPES);
  if (usage !== undefined) context.usageScope = usage;
  const audit = pickMaybe(rng, AUDIT_SCOPES);
  if (audit !== undefined) context.auditScope = audit;
  return context;
}

/** A whole input, with the resource's organisation chosen by the caller. */
export function randomInput(rng: Rng, resourceOrganizationId: string | undefined): AccessInput {
  const principal = randomPrincipal(rng);
  const action = rng.pick(PERMISSION_VALUES);
  const intent = pickMaybe(rng, INTENTS);
  const input: {
    principal: Principal;
    action: Permission;
    intent?: Intent;
    resource?: Resource;
    context: AccessContext;
  } = { principal, action, context: randomContext(rng) };
  if (intent !== undefined) input.intent = intent;
  if (resourceOrganizationId !== undefined) {
    input.resource = rng.bool()
      ? resourceFor(resourceOrganizationId, principal.id)
      : strangerResource(resourceOrganizationId);
  }
  return input;
}
