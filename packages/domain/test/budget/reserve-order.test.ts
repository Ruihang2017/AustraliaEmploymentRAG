/**
 * FND-09 acceptance item "Reserve order" `[machine]` — PRD §42.6's four founder-funded priorities.
 *
 * The load-bearing case: when only the incident/safety allowance remains, a discretionary Deep run is
 * denied while an incident request in the SAME state is admitted.
 */
import { describe, expect, it } from 'vitest';

import { admit, type AdmissionInput } from '../../src/budget/admit.js';
import { BUDGET_PROFILE_V1 } from '../../src/budget/budget-profile.js';
import type { FounderLedgerState } from '../../src/budget/ledgers.js';
import { microAud, type MicroAud } from '../../src/budget/micro-aud.js';
import type { FxSnapshot, PriceSnapshot } from '../../src/budget/pricing.js';
import {
  FOUNDER_RESERVE_ORDER,
  availableForClass,
  hasReserveFor,
  reservePriorityOf,
  type FounderReserveClass,
} from '../../src/budget/reserve-order.js';

const NOW = 1_754_600_000_000;
const CEILING = BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud;

const price: PriceSnapshot = {
  currency: 'USD',
  inputMicroUnitsPerMillionTokens: 1_000_000n,
  outputMicroUnitsPerMillionTokens: 0n,
  observedAtEpochMs: NOW,
};

const fx: FxSnapshot = {
  fromCurrency: 'USD',
  toCurrency: 'AUD',
  microAudPerUnit: 1_000_000n,
  safetyMarginBasisPoints: 0n,
  observedAtEpochMs: NOW,
};

const zero = (): Record<FounderReserveClass, MicroAud> => ({
  INCIDENT_OR_SAFETY_CHECK: microAud(0n),
  TRIAL_COMMITMENT: microAud(0n),
  INTERNAL_TESTING: microAud(0n),
  DISCRETIONARY_DEEP: microAud(0n),
});

/** A$45 already spent; the A$5 that remains is entirely earmarked for incident/safety. */
const onlyIncidentRemains: FounderLedgerState = {
  periodKey: '2026-08',
  ceilingMicroAud: CEILING,
  monthToDateDebitMicroAud: microAud(45_000_000n),
  outstandingReservationsMicroAud: microAud(0n),
  allowances: { ...zero(), INCIDENT_OR_SAFETY_CHECK: microAud(5_000_000n) },
  consumed: zero(),
};

function request(reserveClass: FounderReserveClass, state: FounderLedgerState): AdmissionInput {
  return {
    operation: 'DEEP',
    tier: 'PAID_PILOT',
    nowEpochMs: NOW,
    generationAvailable: true,
    quota: {
      counters: [
        { ledger: 'ADVANCED_TASK_CREDITS', limit: 25, used: 0, resetAtEpochMs: NOW + 60_000 },
      ],
    },
    concurrency: [{ boundary: 'CONCURRENT_DEEP', limit: 1, inFlight: 0 }],
    funding: { kind: 'FOUNDER_PLATFORM_BUDGET', reserveClass, state },
    pricing: {
      price,
      fx,
      maxAgeMs: 86_400_000,
      // 1,000,000 tokens at 1,000,000 micro-units per million, at parity: exactly A$1.
      maxInputTokens: 1_000_000n,
      maxOutputTokens: 0n,
      reservationId: `res-${reserveClass}`,
    },
  };
}

describe('FOUNDER_RESERVE_ORDER', () => {
  it('is exactly the four PRD §42.6 priorities, in order, frozen', () => {
    expect([...FOUNDER_RESERVE_ORDER]).toEqual([
      'INCIDENT_OR_SAFETY_CHECK',
      'TRIAL_COMMITMENT',
      'INTERNAL_TESTING',
      'DISCRETIONARY_DEEP',
    ]);
    expect(Object.isFrozen(FOUNDER_RESERVE_ORDER)).toBe(true);
    expect(reservePriorityOf('INCIDENT_OR_SAFETY_CHECK')).toBe(0);
    expect(reservePriorityOf('DISCRETIONARY_DEEP')).toBe(3);
  });
});

describe('availableForClass', () => {
  it('is monotone in priority: a higher priority never sees less', () => {
    let previous: bigint | null = null;
    for (const reserveClass of FOUNDER_RESERVE_ORDER) {
      const available = availableForClass(reserveClass, onlyIncidentRemains);
      if (previous !== null) expect(available).toBeLessThanOrEqual(previous);
      previous = available;
    }
  });

  it('gives the incident class the whole remainder and the discretionary class none', () => {
    expect(availableForClass('INCIDENT_OR_SAFETY_CHECK', onlyIncidentRemains)).toBe(5_000_000n);
    expect(availableForClass('DISCRETIONARY_DEEP', onlyIncidentRemains)).toBe(0n);
    expect(hasReserveFor('INCIDENT_OR_SAFETY_CHECK', onlyIncidentRemains)).toBe(true);
    expect(hasReserveFor('DISCRETIONARY_DEEP', onlyIncidentRemains)).toBe(false);
  });

  it('subtracts outstanding reservations, not only settled debit', () => {
    const withOutstanding: FounderLedgerState = {
      ...onlyIncidentRemains,
      monthToDateDebitMicroAud: microAud(0n),
      outstandingReservationsMicroAud: microAud(45_000_000n),
    };
    expect(availableForClass('INCIDENT_OR_SAFETY_CHECK', withOutstanding)).toBe(5_000_000n);
    expect(availableForClass('DISCRETIONARY_DEEP', withOutstanding)).toBe(0n);
  });

  it('never returns a negative amount', () => {
    const overspent: FounderLedgerState = {
      ...onlyIncidentRemains,
      monthToDateDebitMicroAud: microAud(CEILING),
      outstandingReservationsMicroAud: microAud(10_000_000n),
    };
    for (const reserveClass of FOUNDER_RESERVE_ORDER) {
      expect(availableForClass(reserveClass, overspent)).toBe(0n);
    }
  });

  it('releases the earmark once the higher-priority allowance has been consumed', () => {
    const consumedIncident: FounderLedgerState = {
      ...onlyIncidentRemains,
      monthToDateDebitMicroAud: microAud(45_000_000n),
      consumed: { ...zero(), INCIDENT_OR_SAFETY_CHECK: microAud(5_000_000n) },
    };
    expect(availableForClass('DISCRETIONARY_DEEP', consumedIncident)).toBe(5_000_000n);
  });
});

describe('admission honours the reserve order', () => {
  it('denies a discretionary Deep run while admitting an incident request in the same state', () => {
    const discretionary = admit(request('DISCRETIONARY_DEEP', onlyIncidentRemains));
    expect(discretionary.allowed).toBe(false);
    if (!discretionary.allowed) expect(discretionary.reason).toBe('CREDIT_LIMIT_REACHED');

    const incident = admit(request('INCIDENT_OR_SAFETY_CHECK', onlyIncidentRemains));
    expect(incident.allowed).toBe(true);
    if (incident.allowed) expect(incident.reservation?.amountMicroAud).toBe(1_000_000n);
  });

  it('denies trial and internal classes too, since incident outranks them', () => {
    for (const reserveClass of ['TRIAL_COMMITMENT', 'INTERNAL_TESTING'] as const) {
      const decision = admit(request(reserveClass, onlyIncidentRemains));
      expect(decision.allowed, `${reserveClass} should not consume the incident allowance`).toBe(
        false,
      );
    }
  });
});
