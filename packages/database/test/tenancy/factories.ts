/**
 * DATA-04 deliverable 7 — fixture builders.
 *
 * Pure value builders: each returns a row object and touches no database. Later `01-app-data`
 * tickets and `ASSR-01` copy the construction pattern, so the shape matters as much as the values —
 * deterministic-but-unique ids, valid ISO-UTC timestamps that satisfy the CHECK constraints, and an
 * `overrides` object as the last argument.
 *
 * **Credential factories build hashes, never secrets** (AUTH-006). There is no `secret` field here
 * for the same reason there is no `secret` column and no `secret` parameter: a convenience field
 * "for tests" is how a secret ends up in a fixture and then in a log.
 */
import { randomUUID } from 'node:crypto';

export type Row = Record<string, unknown>;

let sequence = 0;

/** Unique per call, readable in a failure message, and stable in shape. */
export function testId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${String(sequence).padStart(4, '0')}_${randomUUID().slice(0, 8)}`;
}

/** An ISO-UTC instant offset from a fixed base, so tests can order events without sleeping. */
export function isoAt(offsetMs = 0, base = Date.parse('2026-08-18T00:00:00.000Z')): string {
  return new Date(base + offsetMs).toISOString();
}

export function makeOrganization(organizationId: string, overrides: Row = {}): Row {
  const timestamp = isoAt();
  return {
    // `organization.id === organization.organization_id` is a CHECK constraint (migration header
    // deviation (2)); the factory encodes it so a test cannot accidentally violate it.
    id: organizationId,
    name: `Organisation ${organizationId}`,
    slug: `slug-${organizationId}`,
    plan: 'STANDARD',
    status: 'ACTIVE',
    default_legal_date_policy: 'AS_AT_TODAY',
    retention_policy_json: JSON.stringify({ days: 365 }),
    created_at: timestamp,
    updated_at: timestamp,
    row_version: 1,
    ...overrides,
  };
}

export function makeUser(overrides: Row = {}): Row {
  const timestamp = isoAt();
  const id = (overrides['id'] as string | undefined) ?? testId('usr');
  return {
    id,
    email_normalized: `${id}@example.test`,
    display_name: 'Test User',
    status: 'ACTIVE',
    created_at: timestamp,
    updated_at: timestamp,
    row_version: 1,
    ...overrides,
  };
}

export function makeMembership(userId: string, overrides: Row = {}): Row {
  const timestamp = isoAt();
  return {
    id: testId('mem'),
    user_id: userId,
    role: 'OWNER',
    status: 'ACTIVE',
    joined_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    row_version: 1,
    ...overrides,
  };
}

export function makeActor(userId: string, overrides: Row = {}): Row {
  return {
    id: testId('act'),
    actor_type: 'USER',
    user_id: userId,
    service_account_id: null,
    created_at: isoAt(),
    ...overrides,
  };
}

export interface InvitationFactoryResult {
  readonly emailNormalized: string;
  readonly role: string;
  /** A hash — the plaintext token never exists in this codebase. */
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly invitedByActorId: string;
  readonly id: string;
}

export function makeInvitation(
  invitedByActorId: string,
  overrides: Partial<InvitationFactoryResult> = {},
): InvitationFactoryResult {
  return {
    id: testId('inv'),
    emailNormalized: `${testId('invitee')}@example.test`,
    role: 'RESEARCHER',
    tokenHash: `sha256:${randomUUID().replace(/-/g, '')}`,
    expiresAt: isoAt(7 * 24 * 60 * 60 * 1000),
    invitedByActorId,
    ...overrides,
  };
}

export function makeServiceAccount(overrides: Row = {}): Row {
  const timestamp = isoAt();
  return {
    id: testId('svc'),
    name: 'Test Service Account',
    status: 'ACTIVE',
    scopes_json: JSON.stringify(['search:read', 'records:read']),
    expires_at: null,
    ip_allowlist_json: null,
    budget_limit: null,
    created_at: timestamp,
    updated_at: timestamp,
    row_version: 1,
    ...overrides,
  };
}

export interface CredentialFactoryResult {
  readonly serviceAccountId: string;
  readonly prefix: string;
  /** A hash. There is deliberately no `secret` field (AUTH-006). */
  readonly secretHash: string;
  readonly expiresAt?: string | null;
  readonly id: string;
}

export function makeApiCredential(
  serviceAccountId: string,
  overrides: Partial<CredentialFactoryResult> = {},
): CredentialFactoryResult {
  return {
    id: testId('cred'),
    serviceAccountId,
    prefix: testId('pfx'),
    secretHash: `argon2id$${randomUUID().replace(/-/g, '')}`,
    expiresAt: null,
    ...overrides,
  };
}

export interface SsoFactoryResult {
  readonly protocol: string;
  readonly state: string;
  readonly configuration: string | null;
  readonly id: string;
}

export function makeSsoConnection(overrides: Partial<SsoFactoryResult> = {}): SsoFactoryResult {
  return {
    id: testId('sso'),
    protocol: 'SAML',
    state: 'DRAFT',
    configuration: JSON.stringify({ entityId: 'https://idp.example.test/metadata' }),
    ...overrides,
  };
}
