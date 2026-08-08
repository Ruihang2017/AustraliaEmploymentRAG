/**
 * The public surface of the record workflow state machine (FND-08).
 *
 * PRD §45.2 puts pure state transitions in `packages/domain`; this leaf owns the PRD §32.6 transition
 * table, the §34.1/§16.2 ETag rules and the §8.7 immutability predicates. No framework, database or
 * network code, no clock and no randomness (PRD §39.1).
 *
 * Consumers (`16-monitor-alerts`/WTCH-03, `17-records-collab`/RCRD-04) import this barrel. It is
 * reachable today only as `packages/domain/src/workflow/index.js`: the package entry
 * `packages/domain/src/index.ts` is still FND-01's empty skeleton file and re-exporting these leaves
 * from it is unallocated work (FND-08 open question Q1, inherited from FND-03 Q1).
 *
 * Sub-PRD D10: this leaf imports no sibling leaf (`access`, `answers`, `budget`, `legal`).
 */
export { RECORD_WORKFLOW_STATE_VALUES, isRecordWorkflowState } from './contracts.js';
export type { RecordWorkflowState } from './contracts.js';

export { WORKFLOW_ACTOR_VALUES, isWorkflowActor } from './actors.js';
export type { WorkflowActor } from './actors.js';

export {
  WORKFLOW_CONDITION_VALUES,
  isWorkflowCondition,
  MATERIAL_TRIGGER_VALUES,
  isMaterialTrigger,
} from './conditions.js';
export type { WorkflowCondition, MaterialTrigger } from './conditions.js';

export { TRANSITIONS, TRANSITION_INDEX, transitionKey, buildTransitionIndex } from './transitions.js';
export type { WorkflowTransition } from './transitions.js';

export { canTransition } from './can-transition.js';
export type { TransitionQuery, TransitionDecision } from './can-transition.js';

export { ETAG_VERSION_TAG, computeETag, nextRowVersion, checkIfMatch } from './etag.js';

export { applyTransition, satisfiedConditions } from './apply-transition.js';
export type {
  RecordWorkflowSnapshot,
  TransitionRequest,
  AppliedTransition,
  TransitionOutcome,
} from './apply-transition.js';

export {
  EDITABLE_FIELDS,
  ASSIGNMENT_FIELDS,
  isEditableField,
  FORMAL_ARTIFACT_KINDS,
  assertNotFormalArtifact,
  TIMELINE_IS_APPEND_ONLY,
} from './immutability.js';
export type { EditableField } from './immutability.js';

export { CUSTOMER_REVIEWED_SEMANTICS } from './customer-reviewed.js';
