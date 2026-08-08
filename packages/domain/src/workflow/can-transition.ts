/**
 * `canTransition` — the PRD §32.6 decision, closed by construction (FND-08 deliverable 2).
 *
 * A **total** function over untrusted input: RCRD-04 will hand it values parsed from HTTP, so it never
 * throws and it fails closed. A pair that is not one of the twelve is `INVALID_TRANSITION`; there is no
 * fallback branch, no `switch` over states and no `default:`. The only decision is a `Map` lookup.
 *
 * This module checks the §32.6 Actor column only. Whether the actor may act in the organisation at all
 * is FND-06's §38.1 matrix and the caller composes the two (FND-08 Non-goal 5).
 */
import { isWorkflowActor, type WorkflowActor } from './actors.js';
import type { WorkflowCondition } from './conditions.js';
import { isRecordWorkflowState, type RecordWorkflowState } from './contracts.js';
import { TRANSITION_INDEX, transitionKey, type WorkflowTransition } from './transitions.js';

export interface TransitionQuery {
  readonly from: RecordWorkflowState | string;
  readonly to: RecordWorkflowState | string;
  readonly actor: WorkflowActor | string;
  /**
   * The conditions the caller has SATISFIED — not the ones the transition requires. Unknown tokens are
   * ignored (they can satisfy nothing) and duplicates are harmless. See
   * `satisfiedConditions` in apply-transition.ts for the derivation from a record snapshot.
   */
  readonly conditions: readonly (WorkflowCondition | string)[];
}

export type TransitionDecision =
  | { readonly ok: true; readonly transition: WorkflowTransition }
  | { readonly ok: false; readonly reason: 'INVALID_TRANSITION' | 'ACTOR_NOT_PERMITTED' }
  | {
      readonly ok: false;
      readonly reason: 'CONDITION_NOT_MET';
      /** Every unmet condition, in the transition's declared order — deterministic. */
      readonly missingConditions: readonly WorkflowCondition[];
    };

export function canTransition(query: TransitionQuery): TransitionDecision {
  const { from, to, actor, conditions } = query;

  // Fail closed on anything that is not a known state: an unknown value can never name a §32.6 row.
  if (!isRecordWorkflowState(from) || !isRecordWorkflowState(to)) {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  const transition = TRANSITION_INDEX.get(transitionKey(from, to));
  if (transition === undefined) {
    return { ok: false, reason: 'INVALID_TRANSITION' };
  }

  if (!isWorkflowActor(actor) || !transition.allowedActors.includes(actor)) {
    return { ok: false, reason: 'ACTOR_NOT_PERMITTED' };
  }

  const satisfied = new Set<string>(conditions);
  const missingConditions = transition.conditions.filter((condition) => !satisfied.has(condition));
  if (missingConditions.length > 0) {
    return { ok: false, reason: 'CONDITION_NOT_MET', missingConditions: Object.freeze(missingConditions) };
  }

  return { ok: true, transition };
}
