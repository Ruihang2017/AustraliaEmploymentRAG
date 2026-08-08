/**
 * FND-06 deliverables 2, 3 and 6 — the pure access decision.
 *
 * PRD §16.5 fixes the request flow: authenticate -> resolve organisation -> verify membership/service
 * account -> evaluate permission -> perform tenant-scoped lookup. `EVALUATION_ORDER` mirrors it as
 * DATA, so `RUNT-02` implements the chain without re-deriving it and a test can assert the order
 * rather than describe it.
 *
 * STAGE 1 IS A SECURITY INVARIANT, NOT A BRANCH. PRD §21.2 ("Authorise before lookup") and §38.1
 * ("a role alone never authorises a record from another organisation") make the cross-organisation
 * check the FIRST executable statement of this function. Nothing precedes it — not action validation,
 * not a role lookup, not a log line — and no later branch can flip it, because no later branch is
 * reached. Moving it after the permission lookup must fail `test/access/evaluation-order.test.ts`.
 * It is also the reason a cross-organisation deny does constant work: PRD §41.2's `UAT-AUTH-03` asks
 * for the same 404 shape AND timing class as an unknown id, and `23-assurance` measures that.
 *
 * This function enforces nothing by itself. It returns a decision and a reason; mapping those to
 * §34.9 codes and HTTP status is `RUNT-02`, repository scoping is `DATA-02`, and auditing is `DATA-07`.
 *
 * Pure: no clock, no randomness, no environment, no I/O, no module-level mutable state, no memo cache.
 * Same input, same output, for the life of the process and across processes.
 */
import { CONDITION_DENY_REASON, CONDITION_PREDICATES, isLastOwnerTarget } from './conditions.js';
import type { ConditionName } from './conditions.js';
import { isPermission } from './contracts.js';
import type { Permission, Role } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import { cell } from './matrix.js';
import { principalColumn } from './principal.js';
import type { Principal } from './principal.js';
import { PERMISSION_RESOURCE_REQUIREMENT, isResourceMember } from './resource.js';
import type { Resource } from './resource.js';

/** FND-06 deliverable 6 — the ordering guarantee, as data. */
export const EVALUATION_ORDER = deepFreeze([
  'ORGANIZATION_MATCH',
  'PRINCIPAL_VALIDITY',
  'PERMISSION_LOOKUP',
  'CONDITION',
  'RESOURCE_MEMBERSHIP',
] as const);

export type EvaluationStage = (typeof EVALUATION_ORDER)[number];

/**
 * Why a decision was refused.
 *
 * The ticket names six ("including at least"); `RESOURCE_ABSENT` and `UNKNOWN_ACTION` are the two its
 * own acceptance items force — deliverable 4 needs a missing resource to be nameable, and untrusted
 * boundary input needs an action that is not a `Permission` to fail closed rather than throw.
 */
export const DENY_REASON_VALUES = deepFreeze([
  'CROSS_ORGANIZATION',
  'NOT_A_MEMBER',
  'UNKNOWN_ACTION',
  'ROLE_LACKS_PERMISSION',
  'CONDITION_NOT_MET',
  'SEPARATE_INTERNAL_IDENTITY_REQUIRED',
  'RESOURCE_ABSENT',
  'NOT_A_RESOURCE_MEMBER',
] as const);

export type DenyReason = (typeof DENY_REASON_VALUES)[number];

export const isDenyReason = (value: unknown): value is DenyReason =>
  typeof value === 'string' && (DENY_REASON_VALUES as readonly string[]).includes(value);

/** Read or write. Absent means WRITE — the fail-closed direction (sub-PRD D35). */
export type Intent = 'READ' | 'WRITE';

export type UsageScope = 'ORGANIZATION' | 'OWN' | 'API_SERVICE';
export type AuditScope = 'FULL' | 'LIMITED' | 'CREDENTIAL_EVENTS';

/** Everything a §38.1 conditional cell needs that is neither the principal nor the resource. */
export interface AccessContext {
  /** Owners remaining in the organisation. Absent reads as 0 — the fail-closed direction. */
  readonly ownerCount?: number | undefined;
  /** The membership target's role, for the two Owner-constraint cells. */
  readonly targetRole?: Role | undefined;
  readonly usageScope?: UsageScope | undefined;
  readonly auditScope?: AuditScope | undefined;
}

/** The decision input (sub-PRD D35). Every optional field is fail-closed. */
export interface AccessInput {
  readonly principal: Principal;
  readonly action: Permission;
  readonly intent?: Intent | undefined;
  readonly resource?: Resource | undefined;
  readonly context?: AccessContext | undefined;
}

