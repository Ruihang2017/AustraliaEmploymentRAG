/**
 * FND-09 acceptance items "No sibling-leaf import", "Import-graph purity and determinism" and
 * "Model-agnostic" `[machine]` — PRD §39.1, §45.2, sub-PRD decision **D10**, breakdown plan §8 Q1.
 */
import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  readSource,
  relativeName,
  sourceFiles,
  specifiersOf,
  stripCommentsAndStrings,
} from './source-scan.js';

const files = sourceFiles();
const raw = new Map(files.map((file) => [file, readSource(file)]));
const stripped = new Map(files.map((file) => [file, stripCommentsAndStrings(readSource(file))]));

/**
 * Names that would pre-empt breakdown plan §8 **Q1** — the hosted model per profile is
 * benchmark-selected, resolved by `21-evaluation-600` and recorded by `GOLD-15`, not chosen here.
 */
const FORBIDDEN_MODEL_NAMES = [
  'openai',
  'anthropic',
  'claude',
  'gpt',
  'gemini',
  'llama',
  'mistral',
  'bedrock',
  'vertex',
  'azure',
  'sonnet',
  'haiku',
  'opus',
];

const NON_DETERMINISM = [
  'Date.now',
  'new Date',
  'Math.random',
  'process.env',
  'performance.now',
  'crypto.',
];

const SIBLING_LEAVES = ['access', 'answers', 'workflow', 'legal'];

describe('import graph', () => {
  it('walks the whole budget source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThan(8);
    expect(files.map(relativeName)).toContain(['src', 'budget', 'index.ts'].join(sep));
  });

  it('imports nothing but Node built-ins, relative paths inside this package, and contracts', () => {
    const offenders: string[] = [];
    for (const [file, text] of raw) {
      for (const specifier of specifiersOf(text)) {
        const pure =
          specifier.startsWith('node:') ||
          specifier.startsWith('./') ||
          specifier.startsWith('../');
        if (!pure) offenders.push(`${relativeName(file)} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('reaches packages/contracts only through type-only imports (no runtime coupling)', () => {
    let contractsImports = 0;
    for (const [file, text] of raw) {
      // An import STATEMENT, not a docstring that happens to mention the path.
      const importLines = text
        .split('\n')
        .filter((line) => line.includes('contracts/src/') && line.includes(' from '));
      for (const line of importLines) {
        contractsImports += 1;
        expect(
          line.trimStart().startsWith('import type'),
          `${relativeName(file)} imports contracts at runtime: ${line.trim()}`,
        ).toBe(true);
      }
      // Whatever `specifiersOf` sees must agree with the line scan.
      const specifierCount = specifiersOf(text).filter((specifier) =>
        specifier.includes('contracts/src/'),
      ).length;
      expect(specifierCount).toBe(importLines.length);
    }
    expect(contractsImports, 'no contracts import found — the coupling check is vacuous').toBe(2);
  });

  it('imports no sibling domain leaf (sub-PRD D10)', () => {
    const offenders: string[] = [];
    for (const [file, text] of raw) {
      for (const specifier of specifiersOf(text)) {
        for (const leaf of SIBLING_LEAVES) {
          if (specifier.includes(`src/${leaf}/`) || specifier.includes(`../${leaf}/`)) {
            offenders.push(`${relativeName(file)} -> ${specifier}`);
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
    expect(specifiersOf("export * from './settle.js';")).toEqual(['./settle.js']);
    expect(specifiersOf("import type { X } from '../access/index.js';")).toEqual([
      '../access/index.js',
    ]);
  });
});

describe('determinism (PRD §39.1, §45.2)', () => {
  it.each(NON_DETERMINISM)('uses no %s', (forbidden) => {
    const offenders: string[] = [];
    for (const [file, text] of stripped) {
      if (text.includes(forbidden)) offenders.push(relativeName(file));
    }
    expect(offenders).toEqual([]);
  });

  it('detects each non-deterministic form when present (non-vacuity)', () => {
    for (const forbidden of NON_DETERMINISM) {
      expect(stripCommentsAndStrings(`const x = ${forbidden}foo;`).includes(forbidden)).toBe(true);
    }
  });
});

describe('model agnosticism (breakdown plan §8 Q1)', () => {
  it.each(FORBIDDEN_MODEL_NAMES)('names no provider or model: %s', (name) => {
    const offenders: string[] = [];
    for (const [file, text] of raw) {
      if (text.toLowerCase().includes(name)) offenders.push(relativeName(file));
    }
    expect(offenders).toEqual([]);
  });

  it('detects a planted provider name (non-vacuity)', () => {
    const planted = `const profile = 'a-${FORBIDDEN_MODEL_NAMES[0] ?? ''}-model';`;
    expect(
      FORBIDDEN_MODEL_NAMES.some((name) => planted.toLowerCase().includes(name)),
      'the model-name scan cannot detect anything',
    ).toBe(true);
  });

  it('hardcodes no hosted price: the only money literals are structural or PRD §24.1 values', () => {
    const bigintLiteral = /\b\d[\d_]*n\b/g;
    const structural = new Set(['0n', '1n', '10_000n', '1_000_000n']);
    const offenders: string[] = [];
    let found = 0;
    for (const [file, text] of stripped) {
      const name = relativeName(file);
      if (name.endsWith('budget-profile.ts')) continue; // the PRD §24.1 table itself
      for (const match of text.matchAll(bigintLiteral)) {
        found += 1;
        if (!structural.has(match[0])) offenders.push(`${name}: ${match[0]}`);
      }
    }
    expect(found, 'the money-literal scan found nothing to check').toBeGreaterThan(3);
    expect(offenders).toEqual([]);
  });

  it('keeps the PRD §24.1 values confined to budget-profile.ts', () => {
    const profile = [...stripped.entries()].find(([file]) =>
      relativeName(file).endsWith('budget-profile.ts'),
    );
    expect(profile).toBeDefined();
    const literals = [...(profile?.[1] ?? '').matchAll(/\b\d[\d_]*n\b/g)].map((match) => match[0]);
    expect(literals).toEqual([
      '14n',
      '15n',
      '4n',
      '5n',
      '3n',
      '4n',
      '1n',
      '2n',
      '0n',
      '0n',
      '12n',
      '12n',
      '8n',
      '12n',
      '42n',
      '50n',
      '12n',
      '50n',
      '9_000n',
    ]);
  });
});
