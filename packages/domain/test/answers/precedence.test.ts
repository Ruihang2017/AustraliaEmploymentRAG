/**
 * FND-07 acceptance item 3 — `[fixture]` sub-PRD D13 precedence: for every pair of simultaneously-true
 * conditions the returned status is the more restrictive one, and the returned condition list contains
 * BOTH.
 */
import { describe, expect, it } from 'vitest';

import { STATUS_PRECEDENCE, decideAnswerStatus, statusOfCondition } from '../../src/answers/index.js';
import { derivedCondition, loadFixture } from './fixture.js';

const fixture = loadFixture();

describe('sub-PRD D13 precedence', () => {
  it('enumerates at least one case per restrictive pair (10 pairs) plus multi-condition cases', () => {
    expect(fixture.precedence.cases.length).toBeGreaterThanOrEqual(10);
    const pairs = new Set(
      fixture.precedence.cases
        .filter((testCase) => testCase.expected_conditions.length === 3)
        .map((testCase) => testCase.expected_conditions.slice(0, 2).join('+')),
    );
    expect(pairs.size, 'every ordered restrictive pair must appear').toBe(10);
    expect(
      fixture.precedence.cases.some((testCase) => testCase.expected_conditions.length > 3),
      'at least one case with three or more simultaneous conditions',
    ).toBe(true);
  });

  for (const testCase of fixture.precedence.cases) {
    it(`${testCase.name}: the more restrictive status wins`, () => {
      const decision = decideAnswerStatus(testCase.signals);
      expect(decision.status).toBe(testCase.expected_status);
    });

    it(`${testCase.name}: every fired condition is reported, in precedence order`, () => {
      const decision = decideAnswerStatus(testCase.signals);
      expect(decision.firedConditions).toEqual(testCase.expected_conditions);
      // And each is genuinely no more permissive than the winner.
      const winnerRank = STATUS_PRECEDENCE.indexOf(testCase.expected_status);
      for (const condition of decision.firedConditions) {
        expect(STATUS_PRECEDENCE.indexOf(statusOfCondition(condition))).toBeGreaterThanOrEqual(
          winnerRank,
        );
      }
    });
  }
});

describe('sub-PRD D13a — the derived condition', () => {
  const derived = derivedCondition(fixture, 'MATERIAL_CLAIMS_UNSUPPORTED');

  for (const testCase of derived.cases) {
    it(`${testCase.name}`, () => {
      const decision = decideAnswerStatus(testCase.signals);
      expect(decision.status).toBe(testCase.expected_status);
      expect(decision.firedConditions).toEqual(testCase.expected_conditions);
    });
  }

  it('resolves to INSUFFICIENT_EVIDENCE (PRD §9.4, ANS-005)', () => {
    expect(derived.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(statusOfCondition('MATERIAL_CLAIMS_UNSUPPORTED')).toBe('INSUFFICIENT_EVIDENCE');
  });
});
