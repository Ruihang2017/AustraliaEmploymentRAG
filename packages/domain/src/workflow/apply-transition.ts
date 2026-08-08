/**
 * `applyTransition` — the pure next-state computation (FND-08 deliverable 3).
 *
 * Returns the next state plus the fields the caller must persist: `row_version + 1`, the new ETag,
 * the reason and the trigger. It performs no I/O, reads no clock and returns no timestamp
 * (`updated_at` is the caller's, PRD §35.1; FND-08 deliverable 7 makes any timestamp an input).
 *
 * ## THIS FUNCTION CANNOT PROVIDE ATOMICITY — the caller must
 *
 * `checkIfMatch` is a read-time comparison. Between it and the caller's write another request can
 * commit, and two concurrent requests holding the *same fresh* ETag both pass it. Preventing the lost
 * update requires a compare-and-swap at the storage boundary:
 *
 *     UPDATE research_record SET …, row_version = row_version + 1 WHERE id = ? AND row_version = ?
 *
 * with zero rows affected mapped to `409 CONCURRENT_MODIFICATION`. That is `01-app-data`/DATA-06 and
 * `17-records-collab`/RCRD-04's obligation (FND-08 Non-goals 1 and 2), inherited from here — not
 * something this module has handled. A lock, mutex or queue must never be added here: PRD §45.2
 * requires a pure function, and module-level mutable state would be per-process and therefore useless.
 *
 * ## Order of checks: staleness before validity
 *
 * A caller holding a stale ETag is by definition reasoning about a record state it can no longer see.
 * Answering `INVALID_TRANSITION` against a snapshot the caller never had is misleading, and it
 * discloses the current machine's verdict to a caller whose read was superseded. Checking staleness
 * first is also what makes FND-08's property — "a transition computed against a stale ETag is never
 * applicable" — hold by construction rather than by coincidence.
 *
 * `from` is always `record.state`, never a request field, so a caller can never assert a `from` it does
 * not hold (that would let it legalise an otherwise invalid pair).
 */
import type { WorkflowActor } from './actors.js';
import {
  WORKFLOW_CONDITION_VALUES,
  isMaterialTrigger,
  type MaterialTrigger,
  type WorkflowCondition,
} from './conditions.js';
import type { RecordWorkflowState } from './contracts.js';
import { canTransition } from './can-transition.js';
import { checkIfMatch, computeETag, nextRowVersion } from './etag.js';
import type { WorkflowTransition } from './transitions.js';

/** The record facts this decision needs. A projection of PRD §35.4's `research_record`, not the row. */
export interface RecordWorkflowSnapshot {
  /** Opaque resource id (PRD §34.1). A plain string — the `Id` brand lives in FND-03/FND-04. */
  readonly id: string;
  readonly state: RecordWorkflowState;
  /** PRD §35.1 integer `row_version`. */
  readonly rowVersion: number;
  readonly reviewerAssigned: boolean;
  readonly savedAnswerCount: number;
}

/**
 * The requested transition. Optional fields are written `?: T | undefined` because the workspace
 * compiles with `exactOptionalPropertyTypes` — without it a caller could not pass an explicit
 * `undefined`.
 */
export interface TransitionRequest {
  readonly to: RecordWorkflowState | string;
  readonly actor: WorkflowActor | string;
  readonly ifMatch?: string | undefined;
  readonly reason?: string | undefined;
  readonly trigger?: MaterialTrigger | string | undefined;
  readonly replacementRef?: string | undefined;
  readonly disclaimerAcknowledged?: boolean | undefined;
  readonly confirmed?: boolean | undefined;
  readonly retainWatches?: boolean | undefined;
}

export interface AppliedTransition {
  readonly state: RecordWorkflowState;
  /** `record.rowVersion + 1` — PRD §35.1 monotonicity. */
  readonly rowVersion: number;
  /** `computeETag(rowVersion, record.id)` — the token the caller returns after the write lands. */
  readonly etag: string;
  /** Trimmed, or `null` when absent. Persisted by the caller; never logged or thrown by this module. */
  readonly reason: string | null;
  readonly trigger: MaterialTrigger | null;
  /**
   * PRD §32.6's "watches optionally retained". Reported for every successful transition (`true` unless
   * the request explicitly says `false`), but only *meaningful* for `→ ARCHIVED`; the PRD states no
   * rule for the other rows, so none is invented here.
   */
  readonly retainWatches: boolean;
  readonly transition: WorkflowTransition;
}

