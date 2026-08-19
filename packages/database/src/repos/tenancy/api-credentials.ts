/**
 * `api_credential` — AUTH-006 ("Service credentials are shown once, hashed, scoped, expiring and
 * rotatable"; "Old key fails immediately after rotation/revocation").
 *
 * # The API cannot carry a full secret
 *
 * `create` accepts exactly `prefix` and `secretHash` and **rejects unknown keys at runtime**. There
 * is no `secret` parameter, not even "for tests" — the factories in `test/tenancy/factories.ts`
 * build hashes. The schema half of the same property is that the table has no column able to hold
 * one. Generating, displaying and hashing the secret is `02-auth-core`'s (PRD §38.4); this ticket
 * stores the hash it is handed.
 *
 * # Revocation takes effect immediately
 *
 * `findVerifiable` filters `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)` **in
 * SQL**, so a `revoke()` earlier in the same transaction is already visible to the next verification
 * query — which is exactly what AUTH-006's acceptance measures. Filtering in JavaScript over a
 * cached row would pass a naive test and fail the requirement.
 *
 * The table is `APPEND_ONLY`: `revoke`, `rotate` and `touchLastUsed` are **stamps** written through
 * the scoped-statement helper (sub-PRD D14), not row rewrites, and the repository has no `update`
 * member to misuse.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { ResourceNotFound } from '../../tenant/errors.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { TENANCY_TABLE_SPECS } from '../../schema/tenancy.js';

import { assertOrganizationOpen } from './closure.js';
import { TenancyError } from './errors.js';
import { newId, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';
import { runScopedSelect, runScopedUpdate } from './internal/statement.js';

/**
 * Module-private on purpose (sub-PRD **D12**): this group exports concrete, pre-bound,
 * **guarded** repositories and never the factory definition. `.for(db, ctx)` on a raw definition
 * yields `defineTenantRepository`'s unguarded CRUD, which skips `assertOrganizationOpen`, the
 * last-Owner invariant, the value validations and the `row_version` CAS. Keeping the binding inside
 * this module is what makes those guards unbypassable rather than merely conventional; the
 * `test/tenancy/surface.test.ts` regression pins it.
 */
const apiCredentialDefinition = defineTenantRepository({
  table: 'api_credential',
  spec: TENANCY_TABLE_SPECS.api_credential,
});

/**
 * Everything `create` accepts. The key set is closed and checked at runtime — a caller who passes
 * `secret`, `secret_plaintext` or `token` gets `INVALID_ARGUMENT`, not a silently ignored field.
 */
export interface CreateCredentialRequest {
  readonly serviceAccountId: string;
  /** The displayed lookup handle (AUTH-006 "full secret displayed once" — this is not the secret). */
  readonly prefix: string;
  /** A hash produced by 02-auth-core. Never a secret. */
  readonly secretHash: string;
  readonly expiresAt?: string | null;
  readonly id?: string;
}

const ALLOWED_CREATE_KEYS: readonly string[] = [
  'serviceAccountId',
  'prefix',
  'secretHash',
  'expiresAt',
  'id',
];

/** Names that must never reach this repository, checked explicitly so the refusal is legible. */
const FORBIDDEN_CREATE_KEYS: readonly string[] = [
  'secret',
  'secretPlaintext',
  'secret_plaintext',
  'token',
  'apiKey',
  'api_key',
];

export interface ApiCredentialsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  create(tx: Tx, request: CreateCredentialRequest): Row;
  /** The verification lookup: live credentials only, filtered in SQL. */
  findVerifiable(prefix: string, at?: string): Row | undefined;
  revoke(tx: Tx, id: string): void;
  /** Revokes `oldId` and creates the replacement in the same transaction (AUTH-006). */
  rotate(tx: Tx, oldId: string, replacement: CreateCredentialRequest): Row;
  touchLastUsed(tx: Tx, id: string, at?: string): void;
}

