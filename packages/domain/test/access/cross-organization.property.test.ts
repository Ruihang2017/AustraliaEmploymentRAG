/**
 * FND-06 acceptance item 3 (`[machine]`, requirement **SEC-001**; PRD §21.2 "Authorise before
 * lookup", PRD §38.1 "a role alone never authorises a record from another organisation").
 *
 * ≥ 10,000 generated cases: for **any** valid principal, role, grant set, scope set, action and
 * context, a resource belonging to another organisation is denied with `CROSS_ORGANIZATION`.
 *
 * NON-VACUITY (the ticket's Reviewer step 3): the same generator, with the organisations *matching*,
 * must produce allows. A generator that emitted invalid principals would satisfy the property at the
 * membership step and prove nothing, so that control runs in this file, not in a reviewer's head.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../../src/access/index.js';
import {
  caseLabel,
  randomAction,
  randomContext,
  randomPrincipal,
  randomResource,
  rngFor,
} from './arbitrary.js';
import { ORGANIZATION_ID, OTHER_ORGANIZATION_ID } from './scenario.js';

const CASES = 10_000;

describe('cross-organisation short-circuit (SEC-001)', () => {
  it(`denies every one of ${CASES} generated cross-organisation cases`, () => {
    const rng = rngFor('cross-organisation');
    for (let index = 0; index < CASES; index += 1) {
      const principal = randomPrincipal(rng, ORGANIZATION_ID);
      const action = randomAction(rng);
      const resource = randomResource(rng, OTHER_ORGANIZATION_ID);
      const context = randomContext(rng);
      const decision = evaluate({ principal, action, resource, context });
      expect(
        decision,
        caseLabel(index, { principal, action, resource, context }),
      ).toEqual({ allowed: false, reason: 'CROSS_ORGANIZATION' });
    }
  });

  it('is not vacuous: the same generator produces allows when the organisations match', () => {
    const rng = rngFor('cross-organisation');
    let allowed = 0;
    let denied = 0;
    for (let index = 0; index < CASES; index += 1) {
      const principal = randomPrincipal(rng, ORGANIZATION_ID);
      const action = randomAction(rng);
      const resource = randomResource(rng, ORGANIZATION_ID);
      const context = randomContext(rng);
      if (evaluate({ principal, action, resource, context }).allowed) allowed += 1;
      else denied += 1;
    }
    expect(allowed, 'the generator never produces an allow — the property is vacuous').toBeGreaterThan(
      CASES / 20,
    );
    expect(denied).toBeGreaterThan(0);
  });

  it('never produces a principal the membership step rejects (the generator is valid by construction)', () => {
    const rng = rngFor('validity');
    for (let index = 0; index < 1_000; index += 1) {
      const principal = randomPrincipal(rng, ORGANIZATION_ID);
      const decision = evaluate({
        principal,
        action: 'CORPUS_SEARCH_READ',
        context: { intent: 'READ' },
      });
      expect(decision, caseLabel(index, principal)).not.toEqual({
        allowed: false,
        reason: 'NOT_A_MEMBER',
      });
    }
  });
});
