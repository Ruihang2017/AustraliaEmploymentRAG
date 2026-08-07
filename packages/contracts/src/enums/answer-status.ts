/**
 * Answer statuses (PRD §8.4, lines 469-474).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const ANSWER_STATUS_VALUES = Object.freeze([
  'SUPPORTED',
  'CONDITIONAL',
  'INSUFFICIENT_EVIDENCE',
  'CONFLICTING_SOURCES',
  'OUT_OF_SCOPE',
  'SOURCE_NOT_CURRENT',
] as const);

export type AnswerStatus = (typeof ANSWER_STATUS_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isAnswerStatus = (value: unknown): value is AnswerStatus =>
  typeof value === 'string' && (ANSWER_STATUS_VALUES as readonly string[]).includes(value);
