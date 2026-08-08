/**
 * FND-08 acceptance item 4 — `[machine]` condition enforcement.
 *
 * One dedicated `it()` per named condition (not a single "conditions unmet" case), plus the
 * `satisfiedConditions` derivation table, which is what stops a caller asserting a condition it has
 * not actually met.
 */
import { describe, expect, it } from 'vitest';

import {
  MATERIAL_TRIGGER_VALUES,
  WORKFLOW_CONDITION_VALUES,
  isMaterialTrigger,
  isWorkflowCondition,
  type WorkflowCondition,
} from '../../src/workflow/conditions.js';
import { canTransition } from '../../src/workflow/can-transition.js';
import {
  satisfiedConditions,
  type RecordWorkflowSnapshot,
  type TransitionRequest,
} from '../../src/workflow/apply-transition.js';
import { TRANSITIONS } from '../../src/workflow/transitions.js';

const ALL_CONDITIONS = [...WORKFLOW_CONDITION_VALUES];

function transitionRequiring(condition: WorkflowCondition) {
  const found = TRANSITIONS.find((transition) => transition.conditions.includes(condition));
  if (!found) throw new Error(`no PRD §32.6 transition requires ${condition}`);
  return found;
}

describe('the condition vocabulary', () => {
  it('is the seven §32.6 conditions in ticket order', () => {
    expect([...WORKFLOW_CONDITION_VALUES]).toEqual([
      'REVIEWER_ASSIGNED',
      'AT_LEAST_ONE_SAVED_ANSWER',
      'REASON_REQUIRED',
      'DISCLAIMER_ACKNOWLEDGED',
      'MATERIAL_TRIGGER',
      'REPLACEMENT_OR_RERUN_LINKED',
      'CONFIRMATION',
    ]);
    for (const value of ['reviewer_assigned', 'REVIEWER-ASSIGNED', '', undefined, 7]) {
      expect(isWorkflowCondition(value)).toBe(false);
    }
  });

  it('names three material triggers for the §32.6 "correction, source change or material issue"', () => {
    expect([...MATERIAL_TRIGGER_VALUES]).toEqual(['CORRECTION', 'SOURCE_CHANGE', 'MATERIAL_ISSUE']);
    for (const value of ['correction', 'WHATEVER', '', undefined, null, 0]) {
      expect(isMaterialTrigger(value)).toBe(false);
    }
  });

  it('has every condition required by at least one transition', () => {
    for (const condition of WORKFLOW_CONDITION_VALUES) {
      expect(
        TRANSITIONS.some((transition) => transition.conditions.includes(condition)),
        `${condition} is required by no transition — it would be untestable`,
      ).toBe(true);
    }
  });
});

describe('condition enforcement, one case per named condition', () => {
  for (const condition of WORKFLOW_CONDITION_VALUES) {
    it(`rejects with CONDITION_NOT_MET naming ${condition}`, () => {
      const transition = transitionRequiring(condition);
      const actor = transition.allowedActors[0];
      expect(actor).toBeDefined();
      const decision = canTransition({
        from: transition.from,
        to: transition.to,
        actor: actor ?? 'owner',
        conditions: ALL_CONDITIONS.filter((candidate) => candidate !== condition),
      });

      expect(
        decision.ok,
        `${transition.from}->${transition.to} was permitted without ${condition}`,
      ).toBe(false);
      if (decision.ok) return;
      expect(decision.reason).toBe('CONDITION_NOT_MET');
      if (decision.reason !== 'CONDITION_NOT_MET') return;
      expect(
        [...decision.missingConditions],
        `${transition.from}->${transition.to} should report exactly [${condition}]`,
      ).toEqual([condition]);
    });
  }

  it('reports every unmet condition, in the transition declared order', () => {
    const transition = TRANSITIONS.find((candidate) => candidate.conditions.length > 1);
    expect(transition).toBeDefined();
    if (!transition) return;
    const actor = transition.allowedActors[0] ?? 'owner';
    const decision = canTransition({
      from: transition.from,
      to: transition.to,
      actor,
      conditions: [],
    });
    expect(decision.ok).toBe(false);
    if (decision.ok || decision.reason !== 'CONDITION_NOT_MET') throw new Error('expected CONDITION_NOT_MET');
    expect([...decision.missingConditions]).toEqual([...transition.conditions]);
  });

  it('ignores unknown and duplicated tokens in the satisfied set', () => {
    const transition = transitionRequiring('CONFIRMATION');
    const actor = transition.allowedActors[0] ?? 'owner';
    expect(
      canTransition({
        from: transition.from,
        to: transition.to,
        actor,
        conditions: ['CONFIRMATION', 'CONFIRMATION', 'NOT_A_CONDITION', '__proto__', ''],
      }).ok,
    ).toBe(true);
    expect(
      canTransition({
        from: transition.from,
        to: transition.to,
        actor,
        conditions: ['NOT_A_CONDITION', 'confirmation'],
      }).ok,
      'a lower-case or unknown token must not satisfy CONFIRMATION',
    ).toBe(false);
  });
});

