/**
 * DATA-01 deliverable 11 — `pnpm db:migrate`, `pnpm db:status`, `pnpm db:new <group>`.
 *
 * WHY THIS FILE IS `.mjs` AND NOT `.ts`
 * -------------------------------------
 * Node 24 runs TypeScript directly by stripping types, but its resolver does NOT map a `./x.js`
 * specifier onto `x.ts`; `tsc` 6, meanwhile, rejects a `./x.ts` specifier outright (TS5097) unless
 * `allowImportingTsExtensions` is set — and the FND-01 skeleton allows no `compilerOptions` in a
 * member `tsconfig.json`. So `src/migrate/**` uses `.js` specifiers (what `tsc` and vitest both
 * want) and this entry point bridges the gap with a `node:module` resolve hook. That needs no
 * dependency and no build step; adding `tsx`/`esbuild` instead would introduce a package with a real
 * install script, which is the one thing the workspace's dependency-build policy makes expensive.
 *
 * `console` and `process` are declared globals for `**\/*.mjs` only in tools/eslint.config.mjs, which
 * is the other reason all terminal output lives here rather than in the TypeScript modules.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// The bridge. `ts-resolve.ts` is a leaf module importing nothing but `node:` builtins, so it can be
// loaded by direct URL (Node strips its types) before any `.js` specifier has to resolve. Installing
// the hook is an explicit call rather than an import side effect, so importing the migration surface
// from a library never silently rewires a host application's module resolution.
//
// `new URL(...).href` — never `pathToFileURL(url.pathname)`, which yields `file:///C:/C:/…` on
// Windows.
const { enableTypeScriptResolution } = await import(
  new URL('./ts-resolve.ts', import.meta.url).href
);
enableTypeScriptResolution();
const { runMigrations, migrationStatus, DEFAULT_MIGRATIONS_DIR } = await import(
  new URL('./runner.ts', import.meta.url).href
);
const { nextMigrationFilename } = await import(new URL('./naming.ts', import.meta.url).href);

const USAGE = [
  'usage:',
  '  node src/migrate/cli.mjs migrate [--database <path>] [--migrations <dir>]',
  '  node src/migrate/cli.mjs status  [--database <path>] [--migrations <dir>]',
  '  node src/migrate/cli.mjs new <group> [--migrations <dir>]',
].join('\n');

/** Minimal `--flag value` parser. No shelling out anywhere: `--database` is operator input. */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`flag ${token} needs a value`);
      }
      flags[token.slice(2)] = value;
      index += 1;
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

function databasePath(flags) {
  return resolvePath(flags.database ?? process.env.APP_SQLITE_PATH ?? './app.sqlite');
}

function migrationsDir(flags) {
  return flags.migrations ? resolvePath(flags.migrations) : DEFAULT_MIGRATIONS_DIR;
}

async function commandMigrate(flags) {
  const report = await runMigrations({
    databasePath: databasePath(flags),
    migrationsDir: migrationsDir(flags),
  });
  console.log(`database: ${report.databasePath}`);
  console.log(`run id:   ${report.runId}`);
  if (report.applied.length === 0) {
    console.log('applied:  none (already up to date)');
  } else {
    console.log(`applied:  ${report.applied.length}`);
    for (const migration of report.applied) {
      console.log(`  + ${migration.name} [${migration.phase}] ${migration.durationMs}ms`);
    }
  }
  if (report.outOfOrder.length > 0) {
    console.log(`out of order: ${report.outOfOrder.join(', ')}`);
  }
  console.log(`head:     ${report.head ?? '<none>'}`);

  // A deferred contract migration means the database is deliberately not at head. The runner does not
  // throw for it — an unrelated expand in the same batch must still land (see runner.ts) — so this is
  // the loud operator signal, and it has to be an exit code: a release script that only checks for a
  // thrown error would otherwise report success on a half-applied release.
  if (report.deferred.length > 0) {
    console.error(`deferred: ${report.deferred.length} (database is NOT at head)`);
    for (const migration of report.deferred) {
      console.error(`  ! ${migration.name} [${migration.reason}] ${migration.detail}`);
    }
    return 1;
  }
  return 0;
}

function commandStatus(flags) {
  const status = migrationStatus(databasePath(flags), migrationsDir(flags));
  console.log(`database: ${databasePath(flags)}`);
  console.log(`head:     ${status.head ?? '<none>'}`);
  console.log(`applied:  ${status.applied.length}`);
  if (status.pending.length === 0) {
    console.log('pending:  none');
  } else {
    console.log(`pending:  ${status.pending.length}`);
    for (const name of status.pending) console.log(`  - ${name}`);
  }
  return 0;
}

function commandNew(flags, positional) {
  const group = positional[0];
  if (!group) {
    console.error('db:new needs a group, e.g. `pnpm db:new tenancy`');
    return 2;
  }
  const name = nextMigrationFilename(group);
  const dir = migrationsDir(flags);
  const path = resolvePath(dir, name);
  if (existsSync(path)) {
    console.error(`${path} already exists`);
    return 1;
  }
  writeFileSync(
    path,
    `-- aer:phase expand\n-- ${group} (DATA-*): describe the expand-only change here.\n`,
    'utf8',
  );
  console.log(name);
  console.log(path);
  return 0;
}

async function main(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command ? 0 : 2;
  }
  const { flags, positional } = parseArgs(argv.slice(1));
  switch (command) {
    case 'migrate':
      return await commandMigrate(flags);
    case 'status':
      return commandStatus(flags);
    case 'new':
      return commandNew(flags, positional);
    default:
      console.error(`unknown command ${JSON.stringify(command)}\n${USAGE}`);
      return 2;
  }
}

const entry = process.argv[1] ? resolvePath(process.argv[1]) : null;
if (entry === resolvePath(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? ` [${error.code}]` : '';
    console.error(`db: failed${code}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export { main };
