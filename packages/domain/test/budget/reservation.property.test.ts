/**
 * FND-09 acceptance item 5 — conservative reservation: for any input, the reservation is at least the
 * cost computed from actual usage at the same price, for every rounding case (PRD §42.6).
 */
import { describe, expect, it } from 'vitest';

import {
  ceilDiv,
  costMicroAud,
  reserve,
  reservationId,
  settle,
  type FxSnapshot,
  type PriceSnapshot,
} from '../../src/budget/index.js';
import { MAX_PRICE_AGE_MILLIS, NOW, PRICE_TABLE } from './harness.js';
import { forEachDraw } from './rng.js';

const AUD: FxSnapshot = {
  fromCurrency: 'AUD',
  toCurrency: 'AUD',
  microAudPerUnit: 1_000_000n,
  safetyMarginBasisPoints: 0n,
  recordedAt: NOW,
};

function priceOf(inputMicro: bigint, outputMicro: bigint): PriceSnapshot {
  return {
    currency: 'AUD',
    microPerMillionInputTokens: inputMicro,
    microPerMillionOutputTokens: outputMicro,
    recordedAt: NOW,
  };
}

describe('ceilDiv — the single rounding chokepoint', () => {
  it('rounds up on every remainder and is exact on multiples', () => {
    expect(ceilDiv(0n, 3n)).toBe(0n);
    expect(ceilDiv(1n, 3n)).toBe(1n);
    expect(ceilDiv(2n, 3n)).toBe(1n);
    expect(ceilDiv(3n, 3n)).toBe(1n);
    expect(ceilDiv(4n, 3n)).toBe(2n);
    expect(ceilDiv(1_000_000n, 1_000_000n)).toBe(1n);
    expect(ceilDiv(1_000_001n, 1_000_000n)).toBe(2n);
    expect(ceilDiv(999_999n, 1_000_000n)).toBe(1n);
  });

  it('refuses a non-positive denominator and a negative numerator', () => {
    expect(() => ceilDiv(1n, 0n)).toThrow(RangeError);
    expect(() => ceilDiv(1n, -1n)).toThrow(RangeError);
    expect(() => ceilDiv(-1n, 1n)).toThrow(RangeError);
  });

  it('is monotonic non-decreasing in its numerator (the reason conservativeness is structural)', () => {
    for (let n = 0n; n < 50n; n += 1n) {
      expect(ceilDiv(n + 1n, 7n)).toBeGreaterThanOrEqual(ceilDiv(n, 7n));
    }
  });
});

describe('cost rounding table', () => {
  it('adds nothing on an exact multiple of one million tokens', () => {
    expect(costMicroAud(1_000_000n, 0n, priceOf(3_000_000n, 0n), AUD)).toBe(3_000_000n);
    expect(costMicroAud(2_000_000n, 0n, priceOf(3_000_000n, 0n), AUD)).toBe(6_000_000n);
  });

  it('rounds one token over a multiple UP by the smallest possible unit', () => {
    // 1_000_001 tokens at 3 micro-AUD per million = 3.000003 micro-AUD -> ceil = 3_000_004? No:
    // (1_000_001 * 3_000_000) / 1_000_000 = 3_000_003 exactly, so use a price that leaves a remainder.
    expect(costMicroAud(1_000_001n, 0n, priceOf(3n, 0n), AUD)).toBe(4n);
    expect(costMicroAud(1_000_000n, 0n, priceOf(3n, 0n), AUD)).toBe(3n);
    expect(costMicroAud(999_999n, 0n, priceOf(3n, 0n), AUD)).toBe(3n);
  });

  it('costs nothing for zero tokens', () => {
    expect(costMicroAud(0n, 0n, priceOf(3_000_000n, 15_000_000n), AUD)).toBe(0n);
  });

  it('never rounds a non-zero call down to zero (a zero reservation stops the ceiling holding)', () => {
    expect(costMicroAud(1n, 0n, priceOf(1n, 0n), AUD)).toBe(1n);
    expect(costMicroAud(1n, 1n, priceOf(1n, 1n), AUD)).toBe(2n);
  });

  it('applies the safety margin upward, and the identity FX rate changes nothing', () => {
    const plain = costMicroAud(1_000_000n, 0n, priceOf(1_000_000n, 0n), AUD);
    const margined = costMicroAud(1_000_000n, 0n, priceOf(1_000_000n, 0n), {
      ...AUD,
      safetyMarginBasisPoints: 500n,
    });
    expect(plain).toBe(1_000_000n);
    expect(margined).toBe(1_050_000n);
    const crossCurrency = costMicroAud(1_000_000n, 0n, { ...priceOf(1_000_000n, 0n), currency: 'USD' }, {
      fromCurrency: 'USD',
      toCurrency: 'AUD',
      microAudPerUnit: 1_500_000n,
      safetyMarginBasisPoints: 0n,
      recordedAt: NOW,
    });
    expect(crossCurrency).toBe(1_500_000n);
  });

  it('refuses negative token counts', () => {
    expect(() => costMicroAud(-1n, 0n, priceOf(1n, 1n), AUD)).toThrow(RangeError);
  });
});

