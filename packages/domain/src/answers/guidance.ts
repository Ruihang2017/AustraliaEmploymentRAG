/**
 * FND-07 deliverable 4 — PRD §9.1: *"Guidance MUST NOT silently override legislation, an operative
 * instrument or binding authority."*
 *
 * WHY THIS IS EXPRESSED THROUGH THE COMPARATOR AND NOT THROUGH LEVEL NUMBERS: the ticket states the
 * rule as "level 6 or lower displacing levels 1-4", but sub-PRD D11 puts the eight-level ordering in
 * FND-10 and forbids this module from owning it — and the contracts authority-level array's order IS
 * that ordering, so an index lookup into it would own the ordering by the back door (see ports.ts).
 * The rule is therefore stated as "a
 * strictly LOWER authority relied on to support a claim, against a strictly HIGHER authority that
 * contradicts it", decided by the caller-supplied comparator. That is a superset of the level-6-vs-1-4
 * statement and satisfies the acceptance item verbatim (flags guidance displacing legislation, does not
 * flag the reverse) while leaving the hierarchy where D11 puts it. This generalisation is deliberate,
 * not scope creep.
 *
 * Complexity: pairwise WITHIN one claim group only, O(supporting x contradicting) per claim — never
 * across the whole citation list. Citations reach this module from model output and corpus text, so
 * the bound matters: it must not become a CPU amplifier on the job worker.
 */
import type { AuthorityComparator } from './ports.js';
import type { Citation } from './types.js';

export interface Violation {
  readonly code: 'GUIDANCE_OVERRIDES_BINDING_AUTHORITY';
  readonly claimId: string;
  /** The lower-authority citation relied on to support the claim. */
  readonly lowerCitationId: string;
  /** The higher authority it would displace. */
  readonly higherCitationId: string;
}

/** Flags every lower-authority-displaces-higher-authority pair, per claim (PRD §9.1). */
export function guidanceCannotOverride(
  citations: readonly Citation[],
  compareAuthority: AuthorityComparator,
): readonly Violation[] {
  const byClaim = new Map<string, Citation[]>();
  for (const citation of citations) {
    const group = byClaim.get(citation.claimId);
    if (group) group.push(citation);
    else byClaim.set(citation.claimId, [citation]);
  }

  const violations: Violation[] = [];
  for (const [claimId, group] of byClaim) {
    const relied = group.filter(
      (citation) => citation.role === 'SUPPORTS' || citation.role === 'DEFINES',
    );
    const contradicting = group.filter((citation) => citation.role === 'CONTRADICTS');
    for (const lower of relied) {
      for (const higher of contradicting) {
        if (Math.sign(compareAuthority(lower.authorityLevel, higher.authorityLevel)) < 0) {
          violations.push({
            code: 'GUIDANCE_OVERRIDES_BINDING_AUTHORITY',
            claimId,
            lowerCitationId: lower.id,
            higherCitationId: higher.id,
          });
        }
      }
    }
  }
  return violations;
}
