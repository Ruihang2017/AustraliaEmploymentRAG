/**
 * Monitor change types (PRD §8.8, line 514), in the order the sentence lists them.
 *
 * PRD §8.8 spells them in prose ("amendment, commencement, rate, replacement, appeal, guidance,
 * source-removal or freshness events"); they are spelled UPPER_SNAKE here because that is how the
 * PRD §34.8 webhook payload spells the same field ("change_type": "COMMENCEMENT", line 2108).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const CHANGE_TYPE_VALUES = Object.freeze([
  'AMENDMENT',
  'COMMENCEMENT',
  'RATE',
  'REPLACEMENT',
  'APPEAL',
  'GUIDANCE',
  'SOURCE_REMOVAL',
  'FRESHNESS',
] as const);

export type ChangeType = (typeof CHANGE_TYPE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isChangeType = (value: unknown): value is ChangeType =>
  typeof value === 'string' && (CHANGE_TYPE_VALUES as readonly string[]).includes(value);