describe('conservative reservation property (>= 10,000 draws)', () => {
  it('a settled debit never exceeds the reservation taken for the same call', () => {
    let sawRounding = false;
    let sawFullUse = false;

    forEachDraw(10_000, (rng, index, seed) => {
      const { price, fx } = rng.pick(PRICE_TABLE);
      const profileMaxIn = rng.bigint(200_000n) + 1n;
      const profileMaxOut = rng.bigint(50_000n) + 1n;
      const requestedIn = rng.bigint(300_000n) + 1n;
      const requestedOut = rng.bigint(80_000n) + 1n;

      const reservation = reserve({
        request: {
          reservationId: reservationId(`rsv-${String(index)}`),
          operation: 'QUICK',
          reserveClass: 'INTERNAL_TESTING',
          profileCeiling: { maxInputTokens: profileMaxIn, maxOutputTokens: profileMaxOut },
          requestedMaxInputTokens: requestedIn,
          requestedMaxOutputTokens: requestedOut,
        },
        ledger: 'FOUNDER_PLATFORM_BUDGET',
        price,
        fx,
        now: NOW,
        maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
      });

      // The effective ceilings are the MINIMUM of request and profile — never the larger.
      expect(reservation.effectiveMaxInputTokens).toBe(
        requestedIn < profileMaxIn ? requestedIn : profileMaxIn,
      );
      expect(reservation.effectiveMaxOutputTokens).toBe(
        requestedOut < profileMaxOut ? requestedOut : profileMaxOut,
      );

      // Every tenth draw uses the reservation to the last token: the tight case, which a purely random
      // draw would essentially never produce and which is where an off-by-one rounding shows up.
      const tight = index % 10 === 0;
      const actualIn = tight
        ? reservation.effectiveMaxInputTokens
        : rng.bigint(reservation.effectiveMaxInputTokens + 1n);
      const actualOut = tight
        ? reservation.effectiveMaxOutputTokens
        : rng.bigint(reservation.effectiveMaxOutputTokens + 1n);
      const actualCost = costMicroAud(actualIn, actualOut, price, fx);
      expect(
        actualCost <= reservation.amountMicroAud,
        `seed 0x${seed.toString(16)} case ${String(index)}: ${actualCost.toString()} > ${reservation.amountMicroAud.toString()}`,
      ).toBe(true);

      const settlement = settle(reservation, { executed: true, inputTokens: actualIn, outputTokens: actualOut });
      expect(settlement.debitMicroAud).toBeLessThanOrEqual(reservation.amountMicroAud);
      expect(settlement.overrunMicroAud).toBe(0n);

      if (actualCost < reservation.amountMicroAud) sawRounding = true;
      if (
        actualIn === reservation.effectiveMaxInputTokens &&
        actualOut === reservation.effectiveMaxOutputTokens
      ) {
        sawFullUse = true;
      }
    });

    expect(sawRounding, 'the corpus must contain partially-used reservations').toBe(true);
    expect(sawFullUse, 'the corpus must contain a fully-used reservation (the tight case)').toBe(true);
  });

  it('reserving the profile ceiling costs exactly the cost of the profile ceiling', () => {
    const reservation = reserve({
      request: {
        reservationId: reservationId('rsv-exact'),
        operation: 'DEEP',
        reserveClass: 'DISCRETIONARY_DEEP',
        profileCeiling: { maxInputTokens: 1_000_000n, maxOutputTokens: 1_000_000n },
        requestedMaxInputTokens: 5_000_000n,
        requestedMaxOutputTokens: 5_000_000n,
      },
      ledger: 'FOUNDER_PLATFORM_BUDGET',
      price: priceOf(3_000_000n, 15_000_000n),
      fx: AUD,
      now: NOW,
      maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
    });
    expect(reservation.effectiveMaxInputTokens).toBe(1_000_000n);
    expect(reservation.amountMicroAud).toBe(18_000_000n);
    expect(reservation.founderDebitApplies).toBe(true);
  });
});
