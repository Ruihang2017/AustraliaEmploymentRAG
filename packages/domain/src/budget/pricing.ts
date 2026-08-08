/**
 * FND-09 deliverables 4 and 7 (input half) — price/FX snapshots, their validation, and `costOf`.
 *
 * PRD §42.6: *"Daily provider prices and month-to-date spend are normalised into micro-AUD … Exchange
 * rate uses a recorded daily rate plus configurable safety margin. If price or currency data is
 * unavailable, new founder-funded calls fail closed."*
 *
 * PRICES AND FX RATES ARE INPUTS. This module names no provider, no model and no hosted price: the
 * feed is `EVID-08`/`DATA-07`'s, and the model behind each profile is breakdown plan §8 **Q1**,
 * benchmark-selected and recorded by `GOLD-15`.
 *
 * `costOf` is monotone non-decreasing in both token counts, because `ceilDiv` is monotone and the
 * composition of monotone functions is monotone. That single property is what makes the conservative
 * reservation of `reserve.ts` correct for EVERY input, including exact multiples, rather than for the
 * cases someone happened to write a test for.
 *
 * `validatePricing` is TOTAL — it never throws — and fails closed on a two-sided staleness bound: a
 * snapshot dated in the FUTURE (clock skew at the source) is stale too, because a naive
 * `now − observed <= maxAge` accepts it. Non-finite timestamps are MALFORMED, not "very old".
 *
 * Note on zero rates: an FX rate of zero cannot be a real rate and is MALFORMED. A token price of
 * zero is representable (a free tier) and is not, by itself, malformed.
 *
 * Pure: no clock (`nowEpochMs` is injected), no randomness, no I/O (PRD §39.1, §45.2).
 */
import { ceilDiv, microAud, type MicroAud } from './micro-aud.js';

/** The token block a price is quoted per: 1,000,000 tokens. */
const TOKENS_PER_PRICE_BLOCK = 1_000_000n;

/** Millionths per whole unit, for both the foreign micro-unit and the micro-AUD scales. */
const MICRO_UNITS_PER_UNIT = 1_000_000n;

export interface PriceSnapshot {
  /** ISO currency of the provider price, for example `'USD'`. Never a provider or model name. */
  readonly currency: string;
  /** Millionths of `currency` per 1,000,000 input tokens. */
  readonly inputMicroUnitsPerMillionTokens: bigint;
  /** Millionths of `currency` per 1,000,000 output tokens. */
  readonly outputMicroUnitsPerMillionTokens: bigint;
  readonly observedAtEpochMs: number;
}

export interface FxSnapshot {
  readonly fromCurrency: string;
  readonly toCurrency: 'AUD';
  /** Micro-AUD per one unit of `fromCurrency` — PRD §42.6's "recorded daily rate". */
  readonly microAudPerUnit: bigint;
  /** PRD §42.6's "configurable safety margin", in basis points. Applied at reservation only. */
  readonly safetyMarginBasisPoints: bigint;
  readonly observedAtEpochMs: number;
}

export interface TokenUsage {
  readonly inputTokens: bigint;
  readonly outputTokens: bigint;
}

export type PricingValidity =
  | { readonly ok: true; readonly price: PriceSnapshot; readonly fx: FxSnapshot }
  | { readonly ok: false; readonly cause: 'ABSENT' | 'STALE' | 'MALFORMED' };

const isNonNegativeBigint = (value: bigint): boolean => typeof value === 'bigint' && value >= 0n;

const isPositiveBigint = (value: bigint): boolean => typeof value === 'bigint' && value > 0n;

const isUsableTimestamp = (value: number): boolean =>
  typeof value === 'number' && Number.isFinite(value);

const isWellFormedPrice = (price: PriceSnapshot): boolean =>
  typeof price.currency === 'string' &&
  price.currency.length > 0 &&
  isNonNegativeBigint(price.inputMicroUnitsPerMillionTokens) &&
  isNonNegativeBigint(price.outputMicroUnitsPerMillionTokens) &&
  isUsableTimestamp(price.observedAtEpochMs);

const isWellFormedFx = (fx: FxSnapshot): boolean =>
  typeof fx.fromCurrency === 'string' &&
  fx.fromCurrency.length > 0 &&
  fx.toCurrency === 'AUD' &&
  isPositiveBigint(fx.microAudPerUnit) &&
  isNonNegativeBigint(fx.safetyMarginBasisPoints) &&
  isUsableTimestamp(fx.observedAtEpochMs);

/** Two-sided: too old, or dated in the future. */
const isStale = (observedAtEpochMs: number, nowEpochMs: number, maxAgeMs: number): boolean =>
  observedAtEpochMs > nowEpochMs || nowEpochMs - observedAtEpochMs > maxAgeMs;

/**
 * Fail-closed classification of the supplied price and FX data. Total: returns a cause instead of
 * throwing, so an admission decision is always representable (PRD §42.6 final sentence).
 */
export function validatePricing(
  price: PriceSnapshot | null | undefined,
  fx: FxSnapshot | null | undefined,
  nowEpochMs: number,
  maxAgeMs: number,
): PricingValidity {
  if (price === null || price === undefined || fx === null || fx === undefined) {
    return { ok: false, cause: 'ABSENT' };
  }
  if (!isWellFormedPrice(price) || !isWellFormedFx(fx)) return { ok: false, cause: 'MALFORMED' };
  if (fx.fromCurrency !== price.currency) return { ok: false, cause: 'MALFORMED' };
  if (!isUsableTimestamp(nowEpochMs) || !isUsableTimestamp(maxAgeMs) || maxAgeMs < 0) {
    return { ok: false, cause: 'MALFORMED' };
  }
  if (
    isStale(price.observedAtEpochMs, nowEpochMs, maxAgeMs) ||
    isStale(fx.observedAtEpochMs, nowEpochMs, maxAgeMs)
  ) {
    return { ok: false, cause: 'STALE' };
  }
  return { ok: true, price, fx };
}

/**
 * Cost of `usage` at `price`, converted at `fx`. Every intermediate rounding is upward, so the result
 * is never below the true cost. No floating point, no division operator — `ceilDiv` only.
 *
 * The FX safety margin is NOT applied here: it belongs to the reservation (see `reserve.ts`), which is
 * exactly what makes a reservation strictly conservative relative to settlement.
 */
export function costOf(usage: TokenUsage, price: PriceSnapshot, fx: FxSnapshot): MicroAud {
  const foreignMicroUnits =
    ceilDiv(usage.inputTokens * price.inputMicroUnitsPerMillionTokens, TOKENS_PER_PRICE_BLOCK) +
    ceilDiv(usage.outputTokens * price.outputMicroUnitsPerMillionTokens, TOKENS_PER_PRICE_BLOCK);
  return microAud(ceilDiv(foreignMicroUnits * fx.microAudPerUnit, MICRO_UNITS_PER_UNIT));
}
