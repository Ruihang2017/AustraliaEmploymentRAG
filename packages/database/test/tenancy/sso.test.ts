/**
 * DATA-04 acceptance items 12 and 13 — **AUTH-005**'s persistence half ("enforcement requires
 * successful current test", PRD §35.4/§38.3) and the encryption canary (PRD §35.1, DATA-03).
 */
import { readFileSync, existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  SSO_TEST_FRESHNESS_MS,
  TenancyError,
  tenancyRepositories,
} from '../../src/repos/tenancy/index.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { canary } from '../crypto/helpers.js';
import { isoAt, makeSsoConnection } from './factories.js';
import { ORG_A, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';

describe('sso connections (PRD §38.3, §35.4, AUTH-005)', () => {
  it('refuses enforcement when no successful test is recorded', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const connection = repos.ssoConnections.get(a.ssoConnectionId);
      expect(connection['state']).toBe('DRAFT');
      expect(connection['tested_at']).toBeNull();

      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.ssoConnections.enforce(
            tx,
            a.ssoConnectionId,
            connection['row_version'] as number,
          ),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('SSO_TEST_REQUIRED');
      expect(repos.ssoConnections.get(a.ssoConnectionId)['enforced_at']).toBeNull();
    });
  });

  it('refuses enforcement when the last successful test is stale', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.ssoConnections.get(a.ssoConnectionId);

      const tested = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.recordTest(
          tx,
          a.ssoConnectionId,
          before['row_version'] as number,
          'ACTIVE',
          isoAt(0),
        ),
      );
      expect(tested['state']).toBe('ACTIVE');

      const stale = isoAt(SSO_TEST_FRESHNESS_MS + 60_000);
      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.ssoConnections.enforce(
            tx,
            a.ssoConnectionId,
            tested['row_version'] as number,
            stale,
          ),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('SSO_TEST_REQUIRED');
      expect((thrown as TenancyError).message).toContain('SSO_TEST_FRESHNESS_MS');
    });
  });

  it('enforces when the successful test is current — the refusals above are not unconditional', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.ssoConnections.get(a.ssoConnectionId);

      const tested = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.recordTest(
          tx,
          a.ssoConnectionId,
          before['row_version'] as number,
          'ACTIVE',
          isoAt(0),
        ),
      );
      const fresh = isoAt(SSO_TEST_FRESHNESS_MS - 60_000);
      const enforced = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.enforce(tx, a.ssoConnectionId, tested['row_version'] as number, fresh),
      );
      expect(enforced['enforced_at']).toBe(fresh);
    });
  });

  // Review round 4, minor finding. `enforce()` computed `age = Date.parse(at) - Date.parse(testedAt)`
  // and refused only when `age > SSO_TEST_FRESHNESS_MS`. An inverted pair — `tested_at` later than
  // `at` — makes `age` negative, and a negative age is `> window` for no window at all, so the
  // freshness gate passed unconditionally however much time had really elapsed. Both operands come
  // from callers (`recordTest`'s `testedAt`, `enforce`'s `at`), so neither bounds the other. These
  // three cases pin the closed end of the window; the first two go red against the old comparison.
  it('refuses enforcement when tested_at is after the moment enforced against (negative age)', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.ssoConnections.get(a.ssoConnectionId);

      // A successful test dated far in the future — the state gate (ACTIVE) is satisfied, so the
      // only thing standing between this row and enforcement is the freshness arithmetic.
      const tested = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.recordTest(
          tx,
          a.ssoConnectionId,
          before['row_version'] as number,
          'ACTIVE',
          isoAt(SSO_TEST_FRESHNESS_MS * 10),
        ),
      );
      expect(tested['state']).toBe('ACTIVE');

      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.ssoConnections.enforce(
            tx,
            a.ssoConnectionId,
            tested['row_version'] as number,
            isoAt(0),
          ),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('SSO_TEST_REQUIRED');
      expect((thrown as TenancyError).detail).toBe('tested_at');
      // Specifically the inversion refusal, not the staleness one they share a detail with.
      expect((thrown as TenancyError).message).toContain('not after the moment');
      expect((thrown as TenancyError).message).not.toContain('SSO_TEST_FRESHNESS_MS');
      // Fail closed: nothing was written, so a second attempt cannot inherit a half-applied state.
      expect(repos.ssoConnections.get(a.ssoConnectionId)['enforced_at']).toBeNull();
    });
  });

  it('refuses an inverted pair even one millisecond over — the boundary is at zero, not at the window', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.ssoConnections.get(a.ssoConnectionId);

      const tested = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.recordTest(
          tx,
          a.ssoConnectionId,
          before['row_version'] as number,
          'ACTIVE',
          isoAt(1),
        ),
      );

      let thrown: unknown;
      try {
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.ssoConnections.enforce(
            tx,
            a.ssoConnectionId,
            tested['row_version'] as number,
            isoAt(0),
          ),
        );
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TenancyError);
      expect((thrown as TenancyError).code).toBe('SSO_TEST_REQUIRED');
      expect((thrown as TenancyError).detail).toBe('tested_at');
      // Specifically the inversion refusal, not the staleness one they share a detail with.
      expect((thrown as TenancyError).message).toContain('not after the moment');
      expect((thrown as TenancyError).message).not.toContain('SSO_TEST_FRESHNESS_MS');
      expect(repos.ssoConnections.get(a.ssoConnectionId)['enforced_at']).toBeNull();
    });
  });

  it('still enforces at both legitimate ends of the window — age 0 and age exactly SSO_TEST_FRESHNESS_MS', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.ssoConnections.get(a.ssoConnectionId);

      const tested = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.recordTest(
          tx,
          a.ssoConnectionId,
          before['row_version'] as number,
          'ACTIVE',
          isoAt(0),
        ),
      );

      // age === 0: recorded and enforced within the same millisecond.
      const same = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.enforce(
          tx,
          a.ssoConnectionId,
          tested['row_version'] as number,
          isoAt(0),
        ),
      );
      expect(same['enforced_at']).toBe(isoAt(0));

      // age === SSO_TEST_FRESHNESS_MS exactly: the window is inclusive at its far end.
      const edge = isoAt(SSO_TEST_FRESHNESS_MS);
      const still = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.enforce(tx, a.ssoConnectionId, same['row_version'] as number, edge),
      );
      expect(still['enforced_at']).toBe(edge);
    });
  });

  it('refuses enforcement for a failed test state (AUTH-005: a failed IdP test cannot lock anyone out)', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const before = repos.ssoConnections.get(a.ssoConnectionId);
      const failed = withTenantTransaction(db, a.ctx, (tx) =>
        repos.ssoConnections.recordTest(
          tx,
          a.ssoConnectionId,
          before['row_version'] as number,
          'ERROR',
          isoAt(0),
        ),
      );
      expect(() =>
        withTenantTransaction(db, a.ctx, (tx) =>
          repos.ssoConnections.enforce(
            tx,
            a.ssoConnectionId,
            failed['row_version'] as number,
            isoAt(1000),
          ),
        ),
      ).toThrowError(/successful test/);
    });
  });

  it('encrypts the configuration: a canary never reaches the database bytes, and decodes back', async () => {
    await withTenancyDatabase(({ db, registry, databasePath }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const marker = canary();
      const connection = makeSsoConnection({
        protocol: 'OIDC',
        configuration: JSON.stringify({ issuer: marker }),
      });

      withTenantTransaction(db, a.ctx, (tx) => repos.ssoConnections.create(tx, connection));

      // Round trip first — a canary that is absent because nothing was stored proves nothing.
      const decoded = repos.ssoConnections.readConfiguration(connection.id);
      expect(decoded).toBe(JSON.stringify({ issuer: marker }));
      const stored = repos.ssoConnections.get(connection.id)['configuration_ciphertext'];
      expect(Buffer.isBuffer(stored) || stored instanceof Uint8Array).toBe(true);

      db.sqlite.pragma('wal_checkpoint(TRUNCATE)');
      for (const suffix of ['', '-wal', '-shm']) {
        const path = `${databasePath}${suffix}`;
        if (!existsSync(path)) continue;
        expect(
          readFileSync(path).includes(Buffer.from(marker, 'utf8')),
          `the canary appears in ${path.split(/[\\/]/).pop() ?? path}`,
        ).toBe(false);
      }
    });
  });

  it('binds the ciphertext to the row id (the AAD), so a copied blob does not decode', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const repos = tenancyRepositories(db, a.ctx, { registry });
      const first = makeSsoConnection({ protocol: 'OIDC', configuration: 'first-config' });
      withTenantTransaction(db, a.ctx, (tx) => repos.ssoConnections.create(tx, first));

      // Move the ciphertext onto the seeded SAML row: same organisation, same column, different id.
      const blob = repos.ssoConnections.get(first.id)['configuration_ciphertext'];
      db.sqlite
        .prepare('update sso_connection set configuration_ciphertext = ? where id = ?')
        .run(blob as Buffer, a.ssoConnectionId);

      expect(() => repos.ssoConnections.readConfiguration(a.ssoConnectionId)).toThrow();
      expect(repos.ssoConnections.readConfiguration(first.id)).toBe('first-config');
    });
  });
});
