/**
 * FND-09 deliverable 8 — PRD §42.6's founder-funded reserve order:
 *
 * > 1. production incident/synthetic safety check allowance;
 * > 2. active trial commitments;
 * > 3. internal testing;
 * > 4. discretionary Deep runs.
 *
 * The order is a HOLD-BACK rule, not a queue: money still unspent against a higher-priority class is
 * not available to a lower-priority one. So a discretionary Deep run cannot consume the incident
 * allowance, while an incident — with nothing above it — sees the whole remainder.
 *
 * `heldMicroAud` (outstanding, unsettled reservations) is subtracted as well as `settledMicroAud`.
 * That is the concurrency-critical part (plan risk R1): this module is pure, but its callers are not,
 * and two requests admitted concurrently against the same *settled* month-to-date spend would each
 * see the full remaining balance and together blow the A$50 stop. Admission is evaluated against
 * settled + held, never against settled alone.
 *
 * The reserve class is always an explicit input and is never inferred (ticket obligation 5): there is
 * no default parameter value here, because defaulting to the most permissive class would breach §42.6's
 * ordering silently.
 */
import { deepFreeze } from './deep-freeze.js';
import { microAud, ZERO_MICRO_AUD, type MicroAud } from './micro-aud.js';
import type { FounderLedgerState, FounderReserveClass } from './types.js';

/** PRD §42.6's four priorities, highest first. */
export const FOUNDER_RESERVE_ORDER: readonly FounderReserveClass[] = deepFreeze([
  'PRODUCTION_INCIDENT_OR_SAFETY_CHECK',
  'ACTIVE_TRIAL_COMMITMENT',
  'INTERNAL_TESTING',
  'DISCRETIONARY_DEEP',
] as const);

/** PRD §42.6's own wording for each priority, in order — the transcription the constant is checked against. */
export const FOUNDER_RESERVE_ORDER_PRD_TEXT: readonly string[] = deepFreeze([
  'production incident/synthetic safety check allowance;',
  'active trial commitments;',
  'internal testing;',
  'discretionary Deep runs.',
] as const);

/**
 * How much of the founder ceiling this class may draw on right now:
 *
 * ```
 * max(0, ceiling - settled - held - sum(unspent allowance of every STRICTLY higher-priority class))
 * ```
 */
export function availableForClass(
  reserveClass: FounderReserveClass,
  ledgerState: FounderLedgerState,
): MicroAud {
  if (!FOUNDER_RESERVE_ORDER.includes(reserveClass)) {
    throw new RangeError(`unknown founder reserve class: ${String(reserveClass)}`);
  }
  // The constant is in priority order, so everything BEFORE the requested class is strictly higher
  // priority: iterate until the class itself and hold back exactly those unspent allowances.
  let heldBack = 0n;
  for (const other of FOUNDER_RESERVE_ORDER) {
    if (other === reserveClass) break;
    heldBack += ledgerState.unspentAllowanceMicroAud[other];
  }
  const remaining =
    ledgerState.ceilingMicroAud - ledgerState.settledMicroAud - ledgerState.heldMicroAud - heldBack;
  return remaining <= 0n ? ZERO_MICRO_AUD : microAud(remaining);
}

/**
 * Deliverable 8's fixed signature: is ANY budget available to this class at all.
 *
 * `admit` uses `availableForClass` instead, because admitting requires comparing an amount, not a
 * boolean — a `> 0n` test would admit a A$10 reservation against a A$0.000001 remainder.
 */
export function hasReserveFor(
  reserveClass: FounderReserveClass,
  ledgerState: FounderLedgerState,
): boolean {
  return availableForClass(reserveClass, ledgerState) > 0n;
}
