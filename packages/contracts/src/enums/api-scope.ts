/**
 * Service-account API scopes (PRD §16.3, lines 996-1004).
 *
 * Wire values — lower-case with a colon, transcribed verbatim; they are NOT normalised to
 * UPPER_SNAKE. The PRD calls the list "Example service scopes", so this is the initial membership;
 * adding a scope later is additive within /v1 (PRD §16.1).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const API_SCOPE_VALUES = Object.freeze([
  'search:read',
  'answers:create',
  'records:read',
  'records:write',
  'coverage:create',
  'monitor:read',
  'monitor:write',
  'exports:create',
  'usage:read',
] as const);

export type ApiScope = (typeof API_SCOPE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isApiScope = (value: unknown): value is ApiScope =>
  typeof value === 'string' && (API_SCOPE_VALUES as readonly string[]).includes(value);
