/**
 * Fixed organisation roles (PRD §8.1, line 422).
 *
 * The PRD writes these as prose capitals — "Owner, Admin, Researcher, Viewer and Developer". They are
 * shipped UPPER_SNAKE because a role is a stored `membership.role` controlled value (PRD §35.4) and
 * PRD §35.1 requires enumerations to be checked text values generated from this package, in the same
 * spelling every other controlled value uses. The normalisation is recorded per member as
 * `prdSpelling` in test/enums/prd-enums.fixture.json so it stays visible rather than silent.
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const ROLE_VALUES = Object.freeze([
  'OWNER',
  'ADMIN',
  'RESEARCHER',
  'VIEWER',
  'DEVELOPER',
] as const);

export type Role = (typeof ROLE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLE_VALUES as readonly string[]).includes(value);
