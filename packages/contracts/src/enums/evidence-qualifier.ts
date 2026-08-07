/**
 * Evidence qualifiers: `TREATMENT_NOT_CONFIRMED` (PRD §9.2, line 581) and `MODEL_SUGGESTED`
 * (PRD §9.3, line 589).
 *
 * The registry records a single `prdSection` per family, so this family carries §9.2; the §9.3 origin
 * of `MODEL_SUGGESTED` is recorded per member in test/enums/prd-enums.fixture.json.
 *
 * Transcribed verbatim from docs/PRD.md — spelling, underscores and order are the spec. Renaming or
 * removing a member is a breaking change requiring /v2 (PRD §16.1) and a PRD update (PRD §45.5), not a
 * refactor.
 */
export const EVIDENCE_QUALIFIER_VALUES = Object.freeze([
  'TREATMENT_NOT_CONFIRMED',
  'MODEL_SUGGESTED',
] as const);

export type EvidenceQualifier = (typeof EVIDENCE_QUALIFIER_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isEvidenceQualifier = (value: unknown): value is EvidenceQualifier =>
  typeof value === 'string' && (EVIDENCE_QUALIFIER_VALUES as readonly string[]).includes(value);
