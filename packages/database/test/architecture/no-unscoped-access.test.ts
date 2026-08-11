/**
 * SEC-001, the acceptance evidence the PRD §30.2 register names by hand:
 *
 * > | SEC-001 | Every tenant repository requires `TenantContext` | … | **Static/architecture test
 * > forbids unscoped repository import** |
 *
 * A static test that only ever passes proves nothing, so the negative cases are as important as the
 * positive one: each fixture is copied into the scanned tree and the scanner must report it, with the
 * exact tag, before the file is removed again.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PACKAGE_ROOT,
  REPO_ROOT,
  importSpecifiers,
  isDirectory,
  scanForUnscopedAccess,
  walk,
} from './scan.js';
import type { Violation } from './scan.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * Every test that walks the whole repository gets a generous, explicit budget.
 *
 * The walk takes about a second on a warm cache, but `pnpm test` runs eight workspace projects at
 * once and this is the only test in the workspace that reads every source file in the tree; observed
 * once at 5020ms against vitest's 5000ms default, i.e. a red suite caused purely by IO contention.
 * The budget is raised, never the assertion: an actual violation still fails, and a walk that really
 * took 30s would still fail rather than be quietly tolerated.
 */
const SCAN_TIMEOUT_MS = 30_000;

/**
 * Where a negative fixture is planted: a real, scanned directory outside `packages/database`.
 *
 * The name carries `__data02_violation_`, the pid and a UUID. The prefix makes a stray file obviously
 * debris rather than someone's work; the pid and UUID keep two vitest workers (or two `/start-all`
 * lanes, though those are separate worktrees) from colliding on one path.
 */
function plant(fixture: string): { path: string; relative: string } {
  const directory = join(REPO_ROOT, 'apps', 'worker', 'src');
  const name = `__data02_violation_${process.pid}_${randomUUID()}.ts`;
  mkdirSync(directory, { recursive: true });
  copyFileSync(join(FIXTURES, fixture), join(directory, name));
  return { path: join(directory, name), relative: `apps/worker/src/${name}` };
}

function withFixture(fixture: string, assert: (violations: Violation[], relative: string) => void): void {
  const planted = plant(fixture);
  try {
    assert(scanForUnscopedAccess(), planted.relative);
  } finally {
    // `force: true` so a fixture the assertion already removed, or one that was never written, does
    // not turn a failed assertion into a confusing ENOENT.
    rmSync(planted.path, { force: true });
  }
}

