/**
 * Mandatory states for every asynchronous screen — all ten (PRD §31.3, lines 1572-1574).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const ASYNC_STATE_VALUES = Object.freeze([
  'IDLE',
  'VALIDATING',
  'QUEUED',
  'RUNNING',
  'WAITING_FOR_CLARIFICATION',
  'CANCELLING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
] as const);

export type AsyncState = (typeof ASYNC_STATE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isAsyncState = (value: unknown): value is AsyncState =>
  typeof value === 'string' && (ASYNC_STATE_VALUES as readonly string[]).includes(value);
