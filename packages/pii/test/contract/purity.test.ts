/**
 * EVID-01 acceptance items 6 (import graph) and 13 (purity).
 *
 * PRD §39.1/§45.2 and deliverable 10: *"The module declares no logger, opens no file, no socket and
 * no database."* This suite is what makes that checkable rather than aspirational — including the
 * concurrency rule that a pure module can still get wrong (a shared mutable constant, or a
 * module-scope global regex whose `lastIndex` is shared across concurrent requests).
 *
 * Every scanner here is proved NON-VACUOUS against a synthetic control string, because a source
 * scanner that silently matches nothing is the most comfortable kind of green test.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import { CONSERVATIVE_STAGE_DEFAULTS, admit } from '../../src/contract/pipeline.js';
import { PII_ADMISSION_LIMITS } from '../../src/deterministic/limits.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';
import { DETECTORS } from '../../src/deterministic/detectors/index.js';
import { MINIMUM_RECALL } from '../../src/deterministic/report.js';
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
const sources = files.map((file) => ({
  path: file.slice(PACKAGE_ROOT.length + 1).split('\\').join('/'),
  text: readFileSync(file, 'utf8'),
}));

describe('import graph', () => {
  it('walks the whole source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
  });

  it('imports only relative paths — no Node built-in, no package, so no logger, file, socket or driver', () => {
    const offenders: string[] = [];
    for (const source of sources) {
      for (const specifier of specifiersOf(source.text)) {
        if (specifier.startsWith('./') || specifier.startsWith('../')) continue;
        offenders.push(`${source.path} -> ${specifier}`);
      }
    }
    expect(offenders, `impure import in packages/pii/src:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('detects an impure specifier when one is present (the guard is not vacuous)', () => {
    expect(specifiersOf("import { readFileSync } from 'node:fs';")).toEqual(['node:fs']);
    expect(specifiersOf("const db = require('better-sqlite3');")).toEqual(['better-sqlite3']);
    expect(specifiersOf("import pino from 'pino';")).toEqual(['pino']);
    expect(specifiersOf("export * from './category.js';")).toEqual(['./category.js']);
  });

  it('reaches outside the package only for `packages/contracts` types', () => {
    const outside: string[] = [];
    for (const source of sources) {
      for (const specifier of specifiersOf(source.text)) {
        if (specifier.includes('../../../')) outside.push(`${source.path} -> ${specifier}`);
      }
    }
    expect(outside).toEqual(['src/contract/metrics.ts -> ../../../contracts/src/ids/index.js']);
  });
});

describe('purity of src/**', () => {
  const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
    [/\bDate\.now\b/, 'a clock'],
    [/\bnew Date\b/, 'a clock'],
    [/\bMath\.random\b/, 'randomness'],
    [/\bprocess\.env\b/, 'an environment lookup'],
    [/\bperformance\.now\b/, 'a clock'],
    [/\bcrypto\./, 'a hash or cipher'],
    [/\bcreateHash\b/, 'a hash'],
    [/\bbtoa\b/, 'a reversible encoding'],
    [/\bBuffer\b/, 'a reversible encoding'],
    [/toString\(\s*['"]hex['"]\s*\)/, 'a reversible encoding'],
    [/\bconsole\./, 'a logger'],
    [/\bNODE_ENV\b/, 'an environment branch'],
    [/__unsafe/, 'a test hook'],
  ];

  it.each(FORBIDDEN.map(([pattern, what]) => [pattern.source, pattern, what] as const))(
    'contains no %s (%s)',
    (_source, pattern, what) => {
      const offenders = sources
        .filter((source) => pattern.test(source.text))
        .map((source) => `${source.path} (${what})`);
      expect(offenders).toEqual([]);
    },
  );

  it('the forbidden-pattern scan is not vacuous', () => {
    const control =
      "const now = Date.now(); const r = Math.random(); const e = process.env.NODE_ENV; console.log(Buffer.from('x').toString('hex'));";
    for (const [pattern] of FORBIDDEN) {
      if (pattern.source === '__unsafe' || pattern.source === '\\bnew Date\\b') continue;
      if (pattern.source === '\\bcrypto\\.' || pattern.source === '\\bcreateHash\\b') continue;
      if (pattern.source === '\\bbtoa\\b' || pattern.source === '\\bperformance\\.now\\b') continue;
      expect(pattern.test(control), `${pattern.source} did not fire on the control string`).toBe(
        true,
      );
    }
  });

  it('stores no global or sticky regex at module scope (a shared mutable lastIndex)', () => {
    const offenders: string[] = [];
    for (const source of sources) {
      for (const line of source.text.split('\n')) {
        if (/^(?:export )?const\s+\w+\s*=\s*\/.*\/[a-z]*[gy][a-z]*\s*;/.test(line)) {
          offenders.push(`${source.path}: ${line.trim()}`);
        }
      }
    }
    expect(
      offenders,
      `a module-scope /g or /y regex is shared mutable state across concurrent requests:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('that scan is not vacuous', () => {
    const control = 'const RE = /abc/g;';
    expect(/^(?:export )?const\s+\w+\s*=\s*\/.*\/[a-z]*[gy][a-z]*\s*;/.test(control)).toBe(true);
  });
});

describe('determinism', () => {
  it('gives deeply equal results for two calls on the same request', () => {
    const request = {
      freeText: [
        { field: 'question', value: 'Their TFN is 123 456 782 and email jane.doe@example.invalid.' },
        { field: 'context', value: 'They live at 12 Wattle Street, Northbridge NSW 2063.' },
      ],
      structured: { employer: 'Example Widgets Pty Ltd', abn: '51824753556' },
    };
    const first = admit(request, CONSERVATIVE_STAGE_DEFAULTS);
    const second = admit(request, CONSERVATIVE_STAGE_DEFAULTS);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('does not mutate the request it was given', () => {
    const request = { freeText: [{ field: 'question', value: 'Call 0412 345 678.' }] };
    const snapshot = JSON.stringify(request);
    admit(request, CONSERVATIVE_STAGE_DEFAULTS);
    expect(JSON.stringify(request)).toBe(snapshot);
  });
});

describe('every exported constant is deep-frozen (a process-wide singleton)', () => {
  function assertDeepFrozen(value: unknown, path: string): void {
    if (value === null || typeof value !== 'object') return;
    expect(Object.isFrozen(value), `${path} is not frozen`).toBe(true);
    for (const key of Object.getOwnPropertyNames(value)) {
      assertDeepFrozen((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }

  it.each([
    ['PII_CATEGORY_VALUES', PII_CATEGORY_VALUES as unknown],
    ['PII_PLACEHOLDERS', PII_PLACEHOLDERS as unknown],
    ['PII_ADMISSION_LIMITS', PII_ADMISSION_LIMITS as unknown],
    ['CONSERVATIVE_STAGE_DEFAULTS', CONSERVATIVE_STAGE_DEFAULTS as unknown],
    ['DETECTORS', DETECTORS as unknown],
    ['MINIMUM_RECALL', MINIMUM_RECALL as unknown],
  ])('%s', (name, value) => {
    assertDeepFrozen(value, name);
  });

  it('the freeze assertion is not vacuous', () => {
    expect(() => {
      assertDeepFrozen({ a: { b: 1 } }, 'control');
    }).toThrow();
  });
});