export interface Allowed {
  readonly allowed: true;
  /** The permission that authorised it — the action itself, since §38.1 has one row per permission. */
  readonly via: Permission;
}

export interface Denied {
  readonly allowed: false;
  readonly reason: DenyReason;
  /** Present only when a named §38.1 condition produced the denial. */
  readonly condition?: ConditionName;
}

export type Decision = Allowed | Denied;

/**
 * Frozen deny results. Returning shared frozen values (rather than fresh objects) is deliberate: a
 * decision is a value, a caller must not be able to mutate one, and determinism is then structural.
 * They carry no resource id, no organisation id and no cell text — PRD §16.5 forbids handing the
 * boundary anything that distinguishes another tenant's record from an absent one.
 */
const DENIALS: Readonly<Record<DenyReason, Denied>> = deepFreeze({
  CROSS_ORGANIZATION: { allowed: false, reason: 'CROSS_ORGANIZATION' },
  NOT_A_MEMBER: { allowed: false, reason: 'NOT_A_MEMBER' },
  UNKNOWN_ACTION: { allowed: false, reason: 'UNKNOWN_ACTION' },
  ROLE_LACKS_PERMISSION: { allowed: false, reason: 'ROLE_LACKS_PERMISSION' },
  CONDITION_NOT_MET: { allowed: false, reason: 'CONDITION_NOT_MET' },
  SEPARATE_INTERNAL_IDENTITY_REQUIRED: {
    allowed: false,
    reason: 'SEPARATE_INTERNAL_IDENTITY_REQUIRED',
  },
  RESOURCE_ABSENT: { allowed: false, reason: 'RESOURCE_ABSENT' },
  NOT_A_RESOURCE_MEMBER: { allowed: false, reason: 'NOT_A_RESOURCE_MEMBER' },
} as const);

const denied = (reason: DenyReason): Denied => DENIALS[reason];

const deniedByCondition = (reason: DenyReason, condition: ConditionName): Denied =>
  deepFreeze({ allowed: false as const, reason, condition });

const allowedVia = (via: Permission): Allowed => deepFreeze({ allowed: true as const, via });

/** The two membership actions PRD §8.1's last-Owner invariant guards (sub-PRD D37a). */
const MEMBERSHIP_ACTIONS: readonly Permission[] = deepFreeze([
  'MEMBERSHIP_MANAGE',
  'MEMBERSHIP_ROLE_CHANGE',
]);

export function evaluate(input: AccessInput): Decision {
  const principal = input.principal;
  const resource = input.resource;

  // Stage 1 — ORGANIZATION_MATCH. First. Always. PRD §21.2, §38.1.
  if (resource !== undefined && resource.organizationId !== principal.organizationId) {
    return denied('CROSS_ORGANIZATION');
  }

  // Stage 2 — PRINCIPAL_VALIDITY (PRD §16.5 "verify membership/service account").
  const column = principalColumn(principal);
  if (column === undefined) return denied('NOT_A_MEMBER');
  const action = input.action;
  if (!isPermission(action)) return denied('UNKNOWN_ACTION');

  // Stage 3 — PERMISSION_LOOKUP.
  const found = cell(action, column);
  if (found.kind === 'DENY') return denied(found.reason ?? 'ROLE_LACKS_PERMISSION');

  // Stage 4 — CONDITION.
  // 4a: PRD §8.1's last-Owner MUST overrides even an ALLOW cell (sub-PRD D37a). §38.1 spells it only
  // in the Admin cell; §8.1 states it of everyone, and this ticket's acceptance requires it of the
  // Owner too. This is the ONLY §8-beats-§38.1 override in the leaf.
  if (MEMBERSHIP_ACTIONS.includes(action) && isLastOwnerTarget(input.context)) {
    return deniedByCondition('CONDITION_NOT_MET', 'LAST_OWNER_IMMUTABLE');
  }
  // 4b: the cell's own named condition.
  if (found.kind === 'CONDITIONAL' && !CONDITION_PREDICATES[found.condition](input)) {
    return deniedByCondition(CONDITION_DENY_REASON[found.condition], found.condition);
  }

  // Stage 5 — RESOURCE_MEMBERSHIP. No column skips it: PRD §38.1's closing rule is "permission checks
  // PLUS resource membership", and an Owner is not exempt from it.
  if (PERMISSION_RESOURCE_REQUIREMENT[action] === 'RECORD') {
    if (resource === undefined) return denied('RESOURCE_ABSENT');
    if (!isResourceMember(principal, resource)) return denied('NOT_A_RESOURCE_MEMBER');
  }

  return allowedVia(action);
}
