/**
 * FND-06 acceptance items 10 and 11 (`[machine]`) — import-graph purity and the no-sibling-leaf rule,
 * enforced by a test rather than by convention (PRD §39.1: *"`packages/domain` imports no Fastify,
 * React, SQLite driver, provider SDK or Cloudflare/AWS library"*; PRD §45.2; sub-PRD **D10**).
 *
 * WHY THIS FILE LIVES UNDER test/access/: the ticket's File-scope grants exactly one test leaf,
 * `test/access/**` (sub-PRD D14 — a test directory whose leaf matches the ticket's source leaf). The
 * whole-package concerns (the manifest, the no-framework rule) have no other leaf to live in, and
 * `access` is this ticket's only source leaf. Scope-respecting placement, not scope drift — the same
 * shape `packages/contracts/test/enums/package-purity.test.ts` set for `FND-03`.
 *
 * TOLERANT OF SIBLINGS BY DESIGN: `FND-07` … `FND-10` add `src/{answers,workflow,budget,legal}` in
 * the same wave. The whole-tree walk asserts only what is true of every leaf (built-ins and relative
 * specifiers); the "resolves inside access or contracts" assertion is scoped to `src/access/**`, so
 * the first sibling to merge does not turn this suite red.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from './fixture.js';

const SRC = join(PACKAGE_ROOT, 'src');
const ACCESS = join(SRC, 'access');
const CONTRACTS_SRC = resolve(PACKAGE_ROOT, '..', 'contracts', 'src');
const SIBLING_LEAVES = ['answers', 'workflow', 'budget', 'legal'];

function sourceFiles(dir: string, found: string[] = []): string[] {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** Every module specifier in a file: static import/export, `import(...)` and `require(...)`. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) found.push(specifier);
    }
  }
  return found;
}

const allSourceFiles = sourceFiles(SRC);
const accessFiles = sourceFiles(ACCESS);
const inside = (path: string, root: string): boolean => path === root || path.startsWith(root + sep);

describe('import graph', () => {
  it('walks the access leaf and the package (non-vacuity)', () => {
    expect(accessFiles.length).toBeGreaterThanOrEqual(2);
    expect(allSourceFiles.length).toBeGreaterThanOrEqual(accessFiles.length);
  });

  it('imports nothing but Node built-ins and relative paths, anywhere in packages/domain', () => {
    const offenders: string[] = [];
    for (const file of allSourceFiles) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        const pure =
          specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../');
        if (!pure) offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
      }
    }
    expect(offenders, `non-built-in import in packages/domain:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  it('resolves every src/access relative import inside src/access or packages/contracts/src', () => {
    const offenders: string[] = [];
    for (const file of accessFiles) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        if (!inside(target, ACCESS) && !inside(target, CONTRACTS_SRC)) {
          offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
        }
      }
    }
    expect(offenders, `import outside access/contracts:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('imports no sibling rule leaf (sub-PRD D10 — what makes the seven-lane wave safe)', () => {
    const offenders: string[] = [];
    for (const file of accessFiles) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        for (const leaf of SIBLING_LEAVES) {
          if (inside(target, join(SRC, leaf))) {
            offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('detects an impure specifier when one is present (the guard is not vacuous)', () => {
    expect(specifiersOf("import Fastify from 'fastify';")).toEqual(['fastify']);
    expect(specifiersOf("const db = require('better-sqlite3');")).toEqual(['better-sqlite3']);
    expect(specifiersOf("await import('@aws-sdk/client-s3');")).toEqual(['@aws-sdk/client-s3']);
    expect(specifiersOf("export * from './types.js';")).toEqual(['./types.js']);
    // …and the resolution guard rejects a planted sibling-leaf import.
    const planted = resolve(join(ACCESS, 'evaluate.ts'), '..', '../answers/status.js');
    expect(inside(planted, join(SRC, 'answers'))).toBe(true);
    expect(inside(planted, ACCESS)).toBe(false);
  });
});

describe('no clock, no randomness, no environment, no I/O in src/access', () => {
  it.each(['Date.now(', 'new Date(', 'Math.random(', 'process.env', 'globalThis.crypto'])(
    'contains no %s',
    (forbidden) => {
      const offenders = accessFiles.filter((file) =>
        readFileSync(file, 'utf8').includes(forbidden),
      );
      expect(offenders.map((file) => file.slice(PACKAGE_ROOT.length + 1))).toEqual([]);
    },
  );

  it('imports no Node built-in either — this leaf needs no I/O at all', () => {
    const offenders: string[] = [];
    for (const file of accessFiles) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('node:')) {
          offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('package manifest', () => {
  const manifestText = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8');
  const manifest = JSON.parse(manifestText) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  it('declares no dependency of any kind', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.devDependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
  });

  it('registers the test script so the suite actually runs in CI', () => {
    expect(manifest.scripts?.test).toBe('vitest run');
    expect(manifest.scripts?.typecheck).toBe('tsc -p tsconfig.json --noEmit');
  });

  it('names no framework, driver, provider SDK or cloud library anywhere', () => {
    for (const forbidden of [
      'fastify',
      'react',
      'better-sqlite3',
      '@aws-sdk',
      'openai',
      'anthropic',
      'cloudflare',
      'kysely',
      'drizzle',
    ]) {
      expect(manifestText, `${forbidden} appears in packages/domain/package.json`).not.toContain(
        forbidden,
      );
    }
  });
});
