/**
 * FND-09 — the public surface of the budget leaf (PRD §24.1, §24.4, §38.5, §42.6; requirement OPS-003).
 *
 * Explicit named exports, never `export *`: the whole surface is reviewable in one file, and
 * `test/budget/public-surface.test.ts` compares the exported name list against a literal expectation,
 * so an accidental export — in particular anything that could cross-debit two ledgers — fails the
 * suite rather than escaping into `RUNT-02` and `EVID-08`.
 *
 * This leaf is DEEP-IMPORTED: `packages/domain/src/index.ts` is still the empty FND-01 skeleton entry
 * that `tools/workspace-assertions.mjs` asserts byte for byte, so consumers import
 * `packages/domain/src/budget/index.js` exactly as they do `answers`, `workflow` and `legal`. Wiring
 * the package barrel is unallocated work, not this ticket's.
 */
export { admit, ADMISSION_REASON_TO_ERROR_CODE, errorCodeForReason } from './admit.js';
export type { ErrorCode, FundingLedger } from './contracts.js';
export { ERROR_CODE_VALUES, FUNDING_LEDGER_VALUES, isErrorCode, isFundingLedger } from './contracts.js';
export { deepFreeze } from './deep-freeze.js';
export {
  isFounderLiability,
  isSearchAffected,
  QUOTA_LEDGER_KINDS,
  recordByokEstimate,
  remainingOf,
} from './ledgers.js';
export type { ByokEstimate, ByokEstimateInput } from './ledgers.js';
export {
  BOUNDARY_FOR_OPERATION,
  CONCURRENCY_BOUNDARY_FOR_OPERATION,
  LIMIT_DEFAULTS_V1,
  limitRow,
  OPERATIONS_REQUIRING_MODEL_FUNDING,
  ORGANISATION_CONCURRENCY_DEFAULTS,
  ORGANISATION_CONCURRENCY_PRD_TEXT,
  QUOTA_KIND_FOR_OPERATION,
} from './limits.js';
export type { LimitBoundary, LimitDefaults, LimitRow, LimitScope, LimitValue } from './limits.js';
export {
  addMicroAud,
  assertMicroAud,
  ceilDiv,
  fromCents,
  fromWholeAud,
  maxMicroAud,
  MICRO_AUD_PER_AUD,
  MICRO_AUD_PER_CENT,
  microAud,
  minMicroAud,
  subMicroAud,
  toDisplay,
  ZERO_MICRO_AUD,
} from './micro-aud.js';
export type { MicroAud } from './micro-aud.js';
export { costMicroAud, validatePriceData } from './pricing.js';
export type { PriceDataProblem } from './pricing.js';
export { BUDGET_PROFILE_V1, budgetLineItem } from './profile.js';
export type { BudgetLineItem, BudgetProfile } from './profile.js';
export { reserve } from './reserve.js';
export {
  availableForClass,
  FOUNDER_RESERVE_ORDER,
  FOUNDER_RESERVE_ORDER_PRD_TEXT,
  hasReserveFor,
} from './reserve-order.js';
export { settle } from './settle.js';
export {
  crossesWarningThreshold,
  nextHighWaterMark,
  reachedCeiling,
  warningThresholdMicroAud,
} from './thresholds.js';
export { reservationId } from './types.js';
export type {
  ActualUsage,
  Admission,
  AdmissionDenialReason,
  AdmissionInput,
  ConcurrencyBoundary,
  CustomerFundingMode,
  CustomerLedgerState,
  EpochMillis,
  FounderLedgerState,
  FounderReserveClass,
  FundingLedgerKind,
  FxSnapshot,
  GenerationLedgerState,
  OperationClass,
  PriceSnapshot,
  ProfileCeiling,
  QuotaCounter,
  QuotaLedgerKind,
  QuotaState,
  RateLimitMetadata,
  Reservation,
  ReservationId,
  ReservationRequest,
  ReserveInput,
  Settlement,
  Tier,
} from './types.js';
