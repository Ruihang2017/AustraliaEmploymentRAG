/**
 * `membership` — the last-Owner invariant (PRD §35.4 "last-Owner trigger/application invariant").
 *
 * # Where the count has to happen, and why
 *
 * Inside the **caller's transaction**, immediately before the write, and nowhere else.
 * `withTenantTransaction` opens with `BEGIN IMMEDIATE`, so the write lock is taken *before* this
 * read runs: two processes each demoting "the other" Owner serialise, the second one sees the first
 * one's committed result, and exactly one succeeds. A count taken on a second connection, or before
 * the transaction is entered, reintroduces precisely the race the acceptance criterion is about, and
 * would pass a single-process test while failing in production. No second locking scheme is added —
 * one is enough and two would deadlock against each other.
 *
 * The invariant is evaluated over memberships **excluding the target row**: "would this leave the
 * organisation with no active Owner?" is the question, so the row being demoted, suspended or
 * removed must not count towards its own replacement.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { ResourceNotFound } from '../../tenant/errors.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import {
  MEMBERSHIP_ROLE_OWNER,
  MEMBERSHIP_STATUS_ACTIVE,
  TENANCY_TABLE_SPECS,
} from '../../schema/tenancy.js';

import { assertOrganizationOpen } from './closure.js';
import { TenancyError } from './errors.js';
import { compareAndSwap, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';
import { runScopedSelect } from './internal/statement.js';

/**
 * Module-private on purpose (sub-PRD **D12**): this group exports concrete, pre-bound,
 * **guarded** repositories and never the factory definition. `.for(db, ctx)` on a raw definition
 * yields `defineTenantRepository`'s unguarded CRUD, which skips `assertOrganizationOpen`, the
 * last-Owner invariant, the value validations and the `row_version` CAS. Keeping the binding inside
 * this module is what makes those guards unbypassable rather than merely conventional; the
 * `test/tenancy/surface.test.ts` regression pins it.
 */
const membershipDefinition = defineTenantRepository({
  table: 'membership',
  spec: TENANCY_TABLE_SPECS.membership,
});

export interface MembershipsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  findByUser(userId: string): Row | undefined;
  create(tx: Tx, values: Row): Row;
  /** The documented write path for an ordinary field change: `row_version` CAS (PRD §34.1). */
  updateWithVersion(tx: Tx, id: string, expectedRowVersion: number, patch: Row): Row;
  /** Role change. Refuses with `LAST_OWNER` when it would remove the last ACTIVE Owner. */
  demote(tx: Tx, id: string, expectedRowVersion: number, role: string): Row;
  /** Status change to a non-active value. Same refusal. */
  suspend(tx: Tx, id: string, expectedRowVersion: number, status: string): Row;
  /** Removal. Same refusal. */
  remove(tx: Tx, id: string): void;
}

export function membershipsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: RepositoryOptions,
): MembershipsRepository {
  const repository = membershipDefinition.for(db, ctx);
  const now = resolveNow(options);

  /**
   * Refuses when the organisation would be left without an ACTIVE Owner.
   *
   * Read inside `tx`, so it and the write that follows observe one snapshot under one write lock.
   */
  const assertNotLastOwner = (tx: Tx, id: string, operation: string): Row => {
    assertOrganizationOpen(db, ctx, tx, operation);
    const target = repository.find(id);
    if (target === undefined) throw new ResourceNotFound('membership');
    const targetIsActiveOwner =
      target['role'] === MEMBERSHIP_ROLE_OWNER && target['status'] === MEMBERSHIP_STATUS_ACTIVE;
    if (!targetIsActiveOwner) return target;

    const survivors = runScopedSelect(db, ctx, {
      table: 'membership',
      where: [
        { column: 'role', op: '=', value: MEMBERSHIP_ROLE_OWNER },
        { column: 'status', op: '=', value: MEMBERSHIP_STATUS_ACTIVE },
      ],
    }).filter((row) => row['id'] !== id);

    if (survivors.length === 0) {
      throw new TenancyError(
        'LAST_OWNER',
        `refusing to ${operation} the last ACTIVE OWNER of this organisation (PRD §35.4)`,
        operation,
      );
    }
    return target;
  };

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

    findByUser(userId) {
      return runScopedSelect(db, ctx, {
        table: 'membership',
        where: [{ column: 'user_id', op: '=', value: userId }],
        limit: 1,
      })[0];
    },

    create(tx, values) {
      assertOrganizationOpen(db, ctx, tx, 'membership.create');
      const timestamp = now();
      return repository.insert(tx, {
        created_at: timestamp,
        updated_at: timestamp,
        joined_at: timestamp,
        row_version: 1,
        ...values,
      });
    },

    updateWithVersion(tx, id, expectedRowVersion, patch) {
      assertOrganizationOpen(db, ctx, tx, 'membership.update');
      // A patch that changes role or status goes through the invariant too — otherwise the guard
      // could be bypassed simply by choosing the more general entry point.
      if ('role' in patch || 'status' in patch) {
        assertNotLastOwner(tx, id, 'membership.update');
      }
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'membership',
        id,
        expectedRowVersion,
        patch,
        scope: 'TENANT',
        kind: 'membership',
      });
    },

    demote(tx, id, expectedRowVersion, role) {
      assertNotLastOwner(tx, id, 'demote');
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'membership',
        id,
        expectedRowVersion,
        patch: { role },
        scope: 'TENANT',
        kind: 'membership',
      });
    },

    suspend(tx, id, expectedRowVersion, status) {
      assertNotLastOwner(tx, id, 'suspend');
      return compareAndSwap(db, ctx, tx, now(), {
        table: 'membership',
        id,
        expectedRowVersion,
        patch: { status },
        scope: 'TENANT',
        kind: 'membership',
      });
    },

    remove(tx, id) {
      assertNotLastOwner(tx, id, 'remove');
      repository.delete(tx, id);
    },
  };
}
