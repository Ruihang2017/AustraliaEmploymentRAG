/**
 * FND-06 deliverables 1 and 2 — the vocabulary of the PRD §38.1 access decision (docs/PRD.md
 * lines 2512-2535), plus the input shape `DATA-04` (membership storage) and `RUNT-02` (the admission
 * chain) both read. Recorded as sub-PRD decision **D21** (docs/prd/00-foundation/README.md v0.7).
 *
 * IMPORT ROUTE: the enum vocabulary is `FND-03`'s (sub-PRD **D6**) and is imported from the contracts
 * *enums barrel* by relative path. `packages/contracts/src/index.ts` is frozen at `export {};` by
 * `tools/tests/skeleton.test.mjs`, so the `@taxrag/contracts` path alias resolves to an empty module —
 * see open question **Q-F10**. Never deep-import a single enum family file; the barrel is the surface.
 *
 * IDENTIFIERS ARE PLAIN `string`, deliberately: this leaf only *compares* identifiers, it never mints,
 * parses or validates one, so it does not depend on `packages/contracts/src/ids` and its import
 * surface stays at one file. A branded `Id<K>` assigns to `string`, so a caller holding real opaque
 * ids loses nothing.
 *
 * Purity (deliverable 7, PRD §39.1/§45.2): no `node:` import, no clock, no randomness, no I/O.
 */
import type { ApiScope, Permission, Role } from '../../../contracts/src/enums/index.js';
import { ROLE_VALUES } from '../../../contracts/src/enums/index.js';

/**
 * The six columns of the §38.1 table: the five organisation roles, then the service account, which is
 * a principal *kind* rather than a role.
 */
export type PrincipalKey = Role | 'SERVICE_ACCOUNT';

/** Column order, as printed in PRD §38.1. */
export const PRINCIPAL_KEYS: readonly PrincipalKey[] = Object.freeze([
  ...ROLE_VALUES,
  'SERVICE_ACCOUNT',
] as readonly PrincipalKey[]);

/**
 * The thirteen conditional cells of §38.1, one name per distinct cell wording (deliverable 1). Every
 * one of them is a predicate in `conditions.ts` — never a comment, never a `TODO`.
 *
 * `SCOPED_CREDENTIAL_REQUIRED` is the ticket's renamed `SCOPED_CREDENTIAL`: the shorter literal
 * matches the `credential` pattern of `tools/fixtures/secret-patterns.json`, which the CI secret scan
 * applies to every git-tracked file outside `docs/**` (sub-PRD D20b, D21).
 */
export const CONDITION_NAMES = Object.freeze([
  'OWNER_CONSTRAINTS',
  'LAST_OWNER_IMMUTABLE',
  'ASSIGNED_REVIEWER',
  'SHARED_WITH_MEMBER',
  'GRANT_REQUIRED',
  'OFF_BY_DEFAULT_GRANTABLE',
  'SCOPED_CREDENTIAL_REQUIRED',
  'OWN_RESOURCE_ONLY',
  'USAGE_SUBSET',
  'LIMITED_SUBSET',
  'CREDENTIAL_EVENTS_ONLY',
  'DEVELOPER_PERMISSION_GRANTED',
  'SEPARATE_INTERNAL_IDENTITY',
] as const);

export type ConditionName = (typeof CONDITION_NAMES)[number];

/** Runtime guard — a fixture or a caller may hand us an arbitrary string. */
export const isConditionName = (value: unknown): value is ConditionName =>
  typeof value === 'string' && (CONDITION_NAMES as readonly string[]).includes(value);

/** What a cell says once its PRD wording is read: allow, deny, or allow subject to one condition. */
export type CellEffect = 'ALLOW' | 'DENY' | 'CONDITIONAL';

/**
 * Whether the request reads or writes. `intent` exists because two §38.1 cells cap a Viewer at
 * reading ("read shared", "read-only export if granted") — a cap that cannot be expressed by the
 * effect alone.
 */
export type Intent = 'READ' | 'WRITE';

/** Which slice of usage the caller is asking for — §38.1 "own usage" / "API/service usage subset". */
export type UsageView = 'ORGANIZATION' | 'OWN' | 'API_SERVICE';

/** Which slice of the audit log the caller is asking for — §38.1 "✓ limited" / "credential events only". */
export type AuditView = 'FULL' | 'LIMITED' | 'CREDENTIAL_ONLY';

