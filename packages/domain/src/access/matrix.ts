/**
 * FND-06 deliverable 1 — PRD §38.1's role matrix as data: 14 action rows × 6 principal columns =
 * **84 cells**, none omitted, each carrying the PRD's own cell text (docs/PRD.md lines 2512-2535).
 *
 * ROW ORDER IS THE SPEC. `PERMISSION_VALUES` is, by its own docblock in `FND-03`, "one per action row
 * of the PRD §38.1 role matrix, in matrix row order", so row *n* of the printed table is
 * `PERMISSION_VALUES[n - 1]`. Column order is `PRINCIPAL_KEYS` = the five roles then the service
 * account. `test/access/prd-38-1-matrix.json` transcribes the same table independently and the replay
 * asserts the two agree, so neither can drift without a red test.
 *
 * A conditional cell is NEVER flattened to `ALLOW` or `DENY` — flattening silently deletes a rule.
 */
import type { Permission } from '../../../contracts/src/enums/index.js';
import type { ActionSpec, ConditionName, Intent, MatrixCell, PrincipalKey } from './types.js';
import { deepFreeze } from './freeze.js';

const allow = (prdText: string): MatrixCell => ({ prdText, effect: 'ALLOW' });
const deny = (prdText: string): MatrixCell => ({ prdText, effect: 'DENY' });
const conditional = (
  prdText: string,
  condition: ConditionName,
  maxIntent?: Intent,
): MatrixCell =>
  maxIntent === undefined
    ? { prdText, effect: 'CONDITIONAL', condition }
    : { prdText, effect: 'CONDITIONAL', condition, maxIntent };

