/**
 * FND-06 acceptance items 10, 11 and 12 — import-graph purity (PRD §39.1, §45.2), the sibling-leaf ban
 * (sub-PRD D10), determinism, and the append-only manifest.
 *
 * Modelled on FND-08's and FND-09's purity suites, scanning ONLY `src/access/**`. Every scanner
 * carries a positive control: a scanner that silently matches nothing is indistinguishable from clean
 * code.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from './fixture.js';
import { codeOnly, named, sourceFiles, specifiersOf, stripComments } from './source-scan.js';

const SRC_ACCESS = join(PACKAGE_ROOT, 'src', 'access');
const CONTRACTS_SRC = resolve(PACKAGE_ROOT, '..', 'contracts', 'src');
const SIBLING_LEAVES = ['answers', 'workflow', 'budget', 'legal'];

const files = sourceFiles(SRC_ACCESS);
const fileNames = files.map((file) => named(PACKAGE_ROOT, file));

describe('import graph', () => {
  it('walks the whole access leaf (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(fileNames).toContain('src/access/index.ts');
    expect(fileNames).toContain('src/access/contracts.ts');
    expect(fileNames).toContain('src/access/matrix.ts');
    expect(fileNames).toContain('src/access/evaluate.ts');
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
        if (!pure) offenders.push(`${named(PACKAGE_ROOT, file)} -> ${specifier}`);
      }
    }
    expect(offenders, `non-built-in import in src/access:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('imports no Node built-in either — this leaf does no I/O at all', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('node:')) offenders.push(`${named(PACKAGE_ROOT, file)} -> ${specifier}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('leaves the leaf only towards packages/contracts/src, and only from contracts.ts', () => {
    const escapers: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(file, '..', specifier);
        if (target.startsWith(SRC_ACCESS + sep)) continue;
        escapers.push(`${named(PACKAGE_ROOT, file)} -> ${specifier}`);
        expect(
          target.startsWith(CONTRACTS_SRC + sep),
          `${specifier} escapes src/access towards something other than packages/contracts/src`,
        ).toBe(true);
      }
    }
    const escapingFiles = new Set(escapers.map((entry) => entry.split(' -> ')[0]));
    expect([...escapingFiles], 'only src/access/contracts.ts may name packages/contracts').toEqual([
      'src/access/contracts.ts',
    ]);
    expect(escapers.length, 'the cross-package boundary disappeared').toBeGreaterThan(0);
  });

  it('imports the contracts BARREL, never a family file', () => {
    const contractsSource = readFileSync(join(SRC_ACCESS, 'contracts.ts'), 'utf8');
    for (const specifier of specifiersOf(contractsSource)) {
      expect(specifier).toBe('../../../contracts/src/enums/index.js');
    }
  });
});

describe('sibling-leaf ban (sub-PRD D10)', () => {
  const namesSibling = (specifier: string): boolean =>
    SIBLING_LEAVES.some((leaf) =>
      new RegExp(`(^|[./])${leaf}(/|$)`).test(specifier.replace(/\.js$/, '')),
    );

  it('flags a synthetic sibling import (the matcher is not vacuous)', () => {
    expect(namesSibling('../legal/index.js')).toBe(true);
    expect(namesSibling('../budget/deep-freeze.js')).toBe(true);
    expect(namesSibling('../workflow/etag.js')).toBe(true);
    expect(namesSibling('../answers/snapshot.js')).toBe(true);
    expect(namesSibling('./matrix.js')).toBe(false);
    expect(namesSibling('../../../contracts/src/enums/index.js')).toBe(false);
  });

  it('imports no sibling domain leaf', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (namesSibling(specifier)) offenders.push(`${named(PACKAGE_ROOT, file)} -> ${specifier}`);
      }
    }
    expect(offenders, `sibling-leaf import:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('determinism', () => {
  const FORBIDDEN = ['Date.now', 'new Date', 'Math.random', 'process.env', 'performance.now', 'crypto'];

  it('strips comments before grepping (the stripper is not vacuous)', () => {
    expect(stripComments('/** never calls Date.now */\nconst a = 1;\n')).not.toContain('Date.now');
    expect(stripComments('const a = 1; // Math.random\n')).not.toContain('Math.random');
    expect(stripComments('const a = Date.now();')).toContain('Date.now');
  });

  it('uses no clock, randomness, environment or crypto anywhere in the leaf', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const token of FORBIDDEN) {
        if (source.includes(token)) offenders.push(`${named(PACKAGE_ROOT, file)} contains ${token}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('declares no module-level mutable binding — no cache, no accumulator', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = codeOnly(readFileSync(file, 'utf8'));
      for (const [index, line] of source.split('\n').entries()) {
        if (/^\s*(?:export\s+)?(?:let|var)\s/.test(line)) {
          offenders.push(`${named(PACKAGE_ROOT, file)}:${String(index + 1)} ${line.trim()}`);
        }
      }
    }
    expect(offenders, `module-level mutable state:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the mutable-binding scan fires when it should (positive control)', () => {
    expect(/^\s*(?:export\s+)?(?:let|var)\s/.test('let cache = new Map();')).toBe(true);
    expect(/^\s*(?:export\s+)?(?:let|var)\s/.test('const cache = 1;')).toBe(false);
  });
});

describe('no framework, driver, provider or cloud vocabulary (PRD §39.1)', () => {
  const FORBIDDEN_VOCABULARY = [
    /\bfastify\b/i,
    /\breact\b/i,
    /\bbetter-sqlite3\b/i,
    /@aws-sdk/i,
    /\bopenai\b/i,
    /\banthropic\b/i,
    /\bcloudflare\b/i,
    /\bkysely\b/i,
    /\bdrizzle\b/i,
  ] as const;

  it('fires on a synthetic name (positive control)', () => {
    const control = "import Fastify from 'fastify'; // react, kysely, @aws-sdk";
    const hits = FORBIDDEN_VOCABULARY.filter((pattern) => pattern.test(control));
    expect(hits.length).toBeGreaterThan(2);
  });

  it('names none of them anywhere in the leaf', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_VOCABULARY) {
        if (pattern.test(source)) offenders.push(`${named(PACKAGE_ROOT, file)} matches ${pattern.source}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('package manifest (append-only; the correct append here is the empty one — D34)', () => {
  const manifestText = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8');
  const manifest = JSON.parse(manifestText) as {
    name?: string;
    main?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it('declares no dependency of any kind', () => {
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

  it('names no framework, driver, provider SDK, cloud library or property-testing dependency', () => {
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
      expect(manifestText, `${forbidden} appears in packages/domain/package.json`).not.toContain(
        forbidden,
      );
    }
  });
});

describe('the package entry file is untouched (FND-01 skeleton)', () => {
  it('is still the empty skeleton entry — this leaf is deep-imported', () => {
    expect(readFileSync(join(PACKAGE_ROOT, 'src', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(
      'export {};\n',
    );
  });
});
