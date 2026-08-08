/**
 * FND-10 acceptance item "mode rules" (PRD §6.7, §36.2) — deliverable 2 and open question Q-F5.
 *
 * The three invariants are asserted INDEPENDENTLY of the table, so that editing the table under Q-F5
 * cannot quietly break a PRD-quoted rule.
 */
import { describe, expect, it } from 'vitest';

import {
  PERMITTED_STATUSES_BY_MODE,
  REQUEST_MODE_VALUES,
  canSupportDefinitiveCurrentLaw,
  isRequestMode,
  isStatusPermittedByMode,
} from '../../src/legal/index.js';
import { LEGAL_STATUS_VALUES } from '../../src/legal/contracts.js';

describe('the Q-F5 table', () => {
  it('covers exactly the three request modes', () => {
    expect([...REQUEST_MODE_VALUES]).toEqual(['CURRENT_LAW', 'HISTORICAL', 'FUTURE_OR_PROPOSED']);
    expect(Object.keys(PERMITTED_STATUSES_BY_MODE).sort()).toEqual([...REQUEST_MODE_VALUES].sort());
  });

  it('names only PRD §6.7 legal statuses', () => {
    for (const mode of REQUEST_MODE_VALUES) {
      for (const status of PERMITTED_STATUSES_BY_MODE[mode]) {
        expect(LEGAL_STATUS_VALUES as readonly string[], `${mode}/${status}`).toContain(status);
      }
    }
  });

  it('is the initial rule recorded in the ticket', () => {
    expect([...PERMITTED_STATUSES_BY_MODE.CURRENT_LAW]).toEqual(['IN_FORCE']);
    expect([...PERMITTED_STATUSES_BY_MODE.HISTORICAL]).toEqual(['IN_FORCE', 'SUPERSEDED', 'REPEALED']);
    expect([...PERMITTED_STATUSES_BY_MODE.FUTURE_OR_PROPOSED]).toEqual([
      'ENACTED_NOT_IN_FORCE',
      'BILL_NOT_ENACTED',
      'DRAFT_OR_CONSULTATION',
    ]);
  });

  it('is DEEP-frozen — a shallow freeze would leave each status array mutable process-wide', () => {
    expect(Object.isFrozen(PERMITTED_STATUSES_BY_MODE)).toBe(true);
    for (const mode of REQUEST_MODE_VALUES) {
      expect(Object.isFrozen(PERMITTED_STATUSES_BY_MODE[mode]), mode).toBe(true);
      expect(() => {
        (PERMITTED_STATUSES_BY_MODE[mode] as string[]).push('IN_FORCE');
      }).toThrow();
    }
    expect(Object.isFrozen(REQUEST_MODE_VALUES)).toBe(true);
  });
});

describe('the three PRD-quoted invariants, asserted independently of the table', () => {
  it('(a) CURRENT_LAW admits IN_FORCE and nothing that is not in force (PRD §6.7)', () => {
    expect(isStatusPermittedByMode('IN_FORCE', 'CURRENT_LAW')).toBe(true);
    for (const status of LEGAL_STATUS_VALUES) {
      if (status === 'IN_FORCE') continue;
      expect(isStatusPermittedByMode(status, 'CURRENT_LAW'), status).toBe(false);
    }
  });

  it('(b) FUTURE_OR_PROPOSED never carries IN_FORCE (PRD §36.2)', () => {
    expect(isStatusPermittedByMode('IN_FORCE', 'FUTURE_OR_PROPOSED')).toBe(false);
  });

  it('(c) STATUS_UNCONFIRMED can never support a definitive current-law conclusion (PRD §36.2)', () => {
    expect(canSupportDefinitiveCurrentLaw('STATUS_UNCONFIRMED')).toBe(false);
    for (const mode of REQUEST_MODE_VALUES) {
      expect(isStatusPermittedByMode('STATUS_UNCONFIRMED', mode), mode).toBe(false);
    }
  });
});

describe('canSupportDefinitiveCurrentLaw is not the same thing as mode permission', () => {
  it('is true only for IN_FORCE', () => {
    for (const status of LEGAL_STATUS_VALUES) {
      expect(canSupportDefinitiveCurrentLaw(status), status).toBe(status === 'IN_FORCE');
    }
  });

  it('is false for a REPEALED version that HISTORICAL mode legitimately surfaces', () => {
    expect(isStatusPermittedByMode('REPEALED', 'HISTORICAL')).toBe(true);
    expect(canSupportDefinitiveCurrentLaw('REPEALED')).toBe(false);
  });

  it('is false for junk without throwing', () => {
    for (const value of [null, undefined, 1, {}]) {
      expect(() => canSupportDefinitiveCurrentLaw(value as unknown as string)).not.toThrow();
      expect(canSupportDefinitiveCurrentLaw(value as unknown as string)).toBe(false);
    }
  });
});

describe('isStatusPermittedByMode over every (status x mode) pair', () => {
  it('agrees with the table for all 21 combinations', () => {
    for (const status of LEGAL_STATUS_VALUES) {
      for (const mode of REQUEST_MODE_VALUES) {
        expect(isStatusPermittedByMode(status, mode), `${status}/${mode}`).toBe(
          (PERMITTED_STATUSES_BY_MODE[mode] as readonly string[]).includes(status),
        );
      }
    }
  });

  it('an unknown mode permits NO status (fail-closed)', () => {
    for (const status of LEGAL_STATUS_VALUES) {
      expect(isStatusPermittedByMode(status, 'TIME_TRAVEL'), status).toBe(false);
      expect(isStatusPermittedByMode(status, ''), status).toBe(false);
    }
  });

  it('an unknown status is permitted by no mode', () => {
    for (const mode of REQUEST_MODE_VALUES) {
      expect(isStatusPermittedByMode('MOSTLY_IN_FORCE', mode), mode).toBe(false);
      expect(isStatusPermittedByMode('toString', mode), mode).toBe(false);
    }
  });

  it('is total for non-string input', () => {
    expect(() => isStatusPermittedByMode(null as unknown as string, null as unknown as string)).not.toThrow();
    expect(isStatusPermittedByMode(null as unknown as string, 'CURRENT_LAW')).toBe(false);
  });
});

describe('isRequestMode', () => {
  it('accepts only the three modes', () => {
    for (const mode of REQUEST_MODE_VALUES) expect(isRequestMode(mode)).toBe(true);
    for (const value of ['QUICK', 'ADVANCED', '', null, 3, {}]) expect(isRequestMode(value)).toBe(false);
  });
});
