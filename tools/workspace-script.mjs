/**
 * FND-01 deliverable 2 — the root script wrapper.
 *
 * Deliberately has **no shebang**: it is always invoked as `node tools/workspace-script.mjs <name>`,
 * and on a Windows checkout (`core.autocrlf=true`) a `#!...\r\n` first line makes Vite's transform
 * fail with "SyntaxError: Invalid or unexpected token" when the test suite imports this module.
 *
 * Every root `scripts` entry in package.json is `node tools/workspace-script.mjs <name>`. For a
 * given name this:
 *
 *   1. runs the root implementation, if this repository has one, and propagates a non-zero exit;
 *   2. runs `pnpm -r --if-present run <name>` and propagates a non-zero exit;
 *   3. when NEITHER the root nor any workspace package provides <name>, prints exactly one line
 *      naming the ticket that owns it and exits 0.
 *
 * PRD section 45.3 requires all fourteen entry commands to be real in week 1; four of them
 * (`pnpm dev`, `pnpm eval:smoke`, `pnpm stack:up`, `pnpm stack:down`) plus three more
 * (`pnpm test:integration`, `pnpm generate`, `pnpm generated:check`) have no implementation until
 * their owning ticket lands. Step 3 is documented delegation, not a stub pretending to work.
 *
 * No network access. Reads no environment variable that could carry a credential (PRD section 20.2).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Root-level implementations. Each is resolved to a JS entry point inside node_modules and run with
 * the current `node`, so it works whether the script was reached through `pnpm run` or invoked
 * directly, without depending on PATH.
 */
const ROOT_IMPLEMENTATIONS = {
  lint: { module: 'eslint/bin/eslint.js', args: ['--config', 'tools/eslint.config.mjs', '.'] },
  test: { module: 'vitest/vitest.mjs', args: ['run', '--config', 'tools/vitest.config.mjs'] },
};

export function loadScriptOwners(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, 'tools/fixtures/script-owners.json'), 'utf8'));
}

export function ownerLine(name, root = REPO_ROOT) {
  const fixture = loadScriptOwners(root);
  const owner = fixture.owners[name];
  if (!owner) return null;
  return fixture.messageTemplate
    .replace('{name}', name)
    .replace('{ticket}', owner.ticket)
    .replace('{module}', owner.module);
}

/** Workspace member directories, expanded from the pnpm-workspace.yaml globs with plain `fs`. */
export function workspaceMemberDirs(root = REPO_ROOT) {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [...yaml.matchAll(/^\s*-\s*'([^']+)'\s*$/gm)].map((m) => m[1]);
  const dirs = [];
  for (const glob of globs) {
    const [parent, leaf] = glob.split('/');
    if (leaf !== '*') throw new Error(`unsupported workspace glob (only '<dir>/*'): ${glob}`);
    const parentPath = join(root, parent);
    if (!existsSync(parentPath)) continue;
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(parentPath, entry.name, 'package.json'))) {
        dirs.push(`${parent}/${entry.name}`);
      }
    }
  }
  return dirs.sort();
}

/** Member directories whose package.json declares `scripts.<name>`. */
export function membersProviding(name, root = REPO_ROOT) {
  return workspaceMemberDirs(root).filter((dir) => {
    const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
    return Boolean(manifest.scripts?.[name]);
  });
}

function runNode(entryRelativeToNodeModules, args, root) {
  const entry = join(root, 'node_modules', entryRelativeToNodeModules);
  if (!existsSync(entry)) {
    process.stderr.write(
      `${entry} is missing — run \`corepack pnpm install --frozen-lockfile\` first.\n`,
    );
    return 1;
  }
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: root, stdio: 'inherit' });
  return result.status ?? 1;
}

function runPnpmRecursive(name, root) {
  // `npm_execpath` is set by pnpm when this script was reached through `pnpm run`; using it avoids
  // depending on pnpm being on PATH.
  const execPath = process.env.npm_execpath;
  const result =
    execPath && execPath.endsWith('.cjs')
      ? spawnSync(process.execPath, [execPath, '-r', '--if-present', 'run', name], {
          cwd: root,
          stdio: 'inherit',
        })
      : spawnSync('pnpm', ['-r', '--if-present', 'run', name], {
          cwd: root,
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
  return result.status ?? 1;
}

export function main(argv, root = REPO_ROOT) {
  const name = argv[0];
  if (!name) {
    process.stderr.write('usage: node tools/workspace-script.mjs <script-name>\n');
    return 2;
  }

  const rootImpl = ROOT_IMPLEMENTATIONS[name];
  const providers = membersProviding(name, root);

  if (!rootImpl && providers.length === 0) {
    const line = ownerLine(name, root);
    if (!line) {
      process.stderr.write(
        `${name}: no root implementation, no workspace provider and no owner recorded in ` +
          'tools/fixtures/script-owners.json\n',
      );
      return 2;
    }
    process.stdout.write(`${line}\n`);
    return 0;
  }

  if (rootImpl) {
    const status = runNode(rootImpl.module, rootImpl.args, root);
    if (status !== 0) return status;
  }

  if (providers.length > 0) {
    const status = runPnpmRecursive(name, root);
    if (status !== 0) return status;
  }

  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