/** Row-level facts, keyed in `PERMISSION_VALUES` order. */
export const ACTION_SPECS: Readonly<Record<Permission, ActionSpec>> = deepFreeze({
  CORPUS_SEARCH_READ: {
    permission: 'CORPUS_SEARCH_READ',
    prdAction: 'Search/read public corpus',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  ANSWER_CREATE: {
    permission: 'ANSWER_CREATE',
    prdAction: 'Create Answer/Coverage/Compare',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  RESEARCH_RECORD_READ_WRITE_OWN: {
    permission: 'RESEARCH_RECORD_READ_WRITE_OWN',
    prdAction: 'Create/read own Research Records',
    resourceScoped: true,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  RESEARCH_RECORD_REVIEW_COMMENT: {
    permission: 'RESEARCH_RECORD_REVIEW_COMMENT',
    prdAction: 'Review/comment shared records',
    resourceScoped: true,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  EXPORT_CREATE: {
    permission: 'EXPORT_CREATE',
    prdAction: 'Export accessible records',
    resourceScoped: true,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  WATCHLIST_CREATE: {
    permission: 'WATCHLIST_CREATE',
    prdAction: 'Create watchlists',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  MEMBERSHIP_MANAGE: {
    permission: 'MEMBERSHIP_MANAGE',
    prdAction: 'Manage members/invitations',
    resourceScoped: false,
    membershipMutating: true,
    internalIdentityOnly: false,
  },
  MEMBERSHIP_ROLE_CHANGE: {
    permission: 'MEMBERSHIP_ROLE_CHANGE',
    prdAction: 'Change roles/remove members',
    resourceScoped: false,
    membershipMutating: true,
    internalIdentityOnly: false,
  },
  ORGANIZATION_RETENTION_CONFIGURE: {
    permission: 'ORGANIZATION_RETENTION_CONFIGURE',
    prdAction: 'Configure retention/closure',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  ORGANIZATION_SECURITY_CONFIGURE: {
    permission: 'ORGANIZATION_SECURITY_CONFIGURE',
    prdAction: 'Configure SSO/enforce MFA',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  SERVICE_ACCOUNT_MANAGE: {
    permission: 'SERVICE_ACCOUNT_MANAGE',
    prdAction: 'Manage service accounts/webhooks/widget',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  USAGE_VIEW: {
    permission: 'USAGE_VIEW',
    prdAction: 'View organisation usage',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  AUDIT_EVENT_VIEW: {
    permission: 'AUDIT_EVENT_VIEW',
    prdAction: 'View audit/security events',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: false,
  },
  INTERNAL_ADMIN: {
    permission: 'INTERNAL_ADMIN',
    prdAction: 'Internal source/release/incident admin',
    resourceScoped: false,
    membershipMutating: false,
    internalIdentityOnly: true,
  },
} satisfies Record<Permission, ActionSpec>);

export const ROLE_MATRIX: Readonly<Record<Permission, Readonly<Record<PrincipalKey, MatrixCell>>>> =
  deepFreeze({
    // | Search/read public corpus | ✓ | ✓ | ✓ | ✓ | ✓ | scoped |
    CORPUS_SEARCH_READ: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: allow('✓'),
      VIEWER: allow('✓'),
      DEVELOPER: allow('✓'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPED_CREDENTIAL_REQUIRED'),
    },
    // | Create Answer/Coverage/Compare | ✓ | ✓ | ✓ | — | — by default | scoped |
    ANSWER_CREATE: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: allow('✓'),
      VIEWER: deny('—'),
      DEVELOPER: conditional('— by default', 'OFF_BY_DEFAULT_GRANTABLE'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPED_CREDENTIAL_REQUIRED'),
    },
    // | Create/read own Research Records | ✓ | ✓ | ✓ | read shared | — by default | scoped |
    RESEARCH_RECORD_READ_WRITE_OWN: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: allow('✓'),
      VIEWER: conditional('read shared', 'SHARED_WITH_MEMBER', 'READ'),
      DEVELOPER: conditional('— by default', 'OFF_BY_DEFAULT_GRANTABLE'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPED_CREDENTIAL_REQUIRED'),
    },
    // | Review/comment shared records | ✓ | ✓ | ✓ if assigned | comment if granted | — | scoped if granted |
    RESEARCH_RECORD_REVIEW_COMMENT: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: conditional('✓ if assigned', 'ASSIGNED_REVIEWER'),
      VIEWER: conditional('comment if granted', 'GRANT_REQUIRED'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: conditional('scoped if granted', 'GRANT_REQUIRED'),
    },
    // | Export accessible records | ✓ | ✓ | ✓ | read-only export if granted | — | scoped |
    EXPORT_CREATE: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: allow('✓'),
      VIEWER: conditional('read-only export if granted', 'GRANT_REQUIRED', 'READ'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPED_CREDENTIAL_REQUIRED'),
    },
    // | Create watchlists | ✓ | ✓ | ✓ | — | — | scoped |
    WATCHLIST_CREATE: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: allow('✓'),
      VIEWER: deny('—'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: conditional('scoped', 'SCOPED_CREDENTIAL_REQUIRED'),
    },
    // | Manage members/invitations | ✓ | ✓ except Owner constraints | — | — | — | — |
    MEMBERSHIP_MANAGE: {
      OWNER: allow('✓'),
      ADMIN: conditional('✓ except Owner constraints', 'OWNER_CONSTRAINTS'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: deny('—'),
    },
    // | Change roles/remove members | ✓ | ✓ cannot remove/change last Owner | — | — | — | — |
    MEMBERSHIP_ROLE_CHANGE: {
      OWNER: allow('✓'),
      ADMIN: conditional('✓ cannot remove/change last Owner', 'LAST_OWNER_IMMUTABLE'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: deny('—'),
    },
    // | Configure retention/closure | ✓ | — | — | — | — | — |
    ORGANIZATION_RETENTION_CONFIGURE: {
      OWNER: allow('✓'),
      ADMIN: deny('—'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: deny('—'),
    },
    // | Configure SSO/enforce MFA | ✓ | ✓ | — | — | — | — |
    ORGANIZATION_SECURITY_CONFIGURE: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: deny('—'),
    },
    // | Manage service accounts/webhooks/widget | ✓ | ✓ | — | — | ✓ within granted developer permission | — |
    SERVICE_ACCOUNT_MANAGE: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: conditional(
        '✓ within granted developer permission',
        'DEVELOPER_PERMISSION_GRANTED',
      ),
      SERVICE_ACCOUNT: deny('—'),
    },
    // | View organisation usage | ✓ | ✓ | own usage | — | API/service usage subset | own usage |
    USAGE_VIEW: {
      OWNER: allow('✓'),
      ADMIN: allow('✓'),
      RESEARCHER: conditional('own usage', 'OWN_RESOURCE_ONLY'),
      VIEWER: deny('—'),
      DEVELOPER: conditional('API/service usage subset', 'USAGE_SUBSET'),
      SERVICE_ACCOUNT: conditional('own usage', 'OWN_RESOURCE_ONLY'),
    },
    // | View audit/security events | ✓ | ✓ limited | — | — | credential events only | — |
    AUDIT_EVENT_VIEW: {
      OWNER: allow('✓'),
      ADMIN: conditional('✓ limited', 'LIMITED_SUBSET'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: conditional('credential events only', 'CREDENTIAL_EVENTS_ONLY'),
      SERVICE_ACCOUNT: deny('—'),
    },
    // | Internal source/release/incident admin | — | — | — | — | — | separate internal identity only |
    INTERNAL_ADMIN: {
      OWNER: deny('—'),
      ADMIN: deny('—'),
      RESEARCHER: deny('—'),
      VIEWER: deny('—'),
      DEVELOPER: deny('—'),
      SERVICE_ACCOUNT: conditional(
        'separate internal identity only',
        'SEPARATE_INTERNAL_IDENTITY',
      ),
    },
  } satisfies Record<Permission, Record<PrincipalKey, MatrixCell>>);

/**
 * The cell for one (action, principal) pair. **Throws** on an unknown action or principal key rather
 * than denying: both are chosen by code, never by a user, so an unknown value is a wiring bug and a
 * silent deny would hide it. (The same loud-beats-convenient rule `FND-03`'s enum registry applies.)
 */
export function cellFor(action: Permission, principalKey: PrincipalKey): MatrixCell {
  const row = ROLE_MATRIX[action] as Record<string, MatrixCell> | undefined;
  if (row === undefined) throw new Error(`no PRD §38.1 row for action ${String(action)}`);
  const cell = row[principalKey];
  if (cell === undefined) {
    throw new Error(`no PRD §38.1 cell for action ${String(action)} × ${String(principalKey)}`);
  }
  return cell;
}
