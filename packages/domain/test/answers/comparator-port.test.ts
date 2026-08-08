/**
 * FND-07 acceptance item 9 — the sub-PRD D11 structural port.
 *
 * Two parts: two disagreeing comparators must produce DIFFERENT results on the same input (so the
 * ordering really does come from the caller), and `src/answers/**` must contain no authority ordering
 * of its own (so FND-10 keeps owning the hierarchy).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { classifyClaimSupport } from '../../src/answers/index.js';
import { GUIDANCE, LEGISLATION, citation, claim, invertedComparator, prdOrderComparator } from './doubles.js';
import { PACKAGE_ROOT } from './fixture.js';

const SRC_ANSWERS = join(PACKAGE_ROOT, 'src', 'answers');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** Anything that would amount to owning the §9.1 ordering inside this module. */
const RANKING_PATTERNS: readonly RegExp[] = Object.freeze([
  /AUTHORITY_LEVEL_VALUES/,
  /\bindexOf\s*\(/,
  // Case-sensitive and NOT word-bounded: `AUTHORITY_RANK` must be caught, `ranked` in prose must not.
  /RANK/,
  /HIERARCHY/,
  /LEVEL_ORDER/,
]);

function rankingOffences(source: string): string[] {
  return RANKING_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
}

describe('the comparator really is the caller\'s (sub-PRD D11)', () => {
  it('two disagreeing comparators produce different results on the same claim and citations', () => {
    const citations = [citation('SUPPORTS', GUIDANCE), citation('CONTRADICTS', LEGISLATION)];
    const withPrdOrder = classifyClaimSupport(claim(), citations, prdOrderComparator);
    const withInverted = classifyClaimSupport(claim(), citations, invertedComparator);
    expect(withPrdOrder).toBe('CONTRADICTED');
    expect(withInverted).toBe('DIRECTLY_SUPPORTED');
    expect(withPrdOrder).not.toBe(withInverted);
  });
});

describe('src/answers owns no authority ordering', () => {
  const files = sourceFiles(SRC_ANSWERS);

  it('walks the whole source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of files) {
    it(`${file.slice(SRC_ANSWERS.length + 1)} contains no ranking construct`, () => {
      expect(rankingOffences(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }

  it('the scanner detects a ranking construct when one is present (positive control)', () => {
    expect(rankingOffences('const AUTHORITY_RANK = AUTHORITY_LEVEL_VALUES.indexOf(level);')).toEqual([
      'AUTHORITY_LEVEL_VALUES',
      '\\bindexOf\\s*\\(',
      'RANK',
    ]);
    expect(rankingOffences('const LEVEL_ORDER = [];')).toEqual(['LEVEL_ORDER']);
    expect(rankingOffences('const AUTHORITY_HIERARCHY = [];')).toEqual(['HIERARCHY']);
    // …and it does not fire on ordinary prose that merely uses the word.
    expect(rankingOffences('// a citation ranked at or above the supporting authority')).toEqual([]);
  });
});
