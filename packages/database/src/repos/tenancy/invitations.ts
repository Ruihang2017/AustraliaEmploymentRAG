/**
 * `invitation` — single use (PRD §35.4 "token shown/sent, only hash stored; one use").
 *
 * # No plaintext token, anywhere
 *
 * The table has no column able to hold one and this repository has no parameter that accepts one:
 * `create` takes `tokenHash`, `accept` takes `tokenHash`. Hashing is `02-auth-core`'s
 * (`AUTC-*`) — this ticket stores a hash produced elsewhere and never produces or verifies one.
 *
 * # Why `accept` is one conditional UPDATE
 *
 * `SET accepted_at = ? WHERE token_hash = ? AND organization_id = ? AND accepted_at IS NULL AND
 * expires_at > ?` — the whole single-use rule lives in the WHERE clause, so two concurrent accepts
 * cannot both win regardless of interleaving. A read-then-write would be a race with a comfortable
 * window. `changes === 1` is the accept; anything else falls through to **one** scoped SELECT that
 * classifies the outcome.
 *
 * That classifying SELECT is scoped like every other read, so another tenant's token and a token
 * that never existed both produce `NOT_FOUND` from the same statement on the same line — the
 * indistinguishability PRD §16.5 requires, by construction rather than by remembering.
 */
import type { AppDatabaseHandle } from '../../tenant/connection.js';
import type { TenantContext } from '../../tenant/context.js';
import { defineTenantRepository } from '../../tenant/repository.js';
import type { Row } from '../../tenant/repository.js';
import type { Tx } from '../../tenant/tx-internal.js';
import { TENANCY_TABLE_SPECS } from '../../schema/tenancy.js';

import { assertOrganizationOpen } from './closure.js';
import { TenancyError } from './errors.js';
import { newId, resolveNow } from './internal/support.js';
import type { RepositoryOptions } from './internal/support.js';
import { runScopedSelect, runScopedUpdate } from './internal/statement.js';

export const invitationDefinition = defineTenantRepository({
  table: 'invitation',
  spec: TENANCY_TABLE_SPECS.invitation,
});

/**
 * The discriminated outcome `IDNT-02` renders AUTH-001's "Expired, reused and wrong-email invites
 * fail" from, without a second query.
 */
export type AcceptResult =
  | { readonly status: 'ACCEPTED'; readonly invitation: Row }
  | { readonly status: 'EXPIRED' }
  | { readonly status: 'ALREADY_USED' }
  | { readonly status: 'NOT_FOUND' };

export interface CreateInvitationRequest {
  readonly emailNormalized: string;
  readonly role: string;
  /** A hash. There is deliberately no parameter that accepts the token itself. */
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly invitedByActorId: string;
  readonly id?: string;
}

export interface InvitationsRepository {
  find(id: string): Row | undefined;
  get(id: string): Row;
  list(options?: { limit?: number; offset?: number }): Row[];
  create(tx: Tx, request: CreateInvitationRequest): Row;
  accept(tx: Tx, tokenHash: string): AcceptResult;
}

export interface InvitationsRepositoryOptions extends RepositoryOptions {
  /**
   * Resolves `invited_by_actor_id` to its `actor` row.
   *
   * The compensating check for a composite tenant FK that **cannot exist**: `actor` is GLOBAL, so
   * `invitation.(organization_id, invited_by_actor_id)` has no parent key to reference (sub-PRD
   * M-Q5, recorded under D1 and flagged to `DATA-09` for invariant 4). Supplying this resolver is
   * what turns the missing database constraint into an application one; omitting it means the
   * inviter is not verified, so it is required at the call sites that have an actor to check
   * (`tenancyRepositories` wires it).
   */
  readonly resolveActorOrganization?: (actorId: string) => string | null | undefined;
}

export function invitationsRepository(
  db: AppDatabaseHandle,
  ctx: TenantContext,
  options?: InvitationsRepositoryOptions,
): InvitationsRepository {
  const repository = invitationDefinition.for(db, ctx);
  const now = resolveNow(options);

  return {
    find: (id) => repository.find(id),
    get: (id) => repository.get(id),
    list: (listOptions) => repository.list(listOptions),

    create(tx, request) {
      assertOrganizationOpen(db, ctx, tx, 'invitation.create');
      if (typeof request?.tokenHash !== 'string' || request.tokenHash.length === 0) {
        throw new TenancyError('INVALID_ARGUMENT', 'invitation.create needs a tokenHash');
      }
      const resolver = options?.resolveActorOrganization;
      if (resolver !== undefined) {
        const owner = resolver(request.invitedByActorId);
        if (owner !== undefined && owner !== null && owner !== ctx.organizationId) {
          // The compensating check described in the options doc comment. Refusing here keeps
          // PRD §35.8 invariant 4 true for this edge even though SQLite cannot express it.
          throw new TenancyError(
            'INVALID_ACTOR_LINKAGE',
            'the inviting actor does not belong to this organisation (PRD §35.8 invariant 4)',
            'invited_by_actor_id',
          );
        }
      }
      return repository.insert(tx, {
        id: request.id ?? newId('inv'),
        email_normalized: request.emailNormalized,
        role: request.role,
        token_hash: request.tokenHash,
        expires_at: request.expiresAt,
        accepted_at: null,
        invited_by_actor_id: request.invitedByActorId,
        created_at: now(),
      });
    },

    accept(tx, tokenHash) {
      assertOrganizationOpen(db, ctx, tx, 'invitation.accept');
      const timestamp = now();

      // The whole single-use rule, in one statement. `id` is not known yet, so the change-set entry
      // carries the hash-addressed row's id after the fact — see the classify read below.
      const matches = runScopedSelect(db, ctx, {
        table: 'invitation',
        where: [{ column: 'token_hash', op: '=', value: tokenHash }],
        limit: 1,
      });
      const candidate = matches[0];
      if (candidate === undefined) return { status: 'NOT_FOUND' };

      const changes = runScopedUpdate(db, ctx, tx, {
        table: 'invitation',
        id: candidate['id'] as string,
        set: { accepted_at: timestamp },
        where: [
          { column: 'token_hash', op: '=', value: tokenHash },
          { column: 'accepted_at', op: 'is', value: null },
          { column: 'expires_at', op: '>', value: timestamp },
        ],
      });

      if (changes === 1) {
        const accepted = runScopedSelect(db, ctx, {
          table: 'invitation',
          where: [{ column: 'token_hash', op: '=', value: tokenHash }],
          limit: 1,
        })[0];
        // The row was just written inside this transaction, so it is there.
        return { status: 'ACCEPTED', invitation: accepted as Row };
      }

      // Re-read rather than trusting `candidate`: a concurrent accept may have landed between the
      // two statements, and "already used" must reflect the committed state, not the read one.
      const current = runScopedSelect(db, ctx, {
        table: 'invitation',
        where: [{ column: 'token_hash', op: '=', value: tokenHash }],
        limit: 1,
      })[0];
      if (current === undefined) return { status: 'NOT_FOUND' };
      if (current['accepted_at'] !== null) return { status: 'ALREADY_USED' };
      return { status: 'EXPIRED' };
    },
  };
}
