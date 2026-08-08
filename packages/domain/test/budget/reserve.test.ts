/**
 * FND-09 acceptance item "Conservative reservation" `[machine]` (PRD §42.6).
 *
 * For every generated (maxTokens, price, fx) and every actual usage within the reserved maxima,
 * `reserve().amountMicroAud >= costOf(actual, …)`. Exact multiples of 1,000,000n, one micro under
 * and one micro over are covered explicitly, and every intermediate rounding is asserted upward
 * against a table of hand-computed `ceilDiv` values.
 */
import { describe, expect, it } from 'vitest';

import { ceilDiv, floorDiv } from '../../src/budget/micro-aud.js';
import { costOf, type FxSnapshot, type PriceSnapshot } from '../../src/budget/pricing.js';
import { reserve } from '../../src/budget/reserve.js';
import { generateScenario, usageFor } from './sequence-generator.js';

const OBSERVED = 1_754_600_000_000;

const price = (input: bigint, output: bigint): PriceSnapshot => ({
  currency: 'USD',
  inputMicroUnitsPerMillionTokens: input,
  outputMicroUnitsPerMillionTokens: output,
  observedAtEpochMs: OBSERVED,
});

const fx = (rate: bigint, marginBasisPoints: bigint): FxSnapshot => ({
  fromCurrency: 'USD',
  toCurrency: 'AUD',
  microAudPerUnit: rate,
  safetyMarginBasisPoints: marginBasisPoints,
  observedAtEpochMs: OBSERVED,
});

