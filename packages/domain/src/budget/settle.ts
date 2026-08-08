/**
 * FND-09 deliverable 5 — settlement (PRD §42.6 *"Settlement records actual provider usage and
 * releases the remainder"*; `UAT-ANS-07` *"Cancel before provider stage → full reserved credit
 * released"*).
 *
 *   never executed   → debit = 0,                              release = reservation.amount
 *   executed         → debit = min(costOf(actual), amount),    release = amount − debit
 *
 * `debit + release === reservation.amountMicroAud` EXACTLY, for every input, with no drift: both
 * branches are defined so the two sum to the reserved amount by construction.
 *
 * THE `min` CLAMP, AND WHAT IT HIDES. For well-formed input the clamp cannot fire: usage within the
 * reserved maxima gives a cost at or below the base, and the base is at or below the reserved amount
 * (a non-negative safety margin plus the monotonicity of `costOf`). It exists so that a provider
 * reporting usage ABOVE the reserved maxima cannot break the ceiling invariant. The consequence is
 * that such an overrun is under-debited and invisible in the returned shape — the ticket fixes
 * `Settlement` as `{ debitMicroAud, releaseMicroAud }`, so no overrun field is added here. If
 * `EVID-08` needs overrun visibility, that is ticket Feedback obligation 2: extend the type in this
 * module and write back to `docs/prd/00-foundation/README.md`.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */
import { ZERO_MICRO_AUD, microAud, minMicroAud, type MicroAud } from './micro-aud.js';
import { costOf, type TokenUsage } from './pricing.js';
import type { Reservation } from './reserve.js';

export interface ActualUsage {
  /** `false` when the call never reached the provider (cancelled, refused, breaker open). */
  readonly executed: boolean;
  readonly usage: TokenUsage;
}

export interface Settlement {
  readonly debitMicroAud: MicroAud;
  readonly releaseMicroAud: MicroAud;
}

export function settle(reservation: Reservation, actual: ActualUsage): Settlement {
  if (!actual.executed) {
    return { debitMicroAud: ZERO_MICRO_AUD, releaseMicroAud: reservation.amountMicroAud };
  }
  const cost = costOf(actual.usage, reservation.priceSnapshot, reservation.fxSnapshot);
  const debit = minMicroAud(cost, reservation.amountMicroAud);
  return {
    debitMicroAud: debit,
    releaseMicroAud: microAud(reservation.amountMicroAud - debit),
  };
}
