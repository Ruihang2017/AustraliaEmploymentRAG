/**
 * DATA-04 deliverable 4 — the `tenancy` table group's manifest (PRD §35.4).
 *
 * This is the first file in `packages/database/src/schema/`. Discovery is by glob over that
 * directory (sub-PRD D4, DATA-01 deliverable 9): every file exports `tableManifest` and there is
 * deliberately **no** barrel, so `DATA-05`…`DATA-07` each add one file without contending on a
 * shared registration point.
 *
 * The manifest is not documentation. `assertSchemaConventions` walks it against a migrated database
 * and fails on a missing `requiredColumns` entry, a missing `created_at`/`updated_at`/`row_version`,
 * a `TENANT` table without `organization_id`, and — the one that matters most — an enum CHECK whose
 * value set has drifted from the `packages/contracts` registry (PRD §35.1, FND-03).
 *
 * Loaded through `createRequire`, i.e. **Node's** resolver rather than vitest's, so every relative
 * import here needs a `.js` specifier. `test/migrate/manifest.test.ts` has a dedicated case for that
 * failure mode.
 */
import type { TableManifest, TableSpec } from '../migrate/manifest.js';

/**
 * `organization.status` (PRD §10.3, §35.4 "closure state blocks writes").
 *
 * **FND-03 candidate (sub-PRD M-Q7).** There is no `packages/contracts` family for an organisation
 * status, and PRD §10.3 names only the closure sequence ("export followed by deletion within 30
 * days"). This ticket's acceptance requires a closed value to exist at all, so the vocabulary is
 * declared here, minimally, and the CHECK in the migration is pasted from it — it is deliberately
 * **absent** from `enumColumns` below, because that map is checked against the contracts registry
 * and an unregistered family throws inside `getEnumValues`. When FND-03 canonicalises it, this
 * constant is deleted and the column moves into `enumColumns`.
 */
export const ORGANIZATION_STATUS_VALUES = Object.freeze(['ACTIVE', 'CLOSING', 'CLOSED'] as const);

/** The single `organization.status` value that blocks writes (PRD §10.3, §35.4). */
export const ORGANIZATION_STATUS_CLOSED = 'CLOSED';

/**
 * `membership.status` (PRD §35.4 "last-Owner trigger/application invariant").
 *
 * **FND-03 candidate (sub-PRD M-Q7).** The invariant is stated over the last *ACTIVE* Owner, so an
 * active value has to exist; nothing else in the PRD names a membership status vocabulary.
 */
export const MEMBERSHIP_STATUS_VALUES = Object.freeze(['ACTIVE', 'SUSPENDED'] as const);

/** The `membership.status` value the last-Owner invariant counts (PRD §35.4). */
export const MEMBERSHIP_STATUS_ACTIVE = 'ACTIVE';

/** The `membership.role` value the last-Owner invariant counts. A registered `Role` member. */
export const MEMBERSHIP_ROLE_OWNER = 'OWNER';

/**
 * `actor.actor_type` (PRD §35.4 "stable audit identity", "nullable user/service/system linkage").
 *
 * **FND-03 candidate (sub-PRD M-Q7).** Not a free choice: it must agree with DATA-02's `ActorType`
 * union (`src/tenant/context.ts`), which is already load-bearing in every `TenantContext`. Kept in
 * that order.
 */
export const ACTOR_TYPE_VALUES = Object.freeze(['USER', 'SERVICE_ACCOUNT', 'SYSTEM'] as const);

/**
 * `sso_connection.protocol` (PRD §16.3, §38.3).
 *
 * **FND-03 candidate (sub-PRD M-Q7).** §16.3 and §38.3 name SAML and OIDC as alternatives. The
 * uniqueness decision that goes with it — `UNIQUE (organization_id, protocol)`, one connection per
 * protocol per organisation (ticket deliverable 3) — is stated in the migration file and holds
 * because nothing in the PRD contemplates two simultaneous SAML connections.
 */
export const SSO_PROTOCOL_VALUES = Object.freeze(['SAML', 'OIDC'] as const);

/**
 * DATA-04 deliverable 6 — the Better Auth extension point.
 *
 * PRD §35.4 lists "auth-library linkage" on `user` without specifying it, because `AUTC-01` selects
 * Better Auth's table expectations (PRD §18.2). This ticket owns the `user` row shape and refuses to
 * guess: these are the columns `AUTC-01` may rely on.
 *
 * The rule that goes with the seam (plan §4, PRD §45.2, and this ticket's Feedback obligation):
 * **any additional auth-library table, and any change to this row shape, arrives in a NEW migration
 * authored by a ticket in `01-app-data` — never by `02-auth-core`.** `AUTC-01` must not write
 * `packages/database/migrations/**`. A Better Auth requirement that this shape cannot satisfy is a
 * new `01-app-data` ticket plus a `blocked_by` edge, recorded in the sub-PRD's work-breakdown table.
 */
export const AUTH_LIBRARY_LINKAGE_COLUMNS = Object.freeze([
  'id',
  'email_normalized',
  'display_name',
  'status',
] as const);

