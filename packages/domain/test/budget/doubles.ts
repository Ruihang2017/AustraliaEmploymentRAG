/**
 * FND-09 — plain builders for admission inputs. Not a `*.test.*` file; Vitest does not collect it.
 *
 * These are data builders, not mocks: this leaf has no ports to mock. Prices, FX rates, balances and
 * `now` are ordinary inputs, so a test is just a different set of values.
 */
import {
  fromWholeAud,
  microAud,
  reservationId,
  ZERO_MICRO_AUD,
  type AdmissionInput,
  type ConcurrencyBoundary,
  type FounderLedgerState,
  type FounderReserveClass,
  type FxSnapshot,
  type MicroAud,
  type OperationClass,
  type PriceSnapshot,
  type QuotaCounter,
  type QuotaLedgerKind,
  type QuotaState,
  type ReservationRequest,
} from '../../src/budget/index.js';

export const NOW = 1_000_000n;
export const MAX_PRICE_AGE_MILLIS = 86_400_000n;

/** An AUD-quoted price with an identity FX rate and no safety margin. Synthetic, not a real price. */
export const AUD_PRICE: PriceSnapshot = {
  currency: 'AUD',
  microPerMillionInputTokens: 3_000_000n,
  microPerMillionOutputTokens: 15_000_000n,
  recordedAt: NOW - 1_000n,
};

export const IDENTITY_FX: FxSnapshot = {
  fromCurrency: 'AUD',
  toCurrency: 'AUD',
  microAudPerUnit: 1_000_000n,
  safetyMarginBasisPoints: 0n,
  recordedAt: NOW - 1_000n,
};

export function counter(limit: bigint, used: bigint, resetAt = 60_000n): QuotaCounter {
  return { limit, used, resetAt };
}

export interface QuotaOverrides {
  readonly counters?: Partial<Record<QuotaLedgerKind, QuotaCounter>>;
  readonly concurrency?: Partial<Record<ConcurrencyBoundary, QuotaCounter>>;
}

export function quotaState(overrides: QuotaOverrides = {}): QuotaState {
  const open = counter(100n, 0n);
  return {
    counters: {
      SEARCH: open,
      ANSWER_CREDITS: open,
      ADVANCED_TASK_CREDITS: open,
      API_CALLS: open,
      PROVIDER_COST: open,
      ...(overrides.counters ?? {}),
    },
    concurrency: {
      QUICK: open,
      DEEP: open,
      EXPORT: open,
      ...(overrides.concurrency ?? {}),
    },
  };
}

export function allowances(
  overrides: Partial<Record<FounderReserveClass, MicroAud>> = {},
): Record<FounderReserveClass, MicroAud> {
  return {
    PRODUCTION_INCIDENT_OR_SAFETY_CHECK: ZERO_MICRO_AUD,
    ACTIVE_TRIAL_COMMITMENT: ZERO_MICRO_AUD,
    INTERNAL_TESTING: ZERO_MICRO_AUD,
    DISCRETIONARY_DEEP: ZERO_MICRO_AUD,
    ...overrides,
  };
}

export function founderState(overrides: Partial<FounderLedgerState> = {}): FounderLedgerState {
  return {
    ceilingMicroAud: fromWholeAud(50n),
    settledMicroAud: ZERO_MICRO_AUD,
    heldMicroAud: ZERO_MICRO_AUD,
    unspentAllowanceMicroAud: allowances(),
    ...overrides,
  };
}

export function request(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    reservationId: reservationId('rsv-test-1'),
    operation: 'QUICK' as OperationClass,
    reserveClass: 'ACTIVE_TRIAL_COMMITMENT',
    profileCeiling: { maxInputTokens: 100_000n, maxOutputTokens: 20_000n },
    requestedMaxInputTokens: 100_000n,
    requestedMaxOutputTokens: 20_000n,
    ...overrides,
  };
}

/** Founder-funded, quota available, price fresh, generation up: the admitted baseline. */
export function admissionInput(overrides: Partial<AdmissionInput> = {}): AdmissionInput {
  return {
    request: request(),
    tier: 'PAID_PILOT',
    ledger: 'FOUNDER_PLATFORM_BUDGET',
    founder: founderState(),
    customer: null,
    quota: quotaState(),
    price: AUD_PRICE,
    fx: IDENTITY_FX,
    now: NOW,
    maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
    generationAvailable: true,
    ...overrides,
  };
}

export const A_DOLLAR: MicroAud = microAud(1_000_000n);
