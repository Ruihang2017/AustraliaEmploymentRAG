/**
 * FND-06 acceptance item 12 (`[machine]`) and deliverable 7 — `evaluate()` is a pure function
 * (PRD §45.2, §39.1): the same input yields the same output, the input is not mutated, and the module
 * reads no clock, no environment variable and no random source.
 *
 * The "reads no clock" half is a static assertion in `package-purity.test.ts`; this file proves the
 * observable behaviour.
 */
import { describe, expect, it } from 'vitest';

import { PERMISSION_VALUES } from '../../../contracts/src/enums/index.js';
import { evaluate } from '../../src/access/index.js';
import {
  caseLabel,
  randomAction,
  randomContext,
  randomPrincipal,
  randomResource,
  rngFor,
} from './arbitrary.js';
import { ORGANIZATION_ID, principalFor } from './scenario.js';

const CASES = 1_000;

describe('determinism and purity', () => {
  it(`returns the same decision twice for ${CASES} generated inputs`, () => {
    const rng = rngFor('determinism');
    for (let index = 0; index < CASES; index += 1) {
      const input = {
        principal: randomPrincipal(rng, ORGANIZATION_ID),
        action: randomAction(rng),
        resource: randomResource(rng, ORGANIZATION_ID),
        context: randomContext(rng),
      };
      const first = evaluate(input);
      const second = evaluate(input);
      expect(second, caseLabel(index, input)).toEqual(first);
    }
  });

  it('does not mutate its input, even a deeply frozen one', () => {
    const rng = rngFor('no-mutation');
    for (let index = 0; index < CASES; index += 1) {
      const input = {
        principal: randomPrincipal(rng, ORGANIZATION_ID),
        action: randomAction(rng),
        resource: randomResource(rng, ORGANIZATION_ID),
        context: randomContext(rng),
      };
      const snapshot = structuredClone(input);
      const frozen = {
        ...input,
        principal: Object.freeze({ ...input.principal }),
        resource: Object.freeze({ ...input.resource }),
        context: Object.freeze({ ...input.context }),
      };
      Object.freeze(frozen);
      expect(Object.isFrozen(frozen)).toBe(true);
      evaluate(frozen);
      expect(input, caseLabel(index, input)).toEqual(snapshot);
    }
  });

  it('is order-independent across actions: evaluating one action never affects the next', () => {
    const principal = principalFor('RESEARCHER');
    const context = { intent: 'READ' } as const;
    const firstPass = PERMISSION_VALUES.map((action) => evaluate({ principal, action, context }));
    const secondPass = [...PERMISSION_VALUES]
      .reverse()
      .map((action) => evaluate({ principal, action, context }))
      .reverse();
    expect(secondPass).toEqual(firstPass);
  });
});
