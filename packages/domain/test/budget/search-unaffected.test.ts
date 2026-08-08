/**
 * FND-09 acceptance item "Search unaffected" `[machine]` — PRD §8.2 (*"Search MUST remain usable when
 * the AI budget is exhausted"*), PRD §36.8's final row, requirement **OPS-003** ("search remains
 * usable").
 *
 * `isSearchAffected` is asserted over the EXHAUSTIVE cross-product of the generation-ledger state
 * space — every numeric dimension reduced to its boundary set, every enum dimension fully enumerated
 * — and the case count is asserted explicitly, so a truncated enumeration fails instead of passing
 * quietly. Every one of those states is then fed to `admit` as a Search request: none may be denied
 * for a generation-ledger reason.
 */
import { describe, expect, it } from 'vitest';

import { admit, type AdmissionInput } from '../../src/budget/admit.js';
import { BUDGET_PROFILE_V1 } from '../../src/budget/budget-profile.js';
import {
  isSearchAffected,
  type FundingLedgerKind,
  type GenerationLedgerState,
} from '../../src/budget/ledgers.js';
import { microAud, type MicroAud } from '../../src/budget/micro-aud.js';

const CEILING = BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud;
const NOW = 1_754_600_000_000;

const COUNT_BOUNDARIES: readonly number[] = [0, 1, 249, 250, 251];
const MONEY_BOUNDARIES: readonly MicroAud[] = [
  microAud(0n),
  microAud(1n),
  microAud(CEILING - 1n),
  microAud(CEILING),
  microAud(CEILING + 1n),
];
const BOOLEANS: readonly boolean[] = [false, true];
const LEDGERS: readonly FundingLedgerKind[] = [
  'FOUNDER_PLATFORM_BUDGET',
  'CUSTOMER_PREPAID_OR_BYOK',
];

function everyGenerationLedgerState(): GenerationLedgerState[] {
  const states: GenerationLedgerState[] = [];
  for (const answerCreditsRemaining of COUNT_BOUNDARIES) {
    for (const advancedTaskCreditsRemaining of COUNT_BOUNDARIES) {
      for (const providerCostRemainingMicroAud of MONEY_BOUNDARIES) {
        for (const founderBudgetExhausted of BOOLEANS) {
          for (const generationAvailable of BOOLEANS) {
            for (const pricingValid of BOOLEANS) {
              for (const ledger of LEDGERS) {
                states.push({
                  answerCreditsRemaining,
                  advancedTaskCreditsRemaining,
                  providerCostRemainingMicroAud,
                  founderBudgetExhausted,
                  generationAvailable,
                  pricingValid,
                  ledger,
                });
              }
            }
          }
        }
      }
    }
  }
  return states;
}

const states = everyGenerationLedgerState();

/** A Search request whose every generation-side input is taken from the state under test. */
function searchAdmission(state: GenerationLedgerState): AdmissionInput {
  const exhaustedFounderState = {
    periodKey: '2026-08',
    ceilingMicroAud: CEILING,
    monthToDateDebitMicroAud: state.founderBudgetExhausted ? CEILING : microAud(0n),
    outstandingReservationsMicroAud: microAud(0n),
    allowances: {
      INCIDENT_OR_SAFETY_CHECK: microAud(0n),
      TRIAL_COMMITMENT: microAud(0n),
      INTERNAL_TESTING: microAud(0n),
      DISCRETIONARY_DEEP: microAud(0n),
    },
    consumed: {
      INCIDENT_OR_SAFETY_CHECK: microAud(0n),
      TRIAL_COMMITMENT: microAud(0n),
      INTERNAL_TESTING: microAud(0n),
      DISCRETIONARY_DEEP: microAud(0n),
    },
  };
  return {
    operation: 'SEARCH',
    tier: 'TRIAL',
    nowEpochMs: NOW,
    generationAvailable: state.generationAvailable,
    quota: {
      counters: [
        { ledger: 'SEARCH', limit: 20, used: 0, resetAtEpochMs: NOW + 60_000 },
        {
          ledger: 'ANSWER_CREDITS',
          limit: 20,
          used: 20 - Math.min(20, state.answerCreditsRemaining),
          resetAtEpochMs: NOW + 60_000,
        },
        {
          ledger: 'ADVANCED_TASK_CREDITS',
          limit: 2,
          used: 2 - Math.min(2, state.advancedTaskCreditsRemaining),
          resetAtEpochMs: NOW + 60_000,
        },
      ],
    },
    concurrency: [{ boundary: 'CONCURRENT_QUICK', limit: 1, inFlight: 1 }],
    funding:
      state.ledger === 'FOUNDER_PLATFORM_BUDGET'
        ? {
            kind: 'FOUNDER_PLATFORM_BUDGET',
            reserveClass: 'DISCRETIONARY_DEEP',
            state: exhaustedFounderState,
          }
        : { kind: 'CUSTOMER_PREPAID_OR_BYOK', mode: 'BYOK' },
    pricing: state.pricingValid
      ? {
          price: {
            currency: 'USD',
            inputMicroUnitsPerMillionTokens: 3_000n,
            outputMicroUnitsPerMillionTokens: 15_000n,
            observedAtEpochMs: NOW,
          },
          fx: {
            fromCurrency: 'USD',
            toCurrency: 'AUD',
            microAudPerUnit: 1_500_000n,
            safetyMarginBasisPoints: 250n,
            observedAtEpochMs: NOW,
          },
          maxAgeMs: 86_400_000,
          maxInputTokens: 1_000_000n,
          maxOutputTokens: 1_000_000n,
          reservationId: 'res-search',
        }
      : null,
  };
}

describe('search is never disabled by a generation ledger', () => {
  it('enumerates the whole boundary state space (non-vacuity, count asserted)', () => {
    expect(states).toHaveLength(2_000);
    expect(new Set(states.map((state) => JSON.stringify(state, replacer))).size).toBe(2_000);
  });

  it('isSearchAffected returns false for every generation-ledger state', () => {
    const offenders = states.filter((state) => isSearchAffected(state) !== false);
    expect(offenders).toEqual([]);
  });

  it('admits Search for every generation-ledger state, for no generation reason', () => {
    const forbidden = new Set([
      'CREDIT_LIMIT_REACHED',
      'PRICE_DATA_UNAVAILABLE',
      'GENERATION_UNAVAILABLE',
      'CONCURRENCY_LIMIT',
    ]);
    const offenders: string[] = [];
    for (const state of states) {
      const decision = admit(searchAdmission(state));
      if (!decision.allowed && forbidden.has(decision.reason)) {
        offenders.push(`${decision.reason} for ${JSON.stringify(state, replacer)}`);
      }
      if (!decision.allowed) offenders.push(`unexpected denial ${decision.reason}`);
    }
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it('denies Search only when its OWN search-burst quota is exhausted', () => {
    const base = searchAdmission(states[0] as GenerationLedgerState);
    const exhausted = admit({
      ...base,
      quota: {
        counters: [{ ledger: 'SEARCH', limit: 20, used: 20, resetAtEpochMs: NOW + 60_000 }],
      },
    });
    expect(exhausted.allowed).toBe(false);
    if (!exhausted.allowed) expect(exhausted.reason).toBe('RATE_LIMITED');
  });

  it('reserves nothing for Search: no funding ledger is touched', () => {
    const decision = admit(searchAdmission(states[0] as GenerationLedgerState));
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.reservation).toBeNull();
      expect(decision.byokEstimate).toBeNull();
    }
  });
});

/** `JSON.stringify` cannot serialise a bigint; render it as a decimal string instead. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? String(value) : value;
}
