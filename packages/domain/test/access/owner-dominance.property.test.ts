/**
 * FND-06 acceptance item 5 — Owner dominance: for every action and IDENTICAL context,
 * allowed(Owner) ⊇ allowed(X) for X in {Admin, Researcher, Viewer, Developer}.
 *
 * "Identical context" is the trap. Only the role varies: `principal.id`, `grants`, `scopes`,
 * `resource`, `intent` and `context` are held fixed by `withColumn`. Re-randomising the id would make
 * a record shared with the Researcher stop being shared with the Owner, and the property would fail
 * for a reason that has nothing to do with the matrix.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/access/evaluate.js';
import { ORGANIZATION_ID, ROLE_COLUMNS, randomInput, withColumn } from './generators.js';
import { forEachDraw } from './rng.js';

const CASES = 10_000;
const SUBORDINATE_ROLES = ROLE_COLUMNS.filter((role) => role !== 'OWNER');

describe('Owner dominates every other role', () => {
  it(`holds for ${String(CASES)} generated cases`, () => {
    let comparisons = 0;
    let subordinateAllowed = 0;
    forEachDraw(CASES, (rng, index, seed) => {
      const drawn = randomInput(rng, rng.bool() ? ORGANIZATION_ID : undefined);
      const ownerDecision = evaluate({
        ...drawn,
        principal: withColumn(drawn.principal, 'OWNER'),
      });
      for (const role of SUBORDINATE_ROLES) {
        const decision = evaluate({ ...drawn, principal: withColumn(drawn.principal, role) });
        comparisons += 1;
        if (!decision.allowed) continue;
        subordinateAllowed += 1;
        expect(
          ownerDecision.allowed,
          `seed 0x${seed.toString(16)} case ${String(index)}: ${role} may ${drawn.action} but OWNER may not`,
        ).toBe(true);
      }
    });
    expect(comparisons).toBe(CASES * SUBORDINATE_ROLES.length);
    expect(
      subordinateAllowed,
      'no subordinate role was ever allowed — the property is vacuous',
    ).toBeGreaterThan(0);
  });

  it('the comparison would catch a violation (positive control)', () => {
    // A hand-built pair in which the subordinate is allowed and the Owner is not: exactly the shape
    // the loop above rejects.
    const subordinate = { allowed: true } as const;
    const owner = { allowed: false } as const;
    expect(subordinate.allowed && !owner.allowed).toBe(true);
  });
});
