/**
 * Citation roles (PRD §15.5, lines 880-884).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const CITATION_ROLE_VALUES = Object.freeze([
  'SUPPORTS',
  'QUALIFIES',
  'CONTRADICTS',
  'DEFINES',
  'BACKGROUND_ONLY',
] as const);

export type CitationRole = (typeof CITATION_ROLE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isCitationRole = (value: unknown): value is CitationRole =>
  typeof value === 'string' && (CITATION_ROLE_VALUES as readonly string[]).includes(value);