describe('SEC-001 — no unscoped database access outside packages/database', () => {
  it('reports nothing on the current tree', () => {
    expect(scanForUnscopedAccess()).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  it('actually walked the repository (non-vacuity)', () => {
    const files = walk();
    // A scan that silently walked nothing would satisfy the assertion above. The band is wide on
    // purpose — it is a smoke check that the walker still finds the repository, not a file census.
    expect(files.length).toBeGreaterThan(50);
    expect(files.length).toBeLessThan(5000);
    const asPosix = files.map((file) => file.replace(/\\/g, '/'));
    expect(asPosix.some((file) => file.includes('/apps/api/'))).toBe(true);
    expect(asPosix.some((file) => file.includes('/packages/domain/'))).toBe(true);
    // The owning package is skipped by design: it is allowed to import the driver.
    expect(asPosix.some((file) => file.includes('/packages/database/'))).toBe(false);
  }, SCAN_TIMEOUT_MS);

  it('fails on a module that deep-imports the private connection (the SEC-001 case)', () => {
    withFixture('violation.ts.txt', (violations, relative) => {
      const mine = violations.filter((violation) => violation.file === relative);
      expect(mine.length).toBeGreaterThan(0);
      expect(new Set(mine.map((violation) => violation.tag))).toEqual(
        new Set([
          'better-sqlite3',
          'connection-module',
          'database-src-deep-path',
          'database-package-deep-path',
        ]),
      );
    });
  }, SCAN_TIMEOUT_MS);

  it('fails on a module that imports kysely or better-sqlite3 directly (plan §8 Q13)', () => {
    withFixture('violation-kysely.ts.txt', (violations, relative) => {
      const mine = violations.filter((violation) => violation.file === relative);
      const tags = new Set(mine.map((violation) => violation.tag));
      expect(tags).toEqual(new Set(['better-sqlite3', 'kysely']));
      // Both the bare specifier and the subpath form.
      expect(mine.map((violation) => violation.specifier).sort()).toEqual([
        'better-sqlite3',
        'kysely',
        'kysely/helpers/sqlite',
      ]);
    });
  }, SCAN_TIMEOUT_MS);

  it('leaves no fixture behind', () => {
    const stray = walk().filter((file) => file.includes('__data02_violation_'));
    expect(stray).toEqual([]);
  }, SCAN_TIMEOUT_MS);
});

describe('the extractor recognises every import form and no string literal', () => {
  it('collects all five forms', () => {
    const source = [
      "import a from 'static-default';",
      "export { b } from 'static-reexport';",
      "import c = require('import-equals');",
      "const d = await import('dynamic');",
      "const e = require('common-js');",
    ].join('\n');
    expect(importSpecifiers(source).sort()).toEqual([
      'common-js',
      'dynamic',
      'import-equals',
      'static-default',
      'static-reexport',
    ]);
  });

  it('ignores import-shaped text inside a string literal or a comment', () => {
    const source = [
      "const looksLikeAnImport = \"import x from 'better-sqlite3'\";",
      "const alsoNot = `require('kysely')`;",
      "// import y from 'better-sqlite3'",
      "/* export { z } from 'kysely' */",
      "expect(text).not.toContain('better-sqlite3');",
    ].join('\n');
    expect(importSpecifiers(source)).toEqual([]);
  });

  it('is the reason the current tree is clean — the repository does hold those strings as data', () => {
    // Non-vacuity for the AST choice itself: if these files stopped containing the names, the
    // "reports nothing" assertion above would no longer be evidence that parsing beats grepping.
    const carriers = [
      join(REPO_ROOT, 'apps', 'api', 'test', 'dependency-direction.test.ts'),
      join(REPO_ROOT, 'packages', 'contracts', 'test', 'enums', 'package-purity.test.ts'),
    ].filter((file) => {
      try {
        return readFileSync(file, 'utf8').includes('better-sqlite3');
      } catch {
        return false;
      }
    });
    expect(carriers.length).toBeGreaterThan(0);
  });
});

describe('the package exports map closes every deep path', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    exports?: Record<string, string>;
  };

  it('exposes exactly the four public entries', () => {
    expect(manifest.exports).toBeDefined();
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([
      '.',
      './crypto',
      './migrate',
      './tenant',
    ]);
  });

  it('has no wildcard and no src deep path in any key', () => {
    for (const key of Object.keys(manifest.exports ?? {})) {
      expect(key, `${key} is a wildcard subpath`).not.toContain('*');
      expect(key, `${key} exposes a src path`).not.toContain('src');
    }
  });

  it('exposes no path that returns a connection, a driver handle or a Kysely instance', () => {
    for (const [key, value] of Object.entries(manifest.exports ?? {})) {
      expect(value, `${key} points at the connection module`).not.toContain('connection');
      expect(value, `${key} points into src/tenant beyond its entry`).toMatch(
        /^\.\/src\/(index|migrate\/index|crypto\/index|tenant\/index)\.ts$/,
      );
    }
  });

  it('keeps the connection module out of the public tenant surface', () => {
    const surface = readFileSync(join(PACKAGE_ROOT, 'src', 'tenant', 'index.ts'), 'utf8');
    for (const specifier of importSpecifiers(surface)) {
      expect(specifier, 'the tenant entry re-exports the connection module').not.toContain(
        'connection',
      );
    }
  });

  it('resolves its own assumptions about the tree', () => {
    expect(isDirectory(join(REPO_ROOT, 'apps', 'worker', 'src'))).toBe(true);
    expect(isDirectory(FIXTURES)).toBe(true);
  });
});
