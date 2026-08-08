/**
 * FND-09 acceptance item "Settlement exactness" `[machine]` (PRD §42.6; `UAT-ANS-07`).
 *
 * `debit + release === reservation.amountMicroAud` for EVERY case, including the clamp path, and a
 * never-executed call releases the full reservation.
 */
import { describe, expect, it } from 'vitest';

import { costOf, type FxSnapshot, type PriceSnapshot } from '../../src/budget/pricing.js';
import { reserve } from '../../src/budget/reserve.js';
import { settle } from '../../src/budget/settle.js';
import { generateScenario, usageFor } from './sequence-generator.js';

const OBSERVED = 1_754_600_000_000;

const price: PriceSnapshot = {
  currency: 'USD',
  inputMicroUnitsPerMillionTokens: 3_000n,
  outputMicroUnitsPerMillionTokens: 15_000n,
  observedAtEpochMs: OBSERVED,
};

const fx: FxSnapshot = {
  fromCurrency: 'USD',
  toCurrency: 'AUD',
  microAudPerUnit: 1_500_000n,
  safetyMarginBasisPoints: 250n,
  observedAtEpochMs: OBSERVED,
};

const reservation = reserve({
  reservationId: 'res-settle',
  maxInputTokens: 2_000_000n,
  maxOutputTokens: 500_000n,
  price,
  fx,
});

describe('settle', () => {
  it('releases the full reservation when the call never ran (UAT-ANS-07)', () => {
    const result = settle(reservation, {
      executed: false,
      usage: { inputTokens: 2_000_000n, outputTokens: 500_000n },
    });
    expect(result.debitMicroAud).toBe(0n);
    expect(result.releaseMicroAud).toBe(reservation.amountMicroAud);
    expect(typeof result.debitMicroAud).toBe('bigint');
    expect(typeof result.releaseMicroAud).toBe('bigint');
  });

  it('releases the full reservation for zero usage', () => {
    const result = settle(reservation, {
      executed: true,
      usage: { inputTokens: 0n, outputTokens: 0n },
    });
    expect(result.debitMicroAud).toBe(0n);
    expect(result.releaseMicroAud).toBe(reservation.amountMicroAud);
  });

  it('debits the actual cost and releases the remainder', () => {
    const usage = { inputTokens: 1_000_000n, outputTokens: 250_000n };
    const result = settle(reservation, { executed: true, usage });
    expect(result.debitMicroAud).toBe(costOf(usage, price, fx));
    expect(result.debitMicroAud + result.releaseMicroAud).toBe(reservation.amountMicroAud);
    expect(result.debitMicroAud).toBeLessThan(reservation.amountMicroAud);
  });

  it('debits at most the reserved amount when usage equals the reserved maxima', () => {
    const result = settle(reservation, {
      executed: true,
      usage: { inputTokens: 2_000_000n, outputTokens: 500_000n },
    });
    expect(result.debitMicroAud).toBeLessThanOrEqual(reservation.amountMicroAud);
    expect(result.releaseMicroAud).toBeGreaterThanOrEqual(0n);
    expect(result.debitMicroAud + result.releaseMicroAud).toBe(reservation.amountMicroAud);
  });

  it('clamps a provider overrun instead of breaking the ledger identity', () => {
    const overrun = { inputTokens: 200_000_000n, outputTokens: 200_000_000n };
    expect(costOf(overrun, price, fx)).toBeGreaterThan(reservation.amountMicroAud);
    const result = settle(reservation, { executed: true, usage: overrun });
    expect(result.debitMicroAud).toBe(reservation.amountMicroAud);
    expect(result.releaseMicroAud).toBe(0n);
    expect(result.debitMicroAud + result.releaseMicroAud).toBe(reservation.amountMicroAud);
  });

  it('balances exactly over 10,000 generated reservations and every settlement shape', () => {
    const violations: string[] = [];
    let checked = 0;
    let cancelled = 0;
    for (let seed = 0; seed < 10_000; seed += 1) {
      const scenario = generateScenario(seed);
      for (const step of scenario.steps) {
        if (step.kind !== 'ADMIT') continue;
        const generated = reserve({
          reservationId: step.reservationId,
          maxInputTokens: step.maxInputTokens,
          maxOutputTokens: step.maxOutputTokens,
          price: step.price,
          fx: step.fx,
        });
        for (const shape of ['CANCELLED', 'ZERO', 'PARTIAL', 'MAX', 'OVER'] as const) {
          const actual = usageFor(shape, 61, step.maxInputTokens, step.maxOutputTokens);
          const result = settle(generated, actual);
          checked += 1;
          if (result.debitMicroAud + result.releaseMicroAud !== generated.amountMicroAud) {
            violations.push(`seed ${String(seed)} shape ${shape}: settlement does not balance`);
          }
          if (result.debitMicroAud > generated.amountMicroAud) {
            violations.push(`seed ${String(seed)} shape ${shape}: debit exceeds the reservation`);
          }
          if (shape === 'CANCELLED') {
            cancelled += 1;
            if (result.releaseMicroAud !== generated.amountMicroAud) {
              violations.push(`seed ${String(seed)}: cancellation did not release in full`);
            }
          }
        }
      }
    }
    expect(violations.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(50_000);
    expect(cancelled).toBeGreaterThan(10_000);
  });
});
