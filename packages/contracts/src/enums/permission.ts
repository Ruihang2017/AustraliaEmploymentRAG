/**
 * Permission identifiers — one per action row of the PRD §38.1 role matrix (lines 2519-2532), in
 * matrix row order.
 *
 * The identifiers are coined here: PRD §38.1 spells the rows as English action labels, not as
 * identifiers, and this ticket owns the identifier vocabulary. Each member records the verbatim row
 * label as `prdText` in test/enums/prd-enums.fixture.json. Which role gets which cell is NOT here —
 * that matrix is FND-06 (packages/domain/src/access/**).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const PERMISSION_VALUES = Object.freeze([
  'CORPUS_SEARCH_READ',
  'ANSWER_CREATE',
  'RESEARCH_RECORD_READ_WRITE_OWN',
  'RESEARCH_RECORD_REVIEW_COMMENT',
  'EXPORT_CREATE',
  'WATCHLIST_CREATE',
  'MEMBERSHIP_MANAGE',
  'MEMBERSHIP_ROLE_CHANGE',
  'ORGANIZATION_RETENTION_CONFIGURE',
  'ORGANIZATION_SECURITY_CONFIGURE',
  'SERVICE_ACCOUNT_MANAGE',
  'USAGE_VIEW',
  'AUDIT_EVENT_VIEW',
  'INTERNAL_ADMIN',
] as const);

export type Permission = (typeof PERMISSION_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (PERMISSION_VALUES as readonly string[]).includes(value);
