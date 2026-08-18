/**
 * DATA-04 acceptance item 8 — the last-Owner invariant (PRD §35.4).
 *
 * Two halves. In-process: demoting, suspending or removing the last `ACTIVE` `OWNER` fails and the
 * transaction rolls back, so the row is unchanged afterwards. Cross-process: two Owners, two
 * processes, each demoting "the other", and afterwards the organisation still has an active Owner.
 *
 * The cross-process half needs a real second **process**. `withTenantTransaction` joins a nested
 * call on the same handle as a `SAVEPOINT`, so two contexts inside one process share one
 * transaction and could not demonstrate anything about locking. The ordering here is structural,
 * not a sleep: the parent takes the write lock with `BEGIN IMMEDIATE`, performs its demotion, and
 * only *then* spawns the contender — which therefore cannot exist before the lock is held. Once the
 * parent commits, exactly one ACTIVE Owner is left, and the worker's own demotion is the one the
 * invariant must refuse. Same construction as DATA-02's `test/tenant/concurrency.test.ts` (FND-29).
 */
import { spawn } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TenancyError, membershipsRepository } from '../../src/repos/tenancy/index.js';
import { withTenantTransaction } from '../../src/tenant/transaction.js';

import { makeMembership, makeUser } from './factories.js';
import { ORG_A, REPO_MIGRATIONS_DIR, globalContext, withTenancyDatabase } from './helpers.js';
import { seedOrganization } from './seed.js';
import { identityRepositories } from '../../src/repos/tenancy/index.js';
import { withSystemTransaction } from '../../src/tenant/transaction.js';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), 'owner-worker.mjs');

/** Adds a second ACTIVE OWNER to the seeded organisation and returns its membership id. */
function addSecondOwner(
  db: Parameters<typeof membershipsRepository>[0],
  ctx: Parameters<typeof membershipsRepository>[1],
): string {
  const systemCtx = globalContext('req-second-owner');
  const identity = identityRepositories(db, systemCtx);
  const user = withSystemTransaction(db, systemCtx, (tx) => identity.users.create(tx, makeUser()));
  const memberships = membershipsRepository(db, ctx);
  const membership = withTenantTransaction(db, ctx, (tx) =>
    memberships.create(tx, makeMembership(user['id'] as string, { role: 'OWNER', status: 'ACTIVE' })),
  );
  return membership['id'] as string;
}

describe('last-Owner invariant (PRD §35.4)', () => {
  it('refuses to demote, suspend or remove the only ACTIVE OWNER, and rolls back', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      const memberships = membershipsRepository(db, a.ctx);
      const before = memberships.get(a.membershipId);
      expect(before['role']).toBe('OWNER');
      expect(before['status']).toBe('ACTIVE');

      const attempts: Array<[string, () => unknown]> = [
        [
          'demote',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              memberships.demote(tx, a.membershipId, before['row_version'] as number, 'VIEWER'),
            ),
        ],
        [
          'suspend',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              memberships.suspend(tx, a.membershipId, before['row_version'] as number, 'SUSPENDED'),
            ),
        ],
        [
          'remove',
          () => withTenantTransaction(db, a.ctx, (tx) => memberships.remove(tx, a.membershipId)),
        ],
        [
          'updateWithVersion(role)',
          () =>
            withTenantTransaction(db, a.ctx, (tx) =>
              memberships.updateWithVersion(tx, a.membershipId, before['row_version'] as number, {
                role: 'ADMIN',
              }),
            ),
        ],
      ];

      for (const [label, attempt] of attempts) {
        let thrown: unknown;
        try {
          attempt();
        } catch (error) {
          thrown = error;
        }
        expect(thrown, `${label} was allowed to remove the last Owner`).toBeInstanceOf(TenancyError);
        expect((thrown as TenancyError).code, label).toBe('LAST_OWNER');
        // The transaction rolled back: the row is byte-identical to what it was.
        expect(memberships.get(a.membershipId), `${label} left the row modified`).toEqual(before);
      }
    });
  });

  it('allows the change once a second ACTIVE OWNER exists', async () => {
    await withTenancyDatabase(({ db, registry }) => {
      const a = seedOrganization(db, ORG_A, registry);
      addSecondOwner(db, a.ctx);
      const memberships = membershipsRepository(db, a.ctx);
      const current = memberships.get(a.membershipId);
      const demoted = withTenantTransaction(db, a.ctx, (tx) =>
        memberships.demote(tx, a.membershipId, current['row_version'] as number, 'VIEWER'),
      );
      expect(demoted['role']).toBe('VIEWER');
      expect(demoted['row_version']).toBe((current['row_version'] as number) + 1);
    });
  });

  it(
    'leaves at least one ACTIVE OWNER when two processes each demote the other',
    // An explicit per-test budget, not a change to the repository-wide TEST_TIMEOUT_MS (FND-26):
    // this test pays for a second Node start-up plus type stripping, which is a property of the
    // test, not of the suite. Same value and same reason as test/tenant/concurrency.test.ts.
    { timeout: 60_000 },
    async () => {
      await withTenancyDatabase(async ({ db, databasePath, dir, registry }) => {
        const a = seedOrganization(db, ORG_A, registry);
        const secondOwnerMembershipId = addSecondOwner(db, a.ctx);
        const memberships = membershipsRepository(db, a.ctx);

        const outPath = join(dir, 'owner-worker-out.log');
        const errPath = join(dir, 'owner-worker-err.log');
        const outFd = openSync(outPath, 'a');
        const errFd = openSync(errPath, 'a');

        const parentTarget = memberships.get(a.membershipId);

        // The lock first, the demotion second, the contender third — so the worker cannot exist
        // before the write lock is held, and cannot win the race by being scheduled first.
        const child = withTenantTransaction(db, a.ctx, (tx) => {
          memberships.demote(
            tx,
            a.membershipId,
            parentTarget['row_version'] as number,
            'VIEWER',
          );
          const spawned = spawn(
            process.execPath,
            [WORKER, databasePath, REPO_MIGRATIONS_DIR, ORG_A, secondOwnerMembershipId, '0'],
            { stdio: ['ignore', outFd, errFd] },
          );
          closeSync(outFd);
          closeSync(errFd);
          return spawned;
        });

        const result = await new Promise<{ outcome: string; name?: string; message?: string }>(
          (resolve, reject) => {
            child.on('error', reject);
            child.on('close', (code) => {
              const lines = readFileSync(outPath, 'utf8')
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line !== '' && !line.includes('"ready"'));
              const last = lines.pop();
              if (last === undefined) {
                reject(
                  new Error(
                    `owner worker produced no result (exit ${String(code)}): ` +
                      readFileSync(errPath, 'utf8'),
                  ),
                );
                return;
              }
              resolve(JSON.parse(last) as { outcome: string });
            });
          },
        );

        // The parent committed first, so only one ACTIVE OWNER remains and the worker's demotion is
        // the one the invariant must refuse.
        expect(result.outcome, `worker said: ${result.message ?? ''}`).toBe('refused');
        expect(result.name).toBe('TenancyError');
        expect(result.message).toMatch(/last ACTIVE OWNER/);

        const owners = memberships
          .list()
          .filter((row) => row['role'] === 'OWNER' && row['status'] === 'ACTIVE');
        expect(owners).toHaveLength(1);
        expect(owners[0]?.['id']).toBe(secondOwnerMembershipId);
      });
    },
  );
});
