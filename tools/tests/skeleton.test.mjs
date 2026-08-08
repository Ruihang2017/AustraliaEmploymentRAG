import { describe, expect, it } from 'vitest';
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ENTRY_FILE_CONTENT,
  REPO_ROOT,
  assertEntryFilesEmpty,
  assertSkeleton,
  cargoMembers,
  pnpmMembers,
  uvMembers,
} from '../workspace-assertions.mjs';

/** An exact semver version: `1.2.3`, optionally with a prerelease and/or build suffix. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * `name@range` for every entry of a dependency block whose specifier is not an exact version.
 * Pure and total, so the assertion above can be proved non-vacuous against synthetic ranges.
 */
export function unpinnedSpecifiers(block) {
  return Object.entries(block ?? {})
    .filter(([, range]) => !EXACT_VERSION.test(range))
    .map(([name, range]) => `${name}@${range}`);
}

/** Mutates a real repository file, runs `body`, then restores the exact original bytes. */
function withTemporaryEdit(relPath, mutate, body) {
  const path = join(REPO_ROOT, relPath);
  const original = readFileSync(path);
  try {
    mutate(path);
    body();
  } finally {
    writeFileSync(path, original);
  }
}

describe('PRD 20.1 member skeleton', () => {
  it('has the expected member inventory', () => {
    expect(pnpmMembers()).toHaveLength(21);
    expect(cargoMembers()).toEqual(['services/search-rs']);
    expect(uvMembers()).toHaveLength(6);
  });

  it('gives every member its manifest, its tsconfig and its entry file', () => {
    expect(assertSkeleton()).toEqual([]);
  });

  it('makes every pnpm member tsconfig extend tsconfig.base.json and add nothing else', () => {
    for (const member of pnpmMembers()) {
      const tsconfig = JSON.parse(readFileSync(join(REPO_ROOT, member, 'tsconfig.json'), 'utf8'));
      expect(tsconfig.extends).toBe('../../tsconfig.base.json');
      expect(Object.keys(tsconfig).sort()).toEqual(['extends', 'include']);
    }
  });

  it('turns strict and noUncheckedIndexedAccess on in the shared base config', () => {
    const base = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.base.json'), 'utf8'));
    expect(base.compilerOptions.strict).toBe(true);
    expect(base.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  it('makes `pnpm typecheck` non-vacuous: every pnpm member declares the script', () => {
    for (const member of pnpmMembers()) {
      const manifest = JSON.parse(readFileSync(join(REPO_ROOT, member, 'package.json'), 'utf8'));
      expect(manifest.scripts?.typecheck, `${member} declares no typecheck script`).toBe(
        'tsc -p tsconfig.json --noEmit',
      );
    }
  });

  // FND-04 / sub-PRD D22. This assertion used to read "declares no dependency beyond the toolchain in
  // any member manifest" (`dependencies` and `devDependencies` both `toEqual({})`). That was a snapshot
  // of the repository at bootstrap promoted to a repository-wide invariant, and tools/vitest.config.mjs
  // runs this suite on EVERY later ticket's branch — the same defect class FND-11 was created to repair.
  // It contradicted FND-04's own Harness ("OpenAPI validation and code generation tools declared in
  // packages/contracts/package.json") and would equally block DATA-01, RUNT-*, EVID-* and RLSE-*.
  // What FND-01 durably meant is the pinning discipline: D17's no-silent-upgrade rule and PRD §45.3's
  // "CI and local development use the same pinned versions". That is what is asserted now, and it stays
  // true for a member that legitimately acquires a runtime dependency later.
  it('pins every member dependency to an exact version, with no range', () => {
    for (const member of pnpmMembers()) {
      const manifest = JSON.parse(readFileSync(join(REPO_ROOT, member, 'package.json'), 'utf8'));
      for (const block of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const [name, range] of Object.entries(manifest[block] ?? {})) {
          expect(
            unpinnedSpecifiers({ [name]: range }),
            `${member} ${block}.${name} is "${range}" — pin it to an exact version`,
          ).toEqual([]);
        }
      }
    }
  });

  // Positive control: the pin check above is worthless if it accepts a range, and every member manifest
  // being already-pinned means the loop proves nothing on its own.
  it.each([
    ['^1.2.3', 'caret range'],
    ['~1.2.3', 'tilde range'],
    ['>=1.2.3', 'comparator range'],
    ['1.x', 'wildcard'],
    ['latest', 'dist-tag'],
    ['workspace:*', 'workspace wildcard'],
    ['npm:other@^1.0.0', 'aliased range'],
  ])('rejects %s (%s) as an unpinned specifier', (range) => {
    expect(unpinnedSpecifiers({ example: range })).toEqual([`example@${range}`]);
  });

  it('accepts an exact version, so the pin check is not simply always-failing', () => {
    expect(unpinnedSpecifiers({ example: '1.2.3', pre: '2.0.0-rc.1' })).toEqual([]);
  });

  it('keeps every entry file empty', () => {
    expect(assertEntryFilesEmpty()).toEqual([]);
    expect(ENTRY_FILE_CONTENT.ts).toBe('export {};\n');
    expect(ENTRY_FILE_CONTENT.rs).toBe('');
    expect(ENTRY_FILE_CONTENT.py).toBe('');
  });

  it('fails when code is smuggled into a TypeScript entry file', () => {
    withTemporaryEdit('packages/domain/src/index.ts', (path) => appendFileSync(path, "console.log('x');\n"), () => {
      const problems = assertEntryFilesEmpty();
      expect(problems.join('\n')).toContain('packages/domain/src/index.ts');
      expect(problems.join('\n')).toContain('is not empty');
    });
  });

  it('fails when code is smuggled into the Rust entry file', () => {
    withTemporaryEdit('services/search-rs/src/lib.rs', (path) => appendFileSync(path, 'pub fn x() {}\n'), () => {
      expect(assertEntryFilesEmpty().join('\n')).toContain('services/search-rs/src/lib.rs');
    });
  });

  it('fails when code is smuggled into a Python entry file', () => {
    withTemporaryEdit('sdk/python/taxrag_sdk/__init__.py', (path) => appendFileSync(path, 'X = 1\n'), () => {
      expect(assertEntryFilesEmpty().join('\n')).toContain('sdk/python/taxrag_sdk/__init__.py');
    });
  });

  it('fails when a member tsconfig stops extending the base config', () => {
    withTemporaryEdit(
      'apps/api/tsconfig.json',
      (path) => copyFileSync(join(REPO_ROOT, 'tsconfig.base.json'), path),
      () => {
        expect(assertSkeleton().join('\n')).toContain('apps/api');
      },
    );
  });

  it('pins every Python member to the same requires-python value, with no drift', () => {
    for (const member of uvMembers()) {
      const text = readFileSync(join(REPO_ROOT, member, 'pyproject.toml'), 'utf8');
      const value = text.match(/^\s*requires-python\s*=\s*"([^"]+)"/m)?.[1];
      expect(value, `${member} has no requires-python`).toBe('==3.14.6');
    }
  });
});
