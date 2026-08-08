/**
 * FND-10 acceptance items "import-graph purity and determinism", "no sibling-leaf import" (sub-PRD
 * D10), "no Date object with timezone semantics crosses the module boundary" and the append-only
 * manifest check (PRD §39.1, §45.2).
 *
 * Modelled on `test/workflow/purity.test.ts` (FND-08) — the structure is reused, the file is not
 * imported: it belongs to another ticket.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as legal from '../../src/legal/index.js';
import { PACKAGE_ROOT } from './fixture.js';

const LEGAL_SRC = join(PACKAGE_ROOT, 'src', 'legal');
const CONTRACTS_SRC = resolve(PACKAGE_ROOT, '..', 'contracts', 'src');
const SIBLING_LEAVES = ['access', 'answers', 'workflow', 'budget'];

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

/**
 * Comments removed, so the determinism ban is a ban on CODE rather than on prose: `dates.ts` has to be
 * able to document WHY it constructs no `Date` without tripping the check that it does not.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

const files = sourceFiles(LEGAL_SRC);
const named = files.map((file) => relative(PACKAGE_ROOT, file).split(sep).join('/'));

describe('import graph', () => {
  it('walks the whole legal leaf (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(named).toContain('src/legal/index.ts');
    expect(named).toContain('src/legal/contracts.ts');
    expect(named).toContain('src/legal/eligibility.ts');
  });

  it('detects an impure specifier when one is present (the extractor is not vacuous)', () => {
    expect(specifiersOf("import Fastify from 'fastify';")).toEqual(['fastify']);
    expect(specifiersOf("const db = require('better-sqlite3');")).toEqual(['better-sqlite3']);
    expect(specifiersOf("await import('@aws-sdk/client-s3');")).toEqual(['@aws-sdk/client-s3']);
    expect(specifiersOf("export * from './contracts.js';")).toEqual(['./contracts.js']);
  });

  it('imports nothing but Node built-ins and relative paths', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        const pure =
          specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../');
        if (!pure) offenders.push(`${relative(PACKAGE_ROOT, file)} -> ${specifier}`);
      }
    }
    expect(offenders, `non-built-in import in src/legal:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('leaves the legal leaf only towards packages/contracts/src, and only from contracts.ts', () => {
    const escapers: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(file, '..', specifier);
        if (target.startsWith(LEGAL_SRC + sep)) continue;
        escapers.push(`${relative(PACKAGE_ROOT, file).split(sep).join('/')} -> ${specifier}`);
        expect(
          target.startsWith(CONTRACTS_SRC + sep),
          `${specifier} escapes src/legal towards something other than packages/contracts/src`,
        ).toBe(true);
      }
    }
    const escapingFiles = new Set(escapers.map((entry) => entry.split(' -> ')[0]));
    expect([...escapingFiles], 'only src/legal/contracts.ts may name packages/contracts').toEqual([
      'src/legal/contracts.ts',
    ]);
    expect(escapers.length, 'the cross-package boundary disappeared').toBeGreaterThan(0);
  });
});

describe('sibling-leaf ban (sub-PRD D10)', () => {
  const namesSibling = (specifier: string): boolean =>
    SIBLING_LEAVES.some((leaf) => new RegExp(`(^|[./])${leaf}(/|$)`).test(specifier.replace(/\.js$/, '')));

  it('flags a synthetic sibling import (the matcher is not vacuous)', () => {
    expect(namesSibling('../answers/ports.js')).toBe(true);
    expect(namesSibling('../workflow/etag.js')).toBe(true);
    expect(namesSibling('../access/matrix.js')).toBe(true);
    expect(namesSibling('../budget/limits.js')).toBe(true);
    expect(namesSibling('./interval.js')).toBe(false);
    expect(namesSibling('../../../contracts/src/enums/index.js')).toBe(false);
  });

  it('imports no sibling domain leaf', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (namesSibling(specifier)) offenders.push(`${relative(PACKAGE_ROOT, file)} -> ${specifier}`);
      }
    }
    expect(offenders, `sibling-leaf import:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('determinism — no clock, no randomness, no environment, no Date', () => {
  const FORBIDDEN = ['Date.now', 'new Date', 'Math.random', 'process.env', 'performance.now', 'crypto'];

  it('strips comments before grepping (the stripper is not vacuous)', () => {
    expect(stripComments('/** uses new Date */\nconst a = 1;\n')).not.toContain('new Date');
    expect(stripComments('const a = 1; // Math.random\n')).not.toContain('Math.random');
    expect(stripComments('const a = Date.now();')).toContain('Date.now');
  });

  it('uses none of them anywhere in the leaf', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const token of FORBIDDEN) {
        if (source.includes(token)) {
          offenders.push(`${relative(PACKAGE_ROOT, file).split(sep).join('/')} contains ${token}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('every exported constant is frozen at every level', () => {
  function unfrozen(value: unknown, path: string, seen: WeakSet<object> = new WeakSet()): string[] {
    if (value === null || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);
    const found: string[] = Object.isFrozen(value) ? [] : [path];
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      found.push(...unfrozen(nested, `${path}.${key}`, seen));
    }
    return found;
  }

  it('the walker is not vacuous', () => {
    expect(unfrozen({ a: Object.freeze({ b: [1] }) }, 'root')).toEqual(['root', 'root.a.b']);
    expect(unfrozen(Object.freeze({ a: Object.freeze([]) }), 'root')).toEqual([]);
  });

  it('walks a non-trivial export surface', () => {
    expect(Object.keys(legal).length).toBeGreaterThanOrEqual(30);
  });

  it('finds no unfrozen exported object or array', () => {
    const offenders: string[] = [];
    for (const [name, value] of Object.entries(legal)) {
      if (typeof value === 'function') continue;
      offenders.push(...unfrozen(value, name));
    }
    expect(offenders, `unfrozen exported constant:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('package manifest (append-only, FND-01 skeleton assertions)', () => {
  const manifestText = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8');
  const manifest = JSON.parse(manifestText) as {
    name?: string;
    main?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it('declares no dependency of any kind (plan OQ-1: the correct append is the empty one)', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.devDependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
  });

  it('leaves the FND-01 entries untouched', () => {
    expect(manifest.name).toBe('@taxrag/domain');
    expect(manifest.main).toBe('src/index.ts');
    expect(manifest.scripts?.typecheck).toBe('tsc -p tsconfig.json --noEmit');
    expect(manifest.scripts?.test).toBe('vitest run');
  });

  it('names no framework, driver, provider SDK, cloud or property-testing library', () => {
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
      'fast-check',
    ]) {
      expect(manifestText, `${forbidden} appears in packages/domain/package.json`).not.toContain(forbidden);
    }
  });
});

describe('the package entry file is untouched (FND-01 skeleton)', () => {
  it('is still the empty skeleton entry — this leaf is deep-imported (open question Q1)', () => {
    // Line endings are normalised: git-for-Windows materialises CRLF in the working tree.
    expect(readFileSync(join(PACKAGE_ROOT, 'src', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(
      'export {};\n',
    );
  });
});
