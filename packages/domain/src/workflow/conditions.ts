/**
 * The workflow condition vocabulary — the PRD §32.6 "Condition" column (FND-08 deliverable 1).
 *
 * Each UPPER_SNAKE token names one §32.6 condition phrase. The mapping from token to the PRD's own
 * prose is recorded in `test/workflow/prd-32-6-transitions.json` (`conditionVocabulary`) so it can be
 * audited against docs/PRD.md lines 1674-1682 without reading code.
 *
 * `conditions` on a transition are the conditions that MUST be satisfied for it; `canTransition`
 * receives the set the caller has SATISFIED. See `apply-transition.ts` for how that set is derived
 * from a record snapshot plus a request, so a caller cannot simply assert it.
 */
export const WORKFLOW_CONDITION_VALUES = Object.freeze([
  'REVIEWER_ASSIGNED',
  'AT_LEAST_ONE_SAVED_ANSWER',
  'REASON_REQUIRED',
  'DISCLAIMER_ACKNOWLEDGED',
  'MATERIAL_TRIGGER',
  'REPLACEMENT_OR_RERUN_LINKED',
  'CONFIRMATION',
] as const);

export type WorkflowCondition = (typeof WORKFLOW_CONDITION_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isWorkflowCondition = (value: unknown): value is WorkflowCondition =>
  typeof value === 'string' && (WORKFLOW_CONDITION_VALUES as readonly string[]).includes(value);

/**
 * The three triggers PRD §32.6 names for the `→ REVIEW_REQUIRED` row: *"correction, source change or
 * material issue"*. Coined here (the PRD states the phrase, not a token list) and recorded in the
 * fixture's `materialTriggerVocabulary` against the verbatim prose.
 *
 * WTCH-03 (16-monitor-alerts) raises the system-triggered `REVIEW_REQUIRED` transition and MUST adopt
 * this vocabulary rather than fork its own — FND-08 Feedback obligation 2 requires the transition input
 * type to be extended here, never in `apps/worker`.
 */
export const MATERIAL_TRIGGER_VALUES = Object.freeze([
  'CORRECTION',
  'SOURCE_CHANGE',
  'MATERIAL_ISSUE',
] as const);

export type MaterialTrigger = (typeof MATERIAL_TRIGGER_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isMaterialTrigger = (value: unknown): value is MaterialTrigger =>
  typeof value === 'string' && (MATERIAL_TRIGGER_VALUES as readonly string[]).includes(value);
