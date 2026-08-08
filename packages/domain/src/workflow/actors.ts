/**
 * The workflow actor vocabulary — the PRD §32.6 "Actor" column (FND-08 deliverable 1).
 *
 * A `WorkflowActor` is a **record-relative capacity**, not the `packages/contracts` `Role` enum:
 * §32.6's "owner" is the record's owner and "reviewer" is its assigned reviewer (relationships to one
 * record), while "admin" is an organisation role and "system" is no user at all. The caller resolves a
 * user to a capacity — record ownership plus FND-06's §38.1 permission matrix — and passes the result
 * here; this module checks only the §32.6 Actor column and never asks whether the actor may act in the
 * organisation at all (FND-08 Non-goal 5).
 *
 * The tokens are lower case because the ticket spells them that way (deliverable 1). They are internal
 * domain values that RCRD-04 maps at the HTTP boundary, not wire values, so they deliberately do not
 * follow the UPPER_SNAKE convention that `packages/contracts` controlled values use.
 *
 * Order is the order the §32.6 rows introduce each actor.
 */
export const WORKFLOW_ACTOR_VALUES = Object.freeze([
  'owner',
  'researcher',
  'reviewer',
  'system',
  'admin',
] as const);

export type WorkflowActor = (typeof WORKFLOW_ACTOR_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isWorkflowActor = (value: unknown): value is WorkflowActor =>
  typeof value === 'string' && (WORKFLOW_ACTOR_VALUES as readonly string[]).includes(value);
