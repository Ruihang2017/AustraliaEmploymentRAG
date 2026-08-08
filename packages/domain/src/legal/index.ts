/**
 * FND-10 — the public surface of `packages/domain/src/legal` (PRD §36.2, §36.3, §9.1, §15.2, §6.6, §6.7).
 *
 * WHAT THIS LEAF OWNS: the PRD §36.2 five-conjunct hard applicability filter; the §9.1 authority
 * hierarchy and its comparator; the §36.3 ranking feature ORDER and the "no filtered item reintroduced"
 * invariant; the §15.2 four-time temporal model with status derived from evidenced events; the §6.6
 * financial-year helpers and the two non-exclusion rules. It owns no retrieval constant of any kind —
 * candidate counts, fusion weights, rerank depth and evidence-node counts are breakdown plan §8 Q4,
 * benchmark-selected and owned by `11-retrieval-engine` through `RETR-10`/`GOLD-15`.
 *
 * DEEP-IMPORTED. `packages/domain/src/index.ts` is deliberately NOT wired to this leaf: it is outside
 * this ticket's file-scope and the sibling wave-3 tickets would each want the same edit (FND-03/FND-08
 * open question Q1, sub-PRD D16). Consumers — `EVID-05` first — import
 * `packages/domain/src/legal/index.js` directly until a follow-up ticket owns the package barrel.
 *
 * SIBLING-LEAF BAN (sub-PRD D10). Nothing here imports `src/{access,answers,workflow,budget}/**`, and
 * nothing there imports this. FND-07's authority comparator port is satisfied STRUCTURALLY, by
 * `AUTHORITY_COMPARATOR` matching `(a: AuthorityLevel, b: AuthorityLevel) => -1 | 0 | 1` — never by an
 * import. That is what buys the seven independent wave-3 lanes.
 *
 * TOTALITY RULE. Every exported FILTER or PREDICATE here is total and never throws: malformed or
 * unknown input produces the fail-closed answer (`false`, or a named failure/violation entry). The one
 * exception is the CONVERSION helper `financialYearOf`, which throws `TypeError` on a malformed legal
 * date because it has no fail-closed value to return.
 *
 * COMPARATOR DIRECTION (sub-PRD D11, plan OQ-5). `compareAuthority(a, b)` returns `1` when `a` is the
 * HIGHER authority, `-1` when `a` is the LOWER authority, `0` when equal — the convention FND-07's
 * merged `src/answers/ports.ts` states in prose. Reversing it silently inverts every authority
 * comparison in the product.
 *
 * PURITY. No clock, no randomness, no environment, no I/O, no `Date`: `asAt` and `legal_as_at` are
 * always inputs, and every date is a `YYYY-MM-DD` string (PRD §34.1, §35.1, §39.1, §45.2). Every
 * exported constant is deep-frozen at every level — these are process-lifetime singletons read
 * concurrently by every in-flight request.
 *
 * FIELD NAMING. Record-shaped inputs use the PRD's `snake_case` names (`legal_as_at`, `effective_from`,
 * `legal_status`, `corpus_release_id`, …) because they are projections of PRD §34.2 payloads and §35.2
 * columns. Function and local names stay `camelCase`. `src/workflow` uses `camelCase` records because it
 * projects an app table, not a wire payload — the difference is deliberate, not drift.
 */
export { deepFreeze } from './deep-freeze.js';

export { compareLegalDate, isIsoTimestamp, isLegalDate, parseLegalDate } from './dates.js';
export type { LegalDate } from './dates.js';

export { assertNonOverlapping, effectiveIntervalContains } from './interval.js';
export type { EffectiveInterval, Overlap, OverlapReason } from './interval.js';

export {
  AUTHORITY_COMPARATOR,
  AUTHORITY_RANK,
  GUIDANCE_OR_NON_OPERATIVE_LEVELS,
  OPERATIVE_OR_BINDING_LEVELS,
  UNKNOWN_AUTHORITY_RANK,
  authorityRank,
  compareAuthority,
  guidanceCannotOutrank,
} from './authority.js';
export type { AuthorityComparator } from './authority.js';

export { RANKING_FEATURE_ORDER, assertNoFilteredItemReintroduced } from './ranking.js';
export type { RankingFeature, Violation } from './ranking.js';

export { LEGAL_EVENT_TYPES, deriveStatus, statusDisagreesWithCache } from './temporal.js';
export type { LegalEvent, LegalEventType, StatusDivergence, TemporalStamps } from './temporal.js';

export {
  PERMITTED_STATUSES_BY_MODE,
  REQUEST_MODE_VALUES,
  canSupportDefinitiveCurrentLaw,
  isRequestMode,
  isStatusPermittedByMode,
} from './modes.js';
export type { RequestMode } from './modes.js';

export {
  SUPPORTED_FINANCIAL_YEARS,
  agreementCeased,
  financialYearOf,
  isSupportedFinancialYear,
  mustNotExcludeForAge,
} from './financial-year.js';
export type { AgeExemptionCandidate, EnterpriseAgreement, FinancialYear } from './financial-year.js';

export { ELIGIBILITY_FAILURES, LICENCE_STATES_PERMITTING_USE, isEligible } from './eligibility.js';
export type {
  Eligibility,
  EligibilityCandidate,
  EligibilityFailure,
  EligibilityRequest,
  EligibilityUse,
} from './eligibility.js';
