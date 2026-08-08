/**
 * FND-08 acceptance items 2 and 9 — `[machine]` exhaustive closure and the enum-coverage guard.
 *
 * The 25 ordered pairs are enumerated PROGRAMMATICALLY from `RECORD_WORKFLOW_STATE_VALUES`, never
 * from a hand-written list: a sixth state added in FND-03 without its transition rows must fail here
 * rather than pass silently.
 */
import { describe, expect, it } from 'vitest';

import { WORKFLOW_ACTOR_VALUES } from '../../src/workflow/actors.js';
import { WORKFLOW_CONDITION_VALUES } from '../../src/workflow/conditions.js';
import { RECORD_WORKFLOW_STATE_VALUES } from '../../src/workflow/contracts.js';
import { canTransition } from '../../src/workflow/can-transition.js';
import {
  TRANSITIONS,
  TRANSITION_INDEX,
  buildTransitionIndex,
  transitionKey,
} from '../../src/workflow/transitions.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();
const ALL_CONDITIONS = [...WORKFLOW_CONDITION_VALUES];

/** Every ordered pair of states, derived from the enum. */
const orderedPairs = RECORD_WORKFLOW_STATE_VALUES.flatMap((from) =>
  RECORD_WORKFLOW_STATE_VALUES.map((to) => ({ from, to })),
);

/** Permitted for SOME actor, with every condition satisfied — i.e. the pair itself is representable. */
function isRepresentable(from: string, to: string): boolean {
  return WORKFLOW_ACTOR_VALUES.some(
    (actor) => canTransition({ from, to, actor, conditions: ALL_CONDITIONS }).ok,
  );
}

describe('exhaustive closure over every ordered state pair', () => {
  it('examines exactly 25 pairs (non-vacuity)', () => {
    expect(RECORD_WORKFLOW_STATE_VALUES).toHaveLength(5);
    expect(orderedPairs).toHaveLength(25);
  });

  it('permits exactly the twelve PRD §32.6 pairs', () => {
    const permitted = orderedPairs
      .filter(({ from, to }) => isRepresentable(from, to))
      .map(({ from, to }) => transitionKey(from, to))
      .sort();
    const expected = fixture.expansion.map((entry) => transitionKey(entry.from, entry.to)).sort();

    const extra = permitted.filter((key) => !expected.includes(key));
    const absent = expected.filter((key) => !permitted.includes(key));
    expect(extra, `pairs permitted but not in PRD §32.6: ${extra.join(', ')}`).toEqual([]);
    expect(absent, `PRD §32.6 pairs not permitted: ${absent.join(', ')}`).toEqual([]);
    expect(permitted).toHaveLength(12);
  });

  it('rejects the other thirteen with INVALID_TRANSITION, for every actor', () => {
    const expected = new Set(
      fixture.expansion.map((entry) => transitionKey(entry.from, entry.to)),
    );
    const invalid = orderedPairs.filter(({ from, to }) => !expected.has(transitionKey(from, to)));
    expect(invalid).toHaveLength(13);

    for (const { from, to } of invalid) {
      for (const actor of WORKFLOW_ACTOR_VALUES) {
        const decision = canTransition({ from, to, actor, conditions: ALL_CONDITIONS });
        expect(decision.ok, `${from}->${to} was permitted for ${actor}`).toBe(false);
        expect(
          decision.ok ? null : decision.reason,
          `${from}->${to} (${actor}) should be INVALID_TRANSITION`,
        ).toBe('INVALID_TRANSITION');
      }
    }
  });

  it('rejects all five self-transitions', () => {
    for (const state of RECORD_WORKFLOW_STATE_VALUES) {
      for (const actor of WORKFLOW_ACTOR_VALUES) {
        const decision = canTransition({
          from: state,
          to: state,
          actor,
          conditions: ALL_CONDITIONS,
        });
        expect(decision, `self-transition ${state}->${state} for ${actor}`).toEqual({
          ok: false,
          reason: 'INVALID_TRANSITION',
        });
      }
    }
  });
});