export type TransitionOutcome =
  | { readonly ok: true; readonly next: AppliedTransition }
  | {
      readonly ok: false;
      readonly reason: 'CONDITION_NOT_MET';
      readonly missingConditions: readonly WorkflowCondition[];
    }
  | {
      readonly ok: false;
      readonly reason: 'INVALID_TRANSITION' | 'ACTOR_NOT_PERMITTED' | 'STALE' | 'MISSING';
    };

/**
 * Derives the set of SATISFIED conditions from the record snapshot and the request, so a caller
 * cannot claim `REASON_REQUIRED` while sending an empty reason. Returned in
 * `WORKFLOW_CONDITION_VALUES` order — deterministic and independent of the request's field order.
 */
export function satisfiedConditions(
  record: RecordWorkflowSnapshot,
  request: TransitionRequest,
): readonly WorkflowCondition[] {
  const isNonBlankString = (value: unknown): boolean =>
    typeof value === 'string' && value.trim().length > 0;

  const satisfied: Record<WorkflowCondition, boolean> = {
    REVIEWER_ASSIGNED: record.reviewerAssigned === true,
    AT_LEAST_ONE_SAVED_ANSWER:
      Number.isInteger(record.savedAnswerCount) && record.savedAnswerCount >= 1,
    REASON_REQUIRED: isNonBlankString(request.reason),
    // Strict `===`, not truthiness: `disclaimerAcknowledged: 'yes'` is not an acknowledgement.
    DISCLAIMER_ACKNOWLEDGED: request.disclaimerAcknowledged === true,
    MATERIAL_TRIGGER: isMaterialTrigger(request.trigger),
    REPLACEMENT_OR_RERUN_LINKED: isNonBlankString(request.replacementRef),
    CONFIRMATION: request.confirmed === true,
  };

  return Object.freeze(WORKFLOW_CONDITION_VALUES.filter((condition) => satisfied[condition]));
}

/**
 * Throws only for a caller bug — a snapshot that could not have come from storage. Messages name the
 * offending field and never echo `request.reason`, which is user text and may carry PII
 * (PRD §16 / §20.2).
 */
function assertSnapshot(record: RecordWorkflowSnapshot): void {
  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new TypeError('record.id must be a non-empty string');
  }
  if (!Number.isInteger(record.rowVersion)) {
    throw new TypeError('record.rowVersion must be an integer');
  }
  if (record.rowVersion < 0) {
    throw new RangeError('record.rowVersion must not be negative');
  }
  if (record.rowVersion >= Number.MAX_SAFE_INTEGER - 1) {
    throw new RangeError('record.rowVersion is too large to increment safely');
  }
}

export function applyTransition(
  record: RecordWorkflowSnapshot,
  request: TransitionRequest,
): TransitionOutcome {
  assertSnapshot(record);

  const currentETag = computeETag(record.rowVersion, record.id);
  const freshness = checkIfMatch(request.ifMatch, currentETag);
  if (freshness !== 'OK') {
    return { ok: false, reason: freshness };
  }

  const decision = canTransition({
    from: record.state,
    to: request.to,
    actor: request.actor,
    conditions: satisfiedConditions(record, request),
  });
  if (!decision.ok) {
    return decision.reason === 'CONDITION_NOT_MET'
      ? { ok: false, reason: 'CONDITION_NOT_MET', missingConditions: decision.missingConditions }
      : { ok: false, reason: decision.reason };
  }

  const rowVersion = nextRowVersion(record.rowVersion);
  const reason = typeof request.reason === 'string' && request.reason.trim().length > 0
    ? request.reason.trim()
    : null;

  // Every field below is freshly constructed: no caller-supplied object or array is ever returned,
  // so a caller cannot mutate a value the audit row is built from.
  return {
    ok: true,
    next: Object.freeze({
      state: decision.transition.to,
      rowVersion,
      etag: computeETag(rowVersion, record.id),
      reason,
      trigger: isMaterialTrigger(request.trigger) ? request.trigger : null,
      retainWatches: request.retainWatches !== false,
      transition: decision.transition,
    }),
  };
}
