/**
 * Research Record workflow states (PRD §8.7, line 509).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const RECORD_WORKFLOW_STATE_VALUES = Object.freeze([
  'DRAFT',
  'IN_REVIEW',
  'CUSTOMER_REVIEWED',
  'REVIEW_REQUIRED',
  'ARCHIVED',
] as const);

export type RecordWorkflowState = (typeof RECORD_WORKFLOW_STATE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isRecordWorkflowState = (value: unknown): value is RecordWorkflowState =>
  typeof value === 'string' && (RECORD_WORKFLOW_STATE_VALUES as readonly string[]).includes(value);
