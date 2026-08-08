/**
 * FND-09 deliverable 1 — `MicroAud`, the only money type in this leaf (PRD §34.1: *"Integer micro-AUD
 * for internal cost; never floating point"*, sub-PRD D15).
 *
 * Scale: 1 AUD = 1 000 000 micro-AUD; 1 cent = 10 000 micro-AUD.
 *
 * This file is the single audited chokepoint for division. `ceilDiv` is the ONLY place in
 * `src/budget/**` where the `/` operator may appear, and `test/budget/money-purity.test.ts` asserts
 * that by exact line match — moving a division anywhere else, including elsewhere in this file, fails
 * the suite. Every other file computes through `ceilDiv`, so every rounding in the leaf rounds UP,
 * which is what makes a reservation conservative (PRD §42.6).
 *
 * `Number`, `parseFloat`, `toFixed`, `toPrecision`, `toLocaleString` and `Math.*` appear nowhere: a
 * single float conversion of a money value is how an integer ceiling silently stops holding.
 */

declare const microAudBrand: unique symbol;

/**
 * A non-negative integer amount in micro-AUD. Branded, so a bare `bigint` is not assignable: the only
 * way into the type is `microAud`, `fromCents`, `fromWholeAud` or an arithmetic helper below.
 */
export type MicroAud = bigint & { readonly [microAudBrand]: 'MicroAud' };

/**
 * Compile-enforced proof that the brand actually holds.
 *
 * `packages/domain/tsconfig.json` includes only `src`, so `test/**` is never typechecked — a
 * `*.test-d.ts` file would be dead weight. This assertion therefore lives in `src`, where `tsc -p
 * tsconfig.json --noEmit` (the `pnpm typecheck` gate) checks it: if the brand were ever weakened to a
 * plain `bigint` alias the `@ts-expect-error` below would become an unused directive and the build
 * would fail.
 */
// @ts-expect-error the brand must reject a plain bigint; if this line ever compiles, D15 has been lost.
const plainBigIntIsNotMicroAud: MicroAud = 1n;
void plainBigIntIsNotMicroAud;

/** Micro-AUD in one whole AUD. */
export const MICRO_AUD_PER_AUD = 1_000_000n;
/** Micro-AUD in one cent. */
export const MICRO_AUD_PER_CENT = 10_000n;

/**
 * Integer division rounding UP — the only division in the leaf.
 *
 * Rejects a non-positive denominator and a negative numerator rather than returning a nonsense
 * amount: both are programming errors in the caller, and a silent wrong answer here is a wrong
 * reservation, which is a breached ceiling.
 */
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('ceilDiv: denominator must be positive');
  if (numerator < 0n) throw new RangeError('ceilDiv: numerator must be non-negative');
  return (numerator + denominator - 1n) / denominator;
}

/** Narrows an arbitrary value to `MicroAud`, throwing on anything that is not a non-negative bigint. */
export function assertMicroAud(value: unknown, label = 'value'): asserts value is MicroAud {
  if (typeof value !== 'bigint') throw new TypeError(`${label}: money must be a bigint micro-AUD amount`);
  if (value < 0n) throw new RangeError(`${label}: money must not be negative`);
}

/** The constructor: a non-negative integer amount, already in micro-AUD. */
export function microAud(value: bigint): MicroAud {
  assertMicroAud(value, 'microAud');
  return value;
}

export const ZERO_MICRO_AUD: MicroAud = microAud(0n);

export function fromCents(cents: bigint): MicroAud {
  return microAud(cents * MICRO_AUD_PER_CENT);
}

export function fromWholeAud(aud: bigint): MicroAud {
  return microAud(aud * MICRO_AUD_PER_AUD);
}

export function addMicroAud(a: MicroAud, b: MicroAud): MicroAud {
  return microAud(a + b);
}

/** Subtraction that cannot go negative — an underflow here would mean a ledger has been double-released. */
export function subMicroAud(a: MicroAud, b: MicroAud): MicroAud {
  if (b > a) throw new RangeError('subMicroAud: result would be negative');
  return microAud(a - b);
}

export function minMicroAud(a: MicroAud, b: MicroAud): MicroAud {
  return a <= b ? a : b;
}

export function maxMicroAud(a: MicroAud, b: MicroAud): MicroAud {
  return a >= b ? a : b;
}

/**
 * Renders an amount as `A$50.000000` — bigint string surgery only, matching PRD §24.1's own `A$`
 * rendering. The whole part is recovered through `ceilDiv` on an exact multiple (numerator minus its
 * own remainder), so this file still contains exactly one division.
 */
export function toDisplay(amount: MicroAud): string {
  const remainder = amount % MICRO_AUD_PER_AUD;
  const whole = ceilDiv(amount - remainder, MICRO_AUD_PER_AUD);
  return `A$${whole.toString()}.${remainder.toString().padStart(6, '0')}`;
}