/**
 * GLOBAL, mutable metadata. `user` is not tenant-owned: AUTH-002 requires a user to switch among
 * organisations, so the tenant boundary is `membership`, not this row. Mutability is
 * `MUTABLE_METADATA` because a status or display-name change is a metadata edit — which is why the
 * table carries `updated_at` and `row_version`.
 */
const userSpec = {
  name: 'user',
  scope: 'GLOBAL',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: [
    'id',
    'email_normalized',
    'display_name',
    'status',
    'created_at',
    'updated_at',
    'row_version',
  ],
} satisfies TableSpec;

/**
 * TENANT, mutable metadata. It carries its own `organization_id` (= `id`, enforced by a CHECK) —
 * see the migration header, deviation (2), and sub-PRD M-Q8.
 */
const organizationSpec = {
  name: 'organization',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: [
    'id',
    'organization_id',
    'name',
    'slug',
    'plan',
    'status',
    'default_legal_date_policy',
    'retention_policy_json',
    'created_at',
    'updated_at',
    'row_version',
  ],
} satisfies TableSpec;

/** TENANT, mutable metadata. `id` is synthetic — see the migration header, deviation (1). */
const membershipSpec = {
  name: 'membership',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: [
    'id',
    'organization_id',
    'user_id',
    'role',
    'status',
    'joined_at',
    'created_at',
    'updated_at',
    'row_version',
  ],
  enumColumns: { role: 'Role' },
} satisfies TableSpec;

/** TENANT, mutable metadata (PRD §35.4 "no Web login"; scopes and budgets are edited in place). */
const serviceAccountSpec = {
  name: 'service_account',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  requiredColumns: [
    'id',
    'organization_id',
    'name',
    'status',
    'scopes_json',
    'expires_at',
    'ip_allowlist_json',
    'budget_limit',
    'created_at',
    'updated_at',
    'row_version',
  ],
} satisfies TableSpec;

/**
 * GLOBAL, append-only. PRD §35.4 calls `actor` a "stable audit identity": nothing about an actor row
 * changes after it is written, so `APPEND_ONLY` is not a convenience — it removes `update`/`delete`
 * from the repository type *and* from the object at runtime (PRD §35.8 invariant 5).
 */
const actorSpec = {
  name: 'actor',
  scope: 'GLOBAL',
  mutability: 'APPEND_ONLY',
  requiredColumns: ['id', 'actor_type', 'user_id', 'service_account_id', 'created_at'],
} satisfies TableSpec;

/**
 * TENANT, append-only (ticket deliverable 4). Its lifecycle is expressed by the `revoked_at` and
 * `last_used_at` **stamps**, not by rewriting the row: a credential's identity, prefix and hash are
 * fixed at creation, and rotation mints a new row rather than editing the old one. The stamps are
 * written through the scoped-statement helper (sub-PRD D14), which is why the absent `update` member
 * is not an obstacle.
 */
const apiCredentialSpec = {
  name: 'api_credential',
  scope: 'TENANT',
  mutability: 'APPEND_ONLY',
  requiredColumns: [
    'id',
    'organization_id',
    'service_account_id',
    'prefix',
    'secret_hash',
    'created_at',
    'expires_at',
    'last_used_at',
    'revoked_at',
  ],
} satisfies TableSpec;

/**
 * TENANT, append-only (ticket deliverable 4). Same reasoning: an invitation is used once, and that
 * use is the `accepted_at` stamp written by a conditional UPDATE, not a row rewrite.
 */
const invitationSpec = {
  name: 'invitation',
  scope: 'TENANT',
  mutability: 'APPEND_ONLY',
  requiredColumns: [
    'id',
    'organization_id',
    'email_normalized',
    'role',
    'token_hash',
    'expires_at',
    'accepted_at',
    'invited_by_actor_id',
    'created_at',
  ],
  enumColumns: { role: 'Role' },
} satisfies TableSpec;

/** TENANT, mutable metadata. The configuration is DATA-03 ciphertext (PRD §35.1, sub-PRD D7). */
const ssoConnectionSpec = {
  name: 'sso_connection',
  scope: 'TENANT',
  mutability: 'MUTABLE_METADATA',
  encryptedColumns: ['configuration_ciphertext'],
  requiredColumns: [
    'id',
    'organization_id',
    'protocol',
    'state',
    'configuration_ciphertext',
    'tested_at',
    'enforced_at',
    'created_at',
    'updated_at',
    'row_version',
  ],
  enumColumns: { state: 'SsoConnectionState' },
} satisfies TableSpec;

export const tableManifest: TableManifest = {
  group: 'tenancy',
  tables: [
    userSpec,
    organizationSpec,
    membershipSpec,
    serviceAccountSpec,
    actorSpec,
    apiCredentialSpec,
    invitationSpec,
    ssoConnectionSpec,
  ],
};

/** Per-table specs, by table name — the repositories import theirs from here, never a hand copy. */
export const TENANCY_TABLE_SPECS = Object.freeze({
  user: userSpec,
  organization: organizationSpec,
  membership: membershipSpec,
  service_account: serviceAccountSpec,
  actor: actorSpec,
  api_credential: apiCredentialSpec,
  invitation: invitationSpec,
  sso_connection: ssoConnectionSpec,
});
