import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from './helpers.js';

const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

/**
 * Guard for the ONE place DATA-01 leaves its declared file-scope, and for the pin that made it
 * necessary.
 *
 * This file does not claim the exception is fine. The ticket's "Does not touch" list names "root
 * manifests, lockfiles, `tools/**`, `.github/workflows/**` (`00-foundation`)", and a single
 * `allowBuilds` key in the root `pnpm-workspace.yaml` is outside it. That key is here because it is
 * mechanically unavoidable, not because this ticket decided it was acceptable — measured on pnpm
 * 11.4.0 / Node 24.18.0:
 *
 *  - `pnpm install --frozen-lockfile` against a cold `node_modules` exits 1 with
 *    `ERR_PNPM_IGNORED_BUILDS` when `better-sqlite3` is declared and no root build policy names it.
 *    `strictDepBuilds` defaults to true and `better-sqlite3` ships a `binding.gyp`.
 *  - `dependenciesMeta: { better-sqlite3: { built: false } }` and a `pnpm` block in
 *    `packages/database/package.json` — both inside this ticket's write-owns — were tried and neither
 *    suppresses it. pnpm reads the build policy from the workspace root only.
 *  - Both candidate versions trip it: `12.11.1` needs `allowBuilds: true` (it has an `install` script
 *    that fetches a prebuild over the network), `13.0.3` needs `allowBuilds: false`.
 *
 * So the ticket's own deliverable — a declared `better-sqlite3` dependency — cannot be satisfied
 * inside the ticket's file-scope. That is a ticket/mechanics collision for the Architect and
 * `00-foundation` to settle, and it is filed as **M-Q4** in `docs/prd/01-app-data/README.md` under
 * the ticket's Feedback obligation. Until it is settled, these tests do two things:
 *
 *  1. bound the exception — one key, one entry, nothing else added to any root file, so a *second*
 *     root edit fails a test instead of riding along on this one;
 *  2. bind it to its escalation record — remove the M-Q4 entry and this suite fails. An
 *     out-of-file-scope edit that is no longer declared anywhere is the failure mode; an undeclared
 *     one must not be able to survive quietly.
 *
 * `tools/tests/frozen-paths.test.mjs` lists none of these paths, so nothing else in the repository
 * catches any of it.
 */

/** Top-level YAML keys of a flat, two-space-indented document. Enough for `pnpm-workspace.yaml`. */
function topLevelKeys(yaml: string): string[] {
  return yaml
    .split('\n')
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(':')).trim());
}

/**
 * Reads a repository file with CRLF normalised to LF.
 *
 * `core.autocrlf=true` gives a Windows working tree CRLF for the same commit CI checks out as LF, so
 * every byte-exact assertion below would otherwise pass on one platform and fail on the other. Same
 * reason `migrationChecksum` normalises before hashing.
 */
function repoText(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8').split('\r\n').join('\n');
}

