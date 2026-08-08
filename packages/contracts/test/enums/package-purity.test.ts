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

/**
 * The four extraction patterns, at module scope so the "no weakening" acceptance item is machine
 * checkable (there must be exactly four, and their quote class must stay `'` and `"` only — see the
 * `keeps the scanner at four patterns` control). Same literals, same order, same `g` flags as when
 * they lived inside `specifiersOf`.
 *
 * `matchAll` clones the regex and never writes back `lastIndex`, so sharing these `/g` literals
 * across calls is stateless. That guarantee is specific to `matchAll`: `.test()`/`.exec()` on a `/g`
 * literal advance `lastIndex` and would make a shared pattern miss every second violation. Do not
 * switch mechanism.
 */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Every module specifier in a file: static import/export, `import(...)` and `require(...)`.
 *
 * FND-12 — THE RULE: this returns only specifiers that are **statically knowable from the source
 * text**. A captured specifier containing the interpolation marker `${` is generated *text*, not an
 * import, and is skipped. Everything else is returned exactly as before, unchanged in value and in
 * order.
 *
 * WHY: FND-05's `src/events/codegen/emit.mjs` is a code generator whose index emitter writes
 * `` indexLines.push(`export type { ${name} } from '${specifier}';`); ``. The first pattern matches
 * inside that template literal and captured the literal four-plus-character string `${specifier}`,
 * which is not relative, not a `node:` built-in and not any package that exists — so the `.mjs`
 * tooling scan reported `emit.mjs -> ${specifier}` as an undeclared import and blocked that ticket.
 * `emit.mjs` has no undeclared import; the scanner was wrong. Removing the `${` guard below restores
 * that defect, and PLTF-02 / PLTF-03 (the next generators to emit import statements as text) will
 * rediscover it.
 *
 * The test is on the **specifier**, never on its container. `src/openapi/emit.mjs` emits
 * `` `import type { … } from './schemas.js';` `` from inside a template literal with a statically
 * knowable specifier; discarding matches by quoting form or by container would throw that specifier
 * away and silently shrink the guard.
 *
 * THIS IS A TEXT SCAN, NOT A PARSER. Recorded, accepted limitation: all four patterns accept only
 * `'` and `"` as quote characters, so a backtick-quoted specifier (`` import x from `yaml`; ``) is
 * not matched at all. That gap is owned by the Architect and is documented, not enforced — it is not
 * a licence to add patterns or widen the quote set here (FND-12 Non-goals). The guard is the
 * supply-chain boundary for the most widely inherited package in the repository; its failure mode is
 * silent permissiveness, so any change that makes it report *less* needs a control proving it still
 * bites.
 */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (!specifier) continue;
      // Generated import TEXT, not an import: an interpolated specifier is not statically knowable
      // from the source. See the header comment above — FND-12.
      if (specifier.includes('${')) continue;
      found.push(specifier);
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

/** `@scope/name` from the first two segments, otherwise the first segment. */
function packageNameOf(specifier: string): string {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] as string);
}

/**
 * The `.mjs` tooling rule as one function: skip relative/built-in, reduce a bare specifier to its
 * package name, report anything outside `allowed`. The real-tree scan and the fixture controls call
 * THIS one — a second, hand-copied implementation inside a control would pass while the real scan
 * misbehaves, which is exactly how the FND-12 defect reached `main`. The offender string carries the
 * RAW specifier, not the reduced package name.
 */
function undeclaredImports(label: string, source: string, allowed: ReadonlySet<string>): string[] {
  const offenders: string[] = [];
  for (const specifier of specifiersOf(source)) {
    if (isRelativeOrBuiltin(specifier)) continue;
    if (!allowed.has(packageNameOf(specifier))) offenders.push(`${label} -> ${specifier}`);
  }
  return offenders;
}

/** FND-05 `packages/contracts/src/events/codegen/emit.mjs` line 208, verbatim (indent dropped). */
const GENERATED_INTERPOLATED = "indexLines.push(`export type { ${name} } from '${specifier}';`);";

