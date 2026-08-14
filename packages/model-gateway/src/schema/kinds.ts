/**
 * EVID-07 — PRD §36.5's seven claim kinds.
 *
 * Quoted from the PRD: *"Claim kinds are `SHORT_ANSWER`, `RULE`, `APPLICATION`, `CONCLUSION`,
 * `DATE_OR_STATUS`, `PRACTICAL_STEP` and `LIMITATION`."* Order and spelling are the spec.
 *
 * These live here rather than in `packages/contracts` because §36.5 fixes them as part of the MODEL
 * OUTPUT schema, which is this package's gate. Promoting them into the canonical enum vocabulary
 * would be an `00-foundation` change (PRD §44.3 serial-owned) and is not this ticket's to make; the
 * shape below is the FND-03 enum-family shape so that promotion stays a file move.
 */
export const CLAIM_KIND_VALUES = Object.freeze([
  'SHORT_ANSWER',
  'RULE',
  'APPLICATION',
  'CONCLUSION',
  'DATE_OR_STATUS',
  'PRACTICAL_STEP',
  'LIMITATION',
] as const);

export type ClaimKind = (typeof CLAIM_KIND_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isClaimKind = (value: unknown): value is ClaimKind =>
  typeof value === 'string' && (CLAIM_KIND_VALUES as readonly string[]).includes(value);
