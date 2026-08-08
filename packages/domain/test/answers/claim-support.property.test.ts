/**
 * FND-07 acceptance item 5 — `[machine]` property test: a claim whose citations are all
 * `BACKGROUND_ONLY` is never `DIRECTLY_SUPPORTED` or `SUPPORTED_BY_INFERENCE`; it is `NOT_SUPPORTED`
 * (PRD §15.5).
 *
 * The ticket's test plan step 4 demands the generator be shown NON-VACUOUS: a generator that only ever
 * emitted all-`BACKGROUND_ONLY` claims would satisfy the property while testing nothing. The second
 * describe block is that proof.
 */
import { describe, expect, it } from 'vitest';

import { classifyClaimSupport } from '../../src/answers/index.js';
import type { Citation, CitationRole } from '../../src/answers/index.js';
import { AUTHORITY_LEVEL_VALUES, CITATION_ROLE_VALUES } from '../../../contracts/src/enums/index.js';
import { SEEDS, forEachDraw } from './arbitrary.js';
import { claim, prdOrderComparator } from './doubles.js';

const CASES = 10_000;

function generateCitations(
  rng: { int: (bound: number) => number; pick: <T>(values: readonly T[]) => T },
  roles: readonly CitationRole[],
): Citation[] {
  const count = 1 + rng.int(5);
  const citations: Citation[] = [];
  for (let i = 0; i < count; i += 1) {
    citations.push({
      id: `cit_${i}`,
      claimId: 'clm_1',
      role: rng.pick(roles),
      authorityLevel: rng.pick(AUTHORITY_LEVEL_VALUES),
    });
  }
  return citations;
}

describe(`BACKGROUND_ONLY can never independently support a claim (${CASES} cases)`, () => {
  it('all-BACKGROUND_ONLY claims are always NOT_SUPPORTED', () => {
    let drawn = 0;
    forEachDraw(CASES, (rng, index, seed) => {
      drawn += 1;
      const citations = generateCitations(rng, ['BACKGROUND_ONLY']);
      const label = `seed=0x${seed.toString(16)} case=${index}`;
      expect(classifyClaimSupport(claim(), citations, prdOrderComparator), label).toBe(
        'NOT_SUPPORTED',
      );
    });
    expect(drawn).toBe(CASES);
  });

  it('no draw over the FULL role alphabet is ever supported when only background evidence remains', () => {
    let drawn = 0;
    forEachDraw(CASES, (rng, index, seed) => {
      drawn += 1;
      const citations = generateCitations(rng, CITATION_ROLE_VALUES);
      const own = citations.filter((entry) => entry.claimId === 'clm_1');
      const support = classifyClaimSupport(claim(), citations, prdOrderComparator);
      const label = `seed=0x${seed.toString(16)} case=${index}`;
      if (own.every((entry) => entry.role === 'BACKGROUND_ONLY')) {
        expect(support, label).toBe('NOT_SUPPORTED');
        expect(support, label).not.toBe('DIRECTLY_SUPPORTED');
        expect(support, label).not.toBe('SUPPORTED_BY_INFERENCE');
      }
    });
    expect(drawn).toBe(CASES);
  });
});

describe('the generator is not vacuous (ticket test plan step 4)', () => {
  it('produces mixed citation roles in more than 20% of draws, and every role at least once', () => {
    const seenRoles = new Set<CitationRole>();
    let mixed = 0;
    let total = 0;
    const supports = new Map<string, number>();
    forEachDraw(CASES, (rng) => {
      total += 1;
      const citations = generateCitations(rng, CITATION_ROLE_VALUES);
      for (const entry of citations) seenRoles.add(entry.role);
      if (new Set(citations.map((entry) => entry.role)).size >= 2) mixed += 1;
      const support = classifyClaimSupport(claim(), citations, prdOrderComparator);
      supports.set(support, (supports.get(support) ?? 0) + 1);
    });
    expect(total).toBe(CASES);
    expect(seenRoles.size, 'every CitationRole must be drawn').toBe(CITATION_ROLE_VALUES.length);
    expect(mixed / total, 'mixed-role draws').toBeGreaterThan(0.2);
    // And the property is not vacuous in the other direction either: supported outcomes DO occur.
    expect(supports.get('DIRECTLY_SUPPORTED') ?? 0).toBeGreaterThan(0);
    expect(supports.get('SUPPORTED_BY_INFERENCE') ?? 0).toBeGreaterThan(0);
    expect(supports.get('CONTRADICTED') ?? 0).toBeGreaterThan(0);
    expect(supports.get('CONDITIONAL') ?? 0).toBeGreaterThan(0);
    expect(supports.get('NOT_SUPPORTED') ?? 0).toBeGreaterThan(0);
  });

  it('is reproducible from its fixed seeds', () => {
    expect(SEEDS.length).toBeGreaterThan(1);
    const run = (): string[] => {
      const results: string[] = [];
      forEachDraw(200, (rng) => {
        results.push(classifyClaimSupport(claim(), generateCitations(rng, CITATION_ROLE_VALUES), prdOrderComparator));
      });
      return results;
    };
    expect(run()).toEqual(run());
  });
});
