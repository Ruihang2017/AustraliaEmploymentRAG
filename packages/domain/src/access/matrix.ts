/**
 * FND-06 deliverable 1 — the PRD §38.1 role matrix as DATA: 14 actions x 6 principal columns = 84
 * cells, none omitted, deep-frozen.
 *
 * `prdText` is the §38.1 cell verbatim, tick and em dash included, so the fixture replay
 * (`test/access/prd-38-1-transcription.test.ts`) can assert this table against `docs/PRD.md` itself
 * rather than against a reading of it. Flattening a conditional cell into ALLOW or DENY silently
 * deletes a rule.
 *
 * The action rows are FND-03's `PERMISSION_VALUES`, in PRD §38.1 row order — one member per row, which
 * is why `Decision.via` is the action itself and no second "action" vocabulary is coined here (D6).
 *
 * LOOKUP IS HARDENED. `RUNT-02` calls `evaluate()` with data built from an HTTP request, so a
 * caller-supplied `action` of `'__proto__'`, `'constructor'` or `'toString'` must never resolve to
 * something inherited from `Object.prototype`: that would be an authorisation bypass, not a crash.
 * `cell()` therefore looks rows and columns up through `Object.hasOwn` and throws a named error rather
 * than returning `undefined`.
 */
import type { ConditionName } from './conditions.js';
import type { Permission } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import type { DenyReason } from './evaluate.js';
import type { PrincipalColumn } from './principal.js';

export interface AllowCell {
  readonly kind: 'ALLOW';
  readonly prdText: string;
}

export interface DenyCell {
  readonly kind: 'DENY';
  readonly prdText: string;
  /** Present only where PRD §38.1's own words name a reason other than "this role lacks it". */
  readonly reason?: DenyReason;
}

export interface ConditionalCell {
  readonly kind: 'CONDITIONAL';
  readonly prdText: string;
  readonly condition: ConditionName;
}

export type Cell = AllowCell | DenyCell | ConditionalCell;

/** Thrown when a lookup names a row or column that does not exist. Never returns `undefined`. */
export class MatrixLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatrixLookupError';
  }
}

const allow = (prdText: string): AllowCell => ({ kind: 'ALLOW', prdText });

const deny = (prdText: string, reason?: DenyReason): DenyCell =>
  reason === undefined ? { kind: 'DENY', prdText } : { kind: 'DENY', prdText, reason };

const conditional = (prdText: string, condition: ConditionName): ConditionalCell => ({
  kind: 'CONDITIONAL',
  prdText,
  condition,
});

/** PRD §38.1's tick and em dash, named once so no cell carries a look-alike character. */
const TICK = '✓';
const DASH = '—';

/**
 * The internal-admin row denies every organisation column, and PRD §38.1's own words for the row —
 * "separate internal identity only" — are the reason. Carrying it as cell DATA is what lets the
 * fixture show the rule instead of `evaluate()` hiding it behind a special case.
 */
const INTERNAL_ONLY: DenyReason = 'SEPARATE_INTERNAL_IDENTITY_REQUIRED';

