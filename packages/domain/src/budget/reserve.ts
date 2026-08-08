/**
 * FND-09 deliverable 4 — the conservative reservation of PRD §42.6: *"Before a hosted call the gateway
 * computes a conservative reservation from model profile, maximum input/output tokens and current
 * price."*
 *
 * Two things make it conservative:
 *
 * 1. the effective token ceilings are the MINIMUM of the request's maxima and the profile's ceilings —
 *    the call physically cannot exceed either bound, and reserving the larger of the two would hold
 *    money that can never be spent and starve other work against the same A$50 ceiling;
 * 2. every rounding in `costMicroAud` is upward, and settlement re-uses that same function with the
 *    same snapshots (carried on the `Reservation`), so a settled cost can never exceed the reservation.
 *
 * PRECONDITION: price data must already be valid. The ticket fixes the signature as returning a
 * `Reservation` rather than a result union, so invalid data throws a `RangeError` naming the
 * `PriceDataProblem`. `admit` never reaches that throw — it validates first and denies with
 * `PRICE_DATA_UNAVAILABLE` — and `test/budget/fail-closed.test.ts` asserts the throw, so the
 * precondition is enforced rather than merely documented.
 */
import { isFounderLiability } from './ledgers.js';
import { costMicroAud, validatePriceData } from './pricing.js';
import type { Reservation, ReserveInput } from './types.js';

export function reserve(input: ReserveInput): Reservation {
  const problem = validatePriceData(input.price, input.fx, input.now, input.maxPriceAgeMillis);
  if (problem !== null) {
    throw new RangeError(`reserve: price data is not usable (${problem}); admission must fail closed`);
  }

  const { request } = input;
  if (request.requestedMaxInputTokens < 0n || request.requestedMaxOutputTokens < 0n) {
    throw new RangeError('reserve: requested token maxima must be non-negative');
  }
  if (request.profileCeiling.maxInputTokens < 0n || request.profileCeiling.maxOutputTokens < 0n) {
    throw new RangeError('reserve: profile ceilings must be non-negative');
  }

  const effectiveMaxInputTokens = minBigInt(request.requestedMaxInputTokens, request.profileCeiling.maxInputTokens);
  const effectiveMaxOutputTokens = minBigInt(request.requestedMaxOutputTokens, request.profileCeiling.maxOutputTokens);

  const amountMicroAud = costMicroAud(
    effectiveMaxInputTokens,
    effectiveMaxOutputTokens,
    input.price,
    input.fx,
  );

  return {
    reservationId: request.reservationId,
    amountMicroAud,
    priceSnapshot: input.price,
    fxSnapshot: input.fx,
    effectiveMaxInputTokens,
    effectiveMaxOutputTokens,
    ledger: input.ledger,
    reserveClass: request.reserveClass,
    founderDebitApplies: isFounderLiability(input.ledger),
  };
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a <= b ? a : b;
}