describe('enum-coverage guard', () => {
  it('has the fixture state list in step with the contracts enum', () => {
    expect(
      fixture.states,
      'RECORD_WORKFLOW_STATE_VALUES changed without updating prd-32-6-transitions.json',
    ).toEqual([...RECORD_WORKFLOW_STATE_VALUES]);
  });

  it('gives every state at least one outgoing and one incoming transition', () => {
    const orphanFrom = RECORD_WORKFLOW_STATE_VALUES.filter(
      (state) => !TRANSITIONS.some((transition) => transition.from === state),
    );
    const orphanTo = RECORD_WORKFLOW_STATE_VALUES.filter(
      (state) => !TRANSITIONS.some((transition) => transition.to === state),
    );
    expect(
      orphanFrom,
      `state(s) with no outgoing PRD §32.6 transition: ${orphanFrom.join(', ')}`,
    ).toEqual([]);
    expect(
      orphanTo,
      `state(s) with no incoming PRD §32.6 transition: ${orphanTo.join(', ')}`,
    ).toEqual([]);
  });

  it('names only known states in the table', () => {
    for (const transition of TRANSITIONS) {
      expect(RECORD_WORKFLOW_STATE_VALUES as readonly string[]).toContain(transition.from);
      expect(RECORD_WORKFLOW_STATE_VALUES as readonly string[]).toContain(transition.to);
    }
  });
});

describe('transition index integrity', () => {
  it('indexes every transition exactly once', () => {
    expect(TRANSITION_INDEX.size).toBe(TRANSITIONS.length);
    for (const transition of TRANSITIONS) {
      expect(TRANSITION_INDEX.get(transitionKey(transition.from, transition.to))).toBe(transition);
    }
  });

  it('refuses to load an ambiguous table, naming the duplicate pair', () => {
    const first = TRANSITIONS[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(() => buildTransitionIndex([...TRANSITIONS, first])).toThrow(
      /duplicate workflow transition DRAFT->IN_REVIEW/,
    );
  });

  it('cannot be reached through the prototype chain', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(
        canTransition({ from: key, to: 'DRAFT', actor: 'owner', conditions: ALL_CONDITIONS }),
        `from: ${key}`,
      ).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
      expect(
        canTransition({ from: 'DRAFT', to: key, actor: 'owner', conditions: ALL_CONDITIONS }),
        `to: ${key}`,
      ).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    }
  });

  it('is total over garbage input and never throws', () => {
    const garbage: unknown[] = [undefined, null, 42, {}, [], '', 'DRAFTS', Symbol.iterator];
    for (const value of garbage) {
      expect(() =>
        canTransition({
          from: value as string,
          to: value as string,
          actor: value as string,
          conditions: [],
        }),
      ).not.toThrow();
      expect(
        canTransition({
          from: value as string,
          to: 'DRAFT',
          actor: 'owner',
          conditions: ALL_CONDITIONS,
        }).ok,
      ).toBe(false);
    }
  });
});

describe('table immutability (Object.freeze is shallow — every level is frozen)', () => {
  it('freezes the table, each row and each nested array', () => {
    expect(Object.isFrozen(TRANSITIONS)).toBe(true);
    for (const transition of TRANSITIONS) {
      expect(Object.isFrozen(transition)).toBe(true);
      expect(Object.isFrozen(transition.allowedActors)).toBe(true);
      expect(Object.isFrozen(transition.conditions)).toBe(true);
    }
    expect(Object.isFrozen(WORKFLOW_ACTOR_VALUES)).toBe(true);
    expect(Object.isFrozen(WORKFLOW_CONDITION_VALUES)).toBe(true);
  });

  it('throws on mutation (ESM modules are strict mode)', () => {
    const first = TRANSITIONS[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(() => {
      (first as { from: string }).from = 'ARCHIVED';
    }).toThrow(TypeError);
    expect(() => {
      (first.allowedActors as string[]).push('intruder');
    }).toThrow(TypeError);
    expect(() => {
      (first.conditions as string[]).push('INTRUDER');
    }).toThrow(TypeError);
    expect(() => {
      (TRANSITIONS as unknown[]).push({});
    }).toThrow(TypeError);
  });
});
