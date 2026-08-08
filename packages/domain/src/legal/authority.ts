/**
 * FND-10 deliverables 4 and 5 — the PRD §9.1 authority hierarchy and the rules that protect it.
 *
 * PRD §9.1 default ordering, 1 (highest) to 8 (lowest):
 *   1. Constitution and applicable legislation.
 *   2. Regulations and legislative instruments.
 *   3. Binding judicial authority.
 *   4. FWC orders, approved agreements, modern awards and decisions with operative effect.
 *   5. Persuasive court, tribunal and FWC decisions.
 *   6. Official regulator guidance, rulings, decision summaries and impact materials.
 *   7. Explanatory memoranda and interpretive materials.
 *   8. Bills, consultations and non-operative future materials.
 * and *"Guidance MUST NOT silently override legislation, an operative instrument or binding
 * authority."*
 *
 * This leaf owns the ORDERING RULE. `packages/contracts` owns only the vocabulary (its
 * `AUTHORITY_LEVEL_VALUES` array is in §9.1 order and says explicitly that no comparator ships there),
 * and `src/answers` owns none of it — FND-07 declares a structural port and `12-evidence-safety`/EVID-05
 * wires `AUTHORITY_COMPARATOR` into it. Neither sibling leaf imports the other (sub-PRD D10).
 */
import { AUTHORITY_LEVEL_VALUES, type AuthorityLevel } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';

/**
 * Rank 1 = highest authority, rank 8 = lowest — the PRD §9.1 numbering.
 *
 * DERIVED from `AUTHORITY_LEVEL_VALUES` rather than retyped: FND-03 already ships the eight levels in
 * §9.1 order and says that array position IS the spec, so a second hand-written copy here would be a
 * second thing to keep in sync and a silent way for the two to diverge. The independent assertion
 * target is `test/legal/prd-9-1-hierarchy.json`, which transcribes §9.1's prose and is compared against
 * BOTH this constant and the contracts enum — so a reorder in `packages/contracts` fails here.
 */
export const AUTHORITY_RANK: Readonly<Record<AuthorityLevel, number>> = deepFreeze(
  Object.fromEntries(
    AUTHORITY_LEVEL_VALUES.map((level, index) => [level, index + 1]),
  ) as Record<AuthorityLevel, number>,
);

/**
 * The rank given to anything outside the §9.1 vocabulary: BELOW every known level.
 *
 * Fail-closed, and the one deliberate asymmetry in this module: an unrecognised authority can never
 * outrank legislation, an operative instrument or binding authority, whatever produced it.
 */
export const UNKNOWN_AUTHORITY_RANK = 9;

/**
 * §9.1 rank of a level, or `UNKNOWN_AUTHORITY_RANK` for anything not in the vocabulary. Total.
 *
 * `Object.hasOwn`, not a bare index: `AUTHORITY_RANK` inherits `Object.prototype`, so
 * `AUTHORITY_RANK['constructor']` is a FUNCTION, not `undefined`, and a `?? UNKNOWN_AUTHORITY_RANK`
 * fallback would never fire for it. These values arrive from across the API boundary, so an inherited
 * property must never be mistaken for a rank.
 */
export function authorityRank(level: AuthorityLevel | string): number {
  if (typeof level !== 'string') return UNKNOWN_AUTHORITY_RANK;
  if (!Object.hasOwn(AUTHORITY_RANK, level)) return UNKNOWN_AUTHORITY_RANK;
  const rank = (AUTHORITY_RANK as Record<string, number | undefined>)[level];
  return typeof rank === 'number' ? rank : UNKNOWN_AUTHORITY_RANK;
}

/**
 * Sub-PRD D11's structural port signature, declared here so `pnpm typecheck` reads it (the package
 * tsconfig includes only `src`, so a `*.test-d.ts` under `test/` would never be compiled).
 */
export type AuthorityComparator = (a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1;

/**
 * DIRECTION — read this before touching the body.
 *
 * Returns `1` when `a` is the HIGHER authority, `-1` when `a` is the LOWER authority, `0` when equal.
 * That is the ordinary comparator convention and the one FND-07's merged `src/answers/ports.ts` states
 * in prose for the port this function satisfies ("returns `-1` when `a` is LOWER authority than `b`").
 * It is NOT an `Array#sort` "best first" comparator: sorting with it ascending puts the WEAKEST
 * authority first.
 *
 * Reversing it would silently invert every authority comparison in the product — regulator guidance
 * outranking legislation, exactly the failure PRD §9.1 and §36.3 exist to prevent — and would pass every
 * test written only inside this leaf. `test/legal/authority.test.ts` asserts the direction with literals.
 *
 * Three explicit branches rather than `Math.sign(rankB - rankA)` so the return type is literally
 * `-1 | 0 | 1` without a cast.
 */
export function compareAuthority(a: AuthorityLevel, b: AuthorityLevel): -1 | 0 | 1 {
  const rankA = authorityRank(a);
  const rankB = authorityRank(b);
  if (rankA === rankB) return 0;
  // A LOWER rank number is a HIGHER authority (rank 1 is the Constitution).
  return rankA < rankB ? 1 : -1;
}

/**
 * The exported port value (sub-PRD D11). The annotation is the compile-time half of the ticket's
 * "comparator signature ... verified by a type-level test" acceptance item: `pnpm typecheck` fails if
 * `compareAuthority`'s signature ever drifts from `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1`.
 * EVID-05 wires this value into FND-07's port.
 */
export const AUTHORITY_COMPARATOR: AuthorityComparator = compareAuthority;

/** §9.1 ranks 1–4: legislation, instruments, binding judicial authority, operative FWC instruments. */
export const OPERATIVE_OR_BINDING_LEVELS: readonly AuthorityLevel[] = deepFreeze(
  AUTHORITY_LEVEL_VALUES.filter((level) => AUTHORITY_RANK[level] <= 4),
);

/** §9.1 ranks 6–8: guidance, explanatory/interpretive material, bills and non-operative future material. */
export const GUIDANCE_OR_NON_OPERATIVE_LEVELS: readonly AuthorityLevel[] = deepFreeze(
  AUTHORITY_LEVEL_VALUES.filter((level) => AUTHORITY_RANK[level] >= 6),
);

/**
 * PRD §9.1 *"Guidance MUST NOT silently override legislation, an operative instrument or binding
 * authority"* and PRD §36.3 *"[no learned score may] turn regulator guidance into higher authority than
 * the operative legislation/instrument it explains"*.
 *
 * POLARITY — a foot-gun, so it is stated three times (here, in the test names, and in the barrel):
 * returns `true` when placing `higher` ABOVE `lower` is PERMITTED, and `false` when that placement
 * VIOLATES §9.1/§36.3. The violating case is exactly: `higher` at rank 6–8 (guidance, explanatory
 * material, bills) over `lower` at rank 1–4 (legislation, instruments, binding authority, operative FWC
 * instruments).
 *
 * Rank 5 (persuasive decisions) is not guidance and constrains nothing. Unknown levels rank 9, so an
 * unknown value can never win against ranks 1–4 either. Total: never throws.
 */
export function guidanceCannotOutrank(
  higher: AuthorityLevel | string,
  lower: AuthorityLevel | string,
): boolean {
  const higherRank = authorityRank(higher);
  const lowerRank = authorityRank(lower);
  return !(higherRank >= 6 && lowerRank <= 4);
}