function assertCreateRequest(request: CreateCredentialRequest): void {
  if (typeof request !== 'object' || request === null) {
    throw new TenancyError('INVALID_ARGUMENT', 'api_credential.create needs a request object');
  }
  for (const key of Object.keys(request)) {
    if (FORBIDDEN_CREATE_KEYS.includes(key)) {
      throw new TenancyError(
        'INVALID_ARGUMENT',
        `api_credential.create accepts prefix + secretHash only; ${JSON.stringify(key)} would ` +
          'carry secret material (AUTH-006)',
        key,
      );
    }
    if (!ALLOWED_CREATE_KEYS.includes(key)) {
      throw new TenancyError(
        'INVALID_ARGUMENT',
        `api_credential.create does not accept ${JSON.stringify(key)}`,
        key,
      );
    }
  }
  for (const key of ['serviceAccountId', 'prefix', 'secretHash'] as const) {
    if (typeof request[key] !== 'string' || request[key].length === 0) {
      throw new TenancyError('INVALID_ARGUMENT', `api_credential.create needs a ${key}`);
    }
  }
}

export function apiCredentialsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: RepositoryOptions,
): ApiCredentialsRepository {
  const repository = apiCredentialDefinition.for(db, ctx);
  const now = resolveNow(options);

  const insert = (tx: Tx, request: CreateCredentialRequest): Row => {
    assertCreateRequest(request);
    return repository.insert(tx, {
      id: request.id ?? newId('cred'),
      service_account_id: request.serviceAccountId,
      prefix: request.prefix,
      secret_hash: request.secretHash,
      created_at: now(),
      expires_at: request.expiresAt ?? null,
      last_used_at: null,
      revoked_at: null,
    });
  };

  const stamp = (tx: Tx, id: string, column: 'revoked_at' | 'last_used_at', at: string): void => {
    const changes = runScopedUpdate(db, ctx, tx, {
      table: 'api_credential',
      id,
      set: { [column]: at },
      where: [{ column: 'id', op: '=', value: id }],
    });
    if (changes === 0) throw new ResourceNotFound('api_credential');
  };

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

    create(tx, request) {
      assertOrganizationOpen(db, ctx, tx, 'api_credential.create');
      return insert(tx, request);
    },

    findVerifiable(prefix, at) {
      const when = at ?? now();
      // `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`, written as two conjunctive
      // statements rather than one with an OR branch. The chokepoint deliberately does not analyse
      // boolean structure (`src/tenant/scoped-sql.ts`'s header), so this layer keeps every WHERE an
      // AND chain — the property that makes the scope predicate impossible to sidestep. Both halves
      // are still evaluated in SQL, which is what makes a revocation visible to the very next
      // verification query in the same transaction (AUTH-006).
      const base = [
        { column: 'prefix', op: '=' as const, value: prefix },
        { column: 'revoked_at', op: 'is' as const, value: null },
      ];
      const neverExpires = runScopedSelect(db, ctx, {
        table: 'api_credential',
        where: [...base, { column: 'expires_at', op: 'is', value: null }],
        limit: 1,
      })[0];
      if (neverExpires !== undefined) return neverExpires;
      return runScopedSelect(db, ctx, {
        table: 'api_credential',
        where: [...base, { column: 'expires_at', op: '>', value: when }],
        limit: 1,
      })[0];
    },

    revoke(tx, id) {
      // Revoking a credential of a closed organisation is a safety operation and PRD §10.3's closure
      // sequence must be able to shut access down — so it is exempt. The guard is still *called*,
      // with the operation name that appears in CLOSURE_EXEMPT_OPERATIONS: an exemption granted by
      // omitting the call is invisible at the allowlist, which is the one place the code's own docs
      // say the answer should be readable.
      assertOrganizationOpen(db, ctx, tx, 'api_credential.revoke');
      stamp(tx, id, 'revoked_at', now());
    },

    rotate(tx, oldId, replacement) {
      assertOrganizationOpen(db, ctx, tx, 'api_credential.rotate');
      assertCreateRequest(replacement);
      stamp(tx, oldId, 'revoked_at', now());
      return insert(tx, replacement);
    },

    touchLastUsed(tx, id, at) {
      // A usage stamp is an ordinary write, and a closed organisation's credentials must not be
      // usable at all (PRD §10.3, acceptance item 9). Not exempt, and therefore guarded — the
      // asymmetry with revoke() above is decided in CLOSURE_EXEMPT_OPERATIONS, not here.
      assertOrganizationOpen(db, ctx, tx, 'api_credential.touchLastUsed');
      stamp(tx, id, 'last_used_at', at ?? now());
    },
  };
}
