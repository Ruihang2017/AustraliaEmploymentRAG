/**
 * LicenceAssessment states (PRD §11.1, lines 648-653).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const LICENCE_ASSESSMENT_STATE_VALUES = Object.freeze([
  'PERMITTED',
  'PERMITTED_WITH_ATTRIBUTION',
  'METADATA_AND_LINK_ONLY',
  'UNCLEAR_RESTRICTED',
  'PROHIBITED',
  'REVIEW_REQUIRED',
] as const);

export type LicenceAssessmentState = (typeof LICENCE_ASSESSMENT_STATE_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isLicenceAssessmentState = (value: unknown): value is LicenceAssessmentState =>
  typeof value === 'string' && (LICENCE_ASSESSMENT_STATE_VALUES as readonly string[]).includes(value);
