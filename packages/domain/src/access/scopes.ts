/**
 * FND-06 — the `Permission` -> `ApiScope` mapping that makes PRD §38.1's service-account cells
 * decidable (sub-PRD **D36**, ticket Feedback obligation 4).
 *
 * PRD §38.1 writes the service-account column as "scoped" / "scoped if granted" / "own usage" / "—",
 * and PRD §16.3 lists nine "Example service scopes". Neither says which scope satisfies which row, so
 * the mapping is a decision — recorded on the matrix side, once, so `02-auth-core`/`AUTC-04` adopts it
 * rather than authoring a second table in `packages/auth`.
 *
 * A cell is satisfiable when the credential holds AT LEAST ONE listed scope. An EMPTY list is never
 * satisfiable, which is exactly what the `—` service-account cells mean; the empty entries are spelled
 * out rather than omitted so the map is total and a missing row is a type error.
 *
 * The map is deliberately NOT surjective: `monitor:read` satisfies no §38.1 action row, because
 * watchlist *reading* is not a row of the table. PRD §16.3 calls its list "Example service scopes", so
 * that is expected — recorded as open question **Q-F12** so a later reader does not "fix" it by
 * inventing a fifteenth permission.
 *
 * Issuing and verifying scoped credentials is `AUTC-04`; this file only decides which scope a matrix
 * cell asks for.
 */
import type { ApiScope, Permission } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import type { Principal } from './principal.js';

/** Total over FND-03's fourteen permissions, in PRD §38.1 row order (sub-PRD D36). */
export const PERMISSION_REQUIRED_SCOPES: Readonly<Record<Permission, readonly ApiScope[]>> =
  deepFreeze({
    CORPUS_SEARCH_READ: ['search:read'],
    ANSWER_CREATE: ['answers:create', 'coverage:create'],
    RESEARCH_RECORD_READ_WRITE_OWN: ['records:read', 'records:write'],
    RESEARCH_RECORD_REVIEW_COMMENT: ['records:write'],
    EXPORT_CREATE: ['exports:create'],
    WATCHLIST_CREATE: ['monitor:write'],
    MEMBERSHIP_MANAGE: [],
    MEMBERSHIP_ROLE_CHANGE: [],
    ORGANIZATION_RETENTION_CONFIGURE: [],
    ORGANIZATION_SECURITY_CONFIGURE: [],
    SERVICE_ACCOUNT_MANAGE: [],
    USAGE_VIEW: ['usage:read'],
    AUDIT_EVENT_VIEW: [],
    INTERNAL_ADMIN: [],
  } as const);

/**
 * True when the principal is a service account whose credential carries a scope this action accepts.
 *
 * Fail-closed on every axis: a member (`USER`) is false, a malformed `scopes` value is false, and an
 * action whose required list is empty is false whatever the credential holds.
 */
export function serviceAccountHasScope(principal: Principal, action: Permission): boolean {
  if (principal.kind !== 'SERVICE_ACCOUNT') return false;
  if (!Object.hasOwn(PERMISSION_REQUIRED_SCOPES, action)) return false;
  const required = PERMISSION_REQUIRED_SCOPES[action];
  if (required.length === 0) return false;
  const held = principal.scopes;
  if (!Array.isArray(held)) return false;
  return required.some((scope) => held.includes(scope));
}