describe('ceilDiv / floorDiv', () => {
  it.each([
    [0n, 1_000_000n, 0n],
    [1n, 1_000_000n, 1n],
    [999_999n, 1_000_000n, 1n],
    [1_000_000n, 1_000_000n, 1n],
    [1_000_001n, 1_000_000n, 2n],
    [1_999_999n, 1_000_000n, 2n],
    [2_000_000n, 1_000_000n, 2n],
    [7n, 3n, 3n],
    [9n, 3n, 3n],
  ])('ceilDiv(%s, %s) === %s', (numerator, denominator, expected) => {
    expect(ceilDiv(numerator, denominator)).toBe(expected);
  });

  it('rounds up wherever floorDiv rounds down', () => {
    for (let value = 0n; value <= 20n; value += 1n) {
      const down = floorDiv(value, 7n);
      const up = ceilDiv(value, 7n);
      expect(up).toBeGreaterThanOrEqual(down);
      expect(up * 7n).toBeGreaterThanOrEqual(value);
      expect(down * 7n).toBeLessThanOrEqual(value);
    }
  });

  it('is monotone non-decreasing in the numerator', () => {
    let previous = ceilDiv(0n, 13n);
    for (let value = 1n; value <= 200n; value += 1n) {
      const current = ceilDiv(value, 13n);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe('costOf', () => {
  it('rounds every intermediate step upward', () => {
    // 1 token at 1 micro-unit per million tokens is a fraction of a micro-unit: it must not vanish.
    expect(costOf({ inputTokens: 1n, outputTokens: 0n }, price(1n, 1n), fx(1_000_000n, 0n))).toBe(
      1n,
    );
    expect(costOf({ inputTokens: 0n, outputTokens: 0n }, price(1n, 1n), fx(1_000_000n, 0n))).toBe(
      0n,
    );
    // Exact multiple: no spurious extra unit.
    expect(
      costOf({ inputTokens: 1_000_000n, outputTokens: 0n }, price(1_000n, 0n), fx(1_000_000n, 0n)),
    ).toBe(1_000n);
    // One token over an exact multiple rounds up.
    expect(
      costOf({ inputTokens: 1_000_001n, outputTokens: 0n }, price(1_000n, 0n), fx(1_000_000n, 0n)),
    ).toBe(1_001n);
    // One token under.
    expect(
      costOf({ inputTokens: 999_999n, outputTokens: 0n }, price(1_000n, 0n), fx(1_000_000n, 0n)),
    ).toBe(1_000n);
  });

  it('is monotone non-decreasing in both token counts', () => {
    const p = price(3_000n, 7_000n);
    const f = fx(1_500_000n, 0n);
    let previous = costOf({ inputTokens: 0n, outputTokens: 0n }, p, f);
    for (let tokens = 1n; tokens <= 300n; tokens += 7n) {
      const byInput = costOf({ inputTokens: tokens, outputTokens: 0n }, p, f);
      const byOutput = costOf({ inputTokens: 0n, outputTokens: tokens }, p, f);
      expect(byInput).toBeGreaterThanOrEqual(previous);
      expect(byOutput).toBeGreaterThanOrEqual(0n);
      previous = byInput;
    }
  });

  it('returns bigint money, never a number', () => {
    expect(typeof costOf({ inputTokens: 5n, outputTokens: 5n }, price(9n, 9n), fx(9n, 0n))).toBe(
      'bigint',
    );
  });
});

describe('reserve', () => {
  it('is deterministic: the same input twice yields a deep-equal reservation', () => {
    const input = {
      reservationId: 'res-1',
      maxInputTokens: 1_234_567n,
      maxOutputTokens: 7_654_321n,
      price: price(3_000n, 15_000n),
      fx: fx(1_500_000n, 250n),
    };
    expect(reserve(input)).toEqual(reserve(input));
    expect(typeof reserve(input).amountMicroAud).toBe('bigint');
  });

  it('applies the safety margin upward and only at reservation', () => {
    const p = price(1_000_000n, 0n);
    const f = fx(1_000_000n, 250n);
    const base = costOf({ inputTokens: 1_000_000n, outputTokens: 0n }, p, f);
    const reserved = reserve({
      reservationId: 'res-margin',
      maxInputTokens: 1_000_000n,
      maxOutputTokens: 0n,
      price: p,
      fx: f,
    }).amountMicroAud;
    expect(base).toBe(1_000_000n);
    expect(reserved).toBe(ceilDiv(base * 10_250n, 10_000n));
    expect(reserved).toBeGreaterThan(base);
  });

  it('never reserves less than the base cost, even with a zero safety margin', () => {
    for (const margin of [0n, 1n, 10_000n]) {
      for (const tokens of [0n, 1n, 999_999n, 1_000_000n, 1_000_001n]) {
        const p = price(1_000n, 2_000n);
        const f = fx(999_999n, margin);
        const base = costOf({ inputTokens: tokens, outputTokens: tokens }, p, f);
        const reserved = reserve({
          reservationId: 'res-x',
          maxInputTokens: tokens,
          maxOutputTokens: tokens,
          price: p,
          fx: f,
        }).amountMicroAud;
        expect(reserved).toBeGreaterThanOrEqual(base);
      }
    }
  });

  it('carries the snapshots and maxima so settlement needs no second lookup', () => {
    const p = price(11n, 13n);
    const f = fx(1_000_000n, 100n);
    const reservation = reserve({
      reservationId: 'res-carry',
      maxInputTokens: 17n,
      maxOutputTokens: 19n,
      price: p,
      fx: f,
    });
    expect(reservation.priceSnapshot).toBe(p);
    expect(reservation.fxSnapshot).toBe(f);
    expect(reservation.maxInputTokens).toBe(17n);
    expect(reservation.maxOutputTokens).toBe(19n);
    expect(reservation.reservationId).toBe('res-carry');
  });

  it('bounds the cost of every actual usage within the maxima, over 10,000 generated cases', () => {
    // Violations are collected rather than asserted per iteration: 10,000 seeds is a hot loop, and
    // one `expect` per case would dominate the runtime without adding any information.
    const violations: string[] = [];
    let checked = 0;
    for (let seed = 0; seed < 10_000; seed += 1) {
      const scenario = generateScenario(seed);
      for (const step of scenario.steps) {
        if (step.kind !== 'ADMIT') continue;
        const reservation = reserve({
          reservationId: step.reservationId,
          maxInputTokens: step.maxInputTokens,
          maxOutputTokens: step.maxOutputTokens,
          price: step.price,
          fx: step.fx,
        });
        for (const shape of ['ZERO', 'PARTIAL', 'MAX'] as const) {
          for (const percent of [0, 1, 37, 99, 100]) {
            const actual = usageFor(shape, percent, step.maxInputTokens, step.maxOutputTokens);
            const cost = costOf(actual.usage, step.price, step.fx);
            checked += 1;
            if (reservation.amountMicroAud < cost) {
              violations.push(
                `seed ${String(seed)} shape ${shape} percent ${String(percent)}: reserved ` +
                  `${String(reservation.amountMicroAud)} < cost ${String(cost)}`,
              );
            }
          }
        }
      }
    }
    expect(violations.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(100_000);
  });
});
