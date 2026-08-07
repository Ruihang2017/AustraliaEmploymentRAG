/**
 * SSO connection states (PRD §16.3, line 992).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const SSO_CONNECTION_STATE_VALUES = Object.freeze([
  'DRAFT',
  'TESTING',
  'ACTIVE',
  'ERROR',
  'DISABLED',
] as const);

export type SsoConnectionState = (typeof SSO_CONNECTION_STATE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isSsoConnectionState = (value: unknown): value is SsoConnectionState =>
  typeof value === 'string' && (SSO_CONNECTION_STATE_VALUES as readonly string[]).includes(value);
