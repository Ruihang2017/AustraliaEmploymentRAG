/**
 * FND-10 deliverable 8 — Australian financial-year helpers and PRD §6.6's two NON-EXCLUSION rules.
 *
 * PRD §6.6: point-in-time retrieval MUST support 2026–27, 2025–26 and 2024–25, and *"Case law and
 * still-operative instruments MUST NOT be excluded solely because they are older than three financial
 * years. An enterprise agreement MUST NOT be treated as ceased merely because its nominal expiry date
 * has passed."*
 */
import { deepFreeze } from './deep-freeze.js';
import { type LegalDate, parseLegalDate } from './dates.js';
import { deriveStatus, type LegalEvent } from './temporal.js';

/** An Australian financial year in the PRD's `'2025-26'` notation. */
export type FinancialYear = string;

/** PRD §6.6's three supported years, in the PRD's own order. */
export const SUPPORTED_FINANCIAL_YEARS = deepFreeze(['2024-25', '2025-26', '2026-27'] as const);

export function isSupportedFinancialYear(value: unknown): boolean {
  return typeof value === 'string' && (SUPPORTED_FINANCIAL_YEARS as readonly string[]).includes(value);
}

/**
 * The Australian financial year (1 July – 30 June) containing `date`.
 *
 * `'2026-06-30' → '2025-26'`; `'2026-07-01' → '2026-27'`. The 30 June / 1 July boundary is the single
 * most likely off-by-one in this ticket and is the one `UAT-SRCH-03` is designed to catch.
 *
 * THROWS `TypeError` on a malformed legal date. This is the ONE documented exception to the leaf's
 * totality rule: this is a CONVERSION, not a filter or a predicate, so it has no fail-closed value to
 * return — a made-up financial year would be worse than a thrown error. Every filter and predicate in
 * this leaf is total.
 *
 * The two-digit roll renders FY 2099–2100 as `'2099-00'`. That follows from the PRD's own notation and
 * is recorded here so nobody "fixes" it silently; changing the notation is a PRD change.
 */
export function financialYearOf(date: LegalDate): FinancialYear {
  const parsed = parseLegalDate(date);
  if (parsed === null) {
    throw new TypeError(`financialYearOf: not a YYYY-MM-DD legal date: ${String(date)}`);
  }
  const start = parsed.month >= 7 ? parsed.year : parsed.year - 1;
  const endSuffix = String((start + 1) % 100).padStart(2, '0');
  return `${String(start)}-${endSuffix}`;
}

/** What `mustNotExcludeForAge` needs to know about a candidate. Nothing else is relevant to §6.6. */
export interface AgeExemptionCandidate {
  readonly kind: 'CASE_LAW' | 'INSTRUMENT' | 'OTHER';
  readonly legal_status: string;
}

/**
 * PRD §6.6: *"Case law and still-operative instruments MUST NOT be excluded solely because they are
 * older than three financial years."*
 *
 * ADVISORY, NOT A CONJUNCT. This is deliberately NOT part of `isEligible`: §6.6 says age alone is not a
 * ground for exclusion, and it does not re-admit anything that failed a §36.2 conjunct. Wiring it into
 * the eligibility conjunction would be the PRD §36.3 *"no learned score may reintroduce a filtered
 * item"* violation by another route. `test/legal/financial-year.test.ts` proves `isEligible` is
 * unaffected.
 *
 * Returns `true` for case law, and for an instrument that is still operative (`IN_FORCE`). Anything
 * else — including an unknown `kind` — is `false`, meaning *the rule does not apply*, which is not a
 * licence to exclude.
 */
export function mustNotExcludeForAge(candidate: AgeExemptionCandidate): boolean {
  if (candidate === null || typeof candidate !== 'object') return false;
  if (candidate.kind === 'CASE_LAW') return true;
  return candidate.kind === 'INSTRUMENT' && candidate.legal_status === 'IN_FORCE';
}

export interface EnterpriseAgreement {
  /**
   * Accepted as an input and NEVER read in the decision — see `agreementCeased`. It is on the type so
   * that a caller holding the field does not have to strip it, and so the invariance is testable.
   */
  readonly nominal_expiry: LegalDate | null;
  readonly events: readonly LegalEvent[];
}

/**
 * PRD §6.6: *"An enterprise agreement MUST NOT be treated as ceased merely because its nominal expiry
 * date has passed."*
 *
 * Cessation requires an EVIDENCED EVENT (PRD §15.2): the agreement is ceased only when the status
 * derived from its evidenced events as at `asAt` is `REPEALED` (terminated) or `SUPERSEDED` (replaced).
 * `nominal_expiry` is never consulted; a test sweeps it across null/past/today/future and asserts every
 * answer is invariant.
 */
export function agreementCeased(agreement: EnterpriseAgreement, asAt: LegalDate): boolean {
  if (agreement === null || typeof agreement !== 'object') return false;
  const status = deriveStatus(agreement.events, asAt);
  return status === 'REPEALED' || status === 'SUPERSEDED';
}
