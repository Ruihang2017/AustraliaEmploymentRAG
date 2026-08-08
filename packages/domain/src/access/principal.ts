/**
 * FND-06 — the principal, and the mapping from a principal to a PRD §38.1 matrix COLUMN.
 *
 * PRD §38.1's columns are the five FND-03 roles plus one more, `Service account`, which is not a
 * role: a service account has scopes (PRD §16.3), never a `membership.role`. `PRINCIPAL_COLUMN_VALUES`
 * is therefore `[...ROLE_VALUES, 'SERVICE_ACCOUNT']` and is derived from FND-03's enum rather than
 * retyped, so adding or renaming a role breaks the matrix loudly instead of leaving a column
 * unreachable.
 *
 * `principalColumn` is where "verify membership/service account" (PRD §16.5) is decided. It is
 * fail-closed: anything it cannot classify — a `USER` with no role or an unknown role, a
 * `SERVICE_ACCOUNT` that carries a role, an empty organisation or principal id — is `undefined`, and
 * `evaluate()` turns that into `NOT_A_MEMBER`. The input reaching this function is untrusted
 * (`RUNT-02` builds it from a request), so the guards are runtime guards, not type assertions.
 */
import type { ApiScope, Permission, Role } from './contracts.js';
import { ROLE_VALUES, isRole } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';

/** PRD §16.3: a credential belongs either to a member (`USER`) or to a service account. */
export const PRINCIPAL_KIND_VALUES = deepFreeze(['USER', 'SERVICE_ACCOUNT'] as const);
export type PrincipalKind = (typeof PRINCIPAL_KIND_VALUES)[number];

export const isPrincipalKind = (value: unknown): value is PrincipalKind =>
  typeof value === 'string' && (PRINCIPAL_KIND_VALUES as readonly string[]).includes(value);

/** The six columns of the PRD §38.1 table, in PRD column order. */
export const PRINCIPAL_COLUMN_VALUES = deepFreeze([...ROLE_VALUES, 'SERVICE_ACCOUNT'] as const);
export type PrincipalColumn = (typeof PRINCIPAL_COLUMN_VALUES)[number];

export const isPrincipalColumn = (value: unknown): value is PrincipalColumn =>
  typeof value === 'string' && (PRINCIPAL_COLUMN_VALUES as readonly string[]).includes(value);

/**
 * The acting principal (sub-PRD D35).
 *
 * `id` is the identifier `resource.ownerId`, `resource.sharedWith` and `resource.assignedReviewerId`
 * are compared against; without it the three membership-shaped §38.1 conditions cannot be computed.
 * `grants` are explicitly granted permissions (the table's "if granted" and "— by default" cells) and
 * `scopes` are §16.3 credential scopes (its "scoped" cells).
 */
export interface Principal {
  readonly kind: PrincipalKind;
  readonly id: string;
  readonly organizationId: string;
  readonly role?: Role | undefined;
  readonly grants: readonly Permission[];
  readonly scopes: readonly ApiScope[];
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * The §38.1 column this principal occupies, or `undefined` when it occupies none.
 *
 * A `SERVICE_ACCOUNT` carrying a role is rejected rather than silently treated as that role: it would
 * otherwise be a way to read a member's column with a machine credential.
 */
export function principalColumn(principal: Principal): PrincipalColumn | undefined {
  if (!isNonEmptyString(principal.id)) return undefined;
  if (!isNonEmptyString(principal.organizationId)) return undefined;
  if (principal.kind === 'SERVICE_ACCOUNT') {
    return principal.role === undefined ? 'SERVICE_ACCOUNT' : undefined;
  }
  if (principal.kind === 'USER') return isRole(principal.role) ? principal.role : undefined;
  return undefined;
}
