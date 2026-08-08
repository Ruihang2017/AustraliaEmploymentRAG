/**
 * FND-08 acceptance item 3 — `[machine]` actor enforcement over all twelve transitions.
 */
import { describe, expect, it } from 'vitest';

import { WORKFLOW_ACTOR_VALUES, isWorkflowActor } from '../../src/workflow/actors.js';
import { WORKFLOW_CONDITION_VALUES } from '../../src/workflow/conditions.js';
import { canTransition } from '../../src/workflow/can-transition.js';
import { TRANSITIONS } from '../../src/workflow/transitions.js';

const ALL_CONDITIONS = [...WORKFLOW_CONDITION_VALUES];

describe('the actor vocabulary', () => {
  it('is the five §32.6 capacities, lower case as the ticket spells them', () => {
    expect([...WORKFLOW_ACTOR_VALUES]).toEqual([
      'owner',
      'researcher',
      'reviewer',
      'system',
      'admin',
    ]);
  });

  it('guards against every non-member value', () => {
    for (const actor of WORKFLOW_ACTOR_VALUES) expect(isWorkflowActor(actor)).toBe(true);
    for (const value of ['OWNER', 'Owner', 'nobody', '', ' owner', undefined, null, 7, {}, []]) {
      expect(isWorkflowActor(value), `${String(value)} should not be an actor`).toBe(false);
    }
  });
});

describe('actor enforcement', () => {
  for (const transition of TRANSITIONS) {
    const label = `${transition.from}->${transition.to}`;

    it(`${label} accepts exactly its §32.6 actors`, () => {
      for (const actor of transition.allowedActors) {
        const decision = canTransition({
          from: transition.from,
          to: transition.to,
          actor,
          conditions: ALL_CONDITIONS,
        });
        expect(decision.ok, `${label}: allowed actor ${actor} was rejected`).toBe(true);
      }
    });

    it(`${label} rejects every other actor with ACTOR_NOT_PERMITTED`, () => {
      const outsiders = [
        ...WORKFLOW_ACTOR_VALUES.filter((actor) => !transition.allowedActors.includes(actor)),
        'nobody',
        '',
        'OWNER',
      ];
      expect(outsiders.length, `${label}: no outsider to test`).toBeGreaterThan(0);
      for (const actor of outsiders) {
        const decision = canTransition({
          from: transition.from,
          to: transition.to,
          actor,
          conditions: ALL_CONDITIONS,
        });
        expect(decision, `${label}: actor "${actor}" should be ACTOR_NOT_PERMITTED`).toEqual({
          ok: false,
          reason: 'ACTOR_NOT_PERMITTED',
        });
      }
    });
  }

  it('lets `system` act only on the three → REVIEW_REQUIRED rows (the WTCH-03 contract)', () => {
    const systemPairs = TRANSITIONS.filter((transition) =>
      transition.allowedActors.includes('system'),
    ).map((transition) => `${transition.from}->${transition.to}`);
    expect(systemPairs).toEqual([
      'DRAFT->REVIEW_REQUIRED',
      'IN_REVIEW->REVIEW_REQUIRED',
      'CUSTOMER_REVIEWED->REVIEW_REQUIRED',
    ]);
  });

  it('checks the pair before the actor, so an invalid pair never leaks ACTOR_NOT_PERMITTED', () => {
    expect(
      canTransition({
        from: 'CUSTOMER_REVIEWED',
        to: 'IN_REVIEW',
        actor: 'nobody',
        conditions: ALL_CONDITIONS,
      }),
    ).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
  });
});
