/**
 * FND-10 acceptance item: property test — `assertNoFilteredItemReintroduced` flags every post-rank id
 * absent from the pre-filter set, for randomly generated id sets (PRD §36.3 *"No learned score may
 * reintroduce a filtered item"*).
 *
 * Deterministic: fixed seeds, no `Math.random`, seed printed with every failure.
 */
import { describe, expect, it } from 'vitest';

import { assertNoFilteredItemReintroduced } from '../../src/legal/index.js';
import { Rng, forEachDraw } from './rng.js';

const CASES = 10_000;
const ID_POOL: readonly string[] = Object.freeze(
  Array.from({ length: 24 }, (_, i) => `dv_${String(i).padStart(3, '0')}`),
);

describe('no filtered item is ever reintroduced (>= 10,000 cases)', () => {
  it(`holds for ${String(CASES)} drawn id sets, with non-vacuity counters`, () => {
    const counters = { withViolations: 0, clean: 0, withDuplicates: 0, emptyEligible: 0, total: 0 };

    forEachDraw(CASES, (rng: Rng, index: number, seed: number) => {
      const eligibleSize = rng.int(ID_POOL.length + 1);
      const eligible: string[] = [];
      const eligibleSet = new Set<string>();
      while (eligible.length < eligibleSize) {
        const id = rng.pick(ID_POOL);
        if (eligibleSet.has(id)) continue;
        eligibleSet.add(id);
        eligible.push(id);
      }

      const postRankLength = rng.int(12);
      const postRank: string[] = [];
      for (let i = 0; i < postRankLength; i += 1) {
        // Half the time draw from the eligible set (when there is one), half from the whole pool —
        // so the ranked list genuinely mixes members and non-members.
        postRank.push(rng.bool() && eligible.length > 0 ? rng.pick(eligible) : rng.pick(ID_POOL));
      }

      const where = `seed 0x${seed.toString(16)} case ${String(index)}`;
      const violations = assertNoFilteredItemReintroduced(eligible, postRank);

      // The expectation, recomputed independently of the implementation.
      const expected = postRank
        .map((id, position) => ({ id, position }))
        .filter((entry) => !eligibleSet.has(entry.id));
      expect(violations, where).toEqual(expected);

      for (const violation of violations) {
        expect(postRank[violation.position], `${where} — position must index postRank`).toBe(violation.id);
        expect(eligibleSet.has(violation.id), `${where} — a member was flagged`).toBe(false);
      }

      counters.total += 1;
      if (violations.length > 0) counters.withViolations += 1;
      else counters.clean += 1;
      if (new Set(postRank).size < postRank.length) counters.withDuplicates += 1;
      if (eligible.length === 0) counters.emptyEligible += 1;
    });

    expect(counters.total).toBe(CASES);
    expect(counters.withViolations, 'no case produced a violation').toBeGreaterThan(0);
    expect(counters.clean, 'no case was clean').toBeGreaterThan(0);
    expect(counters.withDuplicates, 'no case had duplicate post-rank ids').toBeGreaterThan(0);
    expect(counters.emptyEligible, 'no case had an empty eligible set').toBeGreaterThan(0);
    expect(counters.withViolations + counters.clean).toBe(CASES);
  });
});
