/**
 * FND-09 — the deterministic sequence generator behind the ceiling, reservation and settlement
 * property suites.
 *
 * WHY NOT A PROPERTY-TESTING LIBRARY. `tools/tests/skeleton.test.mjs` asserts that EVERY workspace
 * member manifest declares no `dependencies` and no `devDependencies`, and it runs on every branch;
 * the ticket's File-scope also forbids touching root manifests and lockfiles, while CI installs with
 * `--frozen-lockfile`. Declaring `fast-check` would turn the repository-wide suite red. The
 * acceptance bar names no library — it requires ">=10,000 generated reserve/settle sequences" — so
 * this seeded generator meets the bar with no new dependency. (Ticket writeback carried in this
 * branch.)
 *
 * Properties the suites rely on:
 *   - fully reproducible: the same seed always yields the same script, and the seed is printed in
 *     every failure message so a counterexample is replayable;
 *   - INTERLEAVED: several reservations are outstanding at once and are settled out of order — a
 *     sequential-only generator would miss the double-spend case entirely;
 *   - varied prices, FX rates, safety margins, token maxima and reserve classes, including the
 *     boundary values 1n, exact multiples of 1,000,000n, one under and one over.
 */
import type { FxSnapshot, PriceSnapshot } from '../../src/budget/pricing.js';
import type { FounderReserveClass } from '../../src/budget/reserve-order.js';

/** `mulberry32` — ten lines, no dependency, identical output for identical seeds. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RESERVE_CLASSES: readonly FounderReserveClass[] = [
  'INCIDENT_OR_SAFETY_CHECK',
  'TRIAL_COMMITMENT',
  'INTERNAL_TESTING',
  'DISCRETIONARY_DEEP',
];

/** Token maxima drawn from a boundary set, not from a uniform range. */
export const TOKEN_BOUNDARIES: readonly bigint[] = [
  0n,
  1n,
  999_999n,
  1_000_000n,
  1_000_001n,
  2_000_000n,
  123_457n,
  5_000_000n,
];

export const SAFETY_MARGINS_BASIS_POINTS: readonly bigint[] = [0n, 1n, 250n, 1_000n, 10_000n];

export const PRICE_UNITS: readonly bigint[] = [1n, 999n, 1_000n, 1_000_000n, 3_000_000n];

export const FX_RATES_MICRO_AUD: readonly bigint[] = [1n, 999_999n, 1_000_000n, 1_500_000n];

export type SettlementShape = 'CANCELLED' | 'ZERO' | 'PARTIAL' | 'MAX' | 'OVER';

export interface AdmitStep {
  readonly kind: 'ADMIT';
  readonly reservationId: string;
  readonly reserveClass: FounderReserveClass;
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
  readonly price: PriceSnapshot;
  readonly fx: FxSnapshot;
}

export interface SettleStep {
  readonly kind: 'SETTLE';
  /** Index into the LIVE outstanding list at execution time — settles out of order. */
  readonly outstandingSelector: number;
  readonly shape: SettlementShape;
  /** Percent of the reserved maxima to report as actual usage, for the `PARTIAL` shape. */
  readonly partialPercent: number;
}

export type GeneratedStep = AdmitStep | SettleStep;

export interface GeneratedScenario {
  readonly seed: number;
  readonly steps: readonly GeneratedStep[];
  readonly allowances: Readonly<Record<FounderReserveClass, bigint>>;
}

const OBSERVED_AT_EPOCH_MS = 1_754_600_000_000;

function pick<T>(random: () => number, values: readonly T[]): T {
  const index = Math.floor(random() * values.length) % values.length;
  const value = values[index];
  if (value === undefined) throw new Error('empty choice list');
  return value;
}

/**
 * A reproducible script for one seed. Admissions are front-loaded relative to settlements so several
 * reservations are outstanding simultaneously; settlement then picks an arbitrary live reservation.
 */
