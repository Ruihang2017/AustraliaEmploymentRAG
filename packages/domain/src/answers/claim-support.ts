/**
 * FND-07 deliverables 3 and 7 — claim-support classification (PRD §15.5) and the definitive-claim
 * predicate ANS-005 is measured against (PRD §30.2, sub-PRD D21).
 *
 * The §15.5 hard rule is implemented as a GATE, not as a weight: `BACKGROUND_ONLY` evidence "cannot
 * independently support a definitive legal claim", so background citations are EXCLUDED from the
 * supporting set entirely. They are never merely outweighed downstream.
 *
 * Authority is compared only through the caller-supplied `AuthorityComparator` (sub-PRD D11): this
 * module owns no ordering. The comparator is called PAIRWISE only — never through
 * `Array.prototype.sort`, which is implementation-defined for a non-transitive or inconsistent
 * comparator — its result is normalised through `Math.sign`, and a comparator that throws propagates
 * rather than silently degrading a legal answer to `NOT_SUPPORTED`.
 */
import type { AuthorityComparator } from './ports.js';
import type { Citation, Claim, ClaimSupport } from './types.js';

/** Normalise an untrusted comparator's result. `NaN` propagates and fails every `>= 0` test. */
function compare(
  compareAuthority: AuthorityComparator,
  a: Citation,
  b: Citation,
): number {
  return Math.sign(compareAuthority(a.authorityLevel, b.authorityLevel));
}

/**
 * Classify one claim's support from its citations (PRD §15.5).
 *
 * Rule order, evaluated exactly as written:
 *
 * 1. no citations for this claim              -> `NOT_SUPPORTED`
 * 2. every citation is `BACKGROUND_ONLY`      -> `NOT_SUPPORTED` (unconditional, §15.5)
 * 3. a `CONTRADICTS` citation ranked at or above every supporting citation -> `CONTRADICTED`
 * 4. supporting evidence plus a `QUALIFIES`   -> `CONDITIONAL`
 * 5. a `SUPPORTS` citation                    -> `DIRECTLY_SUPPORTED`
 * 6. only `DEFINES` (definitional, one step)  -> `SUPPORTED_BY_INFERENCE`
 * 7. otherwise                                -> `NOT_SUPPORTED`
 *
 * Citations belonging to other claims are ignored; the caller may pass the whole pack.
 */
export function classifyClaimSupport(
  claim: Claim,
  citations: readonly Citation[],
  compareAuthority: AuthorityComparator,
): ClaimSupport {
  const own = citations.filter((citation) => citation.claimId === claim.id);
  if (own.length === 0) return 'NOT_SUPPORTED';

  // §15.5 gate: background evidence never joins the supporting set.
  const nonBackground = own.filter((citation) => citation.role !== 'BACKGROUND_ONLY');
  if (nonBackground.length === 0) return 'NOT_SUPPORTED';

  const supporting = nonBackground.filter(
    (citation) => citation.role === 'SUPPORTS' || citation.role === 'DEFINES',
  );
  const contradicting = nonBackground.filter((citation) => citation.role === 'CONTRADICTS');

  const contradicted = contradicting.some((against) =>
    // "At or above" every supporting citation. With no supporting citations this is vacuously true:
    // a contradiction with nothing to weigh against it is a contradiction.
    supporting.every((support) => compare(compareAuthority, against, support) >= 0),
  );
  if (contradicted) return 'CONTRADICTED';

  const qualifies = nonBackground.some((citation) => citation.role === 'QUALIFIES');
  if (supporting.length > 0 && qualifies) return 'CONDITIONAL';

  if (nonBackground.some((citation) => citation.role === 'SUPPORTS')) return 'DIRECTLY_SUPPORTED';
  if (nonBackground.some((citation) => citation.role === 'DEFINES')) return 'SUPPORTED_BY_INFERENCE';

  return 'NOT_SUPPORTED';
}

/**
 * Sub-PRD **D21** — a claim is definitive iff it is material, its asserted short answer is `Yes` or
 * `No` (PRD §8.4's short-answer vocabulary is the only place the PRD grades assertiveness), and it is
 * not asserted subject to a condition or assumption (PRD §8.4 item 3).
 *
 * ANS-005's "unsupported definitive claim count is zero" is measured against THIS predicate, so
 * `EVID-05` and `21-evaluation-600` count the same thing. Changing it changes that metric's
 * denominator in three places and requires notifying both.
 */
export function isDefinitiveClaim(claim: Claim): boolean {
  if (!claim.material) return false;
  if (claim.conditional) return false;
  return claim.shortAnswer === 'Yes' || claim.shortAnswer === 'No';
}
