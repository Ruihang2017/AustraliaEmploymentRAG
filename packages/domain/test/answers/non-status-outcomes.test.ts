/**
 * FND-07 acceptance item 2 — PRD §36.8 rows 7-9 are NOT answer statuses.
 *
 * The `answerStatus === null` assertion is made against the real contracts guard `isAnswerStatus`, not
 * against a literal, so the claim is "this is not a member of the AnswerStatus family" rather than
 * "this happens to be null today".
 */
import { describe, expect, it } from 'vitest';

import { NON_STATUS_OUTCOMES } from '../../src/answers/index.js';
import { isAnswerStatus } from '../../../contracts/src/enums/index.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();

describe('PRD §36.8 non-status rows', () => {
  it('models all three, in PRD table order (non-vacuity)', () => {
    expect(NON_STATUS_OUTCOMES).toHaveLength(3);
    expect(NON_STATUS_OUTCOMES.map((outcome) => outcome.kind)).toEqual(
      fixture.prd_36_8.non_status_rows.map((row) => row.kind),
    );
  });

  for (const [index, row] of fixture.prd_36_8.non_status_rows.entries()) {
    it(`${row.kind}: carries the PRD's consequence verbatim and NO answer status`, () => {
      const outcome = NON_STATUS_OUTCOMES[index];
      expect(outcome, `no outcome models §36.8 row ${index + 7}`).toBeDefined();
      expect(outcome?.consequence).toBe(row.result_text);
      expect(outcome?.answerStatus).toBeNull();
      expect(isAnswerStatus(outcome?.answerStatus)).toBe(false);
    });
  }

  it('PII detection is a pre-admission rejection carrying EMPLOYEE_PII_DETECTED (PRD §10.1, §37.2)', () => {
    const outcome = NON_STATUS_OUTCOMES.find((entry) => entry.kind === 'PRE_ADMISSION_REJECTION');
    expect(outcome).toBeDefined();
    if (outcome?.kind !== 'PRE_ADMISSION_REJECTION') throw new Error('missing PII outcome');
    expect(outcome.condition).toBe('EMPLOYEE_PII_DETECTED');
    expect(outcome.errorCode).toBe('EMPLOYEE_PII_DETECTED');
    expect(outcome.rejectedBeforeJob).toBe(true);
  });

  it('unlawful operational evasion is a refusal that must offer a lawful alternative (PRD §9.5)', () => {
    const outcome = NON_STATUS_OUTCOMES.find((entry) => entry.kind === 'REFUSAL');
    expect(outcome).toBeDefined();
    if (outcome?.kind !== 'REFUSAL') throw new Error('missing refusal outcome');
    expect(outcome.condition).toBe('UNLAWFUL_OPERATIONAL_EVASION');
    expect(outcome.requiresLawfulAlternative).toBe(true);
    expect(outcome.consequence).toContain('lawful');
  });

  it('provider/budget unavailability leaves Search AND saved records available (PRD §8.2, §34.9)', () => {
    const outcome = NON_STATUS_OUTCOMES.find((entry) => entry.kind === 'JOB_UNAVAILABLE');
    expect(outcome).toBeDefined();
    if (outcome?.kind !== 'JOB_UNAVAILABLE') throw new Error('missing job-unavailable outcome');
    expect(outcome.errorCode).toBe('GENERATION_UNAVAILABLE');
    expect(outcome.searchRemainsAvailable).toBe(true);
    expect(outcome.savedRecordsRemainAvailable).toBe(true);
  });

  it('is deeply frozen: a concurrent caller cannot mutate a row for every other request', () => {
    expect(Object.isFrozen(NON_STATUS_OUTCOMES)).toBe(true);
    for (const outcome of NON_STATUS_OUTCOMES) expect(Object.isFrozen(outcome)).toBe(true);
  });
});