/** One cell of the §38.1 matrix, carrying the PRD's own words alongside the derived effect. */
export interface MatrixCell {
  /** The cell text exactly as PRD §38.1 prints it, `✓` and `—` included. */
  readonly prdText: string;
  readonly effect: CellEffect;
  /** Present exactly when `effect === 'CONDITIONAL'`. */
  readonly condition?: ConditionName;
  /** Present when the cell caps the principal at reading (`'READ'`). */
  readonly maxIntent?: Intent;
}

/** Row-level facts about an action that no single cell carries. */
export interface ActionSpec {
  readonly permission: Permission;
  /** The action label exactly as PRD §38.1 prints it. */
  readonly prdAction: string;
  /** The action names a record, so resource membership (§38.1 closing rule) applies. */
  readonly resourceScoped: boolean;
  /** The action adds, removes or re-roles a member, so the last-Owner invariant (PRD §8.1) applies. */
  readonly membershipMutating: boolean;
  /** §38.1's final row: no organisation principal may ever be authorised, Owner included. */
  readonly internalIdentityOnly: boolean;
}

/**
 * An explicit, recorded grant. Grants are **data**: they are stored rows, never inferred from a role
 * (PRD §8.1 — "Developer MUST NOT automatically gain Research Record content access").
 * `resourceId` absent means the grant is organisation-wide.
 */
export interface Grant {
  readonly permission: Permission;
  readonly resourceId?: string;
}

/** Who is asking. `role` belongs to `kind: 'USER'`; a service account carries scopes instead. */
export interface Principal {
  readonly kind: 'USER' | 'SERVICE_ACCOUNT';
  /** Membership/service-account id — compared against `ownerId`, `sharedWith` and `assignedReviewerId`. */
  readonly id: string;
  readonly organizationId: string;
  /** Required for `kind: 'USER'`; an absent or unknown role denies with `NOT_A_MEMBER` (it is data). */
  readonly role?: Role;
  readonly grants: readonly Grant[];
  readonly scopes: readonly ApiScope[];
}

/** The record being acted on, already resolved by the caller. */
export interface Resource {
  readonly organizationId: string;
  readonly id?: string;
  readonly ownerId?: string;
  readonly sharedWith?: readonly string[];
  readonly assignedReviewerId?: string;
}

export interface MembershipTarget {
  readonly memberId: string;
  readonly role: Role;
}

export interface EvaluationContext {
  readonly intent: Intent;
  /** How many Owners the organisation has. Absent is treated as "could be the last one" (fail-closed). */
  readonly ownerCount?: number;
  /** The member being managed, for the two §38.1 membership rows. */
  readonly target?: MembershipTarget;
  readonly usageView?: UsageView;
  readonly auditView?: AuditView;
}

/**
 * `resource` is three-valued and the distinction is load-bearing:
 *
 * - **omitted** — no resource is in play (creating a record, listing, configuring an organisation);
 * - **`null`** — the request named an opaque id and the lookup found nothing. The *domain* produces
 *   the not-found decision, so `RUNT-02` cannot accidentally answer differently for "absent" and
 *   "another tenant's" (PRD §16.5). `isIndistinguishableNotFound` collapses the two;
 * - **a `Resource`** — resolved, and its `organizationId` is checked first, before any role is read.
 *
 * `exactOptionalPropertyTypes` is on, so an omitted key and an explicit `null` really are different
 * types here. Keep it that way.
 */
export interface EvaluationInput {
  readonly principal: Principal;
  /** One of the 14 `PERMISSION_VALUES`, which are the 14 §38.1 rows in matrix row order. */
  readonly action: Permission;
  readonly resource?: Resource | null;
  readonly context: EvaluationContext;
}

/**
 * Why a request was denied. `CROSS_ORGANIZATION` and `RESOURCE_ABSENT` are the two the caller MUST
 * render identically (PRD §16.5); the rest are for the audit trail, not for the response body.
 */
export type DenyReason =
  | 'CROSS_ORGANIZATION'
  | 'RESOURCE_ABSENT'
  | 'NOT_A_MEMBER'
  | 'ROLE_LACKS_PERMISSION'
  | 'CONDITION_NOT_MET'
  | 'WRITE_INTENT_NOT_PERMITTED'
  | 'NOT_A_RESOURCE_MEMBER'
  | 'SEPARATE_INTERNAL_IDENTITY_REQUIRED';

export type Decision =
  | { readonly allowed: true; readonly via: Permission }
  | {
      readonly allowed: false;
      readonly reason: DenyReason;
      /** Present only for `CONDITION_NOT_MET`, naming which §38.1 cell condition failed. */
      readonly condition?: ConditionName;
    };

/** A predicate over the whole input, so a condition can read the principal, the resource and the context. */
export type ConditionPredicate = (input: EvaluationInput) => boolean;
