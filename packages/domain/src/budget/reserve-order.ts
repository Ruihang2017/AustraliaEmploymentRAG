/**
 * FND-09 deliverable 8 — the PRD §42.6 founder-funded reserve order.
 *
 * PRD §42.6 lists four priorities:
 *   1. production incident/synthetic safety check allowance;
 *   2. active trial commitments;
 *   3. internal testing;
 *   4. discretionary Deep runs.
 *
 * The only sound reading of an *order* is that a request of class `C` may consume only funds that are
 * not still earmarked for a strictly higher-priority class:
 *
 *   available(C) = ceiling
 *                − monthToDateDebit
 *                − outstandingReservations
 *                − Σ over P with priority(P) < priority(C) of unusedAllowance(P)
 *   unusedAllowance(P) = max(0, allowance(P) − consumed(P))
 *
 * `allowance(P)` and `consumed(P)` are INPUTS on `FounderLedgerState`. PRD §24.1 states no per-class
 * split of the A$12/A$50, so inventing one here would be spec this ticket does not have
 * (`EVID-08` supplies them — sub-PRD open question recorded in the plan).
 *
 * THE PURPOSE CLASS IS AN EXPLICIT INPUT AND IS NEVER INFERRED. Ticket Feedback obligation 5:
 * defaulting to the most permissive class would breach §42.6's ordering. It is a required field of
 * the founder branch of `FundingRequest`, so omitting it is a type error, not a default.
 *
 * `outstandingReservations` is subtracted here and is a REQUIRED field: if admission compared a
 * request against `ceiling − debit` alone, N concurrent admissions would each pass and the ceiling
 * would be breached by up to N−1 reservations. The atomic read-modify-write of the ledger row is the
 * caller's (`EVID-08`/`DATA-07`); this module is pure and cannot lock anything.
 *
 * Pure: no clock, no randomness, no I/O (PRD §39.1, §45.2).
 */
import { deepFreeze } from './frozen.js';
import type { FounderLedgerState } from './ledgers.js';
import { ZERO_MICRO_AUD, microAud, type MicroAud } from './micro-aud.js';

export type FounderReserveClass =
  /** PRD §42.6 (1) production incident/synthetic safety check allowance. */
  | 'INCIDENT_OR_SAFETY_CHECK'
  /** PRD §42.6 (2) active trial commitments. */
  | 'TRIAL_COMMITMENT'
  /** PRD §42.6 (3) internal testing. */
  | 'INTERNAL_TESTING'
  /** PRD §42.6 (4) discretionary Deep runs. */
  | 'DISCRETIONARY_DEEP';

/** The four PRD §42.6 priorities, highest first. */
export const FOUNDER_RESERVE_ORDER: readonly FounderReserveClass[] = deepFreeze<
  readonly FounderReserveClass[]
>([
  'INCIDENT_OR_SAFETY_CHECK',
  'TRIAL_COMMITMENT',
  'INTERNAL_TESTING',
  'DISCRETIONARY_DEEP',
]);

/** `0` is the highest priority. An unknown class is not representable (the type is closed). */
export function reservePriorityOf(reserveClass: FounderReserveClass): number {
  const index = FOUNDER_RESERVE_ORDER.indexOf(reserveClass);
  if (index < 0) throw new RangeError(`unknown founder reserve class: ${reserveClass}`);
  return index;
}

/** `max(0, allowance − consumed)` for one class. */
function unusedAllowance(
  reserveClass: FounderReserveClass,
  state: FounderLedgerState,
): MicroAud {
  const allowance = state.allowances[reserveClass];
  const consumed = state.consumed[reserveClass];
  return allowance > consumed ? microAud(allowance - consumed) : ZERO_MICRO_AUD;
}

/**
 * Funds a request of `reserveClass` may consume, given the ledger state. Never negative, and monotone
 * in priority: a higher-priority class never sees less than a lower-priority one in the same state.
 */
export function availableForClass(
  reserveClass: FounderReserveClass,
  state: FounderLedgerState,
): MicroAud {
  const priority = reservePriorityOf(reserveClass);
  let earmarkedAbove = 0n;
  for (const other of FOUNDER_RESERVE_ORDER) {
    if (reservePriorityOf(other) < priority) earmarkedAbove += unusedAllowance(other, state);
  }
  const gross =
    state.ceilingMicroAud - state.monthToDateDebitMicroAud - state.outstandingReservationsMicroAud;
  const available = gross - earmarkedAbove;
  return available > 0n ? microAud(available) : ZERO_MICRO_AUD;
}

/** Whether any funds at all remain for this class. Admission compares the reservation amount. */
export const hasReserveFor = (
  reserveClass: FounderReserveClass,
  state: FounderLedgerState,
): boolean => availableForClass(reserveClass, state) > ZERO_MICRO_AUD;
