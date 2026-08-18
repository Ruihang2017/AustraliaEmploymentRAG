/**
 * `user` — GLOBAL (PRD §15.4 "Human identity", §35.4 "globally unique normalised email").
 *
 * GLOBAL is not an oversight: AUTH-002 requires a user to switch among organisations without
 * leaking state, so the tenant boundary is `membership`, not this row. The practical consequence is
 * that this repository binds **only** under `systemContext('GLOBAL', …)` and writes only inside
 * `withSystemTransaction` — the two transaction kinds cannot mix. A flow that creates a user *and* a
 * membership is therefore two transactions, sequenced, and that non-atomicity is why `ensureActor`
 * is idempotent (`actors.ts`).
 *
 * The `AUTH_LIBRARY_LINKAGE_COLUMNS` seam in `src/schema/tenancy.ts` is what `AUTC-01` may rely on;
 * any Better Auth table beyond it arrives in a new `01-app-data` migration, never from
 * `02-auth-core`.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { TENANCY_TABLE_SPECS } from '../../schema/tenancy.js';

import { TenancyError } from './errors.js';
import { compareAndSwap, isUniqueViolation, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';
import { runGlobalSelect } from './internal/statement.js';

export const userDefinition = defineTenantRepository({
  table: 'user',
  spec: TENANCY_TABLE_SPECS.user,
});

export interface UsersRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  /** By normalised email — the lookup `AUTC-01` performs on sign-in. */
  findByEmail(emailNormalized: string): Row | undefined;
  /** A duplicate `email_normalized` surfaces as `TenancyError('EMAIL_CONFLICT')` (PRD §35.4). */
  create(tx: Tx, values: Row): Row;
  /** The documented write path: `row_version` compare-and-swap (PRD §34.1). */
  updateWithVersion(tx: Tx, id: string, expectedRowVersion: number, patch: Row): Row;
}

export function usersRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: RepositoryOptions,
): UsersRepository {
  const repository = userDefinition.for(db, ctx);
  const now = resolveNow(options);

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

    findByEmail(emailNormalized) {
      return runGlobalSelect(db, ctx, {
        table: 'user',
        where: [{ column: 'email_normalized', op: '=', value: emailNormalized }],
        limit: 1,
      })[0];
    },

    create(tx, values) {
      const timestamp = now();
      try {
        return repository.insert(tx, {
          created_at: timestamp,
          updated_at: timestamp,
          row_version: 1,
          ...values,
        });
      } catch (error) {
        if (isUniqueViolation(error, 'user', 'email_normalized')) {
          throw new TenancyError(
            'EMAIL_CONFLICT',
            'a user with that normalised email already exists (PRD §35.4)',
            'email_normalized',
          );
        }
        throw error;
      }
    },

    updateWithVersion(tx, id, expectedRowVersion, patch) {
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'user',
        id,
        expectedRowVersion,
        patch,
        scope: 'GLOBAL',
        kind: 'user',
      });
    },
  };
}
