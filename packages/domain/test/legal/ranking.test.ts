/**
 * FND-10 acceptance items "§36.3 feature order replay", "no retrieval constant leaks in" and the
 * "no filtered item reintroduced" invariant.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as legal from '../../src/legal/index.js';
import { RANKING_FEATURE_ORDER, assertNoFilteredItemReintroduced } from '../../src/legal/index.js';
import { PACKAGE_ROOT, loadFeatures } from './fixture.js';

const fixture = loadFeatures();

describe('§36.3 feature order replay', () => {
  it('the fixture transcribes eight features, positions 1..8, each with its PRD prose', () => {
    expect(fixture.features).toHaveLength(8);
    expect(fixture.features.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const row of fixture.features) {
      expect(row.prdText.trim().length, row.feature).toBeGreaterThan(0);
    }
    expect(fixture.preamble).toContain('in this order of safety precedence');
    expect(fixture.closingRule).toContain('No learned score may reintroduce a filtered item');
  });

  it('RANKING_FEATURE_ORDER equals the fixture IN ORDER (an array, never a set)', () => {
    expect([...RANKING_FEATURE_ORDER]).toEqual(fixture.features.map((row) => row.feature));
  });

  it('is deep-frozen', () => {
    expect(Object.isFrozen(RANKING_FEATURE_ORDER)).toBe(true);
  });
});

describe('no retrieval constant leaks in (breakdown plan §8 Q4 is RETR-10/GOLD-15)', () => {
  /**
   * The §36.2 count table's values. If one of these ever became an exported number in `src/legal`, it
   * would freeze a benchmark-selected value in the wrong module.
   */
  const BANNED_NUMBERS = [20, 50, 100, 200, 60, 30, 12, 10, 32000, 60000, 10000];
  /** Names that would BE a retrieval constant. Deliberately narrow so `EligibilityCandidate` is fine. */
  const BANNED_NAME = /FUSION|RERANK|TOP_K|_WEIGHT|_DEPTH|_CANDIDATES|CANDIDATE_COUNT|EVIDENCE_NODES/i;

  /** Every number reachable from the module's exported surface, deep-walked and cycle-safe. */
  function exportedNumbers(value: unknown, seen: WeakSet<object> = new WeakSet()): number[] {
    if (typeof value === 'number') return [value];
    if (value === null || typeof value !== 'object') return [];
    if (seen.has(value)) return [];
    seen.add(value);
    const found: number[] = [];
    for (const nested of Object.values(value as Record<string, unknown>)) {
      found.push(...exportedNumbers(nested, seen));
    }
    return found;
  }

  it('the walker is not vacuous — it finds nested numbers and survives cycles', () => {
    expect(exportedNumbers({ a: { b: [1, 2] }, c: 3 }).sort((x, y) => x - y)).toEqual([1, 2, 3]);
    const cyclic: Record<string, unknown> = { n: 7 };
    cyclic['self'] = cyclic;
    expect(exportedNumbers(cyclic)).toEqual([7]);
    expect(exportedNumbers({ LEXICAL_CANDIDATES: 100 })).toEqual([100]);
    expect(BANNED_NUMBERS).toContain(100);
  });

  it('RANKING_FEATURE_ORDER carries strings only — the order IS the data', () => {
    for (const feature of RANKING_FEATURE_ORDER) expect(typeof feature).toBe('string');
    expect(exportedNumbers(RANKING_FEATURE_ORDER)).toEqual([]);
  });

  it('no exported value anywhere in src/legal is a §36.2 retrieval constant', () => {
    const numbers = new Set(exportedNumbers({ ...legal }));
    const offenders = [...numbers].filter((value) => BANNED_NUMBERS.includes(value));
    expect(offenders, `retrieval constant exported from src/legal: ${offenders.join(', ')}`).toEqual([]);
    // Non-vacuity: the export surface really does contain numbers (the §9.1 ranks).
    expect(numbers.size).toBeGreaterThan(0);
  });

  it('every exported number is a §9.1 rank (1-8) or the fail-closed unknown rank (9)', () => {
    for (const value of new Set(exportedNumbers({ ...legal }))) {
      expect(value, `unexpected exported number ${String(value)}`).toBeGreaterThanOrEqual(1);
      expect(value, `unexpected exported number ${String(value)}`).toBeLessThanOrEqual(9);
    }
  });

  it('the name matcher fires on a positive control and spares the legitimate names', () => {
    expect(BANNED_NAME.test('LEXICAL_CANDIDATES')).toBe(true);
    expect(BANNED_NAME.test('RERANK_DEPTH')).toBe(true);
    expect(BANNED_NAME.test('FUSION_WEIGHTS')).toBe(true);
    expect(BANNED_NAME.test('EVIDENCE_NODES_QUICK')).toBe(true);
    expect(BANNED_NAME.test('EligibilityCandidate')).toBe(false);
    expect(BANNED_NAME.test('AUTHORITY_RANK')).toBe(false);
  });

  it('no export is NAMED like a retrieval constant', () => {
    const offenders = Object.keys(legal).filter((name) => BANNED_NAME.test(name));
    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('the whole leaf is walked when scanning source (non-vacuity)', () => {
    const files = readdirSync(join(PACKAGE_ROOT, 'src', 'legal')).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(10);
    const barrel = readFileSync(join(PACKAGE_ROOT, 'src', 'legal', 'ranking.ts'), 'utf8');
    expect(barrel).toContain('RANKING_FEATURE_ORDER');
  });
});

