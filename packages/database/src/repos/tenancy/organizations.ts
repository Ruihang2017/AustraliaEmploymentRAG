/**
 * `organization` — the tenant boundary itself (PRD §15.4, §35.4).
 *
 * Two things are unusual about this table and both are recorded in the migration header and the
 * sub-PRD (M-Q8):
 *
 *  - it carries its own `organization_id`, with `CHECK (organization_id = id)`, because it is
 *    `TENANT`-scoped and both `assertSchemaConventions` and `defineTenantRepository` refuse a
 *    `TENANT` table without that column;
 *  - therefore **creating** an organisation happens inside a `withTenantTransaction` whose context's
 *    `organizationId` *is the new organisation's id*. The factory sets `organization_id` from the
 *    context and the CHECK then forces `id` to match. Minting that bootstrap context belongs to
 *    `AUTC-01`/`IDNT-02`, not here.
 *
 * The documented write path is {@link OrganizationsRepository.updateWithVersion} — the `row_version`
 * compare-and-swap — not the raw `update()` the factory also exposes (PRD §34.1).
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import {
  ORGANIZATION_STATUS_CLOSED,
  TENANCY_TABLE_SPECS,
} from '../../schema/tenancy.js';

import { TenancyError } from './errors.js';
import { compareAndSwap, isUniqueViolation, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';

export const organizationDefinition = defineTenantRepository({
  table: 'organization',
  spec: TENANCY_TABLE_SPECS.organization,
});

export interface OrganizationsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  /**
   * Inserts the organisation. `values.id` must equal the context's organisation (see the file
   * header). A duplicate `slug` surfaces as `TenancyError('SLUG_CONFLICT')`, never as a raw driver
   * error (PRD §35.4, acceptance item 4).
   */
  create(tx: Tx, values: Row): Row;
  /** The documented write path: `row_version` compare-and-swap (PRD §34.1). */
  updateWithVersion(tx: Tx, id: string, expectedRowVersion: number, patch: Row): Row;
  /**
   * Moves the organisation to the closed state. Allowlisted under PRD §10.3 — otherwise closure
   * would be the one write a closing organisation could never perform.
   */
  close(tx: Tx, id: string, expectedRowVersion: number): Row;
}

export function organizationsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: RepositoryOptions,
): OrganizationsRepository {
  const repository = organizationDefinition.for(db, ctx);
  const now = resolveNow(options);

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

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
        // Only this exact constraint is translated. Swallowing an unknown constraint failure would
        // hide the composite tenant-key violations the schema depends on (PRD §35.8 invariant 4).
        if (isUniqueViolation(error, 'organization', 'slug')) {
          throw new TenancyError(
            'SLUG_CONFLICT',
            'an organisation with that slug already exists (PRD §35.4)',
            'slug',
          );
        }
        throw error;
      }
    },

    updateWithVersion(tx, id, expectedRowVersion, patch) {
      try {
        return compareAndSwap(db, ctx, tx, now(), {
          table: 'organization',
          id,
          expectedRowVersion,
          patch,
          scope: 'TENANT',
          kind: 'organization',
        });
      } catch (error) {
        if (isUniqueViolation(error, 'organization', 'slug')) {
          throw new TenancyError(
            'SLUG_CONFLICT',
            'an organisation with that slug already exists (PRD §35.4)',
            'slug',
          );
        }
        throw error;
      }
    },

    close(tx, id, expectedRowVersion) {
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'organization',
        id,
        expectedRowVersion,
        patch: { status: ORGANIZATION_STATUS_CLOSED },
        scope: 'TENANT',
        kind: 'organization',
      });
    },
  };
}
