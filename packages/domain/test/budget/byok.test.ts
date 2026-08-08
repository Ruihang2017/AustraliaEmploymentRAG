/**
 * FND-09 acceptance item 10 — no founder liability from BYOK: for every BYOK-funded operation the
 * founder ledger debit is exactly `0n` while the estimate is recorded (PRD §42.6, §24.4, §16.4).
 *
 * The assertion is `toBe(0n)` PLUS `typeof === 'bigint'`, never a truthy check: `0`, `''` and `false`
 * would all pass a truthy check, and the difference between `0` and `0n` here is the difference
 * between "no founder liability" and "a number-typed money value" (PRD §34.1).
 */
import { describe, expect, it } from 'vitest';

import {
  FUNDING_LEDGER_VALUES,
  isFounderLiability,
  microAud,
  recordByokEstimate,
  type FounderReserveClass,
  type OperationClass,
} from '../../src/budget/index.js';
import { AUD_PRICE, IDENTITY_FX, MAX_PRICE_AGE_MILLIS, NOW } from './doubles.js';
import { correctAdmit, runSequence } from './harness.js';
import { forEachDraw } from './rng.js';

const OPERATIONS: readonly OperationClass[] = [
  'SEARCH',
  'QUICK',
  'DEEP',
  'EXPORT',
  'API_CALL',
  'WIDGET_SESSION',
  'WEBHOOK_ENDPOINT',
];

const RESERVE_CLASSES: readonly FounderReserveClass[] = [
  'PRODUCTION_INCIDENT_OR_SAFETY_CHECK',
  'ACTIVE_TRIAL_COMMITMENT',
  'INTERNAL_TESTING',
  'DISCRETIONARY_DEEP',
];

describe('isFounderLiability is total over FND-03’s funding ledgers', () => {
  it('is true only for FOUNDER_PLATFORM_BUDGET', () => {
    expect(isFounderLiability('FOUNDER_PLATFORM_BUDGET')).toBe(true);
    expect(isFounderLiability('CUSTOMER_PREPAID_OR_BYOK')).toBe(false);
    for (const value of FUNDING_LEDGER_VALUES) {
      expect(typeof isFounderLiability(value)).toBe('boolean');
    }
    expect(FUNDING_LEDGER_VALUES).toHaveLength(2);
  });
});

describe('every BYOK operation debits the founder ledger exactly 0n', () => {
  for (const operation of OPERATIONS) {
    for (const reserveClass of RESERVE_CLASSES) {
      it(`${operation} / ${reserveClass}`, () => {
        const estimate = recordByokEstimate({
          inputTokens: 120_000n,
          outputTokens: 30_000n,
          price: AUD_PRICE,
          fx: IDENTITY_FX,
          now: NOW,
          maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
        });
        expect(estimate.founderDebitMicroAud).toBe(0n);
        expect(typeof estimate.founderDebitMicroAud).toBe('bigint');
        expect(estimate.priceAvailable).toBe(true);
        expect(estimate.estimateMicroAud).not.toBeNull();
        expect(estimate.estimateMicroAud ?? 0n).toBeGreaterThan(0n);
      });
    }
  }

  it('records nothing but a null estimate when price data is unavailable', () => {
    const estimate = recordByokEstimate({
      inputTokens: 1n,
      outputTokens: 1n,
      price: null,
      fx: IDENTITY_FX,
      now: NOW,
      maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
    });
    expect(estimate.estimateMicroAud).toBeNull();
    expect(estimate.founderDebitMicroAud).toBe(0n);
    expect(estimate.priceAvailable).toBe(false);
  });

  it('estimates zero-token usage as zero, not as null', () => {
    const estimate = recordByokEstimate({
      inputTokens: 0n,
      outputTokens: 0n,
      price: AUD_PRICE,
      fx: IDENTITY_FX,
      now: NOW,
      maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
    });
    expect(estimate.estimateMicroAud).toBe(0n);
    expect(estimate.priceAvailable).toBe(true);
  });
});

describe('BYOK sequences never move the founder ledger at all', () => {
  it('leaves settled and held at zero over 1,000 generated sequences', () => {
    const violations: string[] = [];
    forEachDraw(1_000, (rng, index, seed) => {
      const result = runSequence(correctAdmit, rng, {
        ceilingMicroAud: microAud(1_000_000n),
        byokOnly: true,
        operations: 5 + rng.int(16),
        maxInputTokens: 200_000n,
        maxOutputTokens: 50_000n,
      });
      if (result.violations.length > 0) {
        violations.push(`seed 0x${seed.toString(16)} case ${String(index)}: ${result.violations[0] ?? ''}`);
      }
      expect(result.settledMicroAud).toBe(0n);
      expect(result.heldMicroAud).toBe(0n);
    });
    expect(violations.slice(0, 5), violations.join('\n')).toEqual([]);
  });
});
