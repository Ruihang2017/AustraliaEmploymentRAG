/**
 * `service_account` — the non-human organisation actor (PRD §15.4, §35.4 "no Web login", §38.4).
 *
 * `scopes_json` is a TEXT column holding JSON, which SQLite cannot usefully CHECK, so the scope
 * vocabulary is enforced **here** against the canonical `packages/contracts` `ApiScope` family
 * (PRD §16.3, FND-03): an unregistered scope is `TenancyError('INVALID_SCOPE')` at write time
 * rather than a surprise at authorisation time. `ip_allowlist_json` is validated only as
 * well-formed JSON array — its contents are network policy, not an enum.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { getEnumValues } from '../../migrate/contracts.js';
import { TENANCY_TABLE_SPECS } from '../../schema/tenancy.js';

import { assertOrganizationOpen } from './closure.js';
import { TenancyError } from './errors.js';
import { compareAndSwap, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';

/**
 * Module-private on purpose (sub-PRD **D12**): this group exports concrete, pre-bound,
 * **guarded** repositories and never the factory definition. `.for(db, ctx)` on a raw definition
 * yields `defineTenantRepository`'s unguarded CRUD, which skips `assertOrganizationOpen`, the
 * last-Owner invariant, the value validations and the `row_version` CAS. Keeping the binding inside
 * this module is what makes those guards unbypassable rather than merely conventional; the
 * `test/tenancy/surface.test.ts` regression pins it.
 */
const serviceAccountDefinition = defineTenantRepository({
  table: 'service_account',
  spec: TENANCY_TABLE_SPECS.service_account,
});

export interface ServiceAccountsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  create(tx: Tx, values: Row): Row;
  /** The documented write path: `row_version` compare-and-swap (PRD §34.1). */
  updateWithVersion(tx: Tx, id: string, expectedRowVersion: number, patch: Row): Row;
}

/** Throws unless every entry of the JSON text is a registered `ApiScope` (PRD §16.3). */
export function assertValidScopesJson(scopesJson: unknown): void {
  if (typeof scopesJson !== 'string') {
    throw new TenancyError('INVALID_SCOPE', 'scopes_json must be JSON text');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopesJson);
  } catch {
    throw new TenancyError('INVALID_SCOPE', 'scopes_json is not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new TenancyError('INVALID_SCOPE', 'scopes_json must be a JSON array of scopes');
  }
  const registered = new Set(getEnumValues('ApiScope'));
  for (const scope of parsed) {
    if (typeof scope !== 'string' || !registered.has(scope)) {
      throw new TenancyError(
        'INVALID_SCOPE',
        `${JSON.stringify(scope)} is not a registered ApiScope (PRD §16.3, FND-03)`,
      );
    }
  }
}

function assertValidIpAllowlist(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') {
    throw new TenancyError('INVALID_ARGUMENT', 'ip_allowlist_json must be JSON text or null');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TenancyError('INVALID_ARGUMENT', 'ip_allowlist_json is not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new TenancyError('INVALID_ARGUMENT', 'ip_allowlist_json must be a JSON array of strings');
  }
}

export function serviceAccountsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: RepositoryOptions,
): ServiceAccountsRepository {
  const repository = serviceAccountDefinition.for(db, ctx);
  const now = resolveNow(options);

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

    create(tx, values) {
      assertOrganizationOpen(db, ctx, tx, 'service_account.create');
      assertValidScopesJson(values['scopes_json']);
      assertValidIpAllowlist(values['ip_allowlist_json']);
      const timestamp = now();
      return repository.insert(tx, {
        created_at: timestamp,
        updated_at: timestamp,
        row_version: 1,
        ...values,
      });
    },

    updateWithVersion(tx, id, expectedRowVersion, patch) {
      assertOrganizationOpen(db, ctx, tx, 'service_account.update');
      if ('scopes_json' in patch) assertValidScopesJson(patch['scopes_json']);
      if ('ip_allowlist_json' in patch) assertValidIpAllowlist(patch['ip_allowlist_json']);
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'service_account',
        id,
        expectedRowVersion,
        patch,
        scope: 'TENANT',
        kind: 'service_account',
      });
    },
  };
}
