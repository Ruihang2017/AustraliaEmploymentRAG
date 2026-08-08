/**
 * FND-07 acceptance item 1 — the `[fixture]` §36.8 replay, asserted in BOTH directions, one `it()` per
 * row so a failure names the row that drifted.
 */
import { describe, expect, it } from 'vitest';

import {
  CONDITION_BY_STATUS,
  DERIVED_CONDITIONS,
  REFUSAL_TABLE,
  STATUS_PRECEDENCE,
  decideAnswerStatus,
  statusOfCondition,
} from '../../src/answers/index.js';
import type { AnswerSignals, RefusalConditionName } from '../../src/answers/index.js';
import { ANSWER_STATUS_VALUES } from '../../../contracts/src/enums/index.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();

/**
 * Signals under which exactly one restrictive condition holds. `allMaterialClaimsSupported` stays true
 * so the derived D13a condition cannot fire and confuse the single-row replay.
 */
function onlyCondition(condition: RefusalConditionName): AnswerSignals {
  return {
    outOfScope: condition === 'OUT_OF_SCOPE_REQUEST',
    sourceStaleOrUnavailableAndMaterial: condition === 'SOURCE_STALE_OR_UNAVAILABLE',
    unreconciledAuthorityConflict: condition === 'UNRECONCILED_AUTHORITY_CONFLICT',
    sufficientApplicableEvidence: condition !== 'NO_SUFFICIENT_APPLICABLE_EVIDENCE',
    materialFactUnknown: condition === 'MATERIAL_FACT_UNKNOWN',
    allMaterialClaimsSupported: true,
  };
}

describe('PRD §36.8 replay — fixture -> implementation', () => {
  it('transcribes exactly six status rows and three non-status rows (non-vacuity)', () => {
    expect(fixture.prd_36_8.status_rows).toHaveLength(6);
    expect(fixture.prd_36_8.non_status_rows).toHaveLength(3);
  });

  for (const [index, row] of fixture.prd_36_8.status_rows.entries()) {
    it(`row ${index + 1} (${row.result}): the table carries the PRD's wording, in PRD order`, () => {
      const implemented = REFUSAL_TABLE[index];
      expect(implemented, `REFUSAL_TABLE has no row ${index + 1}`).toBeDefined();
      expect(implemented?.condition).toBe(row.condition);
      expect(implemented?.prdCondition).toBe(row.condition_text);
      expect(implemented?.status).toBe(row.result);
    });

    it(`row ${index + 1} (${row.result}): its condition alone returns exactly that status`, () => {
      expect(decideAnswerStatus(onlyCondition(row.condition)).status).toBe(row.result);
    });

    it(`row ${index + 1} (${row.result}): the condition maps to the status both ways`, () => {
      expect(CONDITION_BY_STATUS[row.result]).toBe(row.condition);
      expect(statusOfCondition(row.condition)).toBe(row.result);
    });
  }
});

describe('PRD §36.8 replay — implementation -> fixture', () => {
  it('has no status row the fixture does not transcribe', () => {
    expect(REFUSAL_TABLE.map((row) => row.condition)).toEqual(
      fixture.prd_36_8.status_rows.map((row) => row.condition),
    );
    expect(REFUSAL_TABLE.map((row) => row.status)).toEqual(
      fixture.prd_36_8.status_rows.map((row) => row.result),
    );
  });

  it('covers every AnswerStatus the contracts enum declares, and no other value', () => {
    expect([...REFUSAL_TABLE.map((row) => row.status)].sort()).toEqual([...ANSWER_STATUS_VALUES].sort());
  });
});

describe('STATUS_PRECEDENCE (sub-PRD D13)', () => {
  it('matches the fixture order, most restrictive first', () => {
    expect(STATUS_PRECEDENCE).toEqual(fixture.precedence.order);
  });

  it('is a permutation of the table statuses, so the two constants cannot drift', () => {
    expect([...STATUS_PRECEDENCE].sort()).toEqual([...REFUSAL_TABLE.map((r) => r.status)].sort());
    expect(new Set(STATUS_PRECEDENCE).size).toBe(STATUS_PRECEDENCE.length);
  });
});

describe('derived conditions (sub-PRD D13a) are kept out of the §36.8 transcription', () => {
  it('the fixture declares them in a section of their own', () => {
    expect(fixture.derived_conditions).toHaveLength(1);
    expect(fixture.prd_36_8.status_rows.map((row) => row.condition)).not.toContain(
      'MATERIAL_CLAIMS_UNSUPPORTED',
    );
  });

  it('the implementation declares exactly the same derived conditions', () => {
    expect(DERIVED_CONDITIONS.map((entry) => entry.condition)).toEqual(
      fixture.derived_conditions.map((entry) => entry.condition),
    );
    expect(DERIVED_CONDITIONS.map((entry) => entry.status)).toEqual(
      fixture.derived_conditions.map((entry) => entry.status),
    );
  });
});