describe('assertNoFilteredItemReintroduced (PRD §36.3)', () => {
  it('is empty when the post-rank list is a subset of the eligible set', () => {
    expect(assertNoFilteredItemReintroduced(['a', 'b', 'c'], ['c', 'a'])).toEqual([]);
    expect(assertNoFilteredItemReintroduced(['a', 'b', 'c'], [])).toEqual([]);
    expect(assertNoFilteredItemReintroduced(['a', 'b', 'c'], ['a', 'a', 'b'])).toEqual([]);
  });

  it('reports one violation per absent id, in post-rank order, with its 0-based position', () => {
    expect(assertNoFilteredItemReintroduced(['a'], ['a', 'x', 'a', 'y'])).toEqual([
      { id: 'x', position: 1 },
      { id: 'y', position: 3 },
    ]);
  });

  it('an empty eligible set makes every ranked id a violation', () => {
    expect(assertNoFilteredItemReintroduced([], ['a', 'b'])).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });

  it('is exact and case-sensitive — no trim, no case fold (an id-collision vulnerability)', () => {
    expect(assertNoFilteredItemReintroduced(['A'], ['a'])).toEqual([{ id: 'a', position: 0 }]);
    expect(assertNoFilteredItemReintroduced(['a'], [' a'])).toEqual([{ id: ' a', position: 0 }]);
  });

  it('does not inherit membership from Object.prototype', () => {
    expect(assertNoFilteredItemReintroduced(['a'], ['toString', 'constructor'])).toEqual([
      { id: 'toString', position: 0 },
      { id: 'constructor', position: 1 },
    ]);
  });

  it('is total for junk input', () => {
    expect(() =>
      assertNoFilteredItemReintroduced(null as unknown as string[], null as unknown as string[]),
    ).not.toThrow();
    expect(assertNoFilteredItemReintroduced(null as unknown as string[], ['a'])).toEqual([
      { id: 'a', position: 0 },
    ]);
    expect(
      assertNoFilteredItemReintroduced(['a'], [null] as unknown as string[]),
    ).toEqual([{ id: 'null', position: 0 }]);
  });

  it('does not mutate its inputs', () => {
    const pre = ['a', 'b'];
    const post = ['b', 'x'];
    assertNoFilteredItemReintroduced(pre, post);
    expect(pre).toEqual(['a', 'b']);
    expect(post).toEqual(['b', 'x']);
  });
});
