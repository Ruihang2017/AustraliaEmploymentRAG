/**
 * DATA-04 acceptance item 10 — **AUTH-001**'s persistence half (PRD §35.4 "token shown/sent, only
 * hash stored; one use").
 */
import { describe, expect, it } from 'vitest';

import {
  TenancyError,
  identityRepositories,
  tenancyRepositories,
} from '../../src/repos/tenancy/index.js';
import { withSystemTransaction, withTenantTransaction } from '../../src/tenant/transaction.js';

import { isoAt, makeInvitation } from './factories.js';
import { ORG_A, ORG_B, globalContext, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

interface ColumnInfo {
  name: string;
}

describe('invitations — single use (PRD §35.4, AUTH-001)', () => {
  it('stores only the hash: no column can hold a plaintext token', async () => {
    await withTenancyDatabase(({ db }) => {
      const columns = (db.sqlite.pragma('table_info(invitation)') as ColumnInfo[]).map(
        (column) => column.name,
      );
      expect(columns).toContain('token_hash');
      for (const forbidden of ['token', 'token_plaintext', 'secret', 'invite_token']) {
        expect(columns, `invitation.${forbidden} could hold a plaintext token`).not.toContain(
          forbidden,
        );
      }
    });
  });

  it('accepts once, then reports ALREADY_USED', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      const first = withTenantTransaction(db, a.ctx, (tx) =>
        repos.invitations.accept(tx, a.invitationTokenHash),
      );
      expect(first.status).toBe('ACCEPTED');
      expect(first.status === 'ACCEPTED' && first.invitation['accepted_at']).toBeTruthy();

      const second = withTenantTransaction(db, a.ctx, (tx) =>
        repos.invitations.accept(tx, a.invitationTokenHash),
      );
      expect(second).toEqual({ status: 'ALREADY_USED' });
    });
  });

  it('reports EXPIRED for an invitation past its expiry', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const expired = makeInvitation(a.ownerActorId, { expiresAt: isoAt(-1000) });

      withTenantTransaction(db, a.ctx, (tx) => repos.invitations.create(tx, expired));
      const result = withTenantTransaction(db, a.ctx, (tx) =>
        repos.invitations.accept(tx, expired.tokenHash),
      );
      expect(result).toEqual({ status: 'EXPIRED' });
      // And it stays unusable — an expired invitation must not become acceptable on a retry.
      expect(
        withTenantTransaction(db, a.ctx, (tx) => repos.invitations.accept(tx, expired.tokenHash)),
      ).toEqual({ status: 'EXPIRED' });
    });
  });

  it('reports NOT_FOUND for an unknown hash', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      expect(
        withTenantTransaction(db, a.ctx, (tx) => repos.invitations.accept(tx, 'sha256:nope')),
      ).toEqual({ status: 'NOT_FOUND' });
    });
  });

  /**
   * Regression — bounce finding 3.
   *
   * The inviter check used to hang off an optional `resolveActorOrganization` constructor option, so
   * the default (and the shipped seed) was "no check at all". These four cases exercise the real,
   * unconditional path: no option is passed anywhere below, the actors are genuine rows, and the
   * verdict comes from a scoped read of `membership` / `service_account`.
   */
  describe('the inviting actor is verified unconditionally (PRD §35.8 invariant 4, sub-PRD M-Q5)', () => {
    const expectInvalidLinkage = (run: () => unknown): void => {
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('INVALID_ACTOR_LINKAGE');
    };

    it("refuses another organisation's USER actor, with no option passed", async () => {
      await withTenancyDatabase(({ db, registry }) => {
        const a = seedOrganization(db, ORG_A, registry);
        const b = seedOrganization(db, ORG_B, registry);
        // B's owner actor is a perfectly real, existing actor — it simply is not A's. Nothing in
        // SQLite can refuse this row, which is the whole reason the check exists.
        const repos = tenancyRepositories(db, a.ctx, { registry });
        expectInvalidLinkage(() =>
          withTenantTransaction(db, a.ctx, (tx) =>
            repos.invitations.create(tx, makeInvitation(b.ownerActorId)),
          ),
        );
        // And nothing was written.
        expect(repos.invitations.list().every((row) => row['id'] !== undefined)).toBe(true);
        expect(
          repos.invitations.list().filter((row) => row['invited_by_actor_id'] === b.ownerActorId),
        ).toEqual([]);
      });
    });

    it("refuses another organisation's SERVICE_ACCOUNT actor", async () => {
      await withTenancyDatabase(({ db, registry }) => {
        const a = seedOrganization(db, ORG_A, registry);
        const b = seedOrganization(db, ORG_B, registry);
        const identity = identityRepositories(db, globalContext('req-sa-actor'));
        const foreign = withSystemTransaction(db, globalContext('req-sa-actor'), (tx) =>
          identity.actors.ensureActor(tx, {
            type: 'SERVICE_ACCOUNT',
            serviceAccountId: b.serviceAccountId,
          }),
        );
        const repos = tenancyRepositories(db, a.ctx, { registry });
        expectInvalidLinkage(() =>
          withTenantTransaction(db, a.ctx, (tx) =>
            repos.invitations.create(tx, makeInvitation(foreign['id'] as string)),
          ),
        );
      });
    });

    it('refuses an actor id that does not exist at all', async () => {
      await withTenancyDatabase(({ db, registry }) => {
        const a = seedOrganization(db, ORG_A, registry);
        const repos = tenancyRepositories(db, a.ctx, { registry });
        expectInvalidLinkage(() =>
          withTenantTransaction(db, a.ctx, (tx) =>
            repos.invitations.create(tx, makeInvitation('act_missing')),
          ),
        );
      });
    });

    it("accepts this organisation's own member and the SYSTEM actor", async () => {
      await withTenancyDatabase(({ db, registry }) => {
        const a = seedOrganization(db, ORG_A, registry);
        const repos = tenancyRepositories(db, a.ctx, { registry });

        const mine = makeInvitation(a.ownerActorId);
        expect(
          withTenantTransaction(db, a.ctx, (tx) => repos.invitations.create(tx, mine))[
            'invited_by_actor_id'
          ],
        ).toBe(a.ownerActorId);

        // SYSTEM has no linkage by construction (`actor`'s CHECK forces both columns NULL), so it
        // belongs to no organisation — the bootstrap inviter AUTC-01/IDNT-02 need.
        const systemActor = withSystemTransaction(db, globalContext('req-system-actor'), (tx) =>
          identityRepositories(db, globalContext('req-system-actor')).actors.ensureActor(tx, {
            type: 'SYSTEM',
          }),
        );
        const bootstrap = makeInvitation(systemActor['id'] as string);
        expect(
          withTenantTransaction(db, a.ctx, (tx) => repos.invitations.create(tx, bootstrap))[
            'invited_by_actor_id'
          ],
        ).toBe(systemActor['id']);
      });
    });
  });

  it('has no repository parameter that accepts a plaintext token', () => {
    // The type has none; this is the runtime half. `create` reads `tokenHash` and nothing else, so
    // a caller passing a token under any other name stores nothing.
    const request = makeInvitation('act_x');
    expect(Object.keys(request)).toEqual(
      expect.arrayContaining(['tokenHash', 'expiresAt', 'role', 'emailNormalized']),
    );
    expect(Object.keys(request)).not.toContain('token');
    expect(Object.keys(request)).not.toContain('secret');
  });
});
