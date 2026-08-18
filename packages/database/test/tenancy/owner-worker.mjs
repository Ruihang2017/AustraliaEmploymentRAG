/**
 * A second OS process that demotes one Owner of the same organisation as the parent.
 *
 * WHY A PROCESS AND NOT A SECOND CONTEXT. SQLite's single-writer rule is enforced by file locks, and
 * `withTenantTransaction` joins a **same-handle** nested call as a `SAVEPOINT` — two contexts in one
 * process therefore share one transaction and cannot demonstrate the property the last-Owner
 * criterion is about. Two processes contend for the actual write lock. Same reasoning, and same
 * shape, as DATA-02's `test/tenant/tx-worker.mjs`.
 *
 * WHY `.mjs`. Node runs `.ts` by stripping types but does not map a `./x.js` specifier onto `x.ts`,
 * so this entry point installs DATA-01's resolve hook first and then imports by URL.
 *
 * Usage: node owner-worker.mjs <databasePath> <migrationsDir> <organizationId> <membershipId> <delayMs>
 *
 * Writes TWO JSON lines. `{"outcome":"ready"}` is the handshake — emitted after the imports are
 * done, so the parent can start contending knowing this process is about to. The second line is the
 * result: `{"outcome":"demoted"}` or `{"outcome":"refused","code":"..."}`.
 */
const { enableTypeScriptResolution } = await import(
  new URL('../../src/migrate/ts-resolve.ts', import.meta.url).href
);
enableTypeScriptResolution();

const { openAppDatabase } = await import(
  new URL('../../src/tenant/connection.ts', import.meta.url).href
);
const { tenantContextFromSession } = await import(
  new URL('../../src/tenant/context.ts', import.meta.url).href
);
const { withTenantTransaction } = await import(
  new URL('../../src/tenant/transaction.ts', import.meta.url).href
);
const { membershipsRepository } = await import(
  new URL('../../src/repos/tenancy/memberships.ts', import.meta.url).href
);

const [databasePath, migrationsDir, organizationId, membershipId, delayMs] = process.argv.slice(2);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

process.stdout.write(`${JSON.stringify({ outcome: 'ready' })}\n`);
sleepSync(Number(delayMs));

const db = openAppDatabase({ databasePath, migrationsDir });
try {
  const ctx = tenantContextFromSession(
    {
      kind: 'USER',
      id: 'worker-user',
      organizationId,
      role: 'ADMIN',
      grants: [],
      scopes: [],
    },
    organizationId,
    'req-owner-worker',
  );
  const memberships = membershipsRepository(db, ctx);
  withTenantTransaction(db, ctx, (tx) => {
    const current = memberships.get(membershipId);
    memberships.demote(tx, membershipId, current.row_version, 'VIEWER');
  });
  process.stdout.write(`${JSON.stringify({ outcome: 'demoted' })}\n`);
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      outcome: 'refused',
      code: error?.code ?? null,
      name: error?.name ?? null,
      message: error?.message ?? String(error),
    })}\n`,
  );
} finally {
  db.close();
}
