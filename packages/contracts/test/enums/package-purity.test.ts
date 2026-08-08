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

function sourceFiles(dir: string, found: string[] = [], extension = '.ts'): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found, extension);
    else if (entry.name.endsWith(extension)) found.push(path);
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
const toolFiles = sourceFiles(SRC, [], '.mjs');
const manifestJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function isRelativeOrBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../');
}

describe('import graph', () => {
  it('walks the whole source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('imports nothing but Node built-ins and relative paths', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!isRelativeOrBuiltin(specifier)) offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
      }
    }
    expect(offenders, `non-built-in import in packages/contracts:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  /**
   * FND-04 / sub-PRD D22. `src/openapi/**` adds `.mjs` build tooling (loader, emitter, the two CLIs)
   * that must import a YAML parser and a JSON-Schema validator — the `.ts` scan above never saw
   * those files, so without this block they would escape the purity guard purely by file extension.
   * That would be an accident, not a decision. The rule the PRD actually states (§39.1, §45.2) is
   * about the PUBLISHED surface — a dependency inherited by every consumer — so `.mjs` tooling may
   * import a declared **devDependency** and nothing else, and the manifest block below keeps
   * `dependencies` and `peerDependencies` empty.
   */
  it('walks the .mjs build tooling too (non-vacuity)', () => {
    expect(toolFiles.length).toBeGreaterThan(3);
    expect(toolFiles.map((file) => file.slice(PACKAGE_ROOT.length + 1).split('\\').join('/'))).toContain(
      'src/openapi/emit.mjs',
    );
  });

  it('lets .mjs tooling import only Node built-ins, relative paths and declared devDependencies', () => {
    const allowed = new Set(Object.keys(manifestJson.devDependencies ?? {}));
    const offenders: string[] = [];
    for (const file of toolFiles) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (isRelativeOrBuiltin(specifier)) continue;
        const packageName = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] as string);
        if (!allowed.has(packageName)) {
          offenders.push(`${file.slice(PACKAGE_ROOT.length + 1)} -> ${specifier}`);
        }
      }
    }
    expect(offenders, `undeclared import in packages/contracts tooling:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps every devDependency out of the published .ts surface', () => {
    const declared = Object.keys(manifestJson.devDependencies ?? {});
    expect(declared.length).toBeGreaterThan(0);
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        expect(
          declared.some((name) => specifier === name || specifier.startsWith(`${name}/`)),
          `${file.slice(PACKAGE_ROOT.length + 1)} imports the devDependency ${specifier}`,
        ).toBe(false);
      }
    }
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

  /**
   * FND-04 / sub-PRD D22. This read "declares no dependency of any kind" — a snapshot of the package
   * at FND-03 time, which FND-04's own Harness ("OpenAPI validation and code generation tools
   * declared in packages/contracts/package.json") cannot satisfy. What PRD §39.1/§45.2 durably means
   * is that this package must not push a dependency onto every consumer: `dependencies` and
   * `peerDependencies` stay empty forever, `devDependencies` are build/test tooling only, exactly
   * pinned, and — asserted above — never reachable from the published `.ts` surface.
   */
  it('pushes no dependency onto consumers: `dependencies` and `peerDependencies` stay empty', () => {
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies ?? {}).toEqual({});
  });

  it('pins every devDependency to an exact version', () => {
    for (const [name, range] of Object.entries(manifest.devDependencies ?? {})) {
      expect(range, `${name} is not pinned`).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    }
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
