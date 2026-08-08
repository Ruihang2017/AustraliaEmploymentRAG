/**
 * FND-07 acceptance item 6 — PRD §9.1: guidance must not silently override legislation, an operative
 * instrument or binding authority.
 */
import { describe, expect, it } from 'vitest';

import { guidanceCannotOverride } from '../../src/answers/index.js';
import type { Citation } from '../../src/answers/index.js';
import { GUIDANCE, LEGISLATION, citation, prdOrderComparator } from './doubles.js';

describe('guidanceCannotOverride (PRD §9.1)', () => {
  it('flags a guidance-level citation relied on against a legislation-level contradiction', () => {
    const relied = citation('SUPPORTS', GUIDANCE);
    const displaced = citation('CONTRADICTS', LEGISLATION);
    const violations = guidanceCannotOverride([relied, displaced], prdOrderComparator);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.code).toBe('GUIDANCE_OVERRIDES_BINDING_AUTHORITY');
    expect(violations[0]?.claimId).toBe('clm_1');
    expect(violations[0]?.lowerCitationId).toBe(relied.id);
    expect(violations[0]?.higherCitationId).toBe(displaced.id);
  });

  it('does not flag the reverse — legislation relied on against a guidance-level contradiction', () => {
    const citations = [citation('SUPPORTS', LEGISLATION), citation('CONTRADICTS', GUIDANCE)];
    expect(guidanceCannotOverride(citations, prdOrderComparator)).toEqual([]);
  });

  it('does not flag equal authority', () => {
    const citations = [citation('SUPPORTS', GUIDANCE), citation('CONTRADICTS', GUIDANCE)];
    expect(guidanceCannotOverride(citations, prdOrderComparator)).toEqual([]);
  });

  it('does not flag across different claims', () => {
    const citations = [
      citation('SUPPORTS', GUIDANCE, 'clm_1'),
      citation('CONTRADICTS', LEGISLATION, 'clm_2'),
    ];
    expect(guidanceCannotOverride(citations, prdOrderComparator)).toEqual([]);
  });

  it('flags DEFINES as well as SUPPORTS — both are "relied on" evidence', () => {
    const citations = [citation('DEFINES', GUIDANCE), citation('CONTRADICTS', LEGISLATION)];
    expect(guidanceCannotOverride(citations, prdOrderComparator)).toHaveLength(1);
  });

  it('ignores BACKGROUND_ONLY and QUALIFIES citations (neither is relied on for support)', () => {
    const citations = [
      citation('BACKGROUND_ONLY', GUIDANCE),
      citation('QUALIFIES', GUIDANCE),
      citation('CONTRADICTS', LEGISLATION),
    ];
    expect(guidanceCannotOverride(citations, prdOrderComparator)).toEqual([]);
  });

  it('returns an empty array for an empty citation list', () => {
    expect(guidanceCannotOverride([], prdOrderComparator)).toEqual([]);
  });

  it('returns a fresh array each call (no shared mutable result)', () => {
    const first = guidanceCannotOverride([], prdOrderComparator);
    expect(first).not.toBe(guidanceCannotOverride([], prdOrderComparator));
  });

  it('stays bounded on a large single-claim group (CPU-sink guard)', () => {
    const citations: Citation[] = [];
    for (let i = 0; i < 800; i += 1) {
      citations.push({
        id: `cit_${i}`,
        claimId: 'clm_1',
        role: i % 2 === 0 ? 'SUPPORTS' : 'CONTRADICTS',
        authorityLevel: i % 2 === 0 ? GUIDANCE : LEGISLATION,
      });
    }
    const started = Date.now();
    const violations = guidanceCannotOverride(citations, prdOrderComparator);
    // 400 x 400 pairwise comparisons within the one claim group, all violating.
    expect(violations).toHaveLength(160_000);
    expect(Date.now() - started, 'quadratic but not pathological').toBeLessThan(10_000);
  });
});