describe('DATA-01 out-of-file-scope exception (root pnpm-workspace.yaml)', () => {
  it('is declared as an open escalation in the sub-PRD, not only in code', () => {
    const subPrd = repoText(join('docs', 'prd', '01-app-data', 'README.md'));
    const row = subPrd.split('\n').find((line) => line.startsWith('| M-Q4 |'));
    expect(
      row,
      'the pnpm-workspace.yaml exception must stay declared as M-Q4 in the sub-PRD Open questions ' +
        'table; if 00-foundation has taken the key, remove the exception and this suite together',
    ).toBeTruthy();
    expect(row).toContain('pnpm-workspace.yaml');
    expect(row).toContain('00-foundation');
  });

  it('adds exactly one key to the root pnpm-workspace.yaml, carrying exactly one entry', () => {
    const workspace = repoText('pnpm-workspace.yaml');
    expect(topLevelKeys(workspace)).toEqual(['packages', 'allowBuilds']);

    const entries = workspace
      .split('\n')
      .slice(workspace.split('\n').findIndex((line) => line.startsWith('allowBuilds:')) + 1)
      .filter((line) => /^ {2}\S/.test(line));
    expect(entries).toEqual(['  better-sqlite3: false']);

    // pnpm writes the key as a `set this to true or false` stub on the failing install; a stub left
    // behind is a broken install, not a decision.
    expect(workspace).not.toContain('set this to true or false');
  });

  it('leaves the FND-01 workspace globs byte-identical', () => {
    // The exception is an APPEND. Reordering or editing the `packages:` list would be a second,
    // undeclared change to a 00-foundation file hiding inside the declared one.
    const workspace = repoText('pnpm-workspace.yaml');
    const globs = workspace.slice(0, workspace.indexOf('#')).trimEnd();
    expect(globs).toBe(["packages:", "  - 'apps/*'", "  - 'packages/*'", "  - 'tests/*'"].join('\n'));
  });

  it('adds no dependency-build policy to any other root manifest', () => {
    for (const key of [
      'allowBuilds',
      'onlyBuiltDependencies',
      'ignoredBuiltDependencies',
      'neverBuiltDependencies',
      'strict-dep-builds',
      'strictDepBuilds',
      'dangerouslyAllowAllBuilds',
    ]) {
      for (const path of ['package.json', '.npmrc']) {
        expect(repoText(path), `${path} carries ${key}, which DATA-01 does not own`).not.toContain(
          key,
        );
      }
      if (key === 'allowBuilds') continue;
      // Comments stripped: the file explains *why* `strictDepBuilds` forces the one key it does
      // carry, and a prose mention is not a setting.
      const settings = repoText('pnpm-workspace.yaml')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');
      expect(
        settings,
        `pnpm-workspace.yaml carries ${key}, which DATA-01 does not own`,
      ).not.toContain(key);
    }
  });

  it('leaves the root package.json scripts and toolchain pins alone (ticket Non-goals)', () => {
    const root = JSON.parse(repoText('package.json')) as {
      scripts?: Record<string, string>;
      engines?: Record<string, string>;
      packageManager?: string;
      dependencies?: Record<string, string>;
    };
    // "No root package.json scripts. Root manifests are 00-foundation's."
    expect(Object.keys(root.scripts ?? {})).not.toContain('db:migrate');
    expect(root.dependencies).toBeUndefined();
    expect(root.engines?.['node']).toBe('24.18.0');
    expect(root.packageManager).toBe('pnpm@11.4.0');
  });

  it('leaves the tools/ workspace assertions to 00-foundation', () => {
    // DATA-01 must satisfy the repository-wide skeleton assertions, never relax them. The exact-pin
    // rule is the one this package's new dependencies are measured against; a rewrite that keeps the
    // title and drops the assertion is the violation this looks for.
    const skeleton = repoText('tools/tests/skeleton.test.mjs');
    expect(skeleton).toContain(
      "it('pins every member dependency to an exact version, with no range'",
    );
    expect(skeleton).toContain('EXACT_VERSION');
    expect(repoText('tools/workspace-assertions.mjs')).toContain('assertEntryFilesEmpty');
  });

  it('is not vacuous — the YAML key reader sees an appended block', () => {
    const tampered = "packages:\n  - 'packages/*'\nallowBuilds:\n  better-sqlite3: false\n";
    expect(topLevelKeys(tampered)).toEqual(['packages', 'allowBuilds']);
    expect(topLevelKeys("packages:\n  - 'packages/*'\n")).toEqual(['packages']);
  });
});

describe('DATA-01 tsconfig stays on the repo convention', () => {
  it('includes only src, like every other member', () => {
    // contracts/ and pii/ add individual `*.test-d.ts` entries, never the whole `test/` tree, and
    // vitest transpiles tests without typechecking them. Widening `include` to `test` silently
    // changes what `pnpm typecheck` means for this package only.
    const tsconfig = JSON.parse(repoText(join('packages', 'database', 'tsconfig.json'))) as {
      extends: string;
      include: string[];
    };
    expect(tsconfig.include).toEqual(['src']);
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });
});

describe('better-sqlite3 pin (breakdown plan §8 Q12)', () => {
  const manifest = JSON.parse(
    repoText(join('packages', 'database', 'package.json')),
  ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  it('is exact, and is the version whose install runs no scripts', () => {
    expect(manifest.dependencies['better-sqlite3']).toBe('13.0.3');
    expect(manifest.devDependencies['@types/better-sqlite3']).toBe('9.6.0');
  });

  it('resolves to a package that declares no install/postinstall script', () => {
    // This is the whole reason the pin moved off the plan's `12.11.1` (recorded in the deviations
    // note and in ADR 0002 (vi)): 12.x runs `prebuild-install` from an `install` script, which
    // reaches GitHub releases over the network at install time and falls back to `node-gyp` when
    // that fetch fails. 13.x ships N-API prebuilds inside its own tarball and runs nothing.
    //
    // A future bump that reintroduces an install script would make `pnpm install` network-dependent
    // and would flip `allowBuilds` from `false` to `true` — a toolchain change, not a version bump.
    // It has to fail here rather than be discovered on an offline CI runner.
    const require = createRequire(join(PACKAGE_ROOT, 'package.json'));
    const resolved = require('better-sqlite3/package.json') as {
      version: string;
      scripts?: Record<string, string>;
    };
    expect(resolved.version).toBe('13.0.3');
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(
        resolved.scripts?.[hook],
        `better-sqlite3 ${resolved.version} declares a ${hook} script`,
      ).toBeUndefined();
    }
  });
});
