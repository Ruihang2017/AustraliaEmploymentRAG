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

  it('declares no dependency beyond the toolchain in any member manifest', () => {
    for (const member of pnpmMembers()) {
      const manifest = JSON.parse(readFileSync(join(REPO_ROOT, member, 'package.json'), 'utf8'));
      expect(manifest.dependencies ?? {}).toEqual({});
      expect(manifest.devDependencies ?? {}).toEqual({});
    }
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
