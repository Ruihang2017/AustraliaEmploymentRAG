/**
 * Claim support values (PRD §15.5, lines 872-876).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const CLAIM_SUPPORT_VALUES = Object.freeze([
  'DIRECTLY_SUPPORTED',
  'SUPPORTED_BY_INFERENCE',
  'CONDITIONAL',
  'CONTRADICTED',
  'NOT_SUPPORTED',
] as const);

export type ClaimSupport = (typeof CLAIM_SUPPORT_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isClaimSupport = (value: unknown): value is ClaimSupport =>
  typeof value === 'string' && (CLAIM_SUPPORT_VALUES as readonly string[]).includes(value);