export const ROLE_MATRIX: Readonly<Record<Permission, Readonly<Record<PrincipalColumn, Cell>>>> =
  deepFreeze({
    // | Search/read public corpus | ✓ | ✓ | ✓ | ✓ | ✓ | scoped |
    CORPUS_SEARCH_READ: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: allow(TICK),
      VIEWER: allow(TICK),
      DEVELOPER: allow(TICK),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPE_GRANTED'),
    },
    // | Create Answer/Coverage/Compare | ✓ | ✓ | ✓ | — | — by default | scoped |
    ANSWER_CREATE: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: allow(TICK),
      VIEWER: deny(DASH),
      DEVELOPER: conditional(`${DASH} by default`, 'OFF_BY_DEFAULT_GRANTABLE'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPE_GRANTED'),
    },
    // | Create/read own Research Records | ✓ | ✓ | ✓ | read shared | — by default | scoped |
    RESEARCH_RECORD_READ_WRITE_OWN: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: allow(TICK),
      VIEWER: conditional('read shared', 'SHARED_WITH_MEMBER'),
      DEVELOPER: conditional(`${DASH} by default`, 'OFF_BY_DEFAULT_GRANTABLE'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPE_GRANTED'),
    },
    // | Review/comment shared records | ✓ | ✓ | ✓ if assigned | comment if granted | — | scoped if granted |
    RESEARCH_RECORD_REVIEW_COMMENT: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: conditional(`${TICK} if assigned`, 'ASSIGNED_REVIEWER'),
      VIEWER: conditional('comment if granted', 'GRANT_REQUIRED'),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: conditional('scoped if granted', 'GRANT_REQUIRED'),
    },
    // | Export accessible records | ✓ | ✓ | ✓ | read-only export if granted | — | scoped |
    EXPORT_CREATE: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: allow(TICK),
      VIEWER: conditional('read-only export if granted', 'GRANT_REQUIRED'),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPE_GRANTED'),
    },
    // | Create watchlists | ✓ | ✓ | ✓ | — | — | scoped |
    WATCHLIST_CREATE: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: allow(TICK),
      VIEWER: deny(DASH),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPE_GRANTED'),
    },
    // | Manage members/invitations | ✓ | ✓ except Owner constraints | — | — | — | — |
    MEMBERSHIP_MANAGE: {
      OWNER: allow(TICK),
      ADMIN: conditional(`${TICK} except Owner constraints`, 'OWNER_CONSTRAINTS'),
      RESEARCHER: deny(DASH),
      VIEWER: deny(DASH),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: deny(DASH),
    },
    // | Change roles/remove members | ✓ | ✓ cannot remove/change last Owner | — | — | — | — |
    MEMBERSHIP_ROLE_CHANGE: {
      OWNER: allow(TICK),
      ADMIN: conditional(`${TICK} cannot remove/change last Owner`, 'LAST_OWNER_IMMUTABLE'),
      RESEARCHER: deny(DASH),
      VIEWER: deny(DASH),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: deny(DASH),
    },
    // | Configure retention/closure | ✓ | — | — | — | — | — |
    ORGANIZATION_RETENTION_CONFIGURE: {
      OWNER: allow(TICK),
      ADMIN: deny(DASH),
      RESEARCHER: deny(DASH),
      VIEWER: deny(DASH),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: deny(DASH),
    },
    // | Configure SSO/enforce MFA | ✓ | ✓ | — | — | — | — |
    ORGANIZATION_SECURITY_CONFIGURE: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: deny(DASH),
      VIEWER: deny(DASH),
      DEVELOPER: deny(DASH),
      SERVICE_ACCOUNT: deny(DASH),
    },
    // | Manage service accounts/webhooks/widget | ✓ | ✓ | — | — | ✓ within granted developer permission | — |
    SERVICE_ACCOUNT_MANAGE: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: deny(DASH),
      VIEWER: deny(DASH),
      DEVELOPER: conditional(
        `${TICK} within granted developer permission`,
        'DEVELOPER_PERMISSION_GRANTED',
      ),
      SERVICE_ACCOUNT: deny(DASH),
    },
    // | View organisation usage | ✓ | ✓ | own usage | — | API/service usage subset | own usage |
    USAGE_VIEW: {
      OWNER: allow(TICK),
      ADMIN: allow(TICK),
      RESEARCHER: conditional('own usage', 'OWN_RESOURCE_ONLY'),
      VIEWER: deny(DASH),
      DEVELOPER: conditional('API/service usage subset', 'USAGE_SUBSET'),
      SERVICE_ACCOUNT: conditional('own usage', 'OWN_RESOURCE_ONLY'),
    },
    // | View audit/security events | ✓ | ✓ limited | — | — | credential events only | — |
    AUDIT_EVENT_VIEW: {
      OWNER: allow(TICK),
      ADMIN: conditional(`${TICK} limited`, 'LIMITED_SUBSET'),
      RESEARCHER: deny(DASH),
      VIEWER: deny(DASH),
      DEVELOPER: conditional('credential events only', 'CREDENTIAL_EVENTS_ONLY'),
      SERVICE_ACCOUNT: deny(DASH),
    },
    // | Internal source/release/incident admin | — | — | — | — | — | separate internal identity only |
    INTERNAL_ADMIN: {
      OWNER: deny(DASH, INTERNAL_ONLY),
      ADMIN: deny(DASH, INTERNAL_ONLY),
      RESEARCHER: deny(DASH, INTERNAL_ONLY),
      VIEWER: deny(DASH, INTERNAL_ONLY),
      DEVELOPER: deny(DASH, INTERNAL_ONLY),
      SERVICE_ACCOUNT: conditional('separate internal identity only', 'SEPARATE_INTERNAL_IDENTITY'),
    },
  });

/** The matrix's own row order, read back from the table so a test can compare it to FND-03's enum. */
export const MATRIX_ACTIONS: readonly Permission[] = deepFreeze(
  Object.keys(ROLE_MATRIX) as Permission[],
);

/** The matrix's own column order, read back the same way. */
export const MATRIX_COLUMNS: readonly PrincipalColumn[] = deepFreeze(
  Object.keys(ROLE_MATRIX.CORPUS_SEARCH_READ) as PrincipalColumn[],
);

/**
 * The cell for one (action, column) pair.
 *
 * Own-property lookups only: an inherited `Object.prototype` member must never masquerade as a rule.
 */
export function cell(action: Permission, column: PrincipalColumn): Cell {
  if (!Object.hasOwn(ROLE_MATRIX, action)) {
    throw new MatrixLookupError(`no PRD 38.1 row for action ${String(action)}`);
  }
  const row = ROLE_MATRIX[action];
  if (!Object.hasOwn(row, column)) {
    throw new MatrixLookupError(`no PRD 38.1 column ${String(column)} for action ${String(action)}`);
  }
  return row[column];
}
