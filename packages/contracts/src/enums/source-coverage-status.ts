/**
 * Source-group coverage statuses (PRD §7, line 413).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const SOURCE_COVERAGE_STATUS_VALUES = Object.freeze([
  'PLANNED_NOT_ACTIVE',
  'METADATA_AND_LINK_ACTIVE',
  'FRESHNESS_LIMITED',
  'LICENSING_RESTRICTED',
  'SOURCE_UNAVAILABLE',
] as const);

export type SourceCoverageStatus = (typeof SOURCE_COVERAGE_STATUS_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isSourceCoverageStatus = (value: unknown): value is SourceCoverageStatus =>
  typeof value === 'string' && (SOURCE_COVERAGE_STATUS_VALUES as readonly string[]).includes(value);
