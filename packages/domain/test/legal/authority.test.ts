/**
 * FND-10 acceptance items "§9.1 hierarchy replay", "comparator signature" and the guidance rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_COMPARATOR,
  AUTHORITY_RANK,
  GUIDANCE_OR_NON_OPERATIVE_LEVELS,
  OPERATIVE_OR_BINDING_LEVELS,
  UNKNOWN_AUTHORITY_RANK,
  authorityRank,
  compareAuthority,
  guidanceCannotOutrank,
} from '../../src/legal/index.js';
import { AUTHORITY_LEVEL_VALUES, type AuthorityLevel } from '../../src/legal/contracts.js';
import { PACKAGE_ROOT, loadHierarchy } from './fixture.js';

const fixture = loadHierarchy();
const LEVELS = AUTHORITY_LEVEL_VALUES;

describe('§9.1 hierarchy replay (fixture ↔ AUTHORITY_RANK ↔ packages/contracts)', () => {
  it('the fixture transcribes eight levels, ranked 1..8', () => {
    expect(fixture.levels).toHaveLength(8);
    expect(fixture.levels.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const row of fixture.levels) {
      expect(row.prdText.length, row.level).toBeGreaterThan(0);
      expect(row.prdText.endsWith('.'), row.level).toBe(true);
    }
  });

  it("the fixture's level order IS packages/contracts' AUTHORITY_LEVEL_VALUES order", () => {
    expect(fixture.levels.map((row) => row.level)).toEqual([...LEVELS]);
  });

  it('AUTHORITY_RANK matches the fixture in order and identifier', () => {
    for (const row of fixture.levels) {
      expect(AUTHORITY_RANK[row.level as AuthorityLevel], row.level).toBe(row.rank);
    }
    expect(Object.keys(AUTHORITY_RANK)).toEqual([...LEVELS]);
  });

  it('transcribes the §9.1 closing rule that this module encodes', () => {
    expect(fixture.closingRule).toContain(
      'Guidance MUST NOT silently override legislation, an operative instrument or binding authority.',
    );
  });

  it('groups ranks 1-4 and 6-8 as the operative and guidance families', () => {
    expect(OPERATIVE_OR_BINDING_LEVELS).toEqual(LEVELS.slice(0, 4));
    expect(GUIDANCE_OR_NON_OPERATIVE_LEVELS).toEqual(LEVELS.slice(5, 8));
  });

  it('is deep-frozen (a process-lifetime singleton read by every in-flight request)', () => {
    expect(Object.isFrozen(AUTHORITY_RANK)).toBe(true);
    expect(Object.isFrozen(OPERATIVE_OR_BINDING_LEVELS)).toBe(true);
    expect(Object.isFrozen(GUIDANCE_OR_NON_OPERATIVE_LEVELS)).toBe(true);
  });
});

describe('authorityRank fails closed', () => {
  it('ranks an unknown level below every known level', () => {
    expect(UNKNOWN_AUTHORITY_RANK).toBe(9);
    for (const value of ['MADE_UP_LEVEL', '', 'constitution_and_legislation', 'toString']) {
      expect(authorityRank(value), value).toBe(UNKNOWN_AUTHORITY_RANK);
    }
    for (const level of LEVELS) {
      expect(authorityRank(level)).toBeLessThan(UNKNOWN_AUTHORITY_RANK);
    }
  });

  it('does not inherit ranks from Object.prototype', () => {
    expect(authorityRank('constructor')).toBe(UNKNOWN_AUTHORITY_RANK);
    expect(authorityRank('hasOwnProperty')).toBe(UNKNOWN_AUTHORITY_RANK);
  });

  it('is total for non-string input', () => {
    for (const value of [null, undefined, 3, {}]) {
      expect(() => authorityRank(value as unknown as string)).not.toThrow();
      expect(authorityRank(value as unknown as string)).toBe(UNKNOWN_AUTHORITY_RANK);
    }
  });
});

describe('compareAuthority DIRECTION (sub-PRD D11 / plan OQ-5)', () => {
  const CONTRACT =
    'src/answers/ports.ts (FND-07, merged) fixes the direction: -1 when `a` is LOWER authority than `b`';

  it('returns 1 when `a` is the HIGHER authority', () => {
    expect(
      compareAuthority('CONSTITUTION_AND_LEGISLATION', 'OFFICIAL_REGULATOR_GUIDANCE'),
      CONTRACT,
    ).toBe(1);
  });

  it('returns -1 when `a` is the LOWER authority', () => {
    expect(
      compareAuthority('OFFICIAL_REGULATOR_GUIDANCE', 'CONSTITUTION_AND_LEGISLATION'),
      CONTRACT,
    ).toBe(-1);
  });

  it('returns 0 for every level against itself', () => {
    for (const level of LEVELS) expect(compareAuthority(level, level), level).toBe(0);
  });

  it('is a total order over all 64 ordered pairs: values, antisymmetry, and 0 iff equal', () => {
    for (const a of LEVELS) {
      for (const b of LEVELS) {
        const result = compareAuthority(a, b);
        expect([-1, 0, 1], `${a} vs ${b}`).toContain(result);
        // `+` rather than `toBe(-compare(b, a))`: `-0` and `0` are different under `Object.is`.
        expect(result + compareAuthority(b, a), `antisymmetry ${a}/${b}`).toBe(0);
        expect(result === 0, `0 iff equal, ${a}/${b}`).toBe(a === b);
      }
    }
  });

  it('is transitive', () => {
    for (const a of LEVELS) {
      for (const b of LEVELS) {
        for (const c of LEVELS) {
          if (compareAuthority(a, b) > 0 && compareAuthority(b, c) > 0) {
            expect(compareAuthority(a, c), `${a} > ${b} > ${c}`).toBe(1);
          }
        }
      }
    }
  });

  it('agrees with the §9.1 rank ordering for every pair', () => {
    for (const a of LEVELS) {
      for (const b of LEVELS) {
        const expected = AUTHORITY_RANK[a] === AUTHORITY_RANK[b] ? 0 : AUTHORITY_RANK[a] < AUTHORITY_RANK[b] ? 1 : -1;
        expect(compareAuthority(a, b), `${a} vs ${b}`).toBe(expected);
      }
    }
  });

  it('an unknown level never outranks a known one, and two unknowns compare equal', () => {
    const unknown = 'MADE_UP_LEVEL' as AuthorityLevel;
    for (const level of LEVELS) {
      expect(compareAuthority(unknown, level), level).toBe(-1);
      expect(compareAuthority(level, unknown), level).toBe(1);
    }
    expect(compareAuthority(unknown, 'ALSO_MADE_UP' as AuthorityLevel)).toBe(0);
  });

  it('AUTHORITY_COMPARATOR is the exported port value and behaves identically', () => {
    for (const a of LEVELS) {
      for (const b of LEVELS) {
        expect(AUTHORITY_COMPARATOR(a, b)).toBe(compareAuthority(a, b));
      }
    }
  });
});

describe('comparator signature does not drift (sub-PRD D11 structural port)', () => {
  const SIGNATURE = '(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1';
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'legal', 'authority.ts'), 'utf8');

  it('the matcher fires on a positive control (it is not vacuous)', () => {
    expect(`export type AuthorityComparator = ${SIGNATURE};`).toContain(SIGNATURE);
    expect('export type Other = (a: string) => number;').not.toContain(SIGNATURE);
  });

  it('src/legal/authority.ts declares exactly the D11 signature', () => {
    expect(
      source,
      'FND-07 satisfies this port structurally; the signature must not drift (sub-PRD D11)',
    ).toContain(SIGNATURE);
  });

  it('binds compareAuthority to the port type, so `pnpm typecheck` enforces it', () => {
    expect(source).toContain('export const AUTHORITY_COMPARATOR: AuthorityComparator = compareAuthority;');
  });
});

describe('guidanceCannotOutrank — TRUE means the placement is PERMITTED', () => {
  it('is FALSE when guidance (rank 6) would be placed above legislation (rank 1)', () => {
    expect(guidanceCannotOutrank('OFFICIAL_REGULATOR_GUIDANCE', 'CONSTITUTION_AND_LEGISLATION')).toBe(false);
  });

  it('is TRUE when legislation (rank 1) is placed above guidance (rank 6)', () => {
    expect(guidanceCannotOutrank('CONSTITUTION_AND_LEGISLATION', 'OFFICIAL_REGULATOR_GUIDANCE')).toBe(true);
  });

  it('is FALSE for every rank 6-8 over every rank 1-4 pairing', () => {
    for (const higher of GUIDANCE_OR_NON_OPERATIVE_LEVELS) {
      for (const lower of OPERATIVE_OR_BINDING_LEVELS) {
        expect(guidanceCannotOutrank(higher, lower), `${higher} over ${lower}`).toBe(false);
      }
    }
  });

  it('is TRUE for equal levels', () => {
    for (const level of LEVELS) expect(guidanceCannotOutrank(level, level), level).toBe(true);
  });

  it('is TRUE for rank 5 (persuasive decisions) over rank 1 — persuasive material is not guidance', () => {
    expect(guidanceCannotOutrank('PERSUASIVE_DECISIONS', 'CONSTITUTION_AND_LEGISLATION')).toBe(true);
  });

  it('is TRUE for guidance over rank 5 — §9.1 protects ranks 1-4', () => {
    expect(guidanceCannotOutrank('OFFICIAL_REGULATOR_GUIDANCE', 'PERSUASIVE_DECISIONS')).toBe(true);
  });

  it('is FALSE for an UNKNOWN level over legislation (unknown ranks 9, below everything)', () => {
    expect(guidanceCannotOutrank('MADE_UP_LEVEL', 'CONSTITUTION_AND_LEGISLATION')).toBe(false);
  });

  it('is total for junk input', () => {
    for (const value of [null, undefined, 5, {}]) {
      expect(() =>
        guidanceCannotOutrank(value as unknown as string, value as unknown as string),
      ).not.toThrow();
    }
  });
});
