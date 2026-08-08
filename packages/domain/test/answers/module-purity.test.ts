/**
 * FND-07 acceptance items 10, 11 and 12 — import-graph purity, sibling-leaf isolation (sub-PRD D10),
 * determinism (PRD §39.1, §45.2) and the absence of any text intended for a model (PRD §9.4).
 *
 * Modelled on packages/contracts/test/enums/package-purity.test.ts, but scanning ONLY
 * `packages/domain/src/answers/**`. It deliberately does NOT assert "the manifest declares no
 * dependency": that is a contracts-wide rule and would falsely constrain the four sibling wave-3
 * tickets that share `packages/domain/package.json`.
 *
 * Every scanner here carries a positive control, so none of these can pass vacuously.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT, REPO_ROOT } from './fixture.js';

const SRC_ANSWERS = join(PACKAGE_ROOT, 'src', 'answers');
const CONTRACTS_ROOT = join(REPO_ROOT, 'packages', 'contracts');

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

const NON_DETERMINISM = [
  'Date.now',
  'new Date',
  'Math.random',
  'process.env',
  'performance.now',
  'crypto.randomUUID',
] as const;

/**
 * Text that would mean this module is instructing a model, or storing hidden reasoning (PRD §9.4), or
 * naming a provider (PRD §45.2). Deliberately identifier- and provider-shaped, NOT "is this a long
 * English string": `refusal-table.ts` legitimately carries verbatim PRD prose, and
 * `prohibited-language.ts` legitimately carries the words it must detect.
 */
const FORBIDDEN_VOCABULARY = [
  /\bprompt/i,
  /systemMessage/i,
  /chainOfThought/i,
  /chain_of_thought/i,
  /hiddenReasoning/i,
  /scratchpad/i,
  /inner monologue/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bclaude\b/i,
  /\bgpt-/i,
  /\bbedrock\b/i,
  /\bvertex\b/i,
] as const;

const files = sourceFiles(SRC_ANSWERS);

describe('import graph (acceptance items 10 and 11)', () => {
  it('walks the whole source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
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
    expect(offenders, `non-built-in import in src/answers:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every relative import that leaves the package resolves inside packages/contracts', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(join(file, '..'), specifier);
        if (target.startsWith(SRC_ANSWERS + sep)) continue;
        if (target.startsWith(CONTRACTS_ROOT + sep)) continue;
        offenders.push(`${relative(PACKAGE_ROOT, file)} -> ${relative(REPO_ROOT, target)}`);
      }
    }
    expect(offenders, `import outside src/answers and packages/contracts:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  it('imports no sibling domain leaf (sub-PRD D10)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
        if (/\.\.\/(access|workflow|budget|legal)\//.test(specifier)) {
          offenders.push(`${relative(PACKAGE_ROOT, file)} -> ${specifier}`);
        }
      }
    }
    expect(offenders, `sibling-leaf import:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('detects an impure specifier when one is present (positive control)', () => {
    expect(specifiersOf("import Fastify from 'fastify';")).toEqual(['fastify']);
    expect(specifiersOf("const db = require('better-sqlite3');")).toEqual(['better-sqlite3']);
    expect(specifiersOf("await import('@aws-sdk/client-s3');")).toEqual(['@aws-sdk/client-s3']);
    expect(/\.\.\/(access|workflow|budget|legal)\//.test('../legal/authority.js')).toBe(true);
  });
});

describe('determinism (acceptance item 11)', () => {
  for (const forbidden of NON_DETERMINISM) {
    it(`no source file uses ${forbidden}`, () => {
      const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(forbidden));
      expect(offenders.map((file) => relative(PACKAGE_ROOT, file))).toEqual([]);
    });
  }

  it('the scan is not vacuous', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect('const at = Date.now();'.includes('Date.now')).toBe(true);
  });
});

describe('no text intended for a model, and no hidden-reasoning field (acceptance item 12)', () => {
  for (const file of files) {
    it(`${relative(SRC_ANSWERS, file)} is clean`, () => {
      const source = readFileSync(file, 'utf8');
      const hits = FORBIDDEN_VOCABULARY.filter((pattern) => pattern.test(source)).map(
        (pattern) => pattern.source,
      );
      expect(hits).toEqual([]);
    });
  }

  it('the vocabulary scan fires when it should (positive control)', () => {
    const control = 'const prompt = "You are a helpful assistant"; // openai, gpt-4, scratchpad';
    const hits = FORBIDDEN_VOCABULARY.filter((pattern) => pattern.test(control)).map(
      (pattern) => pattern.source,
    );
    expect(hits).toEqual(['\\bprompt', 'scratchpad', '\\bopenai\\b', '\\bgpt-']);
  });

  it('the vocabulary scan tolerates the verbatim PRD prose this module must carry', () => {
    const legitimate =
      'prdCondition: "Evidence supports all material claims"; pattern: "definitely compliant"';
    expect(FORBIDDEN_VOCABULARY.filter((pattern) => pattern.test(legitimate))).toEqual([]);
  });
});

describe('every exported constant is deeply frozen (concurrency)', () => {
  it('freezes the module singletons at every level', async () => {
    const module = (await import('../../src/answers/index.js')) as Record<string, unknown>;
    const constants = [
      'REFUSAL_TABLE',
      'STATUS_PRECEDENCE',
      'NON_STATUS_OUTCOMES',
      'DERIVED_CONDITIONS',
      'CONDITION_BY_STATUS',
      'ANSWER_SECTION_ORDER',
      'SHORT_ANSWER_VALUES',
    ];
    for (const name of constants) {
      const value = module[name];
      expect(value, `${name} is not exported`).toBeDefined();
      expect(Object.isFrozen(value), `${name} is not frozen`).toBe(true);
      if (Array.isArray(value)) {
        for (const [index, entry] of value.entries()) {
          if (entry !== null && typeof entry === 'object') {
            expect(Object.isFrozen(entry), `${name}[${index}] is not frozen`).toBe(true);
          }
        }
      } else if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          const child = (value as Record<string, unknown>)[key];
          if (child !== null && typeof child === 'object') {
            expect(Object.isFrozen(child), `${name}.${key} is not frozen`).toBe(true);
          }
        }
      }
    }
  });
});
