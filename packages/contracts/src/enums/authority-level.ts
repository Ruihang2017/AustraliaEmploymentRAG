/**
 * Authority hierarchy — the eight-step default ordering (PRD §9.1, lines 564-571).
 *
 * ORDERED ENUM: array position is the spec. Index 0 is the highest authority and index 7 the lowest,
 * matching the PRD’s numbered list 1-8. The identifiers are coined here (the PRD spells the steps as
 * prose); each records its verbatim PRD sentence as `prdText` in test/enums/prd-enums.fixture.json.
 *
 * No comparator, rank function or ordering helper ships here: the §9.1 ranking RULE is FND-10
 * (packages/domain/src/legal/**), consumed by FND-07 through a structural port (sub-PRD D11). A rule
 * in this package would breach PRD §45.2.
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const AUTHORITY_LEVEL_VALUES = Object.freeze([
  'CONSTITUTION_AND_LEGISLATION',
  'REGULATIONS_AND_LEGISLATIVE_INSTRUMENTS',
  'BINDING_JUDICIAL_AUTHORITY',
  'OPERATIVE_FWC_INSTRUMENTS_AND_DECISIONS',
  'PERSUASIVE_DECISIONS',
  'OFFICIAL_REGULATOR_GUIDANCE',
  'EXPLANATORY_AND_INTERPRETIVE_MATERIALS',
  'BILLS_AND_NON_OPERATIVE_FUTURE_MATERIALS',
] as const);

export type AuthorityLevel = (typeof AUTHORITY_LEVEL_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isAuthorityLevel = (value: unknown): value is AuthorityLevel =>
  typeof value === 'string' && (AUTHORITY_LEVEL_VALUES as readonly string[]).includes(value);
