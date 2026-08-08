/**
 * FND-09 acceptance item 11 — PRD §42.6's reserve order: a discretionary-Deep request is denied when
 * only the incident/safety allowance remains, while an incident request is admitted.
 */
import { describe, expect, it } from 'vitest';

import {
  admit,
  availableForClass,
  FOUNDER_RESERVE_ORDER,
  fromWholeAud,
  hasReserveFor,
  microAud,
  ZERO_MICRO_AUD,
  type FounderReserveClass,
} from '../../src/budget/index.js';
import { admissionInput, allowances, founderState, request } from './doubles.js';

/** A$10 left in total, all of it the incident allowance. */
const ONLY_INCIDENT_LEFT = founderState({
  ceilingMicroAud: fromWholeAud(50n),
  settledMicroAud: fromWholeAud(40n),
  heldMicroAud: ZERO_MICRO_AUD,
  unspentAllowanceMicroAud: allowances({ PRODUCTION_INCIDENT_OR_SAFETY_CHECK: fromWholeAud(10n) }),
});

describe('a discretionary Deep run cannot consume the incident allowance', () => {
  it('sees nothing available while the incident allowance is unspent', () => {
    expect(availableForClass('DISCRETIONARY_DEEP', ONLY_INCIDENT_LEFT)).toBe(0n);
    expect(hasReserveFor('DISCRETIONARY_DEEP', ONLY_INCIDENT_LEFT)).toBe(false);
  });

  it('is denied CREDIT_LIMIT_REACHED, while an incident request is admitted', () => {
    const deep = admit(
      admissionInput({
        founder: ONLY_INCIDENT_LEFT,
        request: request({ operation: 'DEEP', reserveClass: 'DISCRETIONARY_DEEP' }),
      }),
    );
    expect(deep.allowed).toBe(false);
    if (!deep.allowed) expect(deep.reason).toBe('CREDIT_LIMIT_REACHED');

    const incident = admit(
      admissionInput({
        founder: ONLY_INCIDENT_LEFT,
        request: request({ operation: 'DEEP', reserveClass: 'PRODUCTION_INCIDENT_OR_SAFETY_CHECK' }),
      }),
    );
    expect(incident.allowed).toBe(true);
  });

  it('the top of the order sees the whole remainder', () => {
    expect(availableForClass('PRODUCTION_INCIDENT_OR_SAFETY_CHECK', ONLY_INCIDENT_LEFT)).toBe(
      fromWholeAud(10n),
    );
    expect(hasReserveFor('PRODUCTION_INCIDENT_OR_SAFETY_CHECK', ONLY_INCIDENT_LEFT)).toBe(true);
  });
});

describe('availableForClass subtracts exactly the strictly higher-priority allowances (4 x 4 matrix)', () => {
  const perClass = fromWholeAud(1n);
  const state = founderState({
    ceilingMicroAud: fromWholeAud(50n),
    settledMicroAud: fromWholeAud(10n),
    heldMicroAud: fromWholeAud(4n),
    unspentAllowanceMicroAud: allowances({
      PRODUCTION_INCIDENT_OR_SAFETY_CHECK: perClass,
      ACTIVE_TRIAL_COMMITMENT: perClass,
      INTERNAL_TESTING: perClass,
      DISCRETIONARY_DEEP: perClass,
    }),
  });

  for (const [index, reserveClass] of FOUNDER_RESERVE_ORDER.entries()) {
    it(`${reserveClass} holds back the ${String(index)} allowance(s) above it, and no others`, () => {
      const expected = fromWholeAud(50n - 10n - 4n) - BigInt(index) * perClass;
      expect(availableForClass(reserveClass, state)).toBe(expected);
    });
  }

  it('never goes negative when the ledger is already over-committed', () => {
    const overCommitted = founderState({
      ceilingMicroAud: fromWholeAud(10n),
      settledMicroAud: fromWholeAud(9n),
      heldMicroAud: fromWholeAud(2n),
      unspentAllowanceMicroAud: allowances(),
    });
    for (const reserveClass of FOUNDER_RESERVE_ORDER) {
      expect(availableForClass(reserveClass, overCommitted)).toBe(0n);
      expect(hasReserveFor(reserveClass, overCommitted)).toBe(false);
    }
  });

  it('counts outstanding holds, not only settled spend (the concurrency case)', () => {
    const withHolds = founderState({
      ceilingMicroAud: fromWholeAud(50n),
      settledMicroAud: fromWholeAud(20n),
      heldMicroAud: fromWholeAud(30n),
      unspentAllowanceMicroAud: allowances(),
    });
    expect(availableForClass('ACTIVE_TRIAL_COMMITMENT', withHolds)).toBe(0n);
  });

  it('rejects an unknown reserve class rather than treating it as the most permissive', () => {
    expect(() => availableForClass('NOT_A_CLASS' as FounderReserveClass, ONLY_INCIDENT_LEFT)).toThrow(
      /NOT_A_CLASS/,
    );
  });

  it('hasReserveFor is a boolean test; availableForClass is the amount test admit uses', () => {
    const almostEmpty = founderState({
      ceilingMicroAud: microAud(1n),
      settledMicroAud: ZERO_MICRO_AUD,
      heldMicroAud: ZERO_MICRO_AUD,
      unspentAllowanceMicroAud: allowances(),
    });
    // One micro-AUD is "some reserve" but cannot cover a real reservation: that is why `admit`
    // compares the amount rather than calling `hasReserveFor`.
    expect(hasReserveFor('DISCRETIONARY_DEEP', almostEmpty)).toBe(true);
    const decision = admit(
      admissionInput({
        founder: almostEmpty,
        request: request({ operation: 'DEEP', reserveClass: 'DISCRETIONARY_DEEP' }),
      }),
    );
    expect(decision.allowed).toBe(false);
  });
});

describe('FOUNDER_RESERVE_ORDER', () => {
  it('is PRD §42.6’s four priorities, in order, and frozen', () => {
    expect([...FOUNDER_RESERVE_ORDER]).toEqual([
      'PRODUCTION_INCIDENT_OR_SAFETY_CHECK',
      'ACTIVE_TRIAL_COMMITMENT',
      'INTERNAL_TESTING',
      'DISCRETIONARY_DEEP',
    ]);
    expect(Object.isFrozen(FOUNDER_RESERVE_ORDER)).toBe(true);
  });
});
