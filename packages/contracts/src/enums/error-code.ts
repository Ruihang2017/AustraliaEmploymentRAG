/**
 * Error catalogue codes (PRD §34.9, lines 2121-2137 — the Code column only, in table order).
 *
 * Identifiers only. The HTTP status, the Retry column and the response schema are FND-04
 * (sub-PRD decision D7); no mapping may be added here.
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const ERROR_CODE_VALUES = Object.freeze([
  'INVALID_REQUEST',
  'INVALID_LEGAL_DATE',
  'INVALID_ABN',
  'AUTHENTICATION_REQUIRED',
  'MFA_REQUIRED',
  'RECENT_AUTH_REQUIRED',
  'RESOURCE_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'CONCURRENT_MODIFICATION',
  'EPHEMERAL_CONTENT_EXPIRED',
  'EMPLOYEE_PII_DETECTED',
  'RATE_LIMITED',
  'CREDIT_LIMIT_REACHED',
  'GENERATION_UNAVAILABLE',
  'SOURCE_NOT_CURRENT',
  'CORPUS_INCOMPATIBLE',
  'INTERNAL_ERROR',
] as const);

export type ErrorCode = (typeof ERROR_CODE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && (ERROR_CODE_VALUES as readonly string[]).includes(value);
