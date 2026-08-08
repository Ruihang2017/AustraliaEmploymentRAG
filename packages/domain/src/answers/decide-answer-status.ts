/**
 * FND-07 deliverable 2 — the PRD §36.8 decision, with the sub-PRD D13 precedence.
 *
 * Pure: no clock, no randomness, no I/O, no shared mutable state. Every call allocates its own result
 * array, so no two concurrent callers can observe each other's decision.
 *
 * D13: the more restrictive status wins, and a status more permissive than any triggered condition is
 * never selected. Every condition that fires is returned, not only the winning one, because PRD §36.8
 * requires uncertainty to be represented by status, assumptions, missing facts and conflicts.
 *
 * D13a: the six rows are not total over `AnswerSignals`; the derived, NAMED condition
 * `MATERIAL_CLAIMS_UNSUPPORTED` closes the gap and resolves to `INSUFFICIENT_EVIDENCE`.
 */
import {
  CONDITION_BY_STATUS,
  DERIVED_CONDITIONS,
  MATERIAL_CLAIMS_UNSUPPORTED,
  STATUS_PRECEDENCE,
} from './refusal-table.js';
import type { AnswerDecision, AnswerSignals, AnswerStatus, RefusalConditionName } from './types.js';

/** Whether a §36.8 status row's condition holds, one predicate per row. */
function holds(condition: RefusalConditionName, signals: AnswerSignals): boolean {
  switch (condition) {
    case 'OUT_OF_SCOPE_REQUEST':
      return signals.outOfScope;
    case 'SOURCE_STALE_OR_UNAVAILABLE':
      return signals.sourceStaleOrUnavailableAndMaterial;
    case 'UNRECONCILED_AUTHORITY_CONFLICT':
      return signals.unreconciledAuthorityConflict;
    // The only signal whose FALSE value fires a row (PRD §36.8: "No sufficient applicable evidence").
    case 'NO_SUFFICIENT_APPLICABLE_EVIDENCE':
      return !signals.sufficientApplicableEvidence;
    case 'MATERIAL_FACT_UNKNOWN':
      return signals.materialFactUnknown;
    case 'ALL_MATERIAL_CLAIMS_SUPPORTED':
      return signals.allMaterialClaimsSupported;
    // Derived (D13a) — decided below, once it is known that no tabled row above SUPPORTED fired.
    case 'MATERIAL_CLAIMS_UNSUPPORTED':
      return false;
  }
}

/** The status each condition produces, tabled rows and derived conditions alike. */
export function statusOfCondition(condition: RefusalConditionName): AnswerStatus {
  for (const status of STATUS_PRECEDENCE) {
    if (CONDITION_BY_STATUS[status] === condition) return status;
  }
  for (const derived of DERIVED_CONDITIONS) {
    if (derived.condition === condition) return derived.status;
  }
  // Unreachable for a `RefusalConditionName`: the union is exactly the six tabled rows plus D13a's
  // derived condition. No caller input is embedded in the message (PRD §10 — do not widen PII blast
  // radius through error text).
  throw new Error('statusOfCondition: unknown refusal condition');
}

/**
 * Decide the answer status from validated signals.
 *
 * Total over all 2^6 signal records: either a tabled row fires, or `allMaterialClaimsSupported` is
 * false with no restrictive row, in which case the derived D13a condition fires.
 */
export function decideAnswerStatus(signals: AnswerSignals): AnswerDecision {
  const firedConditions: RefusalConditionName[] = [];

  // STATUS_PRECEDENCE is most-restrictive-first, so the collected list is already in D13 order and
  // its head is the winning status.
  for (const status of STATUS_PRECEDENCE) {
    const condition = CONDITION_BY_STATUS[status];
    if (holds(condition, signals)) firedConditions.push(condition);
  }

  // D13a. `firedConditions` being empty here means no tabled row fired at all — which, given
  // ALL_MATERIAL_CLAIMS_SUPPORTED is one of the rows, implies `allMaterialClaimsSupported === false`.
  if (firedConditions.length === 0 && !signals.allMaterialClaimsSupported) {
    firedConditions.push(MATERIAL_CLAIMS_UNSUPPORTED);
  }

  const winner = firedConditions[0];
  if (winner === undefined) {
    // Unreachable while the argument really is an `AnswerSignals` (see the totality argument above).
    // Kept as a loud failure rather than a silent default: an unnamed fallback status is exactly what
    // D13a forbids. No input is embedded in the message.
    throw new Error('decideAnswerStatus: no condition fired');
  }

  return { status: statusOfCondition(winner), firedConditions };
}
