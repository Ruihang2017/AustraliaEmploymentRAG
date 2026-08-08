/**
 * Input builders shared by the FND-06 cell replay and the invariant suites.
 *
 * Two inputs per cell, and both are deliberately *complete*: the satisfying one holds every grant,
 * scope, share and context field a §38.1 condition could ask for, the unsatisfying one holds none of
 * them. A replay that hand-tunes one input per condition tests the test, not the matrix.
 *
 * Not a test file (vitest collects only `*.test.*`).
 */
import { API_SCOPE_VALUES } from '../../../contracts/src/enums/index.js';
import type { Permission } from '../../../contracts/src/enums/index.js';
import type { EvaluationInput, PrincipalKey, Principal } from '../../src/access/index.js';
import { ACTION_SPECS, ROLE_MATRIX } from '../../src/access/index.js';

/** The condition the cell names, if any — used only to choose a satisfying `usageView`. */
const conditionOf = (action: Permission, principalKey: PrincipalKey): string | undefined =>
  ROLE_MATRIX[action][principalKey].condition;

export const ORGANIZATION_ID = 'org-1';
export const OTHER_ORGANIZATION_ID = 'org-2';
export const PRINCIPAL_ID = 'member-1';
export const OTHER_MEMBER_ID = 'member-9';
export const RESOURCE_ID = 'record-1';

export function principalFor(
  principalKey: PrincipalKey,
  overrides: Partial<Principal> = {},
): Principal {
  const base = {
    id: PRINCIPAL_ID,
    organizationId: ORGANIZATION_ID,
    grants: [],
    scopes: [],
    ...overrides,
  };
  return principalKey === 'SERVICE_ACCOUNT'
    ? { kind: 'SERVICE_ACCOUNT', ...base }
    : { kind: 'USER', role: principalKey, ...base };
}

/** Everything a condition could want: grants for the action, every scope, and a member resource. */
export function satisfyingInput(action: Permission, principalKey: PrincipalKey): EvaluationInput {
  const spec = ACTION_SPECS[action];
  const principal = principalFor(principalKey, {
    grants: [{ permission: action }, { permission: 'SERVICE_ACCOUNT_MANAGE' }],
    scopes: [...API_SCOPE_VALUES],
  });
  const input: {
    principal: Principal;
    action: Permission;
    resource?: EvaluationInput['resource'];
    context: EvaluationInput['context'];
  } = {
    principal,
    action,
    context: {
      intent: 'READ',
      ownerCount: 3,
      target: { memberId: 'member-2', role: 'RESEARCHER' },
      // `USAGE_SUBSET` is the one condition that wants a different view from every other; the
      // matrix gives it to exactly one cell (Developer × View organisation usage).
      usageView: conditionOf(action, principalKey) === 'USAGE_SUBSET' ? 'API_SERVICE' : 'OWN',
      auditView: 'CREDENTIAL_ONLY',
    },
  };
  if (spec.resourceScoped) {
    input.resource = {
      organizationId: ORGANIZATION_ID,
      id: RESOURCE_ID,
      ownerId: PRINCIPAL_ID,
      sharedWith: [PRINCIPAL_ID],
      assignedReviewerId: PRINCIPAL_ID,
    };
  }
  return input;
}

/** No grant, no scope, someone else's record, a last-Owner target and the widest views. */
export function unsatisfyingInput(
  action: Permission,
  principalKey: PrincipalKey,
  options: { readonly withScopes?: boolean } = {},
): EvaluationInput {
  const spec = ACTION_SPECS[action];
  const principal = principalFor(principalKey, {
    grants: [],
    scopes: options.withScopes === true ? [...API_SCOPE_VALUES] : [],
  });
  const input: {
    principal: Principal;
    action: Permission;
    resource?: EvaluationInput['resource'];
    context: EvaluationInput['context'];
  } = {
    principal,
    action,
    context: {
      intent: 'READ',
      ownerCount: 1,
      target: { memberId: 'member-2', role: 'OWNER' },
      usageView: 'ORGANIZATION',
      auditView: 'FULL',
    },
  };
  if (spec.resourceScoped) {
    input.resource = {
      organizationId: ORGANIZATION_ID,
      id: RESOURCE_ID,
      ownerId: OTHER_MEMBER_ID,
      sharedWith: [OTHER_MEMBER_ID],
      assignedReviewerId: OTHER_MEMBER_ID,
    };
  }
  return input;
}
