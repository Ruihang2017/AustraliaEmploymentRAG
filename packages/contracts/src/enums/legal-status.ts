/**
 * Legal status taxonomy (PRD §6.7, lines 393-399).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const LEGAL_STATUS_VALUES = Object.freeze([
  'IN_FORCE',
  'ENACTED_NOT_IN_FORCE',
  'BILL_NOT_ENACTED',
  'DRAFT_OR_CONSULTATION',
  'REPEALED',
  'SUPERSEDED',
  'STATUS_UNCONFIRMED',
] as const);

export type LegalStatus = (typeof LEGAL_STATUS_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isLegalStatus = (value: unknown): value is LegalStatus =>
  typeof value === 'string' && (LEGAL_STATUS_VALUES as readonly string[]).includes(value);
