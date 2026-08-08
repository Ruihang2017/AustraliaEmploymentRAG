/**
 * FND-07 deliverables 3 and 7 — example tests for every rule branch, the edge cases the plan
 * enumerates, and the D21 definitive-claim predicate.
 */
import { describe, expect, it } from 'vitest';

import { classifyClaimSupport, isDefinitiveClaim } from '../../src/answers/index.js';
import type { Citation } from '../../src/answers/index.js';
import { CLAIM_SUPPORT_VALUES } from '../../../contracts/src/enums/index.js';
import {
  GUIDANCE,
  LEGISLATION,
  citation,
  claim,
  flatComparator,
  prdOrderComparator,
} from './doubles.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();

describe('classifyClaimSupport — the seven rule branches (PRD §15.5)', () => {
  it('1. no citations at all -> NOT_SUPPORTED', () => {
    expect(classifyClaimSupport(claim(), [], prdOrderComparator)).toBe('NOT_SUPPORTED');
  });

  it('1b. citations that all belong to other claims -> NOT_SUPPORTED', () => {
    const others = [citation('SUPPORTS', LEGISLATION, 'clm_other')];
    expect(classifyClaimSupport(claim(), others, prdOrderComparator)).toBe('NOT_SUPPORTED');
  });

  it('2. every citation is BACKGROUND_ONLY -> NOT_SUPPORTED (§15.5 hard gate)', () => {
    const citations = [citation('BACKGROUND_ONLY'), citation('BACKGROUND_ONLY', GUIDANCE)];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('NOT_SUPPORTED');
  });

  it('3. a CONTRADICTS citation at or above the supporting authority -> CONTRADICTED', () => {
    const citations = [citation('SUPPORTS', GUIDANCE), citation('CONTRADICTS', LEGISLATION)];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('CONTRADICTED');
  });

  it('3b. a CONTRADICTS citation BELOW the supporting authority does not contradict', () => {
    const citations = [citation('SUPPORTS', LEGISLATION), citation('CONTRADICTS', GUIDANCE)];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('DIRECTLY_SUPPORTED');
  });

  it('3c. a contradiction with nothing to weigh against it still contradicts', () => {
    const citations = [citation('CONTRADICTS', GUIDANCE)];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('CONTRADICTED');
  });

  it('4. support plus a QUALIFIES citation -> CONDITIONAL', () => {
    const citations = [citation('SUPPORTS'), citation('QUALIFIES', GUIDANCE)];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('CONDITIONAL');
  });

  it('5. a SUPPORTS citation -> DIRECTLY_SUPPORTED', () => {
    expect(classifyClaimSupport(claim(), [citation('SUPPORTS')], prdOrderComparator)).toBe(
      'DIRECTLY_SUPPORTED',
    );
  });

  it('5b. SUPPORTS mixed with BACKGROUND_ONLY is still DIRECTLY_SUPPORTED', () => {
    const citations = [citation('BACKGROUND_ONLY'), citation('SUPPORTS')];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('DIRECTLY_SUPPORTED');
  });

  it('6. only DEFINES -> SUPPORTED_BY_INFERENCE', () => {
    expect(classifyClaimSupport(claim(), [citation('DEFINES')], prdOrderComparator)).toBe(
      'SUPPORTED_BY_INFERENCE',
    );
  });

  it('6b. DEFINES mixed with BACKGROUND_ONLY is still SUPPORTED_BY_INFERENCE, never direct', () => {
    const citations = [citation('DEFINES'), citation('BACKGROUND_ONLY')];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('SUPPORTED_BY_INFERENCE');
  });

  it('7. only QUALIFIES, with nothing to qualify -> NOT_SUPPORTED', () => {
    expect(classifyClaimSupport(claim(), [citation('QUALIFIES')], prdOrderComparator)).toBe(
      'NOT_SUPPORTED',
    );
  });

  it('returns only values the contracts enum declares', () => {
    const citations = [citation('SUPPORTS'), citation('QUALIFIES')];
    expect(CLAIM_SUPPORT_VALUES as readonly string[]).toContain(
      classifyClaimSupport(claim(), citations, prdOrderComparator),
    );
    expect(fixture.claim_support.values).toEqual([...CLAIM_SUPPORT_VALUES]);
  });
});

describe('classifyClaimSupport — edge cases', () => {
  it('ignores duplicate citation ids (identity is the caller\'s problem, not a crash here)', () => {
    const one = citation('SUPPORTS');
    const citations: Citation[] = [one, { ...one }];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('DIRECTLY_SUPPORTED');
  });

  it('ignores other claims\' citations mixed into the same pack', () => {
    const citations = [
      citation('CONTRADICTS', LEGISLATION, 'clm_other'),
      citation('SUPPORTS', GUIDANCE, 'clm_1'),
    ];
    expect(classifyClaimSupport(claim(), citations, prdOrderComparator)).toBe('DIRECTLY_SUPPORTED');
  });

  it('lets a throwing comparator propagate rather than degrading the answer silently', () => {
    const throwing = (): never => {
      throw new Error('comparator failure');
    };
    const citations = [citation('SUPPORTS', GUIDANCE), citation('CONTRADICTS', LEGISLATION)];
    expect(() => classifyClaimSupport(claim(), citations, throwing)).toThrow('comparator failure');
  });

  it('treats an all-equal comparator as "at or above" -> CONTRADICTED', () => {
    const citations = [citation('SUPPORTS', LEGISLATION), citation('CONTRADICTS', GUIDANCE)];
    expect(classifyClaimSupport(claim(), citations, flatComparator)).toBe('CONTRADICTED');
  });
});

describe('isDefinitiveClaim (sub-PRD D21, ANS-005)', () => {
  for (const shortAnswer of fixture.definitive_claim.definitive_short_answers) {
    it(`material, unconditional "${shortAnswer}" is definitive`, () => {
      expect(isDefinitiveClaim(claim({ shortAnswer: shortAnswer as 'Yes' }))).toBe(true);
    });
  }

  for (const shortAnswer of fixture.definitive_claim.non_definitive_short_answers) {
    it(`"${shortAnswer}" is not definitive`, () => {
      expect(isDefinitiveClaim(claim({ shortAnswer: shortAnswer as 'Likely' }))).toBe(false);
    });
  }

  it('a non-material claim is never definitive', () => {
    expect(isDefinitiveClaim(claim({ material: false }))).toBe(false);
  });

  it('a claim asserted subject to a condition or assumption is never definitive (PRD §8.4 item 3)', () => {
    expect(isDefinitiveClaim(claim({ conditional: true }))).toBe(false);
  });
});
