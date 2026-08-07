/**
 * Coverage Navigator candidate status values (PRD §8.5, lines 490-495).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const COVERAGE_CANDIDATE_STATUS_VALUES = Object.freeze([
  'CONFIRMED_FROM_STATED_FACTS',
  'LIKELY',
  'POSSIBLE',
  'UNLIKELY',
  'EXCLUDED',
  'INSUFFICIENT_EVIDENCE',
] as const);

export type CoverageCandidateStatus = (typeof COVERAGE_CANDIDATE_STATUS_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isCoverageCandidateStatus = (value: unknown): value is CoverageCandidateStatus =>
  typeof value === 'string' && (COVERAGE_CANDIDATE_STATUS_VALUES as readonly string[]).includes(value);
