/**
 * FND-06 — which PRD §16.3 API scope a §38.1 action row demands of a service account. Sub-PRD
 * decision **D23** (refines **D6**): `FND-03` owns the scope *vocabulary*; this table — the matrix
 * half of the contract — lives here and nowhere else. `02-auth-core`/`AUTC-04` (credential issuance)
 * consumes it through a writeback, never through a second copy in `packages/auth`.
 *
 * A permission whose §38.1 service-account cell is `—` maps to the **empty** set: `evaluate()`'s scope
 * gate treats an empty mapping as unsatisfiable, so an unmapped action can never be reached by a
 * credential. That is the fail-closed direction.
 *
 * RESIDUE, recorded rather than invented away: PRD §16.3's `monitor:read` maps to no §38.1 action row
 * — the matrix has no "read watchlists" row (open question **Q-F9**).
 */
import type { ApiScope, Permission } from '../../../contracts/src/enums/index.js';
import { deepFreeze } from './freeze.js';

export const PERMISSION_TO_API_SCOPES: Readonly<Record<Permission, readonly ApiScope[]>> = deepFreeze(
  {
    /** "Search/read public corpus" — scoped. */
    CORPUS_SEARCH_READ: ['search:read'],
    /** "Create Answer/Coverage/Compare" — the row names both surfaces, so both scopes appear. */
    ANSWER_CREATE: ['answers:create', 'coverage:create'],
    /** "Create/read own Research Records" — the row is read *and* write. */
    RESEARCH_RECORD_READ_WRITE_OWN: ['records:read', 'records:write'],
    /** "Review/comment shared records" — commenting writes. */
    RESEARCH_RECORD_REVIEW_COMMENT: ['records:write'],
    /** "Export accessible records". */
    EXPORT_CREATE: ['exports:create'],
    /** "Create watchlists". */
    WATCHLIST_CREATE: ['monitor:write'],
    /** §38.1 service-account cell is `—`. */
    MEMBERSHIP_MANAGE: [],
    MEMBERSHIP_ROLE_CHANGE: [],
    ORGANIZATION_RETENTION_CONFIGURE: [],
    ORGANIZATION_SECURITY_CONFIGURE: [],
    SERVICE_ACCOUNT_MANAGE: [],
    /** "View organisation usage" — service-account cell is "own usage". */
    USAGE_VIEW: ['usage:read'],
    AUDIT_EVENT_VIEW: [],
    INTERNAL_ADMIN: [],
  } satisfies Record<Permission, readonly ApiScope[]>,
);

/** True when the principal holds at least one scope the action demands. Empty mapping ⇒ `false`. */
export function hasRequiredScope(scopes: readonly ApiScope[], action: Permission): boolean {
  const required = PERMISSION_TO_API_SCOPES[action];
  if (required.length === 0) return false;
  return required.some((scope) => scopes.includes(scope));
}