/** `main` `packages/contracts/src/openapi/emit.mjs` line 324, verbatim (the leading `? ` dropped). */
const GENERATED_LITERAL = "`import type { ${[...imports].sort().join(', ')} } from './schemas.js';`";

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
      offenders.push(
        ...undeclaredImports(
          file.slice(PACKAGE_ROOT.length + 1),
          readFileSync(file, 'utf8'),
          allowed,
        ),
      );
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

  /**
   * FND-12. These controls are the ONLY evidence that the repair works: measured across every `.ts`
   * and `.mjs` file under `packages/contracts/src` on this branch's base, the scanner produces zero
   * interpolated captures, so the real-tree scan is green before the edit and after it either way.
   * Both fixtures are inline string literals, not reads of any repository file — `emit.mjs` does not
   * exist on this base, and `sourceFiles(SRC)` walks `src/**` only, so nothing scans this file.
   */
  it('reads a generated import statement with an interpolated specifier as text, not an import', () => {
    expect(specifiersOf(GENERATED_INTERPOLATED)).toEqual([]);
    expect(undeclaredImports('emit.mjs', GENERATED_INTERPOLATED, new Set())).toEqual([]);
    expect(GENERATED_INTERPOLATED).toContain('${specifier}');
  });

  it('still yields a generated import statement with a literal specifier', () => {
    expect(specifiersOf(GENERATED_LITERAL)).toEqual(['./schemas.js']);
    expect(undeclaredImports('emit.mjs', GENERATED_LITERAL, new Set())).toEqual([]);
  });

  it('still reports every genuine undeclared import in a .mjs source', () => {
    const source = [
      "import Fastify from 'fastify';",
      "const db = require('better-sqlite3');",
      "await import('@aws-sdk/client-s3');",
    ].join('\n');
    const offenders = undeclaredImports('synthetic.mjs', source, new Set(['yaml']));
    expect(offenders).toHaveLength(3);
    expect([...offenders].sort()).toEqual(
      [
        'synthetic.mjs -> fastify',
        'synthetic.mjs -> better-sqlite3',
        'synthetic.mjs -> @aws-sdk/client-s3',
      ].sort(),
    );
  });

  it('still classifies relative and built-in specifiers as clean', () => {
    for (const [source, specifier] of [
      ["export * from './legal-status.js';", './legal-status.js'],
      ["import { uuidv7 } from '../ids/uuidv7.js';", '../ids/uuidv7.js'],
      ["import { readFileSync } from 'node:fs';", 'node:fs'],
    ] as const) {
      expect(specifiersOf(source)).toEqual([specifier]);
      expect(undeclaredImports('synthetic.mjs', source, new Set())).toEqual([]);
    }
  });

  it('still reduces a declared devDependency subtree specifier to its package name', () => {
    const source = ["import YAML from 'yaml';", "import Ajv from 'ajv/dist/2020.js';"].join('\n');
    expect(undeclaredImports('synthetic.mjs', source, new Set(['yaml', 'ajv']))).toEqual([]);
    expect(undeclaredImports('synthetic.mjs', source, new Set())).toEqual([
      'synthetic.mjs -> yaml',
      'synthetic.mjs -> ajv/dist/2020.js',
    ]);
    expect(packageNameOf('@aws-sdk/client-s3')).toBe('@aws-sdk/client-s3');
  });

  it('keeps the scanner at four patterns that accept only single and double quotes', () => {
    expect(SPECIFIER_PATTERNS).toHaveLength(4);
    for (const pattern of SPECIFIER_PATTERNS) {
      expect(pattern.flags, `${pattern.source} must be one global pattern`).toBe('g');
      expect(pattern.source.includes('`'), `${pattern.source} matches a backtick`).toBe(false);
      expect(pattern.source.split("['\"]").length - 1, `${pattern.source} quote class`).toBe(2);
    }
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
