/**
 * `actor` — GLOBAL, append-only (PRD §15.4, §35.4 "stable audit identity").
 *
 * One row per identity, forever. Append-only is what removes `update`/`delete` from the repository
 * type *and* from the object at runtime (PRD §35.8 invariant 5): an audit identity that could be
 * edited is not an audit identity.
 *
 * `ensureActor` is idempotent by construction, not by convention: `UNIQUE (user_id)` and
 * `UNIQUE (service_account_id)` make a second insert for the same linkage impossible, so the
 * select-then-insert is safe under concurrency and a unique violation on insert is resolved by one
 * re-select rather than surfaced. That idempotence is what makes the "create a user, then a
 * membership" flow — necessarily two transactions, because GLOBAL and TENANT transactions cannot
 * mix — safe to retry.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import type { ActorType } from '../../tenant/context.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { ACTOR_TYPE_VALUES, TENANCY_TABLE_SPECS } from '../../schema/tenancy.js';

import { TenancyError } from './errors.js';
import { newId, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';
import { runGlobalSelect } from './internal/statement.js';

export const actorDefinition = defineTenantRepository({
  table: 'actor',
  spec: TENANCY_TABLE_SPECS.actor,
});

export interface EnsureActorRequest {
  readonly type: ActorType;
  readonly userId?: string;
  readonly serviceAccountId?: string;
}

export interface ActorsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  findByUser(userId: string): Row | undefined;
  findByServiceAccount(serviceAccountId: string): Row | undefined;
  /**
   * The stable actor id for a linkage, creating the row on first use.
   *
   * Exactly one linkage must be set for `USER`/`SERVICE_ACCOUNT` and none for `SYSTEM`; anything
   * else is `TenancyError('INVALID_ACTOR_LINKAGE')`, checked here **before** the insert so the
   * caller gets a typed refusal rather than a CHECK-constraint driver error.
   */
  ensureActor(tx: Tx, request: EnsureActorRequest): Row;
}

function assertLinkage(request: EnsureActorRequest): void {
  if (!(ACTOR_TYPE_VALUES as readonly string[]).includes(request?.type)) {
    throw new TenancyError(
      'INVALID_ACTOR_LINKAGE',
      `actor_type must be one of ${ACTOR_TYPE_VALUES.join(', ')}`,
    );
  }
  const hasUser = typeof request.userId === 'string' && request.userId.length > 0;
  const hasService =
    typeof request.serviceAccountId === 'string' && request.serviceAccountId.length > 0;

  if (request.type === 'USER' && !(hasUser && !hasService)) {
    throw new TenancyError('INVALID_ACTOR_LINKAGE', 'a USER actor needs exactly a userId');
  }
  if (request.type === 'SERVICE_ACCOUNT' && !(hasService && !hasUser)) {
    throw new TenancyError(
      'INVALID_ACTOR_LINKAGE',
      'a SERVICE_ACCOUNT actor needs exactly a serviceAccountId',
    );
  }
  if (request.type === 'SYSTEM' && (hasUser || hasService)) {
    throw new TenancyError('INVALID_ACTOR_LINKAGE', 'a SYSTEM actor carries no linkage');
  }
}

export function actorsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: RepositoryOptions,
): ActorsRepository {
  const repository = actorDefinition.for(db, ctx);
  const now = resolveNow(options);

  const byLinkage = (column: 'user_id' | 'service_account_id', value: string): Row | undefined =>
    runGlobalSelect(db, ctx, {
      table: 'actor',
      where: [{ column, op: '=', value }],
      limit: 1,
    })[0];

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),
    findByUser: (userId) => byLinkage('user_id', userId),
    findByServiceAccount: (serviceAccountId) => byLinkage('service_account_id', serviceAccountId),

    ensureActor(tx, request) {
      assertLinkage(request);

      const column =
        request.type === 'USER'
          ? ('user_id' as const)
          : request.type === 'SERVICE_ACCOUNT'
            ? ('service_account_id' as const)
            : undefined;
      const linkage = request.type === 'USER' ? request.userId : request.serviceAccountId;

      if (column !== undefined && linkage !== undefined) {
        const existing = byLinkage(column, linkage);
        if (existing !== undefined) return existing;
      }

      const row: Row = {
        id: newId('act'),
        actor_type: request.type,
        user_id: request.type === 'USER' ? request.userId : null,
        service_account_id: request.type === 'SERVICE_ACCOUNT' ? request.serviceAccountId : null,
        created_at: now(),
      };

      try {
        return repository.insert(tx, row);
      } catch (error) {
        // Lost the race for the same linkage: the UNIQUE index is what makes that impossible to get
        // wrong, so re-select once and return the winner. Retried exactly once — a second failure
        // is not a race and must surface.
        if (column !== undefined && linkage !== undefined) {
          const existing = byLinkage(column, linkage);
          if (existing !== undefined) return existing;
        }
        throw error;
      }
    },
  };
}
