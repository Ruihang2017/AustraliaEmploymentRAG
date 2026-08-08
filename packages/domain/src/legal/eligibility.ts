/**
 * FND-10 deliverable 1 — the PRD §36.2 hard applicability filter.
 *
 * PRD §36.2, verbatim, a candidate is eligible only if:
 *
 *   requested date ∈ effective interval
 *   AND requested jurisdiction intersects applicable jurisdiction
 *   AND legal status is permitted by request mode
 *   AND document/source use is permitted by licence assessment
 *   AND version and node belong to the pinned CorpusRelease
 *
 * ALL FIVE CONJUNCTS ARE ALWAYS EVALUATED — no short-circuit, no early return. PRD §36.2 runs this
 * filter twice (*"before scoring and again before evidence-pack construction"*), and the second run's
 * diagnostics are what `EVID-04` shows the user. A `&&` chain would report one failure and silently
 * drop the rest.
 *
 * NO EXCEPTION PATH. If a candidate must be admitted despite failing a conjunct, that overturns the
 * safety model behind SRCH-002/SRCH-005/ANS-005: stop, raise an ADR, escalate (ticket § Escalation).
 * A soft filter is the same failure as a score that reintroduces a filtered item (PRD §36.3).
 *
 * TOTAL: no input, however malformed, throws. These functions sit behind the API boundary and are
 * called with values that have crossed it; declared types are not runtime guarantees. Every unknown or
 * malformed value produces the RESTRICTIVE answer.
 */
import { type LicenceAssessmentState } from './contracts.js';
import { deepFreeze } from './deep-freeze.js';
import { type LegalDate } from './dates.js';
import { effectiveIntervalContains } from './interval.js';
import { isStatusPermittedByMode } from './modes.js';

/** Failure names, in PRD §36.2's conjunct order. `failures` is always emitted in this order. */
export const ELIGIBILITY_FAILURES = deepFreeze([
  /** Conjunct 1 — requested date ∉ effective interval. */
  'OUTSIDE_EFFECTIVE_INTERVAL',
  /** Conjunct 2 — requested jurisdiction does not intersect applicable jurisdiction. */
  'JURISDICTION_MISMATCH',
  /** Conjunct 3 — legal status not permitted by request mode. */
  'STATUS_NOT_PERMITTED_BY_MODE',
  /** Conjunct 4 — document/source use not permitted by licence assessment. */
  'LICENCE_NOT_PERMITTED',
  /** Conjunct 5 — version/node not in the pinned CorpusRelease. */
  'NOT_IN_PINNED_RELEASE',
] as const);

export type EligibilityFailure = (typeof ELIGIBILITY_FAILURES)[number];

/**
 * The two applications PRD §36.2 names: *"before scoring and again before evidence-pack construction"*.
 * `SEARCH_RESULT` is the metadata/link listing; `EVIDENCE_PACK` quotes exact source text.
 */
export type EligibilityUse = 'SEARCH_RESULT' | 'EVIDENCE_PACK';

/**
 * Licence states permitting each use (open question **OQ-3**).
 *
 * - `EVIDENCE_PACK` quotes exact source text, so it needs an affirmative grant: `PERMITTED` or
 *   `PERMITTED_WITH_ATTRIBUTION`.
 * - `SEARCH_RESULT` is metadata, a snippet-free listing and an official link, so PRD §11.1's
 *   *"Unclear rights default to metadata, limited quotation and official links"* also admits
 *   `METADATA_AND_LINK_ONLY` and `UNCLEAR_RESTRICTED`.
 * - `PROHIBITED` and `REVIEW_REQUIRED` permit NEITHER use. `REVIEW_REQUIRED` means "not yet assessed",
 *   which is exactly the case that must fail closed.
 *
 * This conjunct is a LEGAL-EXPOSURE CONTROL, not a nicety. Any change that lets an unassessed or
 * `PROHIBITED` source pass — a "temporary" default, a `??` fallback, an optional field that defaults
 * permissive — is a licensing breach in production. The per-use decision columns ultimately live on
 * `LicenceAssessment` (PRD §11.1) and are `05-ingestion-framework`/`INGF-04`'s; this module takes an
 * assessment as an input and never assesses.
 */
export const LICENCE_STATES_PERMITTING_USE: Readonly<
  Record<EligibilityUse, readonly LicenceAssessmentState[]>
> = deepFreeze({
  EVIDENCE_PACK: ['PERMITTED', 'PERMITTED_WITH_ATTRIBUTION'],
  SEARCH_RESULT: [
    'PERMITTED',
    'PERMITTED_WITH_ATTRIBUTION',
    'METADATA_AND_LINK_ONLY',
    'UNCLEAR_RESTRICTED',
  ],
} as Record<EligibilityUse, readonly LicenceAssessmentState[]>);

export interface EligibilityCandidate {
  readonly effective_from: LegalDate;
  readonly effective_to: LegalDate | null;
  /** Applicable jurisdictions. Opaque strings here — see the note on conjunct 2 (OQ-2). */
  readonly jurisdictions: readonly string[];
  readonly legal_status: string;
  readonly licence_state: string;
  readonly corpus_release_id: string | null;
  /** Diagnostics only; never part of the decision. */
  readonly document_version_id?: string | undefined;
  readonly node_version_id?: string | undefined;
}

