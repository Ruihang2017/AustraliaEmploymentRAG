/**
 * EVID-02 acceptance items 10 and 12 — this ticket's own import-graph and purity scan, scoped to
 * `src/entity/**` and `src/context/**`.
 *
 * `test/contract/purity.test.ts` (EVID-01) already walks the whole of `src/**` and therefore already
 * covers these files. This suite is not a copy for its own sake: it adds the assertions EVID-01 had
 * no reason to make and that this ticket's Reviewer focus asks for —
 *
 * - no network client, no `child_process`, no file write, IN THE TWO NEW TREES specifically;
 * - `src/context/publicEntity.ts` imports NEITHER the necessary-facts rule set NOR the entity
 *   gazetteer. Stage 5 is the only remover; if a candidate filter could reach it, pasting a company
 *   suffix would become the "ignore warning" button PRD §37.2 forbids;
 * - `PII_STAGES` and every constant this ticket exports are deep-frozen;
 * - the same request twice gives byte-identical results, INCLUDING the combination assessment.
 *
 * Every scanner is proved NON-VACUOUS against a control string.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { admit } from '../../src/contract/pipeline.js';
import { buildScanViews } from '../../src/deterministic/detect.js';
import { PII_STAGES } from '../../src/context/stages.js';
import { COMBINATION_RULE_V1, evaluateCombination } from '../../src/context/combination.js';
import { COMBINATION_DIMENSION_NAMES, DIMENSION_RULES } from '../../src/context/dimensions.js';
import { NECESSARY_FACT_RULES } from '../../src/context/necessaryFacts.js';
import { SUPPRESSIBLE_CATEGORIES } from '../../src/context/publicEntity.js';
import { ENTITY_RULE_NAMES } from '../../src/entity/port.js';
import { ENTITY_RULES } from '../../src/entity/deterministic/rules.js';
import {
  ALLOWED_ENTITY_FORMS,
  CITATION_SHAPED,
  ORGANISATION_HEADS,
} from '../../src/entity/deterministic/gazetteer.js';
import { ENTITY_ARTIFACT_PINS } from '../../src/entity/runtime/pin.js';
import { PACKAGE_ROOT } from '../contract/fixture.js';

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

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

const TREES = [join(PACKAGE_ROOT, 'src', 'entity'), join(PACKAGE_ROOT, 'src', 'context')];
const files = TREES.flatMap((tree) => sourceFiles(tree));
const sources = files.map((file) => ({
  path: file.slice(PACKAGE_ROOT.length + 1).split('\\').join('/'),
  text: readFileSync(file, 'utf8'),
}));

describe('the import graph of src/{entity,context}/**', () => {
  it('walks both trees (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
    expect(sources.some((source) => source.path.startsWith('src/entity/'))).toBe(true);
    expect(sources.some((source) => source.path.startsWith('src/context/'))).toBe(true);
  });

  it('imports only relative paths — no HTTP client, no driver, no builtin', () => {
    const offenders: string[] = [];
    for (const source of sources) {
      for (const specifier of specifiersOf(source.text)) {
        if (specifier.startsWith('./') || specifier.startsWith('../')) continue;
        offenders.push(`${source.path} -> ${specifier}`);
      }
    }
    expect(offenders, `impure import:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('reaches outside the package nowhere at all', () => {
    const outside: string[] = [];
    for (const source of sources) {
      for (const specifier of specifiersOf(source.text)) {
        if (specifier.includes('../../../')) outside.push(`${source.path} -> ${specifier}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('the specifier scan is not vacuous', () => {
    expect(specifiersOf("import { get } from 'node:https';")).toEqual(['node:https']);
    expect(specifiersOf("const x = require('undici');")).toEqual(['undici']);
  });
});

describe('no network, no process, no file write (PRD §21.1)', () => {
  const FORBIDDEN: readonly (readonly [RegExp, string])[] = [
    [/\bfetch\s*\(/, 'a network call'],
    [/\bXMLHttpRequest\b/, 'a network call'],
    [/\bWebSocket\b/, 'a network call'],
    [/\bnode:https?\b/, 'an HTTP client'],
    [/\bchild_process\b/, 'process execution'],
    [/\bwriteFileSync\b/, 'a file write'],
    [/\breadFileSync\b/, 'a file read'],
    [/\bcreateWriteStream\b/, 'a file write'],
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
      "await fetch('https://x'); new XMLHttpRequest(); new WebSocket('x'); import 'node:https'; require('child_process'); writeFileSync(p, s); readFileSync(p); createWriteStream(p);";
    for (const [pattern] of FORBIDDEN) {
      expect(pattern.test(control), `${pattern.source} did not fire on the control`).toBe(true);
    }
  });
});

describe('stage 5 cannot reach a candidate filter (the ignore-warning-button risk)', () => {
  const publicEntity = sources.find((source) => source.path === 'src/context/publicEntity.ts');

  it('the file is in the scan (non-vacuity)', () => {
    expect(publicEntity).toBeDefined();
  });

  it.each(['necessaryFacts', 'gazetteer', 'dimensions', 'rules.js'])(
    'does not import %s',
    (module) => {
      for (const specifier of specifiersOf(publicEntity?.text ?? '')) {
        expect(specifier.includes(module), `publicEntity.ts imports ${specifier}`).toBe(false);
      }
    },
  );

  it('imports only the contract, the checksums and nothing else', () => {
    const specifiers = [...new Set(specifiersOf(publicEntity?.text ?? ''))].sort();
    expect(specifiers).toEqual([
      '../contract/category.js',
      '../contract/finding.js',
      '../contract/freeze.js',
      '../contract/pipeline.js',
      '../contract/request.js',
      '../deterministic/detectors/checksums.js',
    ]);
  });
});

describe('no module-scope global or sticky regex (a shared mutable lastIndex)', () => {
  it('there is none', () => {
    const offenders: string[] = [];
    for (const source of sources) {
      for (const line of source.text.split('\n')) {
        if (/^(?:export )?const\s+\w+\s*=\s*\/.*\/[a-z]*[gy][a-z]*\s*;/.test(line)) {
          offenders.push(`${source.path}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('that scan is not vacuous', () => {
    expect(/^(?:export )?const\s+\w+\s*=\s*\/.*\/[a-z]*[gy][a-z]*\s*;/.test('const RE = /abc/g;')).toBe(
      true,
    );
  });
});

describe('every constant this ticket exports is deep-frozen', () => {
  function assertDeepFrozen(value: unknown, path: string): void {
    if (value === null || typeof value !== 'object') return;
    expect(Object.isFrozen(value), `${path} is not frozen`).toBe(true);
    for (const key of Object.getOwnPropertyNames(value)) {
      assertDeepFrozen((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }

  it.each([
    ['PII_STAGES', PII_STAGES as unknown],
    ['COMBINATION_RULE_V1', COMBINATION_RULE_V1 as unknown],
    ['COMBINATION_DIMENSION_NAMES', COMBINATION_DIMENSION_NAMES as unknown],
    ['DIMENSION_RULES', DIMENSION_RULES as unknown],
    ['NECESSARY_FACT_RULES', NECESSARY_FACT_RULES as unknown],
    ['SUPPRESSIBLE_CATEGORIES', SUPPRESSIBLE_CATEGORIES as unknown],
    ['ENTITY_RULE_NAMES', ENTITY_RULE_NAMES as unknown],
    ['ENTITY_RULES', ENTITY_RULES as unknown],
    ['ALLOWED_ENTITY_FORMS', ALLOWED_ENTITY_FORMS as unknown],
    ['ORGANISATION_HEADS', ORGANISATION_HEADS as unknown],
    ['CITATION_SHAPED', CITATION_SHAPED as unknown],
    ['ENTITY_ARTIFACT_PINS', ENTITY_ARTIFACT_PINS as unknown],
  ])('%s', (name, value) => {
    assertDeepFrozen(value, name);
  });

  it('the freeze assertion is not vacuous', () => {
    expect(() => {
      assertDeepFrozen({ a: { b: 1 } }, 'control');
    }).toThrow();
  });
});

describe('determinism (PRD §39.1, §45.2)', () => {
  const request = {
    freeText: [
      { field: 'question', value: 'Hi Marta Kowalski, our sole welder in a four-person workshop had a stroke.' },
      { field: 'context', value: 'Their tax file number is 123 456 782 and the depot is in regional NSW.' },
    ],
    structured: { employer: 'Example Widgets Pty Ltd', abn: '51824753556' },
  };

  it('gives deeply equal and byte-equal results for two calls', () => {
    const first = admit(request, PII_STAGES);
    const second = admit(request, PII_STAGES);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('gives a byte-equal combination assessment for two calls', () => {
    const views = buildScanViews(request);
    const findings = admit(request, PII_STAGES).findings;
    const first = evaluateCombination({ request, views }, findings);
    const second = evaluateCombination({ request, views }, findings);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('does not mutate the request it was given', () => {
    const snapshot = JSON.stringify(request);
    admit(request, PII_STAGES);
    expect(JSON.stringify(request)).toBe(snapshot);
  });
});
