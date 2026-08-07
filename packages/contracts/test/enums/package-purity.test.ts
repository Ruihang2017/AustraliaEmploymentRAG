/**
 * FND-03 deliverable 6 / acceptance item 8 — import-graph purity, enforced by a test rather than by
 * convention (PRD §39.1, §45.2: `packages/contracts` owns enums/schemas/boundaries and must not own
 * business orchestration or provider SDKs; a dependency here is inherited by every package in the
 * repository).
 *
 * WHY THIS FILE LIVES UNDER test/enums/: the ticket's File-scope grants exactly two test leaves,
 * `test/enums/**` and `test/ids/**` (sub-PRD D14 — a test directory whose leaf matches the ticket's
 * source leaf). A whole-package concern has no third leaf to live in, and `enums` is this ticket's
 * primary source leaf. This is scope-respecting placement, not scope drift.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from './fixture.js';

function sourceFiles(dir: string, found: string[] = []): string[] {
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

const SRC = join(PACKAGE_ROOT, 'src');
const files = sourceFiles(SRC);

describe('import graph', () => {
  it('walks the whole source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('imports nothing but Node built-ins and relative paths', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        const pure =
          specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../');
        if (!pure) offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
      }
    }
    expect(offenders, `non-built-in import in packages/contracts:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  it('detects an impure specifier when one is present (the guard is not vacuous)', () => {
    expect(specifiersOf("import Fastify from 'fastify';")).toEqual(['fastify']);
    expect(specifiersOf("const db = require('better-sqlite3');")).toEqual(['better-sqlite3']);
    expect(specifiersOf("await import('@aws-sdk/client-s3');")).toEqual(['@aws-sdk/client-s3']);
    expect(specifiersOf("export * from './legal-status.js';")).toEqual(['./legal-status.js']);
  });
});

describe('package manifest', () => {
  const manifestText = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8');
  const manifest = JSON.parse(manifestText) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it('declares no dependency of any kind', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.devDependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
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
      expect(manifestText, `${forbidden} appears in packages/contracts/package.json`).not.toContain(
        forbidden,
      );
    }
  });
});
