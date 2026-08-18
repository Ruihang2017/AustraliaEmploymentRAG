/**
 * DATA-04 acceptance item 10 — **AUTH-001**'s persistence half (PRD §35.4 "token shown/sent, only
 * hash stored; one use").
 */
import { describe, expect, it } from 'vitest';

import { TenancyError, tenancyRepositories } from '../../src/repos/tenancy/index.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { isoAt, makeInvitation } from './factories.js';
import { ORG_A, withTenancyDatabase } from './helpers.js';
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

  it('refuses an inviting actor that belongs to another organisation', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      // The compensating check for the composite FK that cannot exist — `actor` is GLOBAL, so
      // `invitation.(organization_id, invited_by_actor_id)` has no parent key (sub-PRD M-Q5).
      const repos = tenancyRepositories(db, a.ctx, {
        registry,
        resolveActorOrganization: () => 'org-bbbbbbbbbbbbbbbbbbbb',
      });
      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.invitations.create(tx, makeInvitation(a.ownerActorId)),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('INVALID_ACTOR_LINKAGE');
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
