/**
 * FND-10 acceptance items 1, 2, 11 and the "no exception path" safety rule — the PRD §36.2 hard
 * applicability filter.
 */
import { describe, expect, it } from 'vitest';

import {
  ELIGIBILITY_FAILURES,
  LICENCE_STATES_PERMITTING_USE,
  isEligible,
  type EligibilityCandidate,
  type EligibilityRequest,
} from '../../src/legal/index.js';
import { loadTruthTable, truthTableRow, type ConjunctOutcome, type TruthTableRow } from './fixture.js';

const fixture = loadTruthTable();
const basis = fixture.basis;

function candidateFor(row: TruthTableRow): EligibilityCandidate {
  return {
    effective_from: basis.candidate.effective_from,
    effective_to: basis.candidate.effective_to,
    jurisdictions: [...basis.candidate.jurisdictions],
    legal_status: pick(basis.candidate.legal_status, row.status),
    licence_state: pick(basis.candidate.licence_state, row.licence),
    corpus_release_id: pick(basis.candidate.corpus_release_id, row.release),
  };
}

function requestFor(row: TruthTableRow): EligibilityRequest {
  return {
    legal_as_at: pick(basis.request.legal_as_at, row.date),
    jurisdictions: [...pickList(basis.request.jurisdictions, row.jurisdiction)],
    request_mode: basis.request.request_mode,
    corpus_release_id: basis.request.corpus_release_id,
    use: 'EVIDENCE_PACK',
  };
}

function pick(table: Readonly<Record<ConjunctOutcome, string>>, outcome: ConjunctOutcome): string {
  const value = table[outcome];
  if (value === undefined) throw new Error(`basis is missing the ${outcome} value`);
  return value;
}

function pickList(
  table: Readonly<Record<ConjunctOutcome, readonly string[]>>,
  outcome: ConjunctOutcome,
): readonly string[] {
  const value = table[outcome];
  if (value === undefined) throw new Error(`basis is missing the ${outcome} list`);
  return value;
}

