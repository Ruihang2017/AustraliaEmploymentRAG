/**
 * FND-09 deliverable 4 — the conservative reservation (PRD §42.6).
 *
 * > *"Before a hosted call the gateway computes a conservative reservation from model profile,
 * > maximum input/output tokens and current price."*
 *
 *   base   = costOf({ maxInputTokens, maxOutputTokens }, price, fx)
 *   amount = ceilDiv(base * (10,000 + safetyMarginBasisPoints), 10,000)
 *
 * ALL ROUNDING IS UPWARD and the FX safety margin is applied here and nowhere else, so for the same
 * price and FX data the reservation is never smaller than the cost of any actual usage within the
 * reserved maxima (`costOf` is monotone; the margin is non-negative).
 *
 * `reservationId` IS AN INPUT, NOT GENERATED. Deliverable 12 forbids a clock and randomness, and
 * minting an identifier needs both; `EVID-08` mints it. The reservation carries both snapshots so
 * settlement prices the actual usage against the SAME data without a second lookup (PRD §42.6).
 *
 * Pure and deterministic: the same input always yields a deep-equal output (PRD §39.1, §45.2).
 */
import { BASIS_POINT_DENOMINATOR, ceilDiv, microAud, type MicroAud } from './micro-aud.js';
import { costOf, type FxSnapshot, type PriceSnapshot } from './pricing.js';

export interface ReserveInput {
  /** Minted by the caller (`EVID-08`); this module has no clock and no randomness. */
  readonly reservationId: string;
  /** The model profile's ceiling, an input — no model or provider is named here. */
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
  readonly price: PriceSnapshot;
  readonly fx: FxSnapshot;
}

export interface Reservation {
  readonly reservationId: string;
  readonly amountMicroAud: MicroAud;
  readonly priceSnapshot: PriceSnapshot;
  readonly fxSnapshot: FxSnapshot;
  readonly maxInputTokens: bigint;
  readonly maxOutputTokens: bigint;
}

export function reserve(input: ReserveInput): Reservation {
  const base = costOf(
    { inputTokens: input.maxInputTokens, outputTokens: input.maxOutputTokens },
    input.price,
    input.fx,
  );
  const withMargin = ceilDiv(
    base * (BASIS_POINT_DENOMINATOR + input.fx.safetyMarginBasisPoints),
    BASIS_POINT_DENOMINATOR,
  );
  return {
    reservationId: input.reservationId,
    amountMicroAud: microAud(withMargin),
    priceSnapshot: input.price,
    fxSnapshot: input.fx,
    maxInputTokens: input.maxInputTokens,
    maxOutputTokens: input.maxOutputTokens,
  };
}