export interface EligibilityRequest {
  /** PRD §15.2: *"A query MUST carry `legal_as_at`"*. There is no clock in this module. */
  readonly legal_as_at: LegalDate;
  readonly jurisdictions: readonly string[];
  /** `CURRENT_LAW` | `HISTORICAL` | `FUTURE_OR_PROPOSED` — see `modes.ts`. Not §34.2's `mode`. */
  readonly request_mode: string;
  readonly corpus_release_id: string;
  /** Defaults to the STRICTEST use, `EVIDENCE_PACK`, so a caller that forgets it over-filters. */
  readonly use?: EligibilityUse | undefined;
}

export interface Eligibility {
  readonly eligible: boolean;
  /** Always in `ELIGIBILITY_FAILURES` order, whatever order evaluation happened in. */
  readonly failures: readonly EligibilityFailure[];
}

/**
 * PRD §36.2 conjunct 2. Non-empty intersection under EXACT, case-sensitive string equality.
 *
 * NO HIERARCHY EXPANSION: `CTH` does not implicitly cover `VIC`. PRD §34.2's own example sends
 * `"jurisdictions": ["CTH", "VIC"]` on the REQUEST against a `["CTH"]` result — the caller widens the
 * request. Inferring coverage here would be a soft rule inside a hard filter and belongs to §36.1 query
 * classification.
 *
 * EITHER SIDE EMPTY ⇒ FAIL: a request with no jurisdiction cannot be satisfied (PRD §8.2 requires an
 * explicit jurisdiction with visible assumptions), and a candidate with no declared jurisdiction cannot
 * be proven applicable.
 *
 * Jurisdiction values are OPAQUE STRINGS here (open question **OQ-2**). The ticket's non-goals assign
 * "the jurisdiction codes" to FND-03, but FND-03 shipped no such enum; PRD §32.2's controlled list
 * (`CTH`, `NSW`, `VIC`, `QLD`, `WA`, `SA`, `TAS`, `ACT`, `NT`) must be added THERE, not invented here.
 */
function jurisdictionsIntersect(
  requested: readonly string[],
  applicable: readonly string[],
): boolean {
  if (!Array.isArray(requested) || !Array.isArray(applicable)) return false;
  if (requested.length === 0 || applicable.length === 0) return false;
  const applicableSet = new Set(applicable.filter((value) => typeof value === 'string'));
  return requested.some((value) => typeof value === 'string' && applicableSet.has(value));
}

/** PRD §36.2 conjunct 4. Unknown state, unknown use and non-string input all fail closed. */
function licencePermits(licenceState: string, use: EligibilityUse): boolean {
  const permitted = (
    LICENCE_STATES_PERMITTING_USE as Record<string, readonly string[] | undefined>
  )[use];
  if (permitted === undefined) return false;
  return typeof licenceState === 'string' && permitted.includes(licenceState);
}

/**
 * The PRD §36.2 five-conjunct eligibility predicate.
 *
 * Pure: no I/O, no state, no clock, no randomness. Returns a FRESH FROZEN object each call and never
 * aliases the caller's arrays into it, so a caller mutating its inputs afterwards cannot retroactively
 * change a decision another request is still holding.
 */
export function isEligible(
  candidate: EligibilityCandidate,
  request: EligibilityRequest,
): Eligibility {
  const failures: EligibilityFailure[] = [];

  const safeCandidate: Partial<EligibilityCandidate> =
    candidate !== null && typeof candidate === 'object' ? candidate : {};
  const safeRequest: Partial<EligibilityRequest> =
    request !== null && typeof request === 'object' ? request : {};

  // Conjunct 1 — requested date ∈ effective interval (closed inclusive, sub-PRD D12).
  const inInterval = effectiveIntervalContains(
    {
      effective_from: safeCandidate.effective_from as LegalDate,
      effective_to: safeCandidate.effective_to ?? null,
    },
    safeRequest.legal_as_at as LegalDate,
  );

  // Conjunct 2 — requested jurisdiction intersects applicable jurisdiction.
  const jurisdictionOk = jurisdictionsIntersect(
    safeRequest.jurisdictions ?? [],
    safeCandidate.jurisdictions ?? [],
  );

  // Conjunct 3 — legal status permitted by request mode. MEMBERSHIP ONLY; the date is conjunct 1.
  const statusOk = isStatusPermittedByMode(
    String(safeCandidate.legal_status),
    String(safeRequest.request_mode),
  );

  // Conjunct 4 — document/source use permitted by licence assessment. Default = strictest use.
  const use: EligibilityUse = safeRequest.use === 'SEARCH_RESULT' ? 'SEARCH_RESULT' : 'EVIDENCE_PACK';
  const licenceOk = licencePermits(String(safeCandidate.licence_state), use);

  // Conjunct 5 — version and node belong to the pinned CorpusRelease. Manifest membership itself is
  // `CRPS-03`'s; this compares the pinned id the caller resolved the version and node from.
  const pinned = safeRequest.corpus_release_id;
  const releaseOk =
    typeof pinned === 'string' &&
    pinned.length > 0 &&
    typeof safeCandidate.corpus_release_id === 'string' &&
    safeCandidate.corpus_release_id.length > 0 &&
    safeCandidate.corpus_release_id === pinned;

  if (!inInterval) failures.push('OUTSIDE_EFFECTIVE_INTERVAL');
  if (!jurisdictionOk) failures.push('JURISDICTION_MISMATCH');
  if (!statusOk) failures.push('STATUS_NOT_PERMITTED_BY_MODE');
  if (!licenceOk) failures.push('LICENCE_NOT_PERMITTED');
  if (!releaseOk) failures.push('NOT_IN_PINNED_RELEASE');

  return Object.freeze({
    eligible: failures.length === 0,
    failures: Object.freeze(failures) as readonly EligibilityFailure[],
  });
}
