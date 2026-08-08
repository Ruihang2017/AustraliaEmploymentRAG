/**
 * FND-09 deliverables 4 and 7 (arithmetic half) — cost in micro-AUD, and the fail-closed validation of
 * the price and FX snapshots (PRD §42.6: *"Exchange rate uses a recorded daily rate plus configurable
 * safety margin"*, *"If price or currency data is unavailable, new founder-funded calls fail closed"*).
 *
 * CONSERVATIVENESS IS STRUCTURAL, not a rule someone must remember: every step rounds up through
 * `ceilDiv`, which is monotonic non-decreasing in its numerator, and `reserve` and `settle` call THIS
 * function with THE SAME snapshots. So for `a <= A` and `b <= B`, `cost(a, b) <= cost(A, B)` — the
 * settled cost of a call can never exceed the reservation taken for it. There is exactly one rounding
 * pipeline in the leaf; a second one is how a ceiling silently stops holding (plan risk R4).
 *
 * No price, provider or model is named anywhere: both snapshots are inputs (breakdown plan §8 Q1).
 */
import { ceilDiv, microAud, type MicroAud } from './micro-aud.js';
import type { EpochMillis, FxSnapshot, PriceSnapshot } from './types.js';

/** Why price data was refused. Every one of these is a DENY for founder-funded work. */
export type PriceDataProblem =
  | 'PRICE_ABSENT'
  | 'PRICE_MALFORMED'
  | 'PRICE_STALE'
  | 'FX_ABSENT'
  | 'FX_MALFORMED'
  | 'FX_STALE'
  | 'FX_CURRENCY_MISMATCH';

const TOKENS_PER_QUOTE_UNIT = 1_000_000n;
const BASIS_POINTS_PER_UNIT = 10_000n;

function isNonNegativeBigInt(value: unknown): boolean {
  return typeof value === 'bigint' && value >= 0n;
}

/**
 * Returns `null` only when both snapshots are present, well-formed, mutually consistent and fresh;
 * otherwise the first problem found, in the documented order below.
 *
 * Fail-closed in every direction (plan risk R6). In particular:
 * - a FUTURE `recordedAt` is malformed, not "fresh": a clock-skewed feed must not extend staleness;
 * - the FX snapshot is validated as strictly as the price, including that it converts the currency the
 *   price is actually quoted in (`FX_CURRENCY_MISMATCH`) and that it targets AUD;
 * - `microAudPerUnit` must be strictly positive: a zero rate would price every call at zero.
 *
 * Age is measured inclusively: `now - recordedAt === maxAgeMillis` is still fresh, one millisecond
 * more is stale.
 */
export function validatePriceData(
  price: PriceSnapshot | null,
  fx: FxSnapshot | null,
  now: EpochMillis,
  maxAgeMillis: bigint,
): PriceDataProblem | null {
  // `typeof !== 'object'` also catches an `undefined` handed in by an untyped JavaScript caller.
  if (price === null || typeof price !== 'object') return 'PRICE_ABSENT';
  if (fx === null || typeof fx !== 'object') return 'FX_ABSENT';
  if (typeof now !== 'bigint' || typeof maxAgeMillis !== 'bigint' || maxAgeMillis < 0n) {
    return 'PRICE_MALFORMED';
  }

  if (
    typeof price.currency !== 'string' ||
    price.currency.length === 0 ||
    !isNonNegativeBigInt(price.microPerMillionInputTokens) ||
    !isNonNegativeBigInt(price.microPerMillionOutputTokens) ||
    typeof price.recordedAt !== 'bigint' ||
    price.recordedAt > now
  ) {
    return 'PRICE_MALFORMED';
  }
  if (now - price.recordedAt > maxAgeMillis) return 'PRICE_STALE';

  if (
    typeof fx.fromCurrency !== 'string' ||
    fx.fromCurrency.length === 0 ||
    typeof fx.microAudPerUnit !== 'bigint' ||
    fx.microAudPerUnit <= 0n ||
    !isNonNegativeBigInt(fx.safetyMarginBasisPoints) ||
    typeof fx.recordedAt !== 'bigint' ||
    fx.recordedAt > now
  ) {
    return 'FX_MALFORMED';
  }
  if (fx.toCurrency !== 'AUD' || fx.fromCurrency !== price.currency) return 'FX_CURRENCY_MISMATCH';
  if (now - fx.recordedAt > maxAgeMillis) return 'FX_STALE';

  return null;
}

/**
 * Cost of `inputTokens`/`outputTokens` at the given snapshots, rounded UP at every step.
 *
 * ```
 * foreign = ceilDiv(inputTokens  * microPerMillionInputTokens,  1_000_000)
 *         + ceilDiv(outputTokens * microPerMillionOutputTokens, 1_000_000)
 * aud     = ceilDiv(foreign * microAudPerUnit * (10_000 + safetyMarginBasisPoints), 1_000_000 * 10_000)
 * ```
 *
 * An AUD-quoted price is the identity case (`microAudPerUnit: 1_000_000n`, margin `0n`) and needs no
 * special case in code.
 */
export function costMicroAud(
  inputTokens: bigint,
  outputTokens: bigint,
  price: PriceSnapshot,
  fx: FxSnapshot,
): MicroAud {
  if (inputTokens < 0n || outputTokens < 0n) {
    throw new RangeError('costMicroAud: token counts must be non-negative');
  }
  const foreign =
    ceilDiv(inputTokens * price.microPerMillionInputTokens, TOKENS_PER_QUOTE_UNIT) +
    ceilDiv(outputTokens * price.microPerMillionOutputTokens, TOKENS_PER_QUOTE_UNIT);
  const withMargin = foreign * fx.microAudPerUnit * (BASIS_POINTS_PER_UNIT + fx.safetyMarginBasisPoints);
  return microAud(ceilDiv(withMargin, TOKENS_PER_QUOTE_UNIT * BASIS_POINTS_PER_UNIT));
}
