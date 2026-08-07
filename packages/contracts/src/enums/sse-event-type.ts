/**
 * Allowed public SSE event types (PRD §34.4, lines 1954-1956).
 *
 * Wire values — lower-case dotted, transcribed verbatim; they are NOT normalised.
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const SSE_EVENT_TYPE_VALUES = Object.freeze([
  'job.started',
  'stage.changed',
  'clarification.required',
  'answer.section',
  'citation.added',
  'job.completed',
  'job.failed',
  'job.cancelled',
  'heartbeat',
] as const);

export type SseEventType = (typeof SSE_EVENT_TYPE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isSseEventType = (value: unknown): value is SseEventType =>
  typeof value === 'string' && (SSE_EVENT_TYPE_VALUES as readonly string[]).includes(value);
