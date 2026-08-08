/**
 * FND-09 deliverable 1 — the money primitive.
 *
 * PRD §34.1 money row: *"Integer micro-AUD for internal cost; never floating point."* Sub-PRD
 * decision **D15** repeats it as a test obligation rather than a review comment. Every amount in
 * `packages/domain/src/budget` is a `MicroAud`, which is a branded `bigint`; A$1 is 1,000,000n.
 *
 * THIS FILE IS THE ONLY PLACE IN `src/budget` WHERE THE DIVISION OPERATOR MAY APPEAR, and only inside
 * `ceilDiv` and `floorDiv`. Every other module divides by calling one of those two helpers, so that a
 * static test (`test/budget/money-purity.test.ts`) can prove no ad-hoc division — and therefore no
 * silent truncation or float coercion — ever touches a money value. For the same reason no regular
 * expression literal is written anywhere under `src/budget`: a `slash-delimited` literal would defeat
 * the scan.
 *
 * All amounts are non-negative by construction. A negative money value is a programming error, not a
 * state the ledger can be in, so the constructors throw `RangeError` rather than returning one.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */

declare const microAudBrand: unique symbol;

/** A non-negative integer amount in millionths of one Australian dollar. */
export type MicroAud = bigint & { readonly [microAudBrand]: 'MicroAud' };

/** Micro-AUD in one Australian dollar (PRD §34.1). */
export const ONE_AUD_IN_MICRO_AUD = 1_000_000n;

/** Micro-AUD in one Australian cent. */
export const ONE_CENT_IN_MICRO_AUD = 10_000n;

/** Basis-point denominator: 10,000 basis points is 100%. Used instead of a float ratio. */
export const BASIS_POINT_DENOMINATOR = 10_000n;

/**
 * Ceiling division for non-negative operands. Conservative rounding — the direction PRD §42.6's
 * *"conservative reservation"* requires — is always upward.
 */
export const ceilDiv = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator;

/** Floor division for non-negative operands. */
export const floorDiv = (numerator: bigint, denominator: bigint): bigint => numerator / denominator;

/** Brands a raw `bigint`. Throws `RangeError` on a negative amount. */
export function microAud(value: bigint): MicroAud {
  if (typeof value !== 'bigint') throw new RangeError('micro-AUD must be a bigint');
  if (value < 0n) throw new RangeError('micro-AUD must not be negative');
  return value as MicroAud;
}

/** Zero. */
export const ZERO_MICRO_AUD: MicroAud = microAud(0n);

/** Australian cents to micro-AUD. */
export const fromCents = (cents: bigint): MicroAud => microAud(cents * ONE_CENT_IN_MICRO_AUD);

/** Whole Australian dollars to micro-AUD. */
export const fromWholeAud = (aud: bigint): MicroAud => microAud(aud * ONE_AUD_IN_MICRO_AUD);

/** Addition, staying inside the brand. */
export const addMicroAud = (left: MicroAud, right: MicroAud): MicroAud => microAud(left + right);

/** Subtraction. Throws `RangeError` if the result would be negative. */
export const subMicroAud = (left: MicroAud, right: MicroAud): MicroAud => microAud(left - right);

/** The smaller of two amounts. */
export const minMicroAud = (left: MicroAud, right: MicroAud): MicroAud =>
  left <= right ? left : right;

/** The larger of two amounts. */
export const maxMicroAud = (left: MicroAud, right: MicroAud): MicroAud =>
  left >= right ? left : right;

/**
 * Renders an amount for logs and admin surfaces as `A$<dollars>.<six digits>` using integer
 * arithmetic only — no `toFixed`, no float coercion, no loss above or below the micro-AUD unit.
 */
export function toDisplay(amount: MicroAud): string {
  const whole = floorDiv(amount, ONE_AUD_IN_MICRO_AUD);
  const fraction = String(amount % ONE_AUD_IN_MICRO_AUD).padStart(6, '0');
  return `A$${String(whole)}.${fraction}`;
}
