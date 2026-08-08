/**
 * FND-09 acceptance item 6 — settlement exactness: `debit + release === reservation.amount` for every
 * case, and a never-executed call releases the full reservation (PRD §42.6; `UAT-ANS-07`).
 */
import { describe, expect, it } from 'vitest';

import { costMicroAud, reserve, reservationId, settle, type Reservation } from '../../src/budget/index.js';
import { MAX_PRICE_AGE_MILLIS, NOW, PRICE_TABLE } from './harness.js';
import { forEachDraw } from './rng.js';

const pair = PRICE_TABLE[0];
if (pair === undefined) throw new Error('price table is empty');

function reservationOf(maxIn: bigint, maxOut: bigint): Reservation {
  return reserve({
    request: {
      reservationId: reservationId('rsv-settle'),
      operation: 'QUICK',
      reserveClass: 'ACTIVE_TRIAL_COMMITMENT',
      profileCeiling: { maxInputTokens: maxIn, maxOutputTokens: maxOut },
      requestedMaxInputTokens: maxIn,
      requestedMaxOutputTokens: maxOut,
    },
    ledger: 'FOUNDER_PLATFORM_BUDGET',
    price: pair.price,
    fx: pair.fx,
    now: NOW,
    maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
  });
}

describe('settlement exactness (>= 10,000 draws)', () => {
  it('debit + release === reservation amount, for every usage including over-ceiling usage', () => {
    let sawOverrun = false;
    let sawPartial = false;
    let sawCancel = false;

    forEachDraw(10_000, (rng, index, seed) => {
      const reservation = reservationOf(rng.bigint(200_000n) + 1n, rng.bigint(50_000n) + 1n);
      // One draw in four deliberately exceeds the reserved ceilings.
      const overrun = rng.int(4) === 0;
      const executed = rng.int(8) !== 0;
      const inputTokens = overrun
        ? reservation.effectiveMaxInputTokens + rng.bigint(10_000n) + 1n
        : rng.bigint(reservation.effectiveMaxInputTokens + 1n);
      const outputTokens = overrun
        ? reservation.effectiveMaxOutputTokens + rng.bigint(5_000n) + 1n
        : rng.bigint(reservation.effectiveMaxOutputTokens + 1n);

      const settlement = settle(reservation, { executed, inputTokens, outputTokens });
      expect(
        settlement.debitMicroAud + settlement.releaseMicroAud,
        `seed 0x${seed.toString(16)} case ${String(index)}`,
      ).toBe(reservation.amountMicroAud);
      expect(settlement.debitMicroAud).toBeLessThanOrEqual(reservation.amountMicroAud);

      if (!executed) {
        sawCancel = true;
        expect(settlement.debitMicroAud).toBe(0n);
        expect(settlement.releaseMicroAud).toBe(reservation.amountMicroAud);
        expect(settlement.overrunMicroAud).toBe(0n);
      } else if (overrun) {
        const actual = costMicroAud(inputTokens, outputTokens, reservation.priceSnapshot, reservation.fxSnapshot);
        expect(settlement.debitMicroAud).toBe(reservation.amountMicroAud);
        expect(settlement.overrunMicroAud).toBe(actual - reservation.amountMicroAud);
        if (settlement.overrunMicroAud > 0n) sawOverrun = true;
      } else {
        expect(settlement.overrunMicroAud).toBe(0n);
        if (settlement.releaseMicroAud > 0n) sawPartial = true;
      }
    });

    expect(sawOverrun, 'the corpus must contain an over-ceiling usage').toBe(true);
    expect(sawPartial, 'the corpus must contain a partially-used reservation').toBe(true);
    expect(sawCancel, 'the corpus must contain a cancellation').toBe(true);
  });
});

describe('UAT-ANS-07 — cancel before the provider stage releases the full reserved credit', () => {
  it('releases everything and debits exactly zero, whatever token counts are reported', () => {
    const reservation = reservationOf(100_000n, 20_000n);
    for (const usage of [
      { executed: false, inputTokens: 0n, outputTokens: 0n },
      { executed: false, inputTokens: 50_000n, outputTokens: 10_000n },
      { executed: false, inputTokens: 10_000_000n, outputTokens: 10_000_000n },
    ]) {
      const settlement = settle(reservation, usage);
      expect(settlement.releaseMicroAud).toBe(reservation.amountMicroAud);
      expect(settlement.debitMicroAud).toBe(0n);
      expect(typeof settlement.debitMicroAud).toBe('bigint');
    }
  });

  it('a zero-token execution debits nothing and releases everything', () => {
    const reservation = reservationOf(100_000n, 20_000n);
    const settlement = settle(reservation, { executed: true, inputTokens: 0n, outputTokens: 0n });
    expect(settlement.debitMicroAud).toBe(0n);
    expect(settlement.releaseMicroAud).toBe(reservation.amountMicroAud);
  });

  it('settles at the reservation’s own snapshots, not at a price supplied later', () => {
    const reservation = reservationOf(1_000_000n, 0n);
    expect(reservation.priceSnapshot).toBe(pair.price);
    expect(reservation.fxSnapshot).toBe(pair.fx);
    const settlement = settle(reservation, { executed: true, inputTokens: 1_000_000n, outputTokens: 0n });
    expect(settlement.debitMicroAud).toBe(reservation.amountMicroAud);
    expect(settlement.releaseMicroAud).toBe(0n);
  });

  it('refuses negative reported token counts', () => {
    const reservation = reservationOf(100n, 100n);
    expect(() => settle(reservation, { executed: true, inputTokens: -1n, outputTokens: 0n })).toThrow(
      RangeError,
    );
  });
});
