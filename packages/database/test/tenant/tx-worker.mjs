/**
 * A second OS process that opens its own connection and tries to write the same row as the parent.
 *
 * WHY A PROCESS AND NOT A WORKER THREAD. SQLite's single-writer rule is enforced by file locks. Two
 * handles inside one process can share cache and can be serialised by the event loop, so a
 * same-process "concurrency" test passes by accident as often as it passes for the right reason. Two
 * processes contend for the actual lock.
 *
 * WHY `.mjs`. Same reason as `src/migrate/cli.mjs`: Node runs `.ts` by stripping types but does not
 * map a `./x.js` specifier onto `x.ts`, so this entry point installs DATA-01's resolve hook first and
 * then imports the tenant modules by their normal `.js` specifiers.
 *
 * Usage: node tx-worker.mjs <databasePath> <migrationsDir> <organizationId> <rowId> <delayMs> <label>
 *
 * Writes TWO JSON lines to stdout. The first, `{"outcome":"ready"}`, is a handshake: it is emitted
 * after the imports are done, so the parent can take the write lock knowing this process is about to
 * contend for it. Without it the parent would be guessing how long Node takes to boot and strip
 * types here — and guessing wrong makes the test pass or fail on machine speed rather than on
 * locking behaviour. The second line is the result: `{"outcome":"committed"}` or
 * `{"outcome":"conflict","code":"..."}`.
 */
const { enableTypeScriptResolution } = await import(
  new URL('../../src/migrate/ts-resolve.ts', import.meta.url).href
);
enableTypeScriptResolution();

const { openAppDatabase } = await import(new URL('../../src/tenant/connection.ts', import.meta.url).href);
const { tenantContextFromSession } = await import(
  new URL('../../src/tenant/context.ts', import.meta.url).href
);
const { defineTenantRepository } = await import(
  new URL('../../src/tenant/repository.ts', import.meta.url).href
);
const { withTenantTransaction } = await import(
  new URL('../../src/tenant/transaction.ts', import.meta.url).href
);

const [databasePath, migrationsDir, organizationId, rowId, delayMs, label] = process.argv.slice(2);

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
    'req-worker',
  );
  const repository = defineTenantRepository({
    table: 't_parent',
    spec: {
      name: 't_parent',
      scope: 'TENANT',
      mutability: 'MUTABLE_METADATA',
      requiredColumns: ['id', 'organization_id', 'label'],
    },
  }).for(db, ctx);

  withTenantTransaction(db, ctx, (tx) => {
    repository.update(tx, rowId, { label });
  });
  process.stdout.write(`${JSON.stringify({ outcome: 'committed' })}\n`);
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({
      outcome: 'conflict',
      code: error?.code ?? null,
      name: error?.name ?? null,
      message: error?.message ?? String(error),
    })}\n`,
  );
} finally {
  db.close();
}
