/**
 * FND-09 deliverable 5 — settlement (PRD §42.6: *"Settlement records actual provider usage and releases
 * the remainder"*; `UAT-ANS-07`: *"Cancel before provider stage → full reserved credit released"*).
 *
 * ```
 * actual  = executed ? costMicroAud(actualTokens, reservation's own snapshots) : 0
 * debit   = min(actual, reservation.amount)
 * release = reservation.amount - debit          // by SUBTRACTION, never a second cost computation
 * overrun = actual - debit                      // 0 for every in-bounds usage
 * ```
 *
 * `debit + release === reservation.amountMicroAud` therefore holds BY CONSTRUCTION rather than by
 * luck: `release` is defined as the difference, so no rounding can drift the identity (plan risk R4).
 *
 * Why the debit is capped (plan risk R3 / open question OQ-5): if a provider reports more tokens than
 * were reserved, debiting the excess would breach the A$50 admission-control ceiling that OPS-003
 * requires, and throwing would lose the accounting. So the excess is reported as `overrunMicroAud` and
 * `EVID-08` decides what it means operationally. It is an additive field, not a change to the ticket's
 * `{ debitMicroAud, releaseMicroAud }` contract.
 *
 * The price and FX snapshots come from the RESERVATION, never from the caller: settling at a different
 * price than admission was granted at is how a conservative reservation stops being conservative.
 */
import { minMicroAud, subMicroAud, ZERO_MICRO_AUD } from './micro-aud.js';
import { costMicroAud } from './pricing.js';
import type { ActualUsage, Reservation, Settlement } from './types.js';

export function settle(reservation: Reservation, actualUsage: ActualUsage): Settlement {
  if (actualUsage.inputTokens < 0n || actualUsage.outputTokens < 0n) {
    throw new RangeError('settle: actual token counts must be non-negative');
  }

  const actual = actualUsage.executed
    ? costMicroAud(
        actualUsage.inputTokens,
        actualUsage.outputTokens,
        reservation.priceSnapshot,
        reservation.fxSnapshot,
      )
    : ZERO_MICRO_AUD;

  const debitMicroAud = minMicroAud(actual, reservation.amountMicroAud);
  const releaseMicroAud = subMicroAud(reservation.amountMicroAud, debitMicroAud);
  const overrunMicroAud = subMicroAud(actual, debitMicroAud);

  return { debitMicroAud, releaseMicroAud, overrunMicroAud };
}
