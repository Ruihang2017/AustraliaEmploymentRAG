/**
 * FND-09 acceptance item 9 — Search is unaffected by the generation ledger (PRD §8.2: *"Search MUST
 * remain usable when the AI budget is exhausted"*; §36.8's final row; OPS-003's "search remains usable").
 *
 * `isSearchAffected` is asserted over the WHOLE state space — all 2^7 = 128 generation-ledger states,
 * enumerated, not sampled — and `admit` is swept over those states crossed with both tiers and both
 * funding ledgers.
 */
import { describe, expect, it } from 'vitest';

import {
  admit,
  isSearchAffected,
  microAud,
  OPERATIONS_REQUIRING_MODEL_FUNDING,
  ZERO_MICRO_AUD,
  type FundingLedgerKind,
  type GenerationLedgerState,
  type Tier,
} from '../../src/budget/index.js';
import {
  AUD_PRICE,
  IDENTITY_FX,
  admissionInput,
  counter,
  founderState,
  quotaState,
  request,
} from './doubles.js';

const FLAGS = [
  'founderCeilingReached',
  'warningCrossed',
  'answerCreditsExhausted',
  'advancedTaskCreditsExhausted',
  'providerCostExhausted',
  'priceDataAvailable',
  'generationAvailable',
] as const;

function allStates(): GenerationLedgerState[] {
  const states: GenerationLedgerState[] = [];
  for (let mask = 0; mask < 1 << FLAGS.length; mask += 1) {
    const state: Record<string, boolean> = {};
    for (const [bit, flag] of FLAGS.entries()) state[flag] = (mask & (1 << bit)) !== 0;
    states.push(state as unknown as GenerationLedgerState);
  }
  return states;
}

const STATES = allStates();

describe('isSearchAffected is total and always false', () => {
  it('enumerates all 128 generation-ledger states (non-vacuity)', () => {
    expect(STATES).toHaveLength(128);
    expect(new Set(STATES.map((state) => JSON.stringify(state))).size).toBe(128);
  });

  it('returns false for every one of them', () => {
    for (const state of STATES) {
      expect(isSearchAffected(state), JSON.stringify(state)).toBe(false);
    }
  });
});

describe('no admission path can deny a Search for a generation-ledger reason', () => {
  const tiers: readonly Tier[] = ['TRIAL', 'PAID_PILOT'];
  const ledgers: readonly FundingLedgerKind[] = ['FOUNDER_PLATFORM_BUDGET', 'CUSTOMER_PREPAID_OR_BYOK'];

  it('admits Search across all 128 states x both tiers x both funding ledgers', () => {
    let sweep = 0;
    for (const state of STATES) {
      for (const tier of tiers) {
        for (const ledger of ledgers) {
          const decision = admit(
            admissionInput({
              request: request({ operation: 'SEARCH', reserveClass: 'DISCRETIONARY_DEEP' }),
              tier,
              ledger,
              customer: ledger === 'CUSTOMER_PREPAID_OR_BYOK'
                ? { mode: 'BYOK', prepaidRemainingMicroAud: ZERO_MICRO_AUD }
                : null,
              // Every generation-side signal at its worst: ceiling reached, no budget, no price data,
              // the provider down. Search must still be admitted.
              founder: founderState({
                ceilingMicroAud: ZERO_MICRO_AUD,
                settledMicroAud: ZERO_MICRO_AUD,
                heldMicroAud: ZERO_MICRO_AUD,
              }),
              price: state.priceDataAvailable ? AUD_PRICE : null,
              fx: state.priceDataAvailable ? IDENTITY_FX : null,
              generationAvailable: state.generationAvailable,
            }),
          );
          sweep += 1;
          expect(decision.allowed, JSON.stringify({ state, tier, ledger })).toBe(true);
          if (!decision.allowed) continue;
          // No model funding is consumed by a Search, so there is no reservation to make.
          expect(decision.reservation).toBeNull();
        }
      }
    }
    expect(sweep).toBe(128 * 2 * 2);
  });

  it('the only reason a Search may be denied is its own search-burst quota', () => {
    const denied = admit(
      admissionInput({
        request: request({ operation: 'SEARCH' }),
        quota: quotaState({ counters: { SEARCH: counter(20n, 20n) } }),
        founder: founderState({ ceilingMicroAud: microAud(1n) }),
        generationAvailable: false,
        price: null,
        fx: null,
      }),
    );
    expect(denied.allowed).toBe(false);
    if (denied.allowed) return;
    expect(denied.reason).toBe('RATE_LIMITED');
  });

  it('exhausting the answer-credit ledger does not deny a Search', () => {
    const decision = admit(
      admissionInput({
        request: request({ operation: 'SEARCH' }),
        quota: quotaState({ counters: { ANSWER_CREDITS: counter(20n, 20n), PROVIDER_COST: counter(1n, 1n) } }),
      }),
    );
    expect(decision.allowed).toBe(true);
  });

  it('SEARCH is structurally absent from the operations that require model funding', () => {
    expect(OPERATIONS_REQUIRING_MODEL_FUNDING.has('SEARCH')).toBe(false);
    expect(OPERATIONS_REQUIRING_MODEL_FUNDING.has('QUICK')).toBe(true);
    expect(OPERATIONS_REQUIRING_MODEL_FUNDING.has('DEEP')).toBe(true);
  });
});
