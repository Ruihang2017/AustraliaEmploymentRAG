/**
 * Test doubles for the sub-PRD D11 structural port. The ORDERING lives here, in the test, exactly
 * because `src/answers/**` may not own it (FND-10 does).
 */
import { AUTHORITY_LEVEL_VALUES } from '../../../contracts/src/enums/index.js';
import type { AuthorityComparator } from '../../src/answers/index.js';
import type { AuthorityLevel, Citation, CitationRole, Claim } from '../../src/answers/index.js';

/** PRD §9.1 order: index 0 is the HIGHEST authority, so a lower index means higher authority. */
export const prdOrderComparator: AuthorityComparator = (a, b) => {
  const rankA = AUTHORITY_LEVEL_VALUES.indexOf(a);
  const rankB = AUTHORITY_LEVEL_VALUES.indexOf(b);
  if (rankA === rankB) return 0;
  return rankA < rankB ? 1 : -1;
};

/** The same ordering inverted — a second, disagreeing comparator (acceptance item 9). */
export const invertedComparator: AuthorityComparator = (a, b) => {
  const result = prdOrderComparator(a, b);
  if (result === 0) return 0;
  return result === 1 ? -1 : 1;
};

/** Everything is equal authority — the degenerate but legal comparator. */
export const flatComparator: AuthorityComparator = () => 0;

export const LEGISLATION: AuthorityLevel = 'CONSTITUTION_AND_LEGISLATION';
export const GUIDANCE: AuthorityLevel = 'OFFICIAL_REGULATOR_GUIDANCE';

export function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'clm_1',
    material: true,
    shortAnswer: 'Yes',
    conditional: false,
    ...overrides,
  };
}

let citationCounter = 0;
export function citation(
  role: CitationRole,
  authorityLevel: AuthorityLevel = LEGISLATION,
  claimId = 'clm_1',
): Citation {
  citationCounter += 1;
  return { id: `cit_${citationCounter}`, claimId, role, authorityLevel };
}
