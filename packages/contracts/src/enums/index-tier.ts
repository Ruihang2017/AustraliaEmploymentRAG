/**
 * Index tiers (PRD §17.2, lines 1035-1039).
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const INDEX_TIER_VALUES = Object.freeze([
  'TIER_1_FULL_SEMANTIC',
  'TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC',
  'TIER_3_METADATA_AND_ON_DEMAND',
  'EXCLUDED_LICENSING',
  'QUARANTINED_QUALITY',
] as const);

export type IndexTier = (typeof INDEX_TIER_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isIndexTier = (value: unknown): value is IndexTier =>
  typeof value === 'string' && (INDEX_TIER_VALUES as readonly string[]).includes(value);