describe('the fixture is the whole §36.2 truth table, not a sample', () => {
  it('has 32 rows numbered 1..32', () => {
    expect(fixture.rows).toHaveLength(32);
    expect(fixture.rows.map((row) => row.n)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it('covers 32 DISTINCT conjunct combinations', () => {
    const tuples = fixture.rows.map((row) =>
      [row.date, row.jurisdiction, row.status, row.licence, row.release].join('|'),
    );
    expect(new Set(tuples).size).toBe(32);
  });

  it('marks exactly one row eligible — the all-pass row', () => {
    const eligible = fixture.rows.filter((row) => row.eligible);
    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.n).toBe(1);
    expect(eligible[0]?.failures).toEqual([]);
  });

  it('lists the five conjuncts in the PRD order and names them as ELIGIBILITY_FAILURES does', () => {
    expect(fixture.conjuncts).toHaveLength(5);
    expect(fixture.failureNames).toEqual([...ELIGIBILITY_FAILURES]);
    expect(fixture.prdSection).toBe('§36.2');
  });

  it('records every failure set in ELIGIBILITY_FAILURES order', () => {
    for (const row of fixture.rows) {
      const ordered = ELIGIBILITY_FAILURES.filter((name) => row.failures.includes(name));
      expect(row.failures, `row ${String(row.n)}`).toEqual(ordered);
    }
  });
});

describe('§36.2 truth-table replay', () => {
  for (let n = 1; n <= 32; n += 1) {
    const row = truthTableRow(fixture, n);
    it(`row ${String(n)} — ${row.failures.length === 0 ? 'eligible' : row.failures.join('+')}`, () => {
      const result = isEligible(candidateFor(row), requestFor(row));
      expect(result.eligible).toBe(row.eligible);
      expect(result.failures).toEqual(row.failures);
      expect(result.eligible).toBe(result.failures.length === 0);
    });
  }
});

describe('all five conjuncts are evaluated (no short-circuit)', () => {
  it('a candidate failing three conjuncts reports all three failures, not the first', () => {
    const row = fixture.rows.find(
      (candidate) =>
        candidate.date === 'FAIL' && candidate.status === 'FAIL' && candidate.release === 'FAIL' &&
        candidate.jurisdiction === 'PASS' && candidate.licence === 'PASS',
    );
    expect(row, 'the fixture must contain the 1+3+5 failing combination').toBeDefined();
    if (!row) return;
    const result = isEligible(candidateFor(row), requestFor(row));
    expect(result.failures).toEqual([
      'OUTSIDE_EFFECTIVE_INTERVAL',
      'STATUS_NOT_PERMITTED_BY_MODE',
      'NOT_IN_PINNED_RELEASE',
    ]);
  });

  it('the all-fail row reports all five failures', () => {
    const row = truthTableRow(fixture, 32);
    const result = isEligible(candidateFor(row), requestFor(row));
    expect(result.failures).toEqual([...ELIGIBILITY_FAILURES]);
    expect(result.eligible).toBe(false);
  });
});

describe('mode rules (PRD §6.7, §36.2)', () => {
  const inForceCandidate: EligibilityCandidate = {
    effective_from: '2024-07-01',
    effective_to: '2025-06-30',
    jurisdictions: ['CTH'],
    legal_status: 'IN_FORCE',
    licence_state: 'PERMITTED',
    corpus_release_id: 'cr_pinned',
  };
  const baseRequest: EligibilityRequest = {
    legal_as_at: '2025-06-30',
    jurisdictions: ['CTH'],
    request_mode: 'CURRENT_LAW',
    corpus_release_id: 'cr_pinned',
  };

  it('CURRENT_LAW + IN_FORCE but a date outside the interval is INELIGIBLE (conjuncts 1 AND 3)', () => {
    const result = isEligible(inForceCandidate, { ...baseRequest, legal_as_at: '2025-07-01' });
    expect(result.eligible).toBe(false);
    expect(result.failures).toEqual(['OUTSIDE_EFFECTIVE_INTERVAL']);
  });

  it('FUTURE_OR_PROPOSED admits ENACTED_NOT_IN_FORCE', () => {
    const result = isEligible(
      { ...inForceCandidate, legal_status: 'ENACTED_NOT_IN_FORCE' },
      { ...baseRequest, request_mode: 'FUTURE_OR_PROPOSED' },
    );
    expect(result.eligible).toBe(true);
  });

  it('FUTURE_OR_PROPOSED never admits IN_FORCE — future material is never relabelled current', () => {
    const result = isEligible(inForceCandidate, { ...baseRequest, request_mode: 'FUTURE_OR_PROPOSED' });
    expect(result.failures).toContain('STATUS_NOT_PERMITTED_BY_MODE');
  });

  it('HISTORICAL admits SUPERSEDED and REPEALED, CURRENT_LAW does not', () => {
    for (const status of ['SUPERSEDED', 'REPEALED']) {
      expect(
        isEligible({ ...inForceCandidate, legal_status: status }, { ...baseRequest, request_mode: 'HISTORICAL' })
          .eligible,
      ).toBe(true);
      expect(
        isEligible({ ...inForceCandidate, legal_status: status }, baseRequest).failures,
      ).toContain('STATUS_NOT_PERMITTED_BY_MODE');
    }
  });

  it('STATUS_UNCONFIRMED is permitted by NO mode', () => {
    for (const mode of ['CURRENT_LAW', 'HISTORICAL', 'FUTURE_OR_PROPOSED']) {
      expect(
        isEligible(
          { ...inForceCandidate, legal_status: 'STATUS_UNCONFIRMED' },
          { ...baseRequest, request_mode: mode },
        ).failures,
        mode,
      ).toContain('STATUS_NOT_PERMITTED_BY_MODE');
    }
  });
});

describe('jurisdiction intersection has no hierarchy (PRD §34.2, §32.2 — plan OQ-2)', () => {
  const base: EligibilityCandidate = {
    effective_from: '2024-07-01',
    effective_to: null,
    jurisdictions: ['CTH'],
    legal_status: 'IN_FORCE',
    licence_state: 'PERMITTED',
    corpus_release_id: 'cr_pinned',
  };
  const request: EligibilityRequest = {
    legal_as_at: '2025-01-01',
    jurisdictions: ['CTH', 'VIC'],
    request_mode: 'CURRENT_LAW',
    corpus_release_id: 'cr_pinned',
  };

  it('a widened request intersects a narrower candidate', () => {
    expect(isEligible(base, request).eligible).toBe(true);
  });

  it('CTH does not implicitly cover VIC', () => {
    expect(isEligible(base, { ...request, jurisdictions: ['VIC'] }).failures).toContain(
      'JURISDICTION_MISMATCH',
    );
  });

  it('an empty request jurisdiction list fails', () => {
    expect(isEligible(base, { ...request, jurisdictions: [] }).failures).toContain(
      'JURISDICTION_MISMATCH',
    );
  });

  it('an empty candidate jurisdiction list fails', () => {
    expect(isEligible({ ...base, jurisdictions: [] }, request).failures).toContain(
      'JURISDICTION_MISMATCH',
    );
  });

  it('both empty fails', () => {
    expect(isEligible({ ...base, jurisdictions: [] }, { ...request, jurisdictions: [] }).failures).toContain(
      'JURISDICTION_MISMATCH',
    );
  });

  it('is case-sensitive', () => {
    expect(isEligible({ ...base, jurisdictions: ['cth'] }, request).failures).toContain(
      'JURISDICTION_MISMATCH',
    );
  });
});

describe('licence conjunct (PRD §11.1, §36.2 — plan OQ-3)', () => {
  const base: EligibilityCandidate = {
    effective_from: '2024-07-01',
    effective_to: null,
    jurisdictions: ['CTH'],
    legal_status: 'IN_FORCE',
    licence_state: 'METADATA_AND_LINK_ONLY',
    corpus_release_id: 'cr_pinned',
  };
  const request: EligibilityRequest = {
    legal_as_at: '2025-01-01',
    jurisdictions: ['CTH'],
    request_mode: 'CURRENT_LAW',
    corpus_release_id: 'cr_pinned',
  };

  it('defaults to the STRICTEST use when `use` is omitted', () => {
    expect(isEligible(base, request).failures).toContain('LICENCE_NOT_PERMITTED');
    expect(isEligible(base, { ...request, use: 'SEARCH_RESULT' }).eligible).toBe(true);
  });

  it('PROHIBITED and REVIEW_REQUIRED permit neither use', () => {
    for (const state of ['PROHIBITED', 'REVIEW_REQUIRED']) {
      for (const use of ['SEARCH_RESULT', 'EVIDENCE_PACK'] as const) {
        expect(
          isEligible({ ...base, licence_state: state }, { ...request, use }).failures,
          `${state} / ${use}`,
        ).toContain('LICENCE_NOT_PERMITTED');
      }
    }
  });

  it('the state->use table is exactly the OQ-3 rule', () => {
    expect(LICENCE_STATES_PERMITTING_USE.EVIDENCE_PACK).toEqual([
      'PERMITTED',
      'PERMITTED_WITH_ATTRIBUTION',
    ]);
    expect(LICENCE_STATES_PERMITTING_USE.SEARCH_RESULT).toEqual([
      'PERMITTED',
      'PERMITTED_WITH_ATTRIBUTION',
      'METADATA_AND_LINK_ONLY',
      'UNCLEAR_RESTRICTED',
    ]);
  });

  it('an unknown licence state fails closed', () => {
    expect(isEligible({ ...base, licence_state: 'FREE_FOR_ALL' }, request).failures).toContain(
      'LICENCE_NOT_PERMITTED',
    );
  });
});

describe('pinned release conjunct', () => {
  const base: EligibilityCandidate = {
    effective_from: '2024-07-01',
    effective_to: null,
    jurisdictions: ['CTH'],
    legal_status: 'IN_FORCE',
    licence_state: 'PERMITTED',
    corpus_release_id: 'cr_pinned',
  };
  const request: EligibilityRequest = {
    legal_as_at: '2025-01-01',
    jurisdictions: ['CTH'],
    request_mode: 'CURRENT_LAW',
    corpus_release_id: 'cr_pinned',
  };

  it('a null candidate release fails', () => {
    expect(isEligible({ ...base, corpus_release_id: null }, request).failures).toContain(
      'NOT_IN_PINNED_RELEASE',
    );
  });

  it('an empty pinned release id fails — two empty strings are not a match', () => {
    expect(
      isEligible({ ...base, corpus_release_id: '' }, { ...request, corpus_release_id: '' }).failures,
    ).toContain('NOT_IN_PINNED_RELEASE');
  });
});

describe('isEligible is TOTAL — no input throws (values crossed the API boundary)', () => {
  const wellFormed: EligibilityCandidate = {
    effective_from: '2024-07-01',
    effective_to: null,
    jurisdictions: ['CTH'],
    legal_status: 'IN_FORCE',
    licence_state: 'PERMITTED',
    corpus_release_id: 'cr_pinned',
  };
  const request: EligibilityRequest = {
    legal_as_at: '2025-01-01',
    jurisdictions: ['CTH'],
    request_mode: 'CURRENT_LAW',
    corpus_release_id: 'cr_pinned',
  };

  const junk: readonly [string, unknown, unknown][] = [
    ['malformed legal_as_at', wellFormed, { ...request, legal_as_at: '2025-02-30' }],
    ['malformed effective_from', { ...wellFormed, effective_from: 'yesterday' }, request],
    ['null jurisdictions on the candidate', { ...wellFormed, jurisdictions: null }, request],
    ['null jurisdictions on the request', wellFormed, { ...request, jurisdictions: null }],
    ['numeric legal_status', { ...wellFormed, legal_status: 7 }, request],
    ['unknown request_mode', wellFormed, { ...request, request_mode: 'TIME_TRAVEL' }],
    ['undefined licence_state', { ...wellFormed, licence_state: undefined }, request],
    ['null candidate', null, request],
    ['null request', wellFormed, null],
    ['undefined both', undefined, undefined],
    ['empty objects', {}, {}],
  ];

  for (const [name, candidate, req] of junk) {
    it(`${name} fails closed and does not throw`, () => {
      expect(() =>
        isEligible(candidate as EligibilityCandidate, req as EligibilityRequest),
      ).not.toThrow();
      const result = isEligible(candidate as EligibilityCandidate, req as EligibilityRequest);
      expect(result.eligible).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });
  }
});

describe('the result is frozen and does not alias its inputs', () => {
  it('returns a frozen object with a frozen failures array', () => {
    const result = isEligible(
      {
        effective_from: '2024-07-01',
        effective_to: null,
        jurisdictions: ['CTH'],
        legal_status: 'REPEALED',
        licence_state: 'PERMITTED',
        corpus_release_id: 'cr_pinned',
      },
      {
        legal_as_at: '2025-01-01',
        jurisdictions: ['CTH'],
        request_mode: 'CURRENT_LAW',
        corpus_release_id: 'cr_pinned',
      },
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.failures)).toBe(true);
  });

  it('mutating the caller arrays afterwards does not change a decision already handed out', () => {
    const jurisdictions = ['CTH'];
    const candidate: EligibilityCandidate = {
      effective_from: '2024-07-01',
      effective_to: null,
      jurisdictions,
      legal_status: 'IN_FORCE',
      licence_state: 'PERMITTED',
      corpus_release_id: 'cr_pinned',
    };
    const result = isEligible(candidate, {
      legal_as_at: '2025-01-01',
      jurisdictions: ['CTH'],
      request_mode: 'CURRENT_LAW',
      corpus_release_id: 'cr_pinned',
    });
    expect(result.eligible).toBe(true);
    jurisdictions.length = 0;
    jurisdictions.push('VIC');
    expect(result.eligible).toBe(true);
    expect(result.failures).toEqual([]);
  });
});
