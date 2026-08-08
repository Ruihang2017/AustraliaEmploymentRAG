/**
 * FND-10 acceptance item: property test (>= 10,000 cases) — `guidanceCannotOutrank` never lets an
 * authority at level 6-8 be ordered above one at level 1-4, for any input (PRD §9.1, §36.3).
 *
 * Deterministic: fixed seeds, no `Math.random`, and the seed is printed with every failure so a red
 * run reproduces exactly.
 */
import { describe, expect, it } from 'vitest';

import {
  authorityRank,
  compareAuthority,
  guidanceCannotOutrank,
  UNKNOWN_AUTHORITY_RANK,
} from '../../src/legal/index.js';
import { AUTHORITY_LEVEL_VALUES, type AuthorityLevel } from '../../src/legal/contracts.js';
import { Rng, SEEDS, forEachDraw } from './rng.js';

const CASES = 10_000;

/** The eight §9.1 levels plus a pool of values that are NOT in the vocabulary. */
const UNKNOWN_POOL = ['MADE_UP_LEVEL', '', 'constitution_and_legislation', 'toString', 'RANK_ZERO'];
const DRAW_POOL: readonly string[] = [...AUTHORITY_LEVEL_VALUES, ...UNKNOWN_POOL];

describe('guidance can never outrank legislation (>= 10,000 cases)', () => {
  it(`holds for ${String(CASES)} drawn pairs, with non-vacuity counters`, () => {
    const counters = {
      level6OverLevel1: 0,
      level8OverLevel4: 0,
      equalLevels: 0,
      level5OverLevel1: 0,
      unknownVersusKnown: 0,
      violatingPairs: 0,
      permittedPairs: 0,
      total: 0,
    };

    forEachDraw(CASES, (rng: Rng, index: number, seed: number) => {
      const a = rng.pick(DRAW_POOL);
      const b = rng.pick(DRAW_POOL);
      const where = `seed 0x${seed.toString(16)} case ${String(index)}: (${a}, ${b})`;
      const rankA = authorityRank(a);
      const rankB = authorityRank(b);
      counters.total += 1;

      const permitted = guidanceCannotOutrank(a, b);
      expect(typeof permitted, where).toBe('boolean');
      // The rule, recomputed independently of the implementation.
      expect(permitted, where).toBe(!(rankA >= 6 && rankB <= 4));

      if (rankA >= 6 && rankB <= 4) {
        counters.violatingPairs += 1;
        expect(permitted, `${where} — guidance/unknown must never be placed above ranks 1-4`).toBe(false);
        if (rankA <= 8) {
          // A KNOWN low-authority level is strictly below the operative one by the comparator too.
          expect(compareAuthority(a as AuthorityLevel, b as AuthorityLevel), where).toBe(-1);
        }
      } else {
        counters.permittedPairs += 1;
      }

      if (rankA === 6 && rankB === 1) counters.level6OverLevel1 += 1;
      if (rankA === 8 && rankB === 4) counters.level8OverLevel4 += 1;
      if (rankA === rankB) counters.equalLevels += 1;
      if (rankA === 5 && rankB === 1) counters.level5OverLevel1 += 1;
      if (
        (rankA === UNKNOWN_AUTHORITY_RANK) !== (rankB === UNKNOWN_AUTHORITY_RANK)
      ) {
        counters.unknownVersusKnown += 1;
      }
    });

    expect(counters.total).toBe(CASES);
    // Non-vacuity: without these, the property is trivially true if the generator drifts.
    expect(counters.level6OverLevel1, 'no level-6-over-level-1 case was drawn').toBeGreaterThan(0);
    expect(counters.level8OverLevel4, 'no level-8-over-level-4 case was drawn').toBeGreaterThan(0);
    expect(counters.equalLevels, 'no equal-level case was drawn').toBeGreaterThan(0);
    expect(counters.level5OverLevel1, 'no level-5-over-level-1 case was drawn').toBeGreaterThan(0);
    expect(counters.unknownVersusKnown, 'no unknown-versus-known case was drawn').toBeGreaterThan(0);
    expect(counters.violatingPairs, 'no violating pair was drawn').toBeGreaterThan(0);
    expect(counters.permittedPairs, 'no permitted pair was drawn').toBeGreaterThan(0);
    expect(counters.violatingPairs + counters.permittedPairs).toBe(CASES);
  });

  it('every pair drawn spans the full eight-level vocabulary', () => {
    const seen = new Set<number>();
    forEachDraw(CASES, (rng: Rng) => {
      seen.add(authorityRank(rng.pick(DRAW_POOL)));
      seen.add(authorityRank(rng.pick(DRAW_POOL)));
    });
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('the generator is reproducible and not degenerate', () => {
  it('two generators with the same seed emit the same sequence', () => {
    const seed = SEEDS[0];
    expect(seed).toBeDefined();
    const first = Array.from({ length: 50 }, () => new Rng(seed as number).int(8));
    const second = new Rng(seed as number);
    const third = new Rng(seed as number);
    expect(Array.from({ length: 50 }, () => second.int(8))).toEqual(
      Array.from({ length: 50 }, () => third.int(8)),
    );
    // A fresh generator per draw always yields the same value — proof the seed drives it.
    expect(new Set(first).size).toBe(1);
  });

  it('a single generator produces a varied sequence', () => {
    const rng = new Rng(0x1a2b3c4d);
    const drawn = Array.from({ length: 200 }, () => rng.int(8));
    expect(new Set(drawn).size).toBeGreaterThan(4);
  });
});