export function generateScenario(seed: number): GeneratedScenario {
  const random = mulberry32(seed);
  const stepCount = 4 + Math.floor(random() * 9);
  const steps: GeneratedStep[] = [];
  let admitted = 0;

  for (let index = 0; index < stepCount; index += 1) {
    const wantAdmit = admitted === 0 || random() < 0.6;
    if (wantAdmit) {
      const currency = pick(random, ['USD', 'EUR', 'AUD']);
      steps.push({
        kind: 'ADMIT',
        reservationId: `seed-${String(seed)}-step-${String(index)}`,
        reserveClass: pick(random, RESERVE_CLASSES),
        maxInputTokens: pick(random, TOKEN_BOUNDARIES),
        maxOutputTokens: pick(random, TOKEN_BOUNDARIES),
        price: {
          currency,
          inputMicroUnitsPerMillionTokens: pick(random, PRICE_UNITS),
          outputMicroUnitsPerMillionTokens: pick(random, PRICE_UNITS),
          observedAtEpochMs: OBSERVED_AT_EPOCH_MS,
        },
        fx: {
          fromCurrency: currency,
          toCurrency: 'AUD',
          microAudPerUnit: pick(random, FX_RATES_MICRO_AUD),
          safetyMarginBasisPoints: pick(random, SAFETY_MARGINS_BASIS_POINTS),
          observedAtEpochMs: OBSERVED_AT_EPOCH_MS,
        },
      });
      admitted += 1;
      continue;
    }
    steps.push({
      kind: 'SETTLE',
      outstandingSelector: Math.floor(random() * 1_000),
      shape: pick<SettlementShape>(random, ['CANCELLED', 'ZERO', 'PARTIAL', 'MAX', 'OVER']),
      partialPercent: Math.floor(random() * 101),
    });
  }

  // Drain: settle everything still outstanding, so the final ledger state is fully realised.
  for (let index = 0; index < admitted; index += 1) {
    steps.push({
      kind: 'SETTLE',
      outstandingSelector: Math.floor(random() * 1_000),
      shape: pick<SettlementShape>(random, ['CANCELLED', 'ZERO', 'PARTIAL', 'MAX', 'OVER']),
      partialPercent: Math.floor(random() * 101),
    });
  }

  const allowanceUnit = 1_000_000n * BigInt(1 + Math.floor(random() * 10));
  return {
    seed,
    steps,
    allowances: {
      INCIDENT_OR_SAFETY_CHECK: allowanceUnit,
      TRIAL_COMMITMENT: allowanceUnit * 2n,
      INTERNAL_TESTING: allowanceUnit,
      DISCRETIONARY_DEEP: 0n,
    },
  };
}

/** Actual usage for a settlement shape, given the reserved maxima. */
export function usageFor(
  shape: SettlementShape,
  partialPercent: number,
  maxInputTokens: bigint,
  maxOutputTokens: bigint,
): { executed: boolean; usage: { inputTokens: bigint; outputTokens: bigint } } {
  if (shape === 'CANCELLED') {
    return { executed: false, usage: { inputTokens: 0n, outputTokens: 0n } };
  }
  if (shape === 'ZERO') {
    return { executed: true, usage: { inputTokens: 0n, outputTokens: 0n } };
  }
  if (shape === 'MAX') {
    return {
      executed: true,
      usage: { inputTokens: maxInputTokens, outputTokens: maxOutputTokens },
    };
  }
  if (shape === 'OVER') {
    // Deliberately outside the reserved maxima: exercises the settlement clamp.
    return {
      executed: true,
      usage: { inputTokens: maxInputTokens + 7_000_000n, outputTokens: maxOutputTokens + 3n },
    };
  }
  const percent = BigInt(partialPercent);
  return {
    executed: true,
    usage: {
      inputTokens: (maxInputTokens * percent) / 100n,
      outputTokens: (maxOutputTokens * percent) / 100n,
    },
  };
}
