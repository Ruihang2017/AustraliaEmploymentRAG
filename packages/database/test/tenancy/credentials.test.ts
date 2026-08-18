/**
 * DATA-04 acceptance item 11 — **AUTH-006** ("Service credentials are shown once, hashed, scoped,
 * expiring and rotatable"; "Old key fails immediately after rotation/revocation").
 */
import { describe, expect, it } from 'vitest';

import { TenancyError, tenancyRepositories } from '../../src/repos/tenancy/index.js';
import { openAppDatabase } from '../../src/tenant/connection.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { isoAt, makeApiCredential, makeServiceAccount } from './factories.js';
import { ORG_A, REPO_MIGRATIONS_DIR, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

interface ColumnInfo {
  name: string;
}

describe('api credentials (PRD §35.4, §38.4, AUTH-006)', () => {
  it('has no column able to hold a full secret', async () => {
    await withTenancyDatabase(({ db }) => {
      const columns = (db.sqlite.pragma('table_info(api_credential)') as ColumnInfo[]).map(
        (column) => column.name,
      );
      expect(columns).toContain('prefix');
      expect(columns).toContain('secret_hash');
      for (const forbidden of ['secret', 'secret_plaintext', 'token', 'api_key', 'credential']) {
        expect(columns, `api_credential.${forbidden} could hold a full secret`).not.toContain(
          forbidden,
        );
      }
    });
  });

  it('accepts prefix + secretHash only and rejects unknown or secret-carrying keys at runtime', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });

      for (const extra of ['secret', 'token', 'apiKey', 'notAField']) {
        let thrown: unknown;
        try {
          withTenantTransaction(db, a.ctx, (tx) =>
            repos.apiCredentials.create(tx, {
              ...makeApiCredential(a.serviceAccountId),
              [extra]: 'sk_live_totally_secret',
            } as never),
          );
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${extra} was accepted`).toBeInstanceOf(TenancyError);
        expect((thrown as TenancyError).code, extra).toBe('INVALID_ARGUMENT');
      }
    });
  });

  it('stops verifying a credential the moment it is revoked, in the same transaction', async () => {
    await withTenancyDatabase(({ db, registry, databasePath }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const credential = makeApiCredential(a.serviceAccountId);

      withTenantTransaction(db, a.ctx, (tx) => {
        repos.apiCredentials.create(tx, credential);
        // Hit, revoke, miss — all three inside one transaction, which is exactly what AUTH-006's
        // "immediately" means at this layer.
        expect(repos.apiCredentials.findVerifiable(credential.prefix)).toBeDefined();
        repos.apiCredentials.revoke(tx, credential.id);
        expect(repos.apiCredentials.findVerifiable(credential.prefix)).toBeUndefined();
      });

      // And again on a fresh connection, so the miss is committed state and not a cache artefact.
      const fresh = openAppDatabase({ databasePath, migrationsDir: REPO_MIGRATIONS_DIR });
      try {
        const freshRepos = tenancyRepositories(fresh, a.ctx, { registry });
        expect(freshRepos.apiCredentials.findVerifiable(credential.prefix)).toBeUndefined();
      } finally {
        fresh.close();
      }
    });
  });

  it('rotates: the old credential stops verifying and the new one starts, in one transaction', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const oldCredential = makeApiCredential(a.serviceAccountId);
      const newCredential = makeApiCredential(a.serviceAccountId);

      withTenantTransaction(db, a.ctx, (tx) => repos.apiCredentials.create(tx, oldCredential));
      expect(repos.apiCredentials.findVerifiable(oldCredential.prefix)).toBeDefined();

      withTenantTransaction(db, a.ctx, (tx) => {
        repos.apiCredentials.rotate(tx, oldCredential.id, newCredential);
        expect(repos.apiCredentials.findVerifiable(oldCredential.prefix)).toBeUndefined();
        expect(repos.apiCredentials.findVerifiable(newCredential.prefix)).toBeDefined();
      });
    });
  });

  it('does not verify an expired credential, and does verify a never-expiring one', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const expired = makeApiCredential(a.serviceAccountId, { expiresAt: isoAt(1000) });
      const eternal = makeApiCredential(a.serviceAccountId, { expiresAt: null });

      withTenantTransaction(db, a.ctx, (tx) => {
        repos.apiCredentials.create(tx, expired);
        repos.apiCredentials.create(tx, eternal);
      });

      expect(repos.apiCredentials.findVerifiable(expired.prefix, isoAt(500))).toBeDefined();
      expect(repos.apiCredentials.findVerifiable(expired.prefix, isoAt(5000))).toBeUndefined();
      expect(repos.apiCredentials.findVerifiable(eternal.prefix, isoAt(5_000_000))).toBeDefined();
    });
  });

  it('stamps last_used_at without any update path on an append-only table', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      expect(repos.apiCredentials.get(a.credentialId)['last_used_at']).toBeNull();
      withTenantTransaction(db, a.ctx, (tx) =>
        repos.apiCredentials.touchLastUsed(tx, a.credentialId, isoAt(60_000)),
      );
      expect(repos.apiCredentials.get(a.credentialId)['last_used_at']).toBe(isoAt(60_000));
    });
  });

  it('validates service-account scopes against the packages/contracts ApiScope family', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.serviceAccounts.create(
            tx,
            makeServiceAccount({ scopes_json: JSON.stringify(['search:read', 'not:a:scope']) }),
          ),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('INVALID_SCOPE');
    });
  });
});