describe('satisfiedConditions derivation', () => {
  const record: RecordWorkflowSnapshot = {
    id: 'rec_0193',
    state: 'DRAFT',
    rowVersion: 3,
    reviewerAssigned: true,
    savedAnswerCount: 2,
  };

  const derive = (
    overrides: Partial<RecordWorkflowSnapshot>,
    request: TransitionRequest,
  ): readonly WorkflowCondition[] => satisfiedConditions({ ...record, ...overrides }, request);

  const base: TransitionRequest = { to: 'IN_REVIEW', actor: 'owner' };

  it('derives record facts from the snapshot, not from the request', () => {
    expect(derive({}, base)).toContain('REVIEWER_ASSIGNED');
    expect(derive({ reviewerAssigned: false }, base)).not.toContain('REVIEWER_ASSIGNED');
    expect(derive({}, base)).toContain('AT_LEAST_ONE_SAVED_ANSWER');
    expect(derive({ savedAnswerCount: 1 }, base)).toContain('AT_LEAST_ONE_SAVED_ANSWER');
    expect(derive({ savedAnswerCount: 0 }, base)).not.toContain('AT_LEAST_ONE_SAVED_ANSWER');
    expect(derive({ savedAnswerCount: 1.5 }, base)).not.toContain('AT_LEAST_ONE_SAVED_ANSWER');
    expect(derive({ savedAnswerCount: -1 }, base)).not.toContain('AT_LEAST_ONE_SAVED_ANSWER');
  });

  it('does not accept a blank reason as REASON_REQUIRED', () => {
    expect(derive({}, { ...base, reason: 'supersedes turn 4' })).toContain('REASON_REQUIRED');
    expect(derive({}, { ...base, reason: '   ' })).not.toContain('REASON_REQUIRED');
    expect(derive({}, { ...base, reason: '' })).not.toContain('REASON_REQUIRED');
    expect(derive({}, base)).not.toContain('REASON_REQUIRED');
  });

  it('requires a strict `true` for DISCLAIMER_ACKNOWLEDGED and CONFIRMATION', () => {
    expect(derive({}, { ...base, disclaimerAcknowledged: true })).toContain(
      'DISCLAIMER_ACKNOWLEDGED',
    );
    expect(
      derive({}, { ...base, disclaimerAcknowledged: 'yes' as unknown as boolean }),
      'a truthy non-boolean is not an acknowledgement',
    ).not.toContain('DISCLAIMER_ACKNOWLEDGED');
    expect(derive({}, { ...base, confirmed: true })).toContain('CONFIRMATION');
    expect(derive({}, { ...base, confirmed: 1 as unknown as boolean })).not.toContain(
      'CONFIRMATION',
    );
  });

  it('accepts only a known MaterialTrigger', () => {
    for (const trigger of MATERIAL_TRIGGER_VALUES) {
      expect(derive({}, { ...base, trigger })).toContain('MATERIAL_TRIGGER');
    }
    expect(derive({}, { ...base, trigger: 'WHATEVER' })).not.toContain('MATERIAL_TRIGGER');
    expect(derive({}, { ...base, trigger: '' })).not.toContain('MATERIAL_TRIGGER');
  });

  it('does not accept a blank replacement reference', () => {
    expect(derive({}, { ...base, replacementRef: 'ans_01' })).toContain(
      'REPLACEMENT_OR_RERUN_LINKED',
    );
    expect(derive({}, { ...base, replacementRef: ' ' })).not.toContain(
      'REPLACEMENT_OR_RERUN_LINKED',
    );
  });

  it('returns a frozen list in WORKFLOW_CONDITION_VALUES order', () => {
    const derived = derive(
      {},
      { ...base, reason: 'r', disclaimerAcknowledged: true, confirmed: true },
    );
    expect(Object.isFrozen(derived)).toBe(true);
    expect([...derived]).toEqual(
      WORKFLOW_CONDITION_VALUES.filter((condition) => derived.includes(condition)),
    );
  });
});
