/**
 * FND-09 acceptance items "Both-gates admission", "Fail closed", "Rate-limit metadata" `[machine]`
 * (PRD §42.6, §38.5, §34.9).
 */
import { describe, expect, it } from 'vitest';

import {
  ADMISSION_DENIAL_REASONS,
  ADMISSION_REASON_TO_ERROR_CODE,
  LIMIT_BOUNDARY_BY_OPERATION,
  admit,
  rateLimitMetadataOf,
  type AdmissionInput,
} from '../../src/budget/admit.js';
import { BUDGET_PROFILE_V1 } from '../../src/budget/budget-profile.js';
import { limitCellFor, limitRowFor } from '../../src/budget/limit-defaults.js';
import type { FounderLedgerState } from '../../src/budget/ledgers.js';
import { microAud } from '../../src/budget/micro-aud.js';
import type { FxSnapshot, PriceSnapshot } from '../../src/budget/pricing.js';

const NOW = 1_754_600_000_000;
const MAX_AGE_MS = 86_400_000;
const CEILING = BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud;

/**
 * The PRD §34.9 Code column, transcribed here so this suite needs no runtime import from
 * `packages/contracts` (its entry file is the empty skeleton, and no workspace dependency may be
 * declared). `FND-03` owns the enum; this is the reviewer's independent copy.
 */
const PRD_34_9_ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_LEGAL_DATE',
  'INVALID_ABN',
  'AUTHENTICATION_REQUIRED',
  'MFA_REQUIRED',
  'RECENT_AUTH_REQUIRED',
  'RESOURCE_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'CONCURRENT_MODIFICATION',
  'EPHEMERAL_CONTENT_EXPIRED',
  'EMPLOYEE_PII_DETECTED',
  'RATE_LIMITED',
  'CREDIT_LIMIT_REACHED',
  'GENERATION_UNAVAILABLE',
  'SOURCE_NOT_CURRENT',
  'CORPUS_INCOMPATIBLE',
  'INTERNAL_ERROR',
];

const price: PriceSnapshot = {
  currency: 'USD',
  inputMicroUnitsPerMillionTokens: 3_000n,
  outputMicroUnitsPerMillionTokens: 15_000n,
  observedAtEpochMs: NOW,
};

const fx: FxSnapshot = {
  fromCurrency: 'USD',
  toCurrency: 'AUD',
  microAudPerUnit: 1_500_000n,
  safetyMarginBasisPoints: 250n,
  observedAtEpochMs: NOW,
};

const zeroClasses = {
  INCIDENT_OR_SAFETY_CHECK: microAud(0n),
  TRIAL_COMMITMENT: microAud(0n),
  INTERNAL_TESTING: microAud(0n),
  DISCRETIONARY_DEEP: microAud(0n),
};

const founderState = (debit: bigint): FounderLedgerState => ({
  periodKey: '2026-08',
  ceilingMicroAud: CEILING,
  monthToDateDebitMicroAud: microAud(debit),
  outstandingReservationsMicroAud: microAud(0n),
  allowances: zeroClasses,
  consumed: zeroClasses,
});

function baseInput(overrides: Partial<AdmissionInput> = {}): AdmissionInput {
  return {
    operation: 'DEEP',
    tier: 'PAID_PILOT',
    nowEpochMs: NOW,
    generationAvailable: true,
    quota: {
      counters: [
        { ledger: 'ADVANCED_TASK_CREDITS', limit: 25, used: 3, resetAtEpochMs: NOW + 60_000 },
      ],
    },
    concurrency: [{ boundary: 'CONCURRENT_DEEP', limit: 1, inFlight: 0 }],
    funding: {
      kind: 'FOUNDER_PLATFORM_BUDGET',
      reserveClass: 'INTERNAL_TESTING',
      state: founderState(0n),
    },
    pricing: {
      price,
      fx,
      maxAgeMs: MAX_AGE_MS,
      maxInputTokens: 1_000_000n,
      maxOutputTokens: 200_000n,
      reservationId: 'res-admit',
    },
    ...overrides,
  };
}

describe('both gates are required (PRD §42.6)', () => {
  it('admits when quota, concurrency and funding balance all pass', () => {
    const decision = admit(baseInput());
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.reservation).not.toBeNull();
      expect(typeof decision.reservation?.amountMicroAud).toBe('bigint');
      expect(decision.reservation?.reservationId).toBe('res-admit');
    }
  });

  it('denies CREDIT_LIMIT_REACHED with quota but no funding balance', () => {
    const decision = admit(
      baseInput({
        funding: {
          kind: 'FOUNDER_PLATFORM_BUDGET',
          reserveClass: 'INTERNAL_TESTING',
          state: founderState(CEILING),
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('CREDIT_LIMIT_REACHED');
  });

  it('denies RATE_LIMITED with funding balance but no quota', () => {
    const decision = admit(
      baseInput({
        quota: {
          counters: [
            { ledger: 'ADVANCED_TASK_CREDITS', limit: 25, used: 25, resetAtEpochMs: NOW + 60_000 },
          ],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('RATE_LIMITED');
  });

  it('denies CONCURRENCY_LIMIT with funding balance but no concurrency slot', () => {
    const decision = admit(
      baseInput({ concurrency: [{ boundary: 'CONCURRENT_DEEP', limit: 1, inFlight: 1 }] }),
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('CONCURRENCY_LIMIT');
  });

  it('denies GENERATION_UNAVAILABLE when the provider is unavailable', () => {
    const decision = admit(baseInput({ generationAvailable: false }));
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('GENERATION_UNAVAILABLE');
  });

  it('denies prepaid work whose prepaid balance is below the reservation', () => {
    const reserved = admit(baseInput());
    expect(reserved.allowed).toBe(true);
    const amount = reserved.allowed ? (reserved.reservation?.amountMicroAud ?? 0n) : 0n;
    expect(amount).toBeGreaterThan(0n);

    const short = admit(
      baseInput({
        funding: {
          kind: 'CUSTOMER_PREPAID_OR_BYOK',
          mode: 'PREPAID',
          prepaidBalanceMicroAud: microAud(amount - 1n),
        },
      }),
    );
    expect(short.allowed).toBe(false);
    if (!short.allowed) expect(short.reason).toBe('CREDIT_LIMIT_REACHED');

    const exact = admit(
      baseInput({
        funding: {
          kind: 'CUSTOMER_PREPAID_OR_BYOK',
          mode: 'PREPAID',
          prepaidBalanceMicroAud: microAud(amount),
        },
      }),
    );
    expect(exact.allowed).toBe(true);
  });
});

describe('fail closed on price and FX data (PRD §42.6 final sentence)', () => {
  it('denies founder-funded work when the price snapshot is absent', () => {
    for (const pricing of [
      null,
      {
        price: null,
        fx,
        maxAgeMs: MAX_AGE_MS,
        maxInputTokens: 1n,
        maxOutputTokens: 1n,
        reservationId: 'r',
      },
      {
        price,
        fx: null,
        maxAgeMs: MAX_AGE_MS,
        maxInputTokens: 1n,
        maxOutputTokens: 1n,
        reservationId: 'r',
      },
    ]) {
      const decision = admit(baseInput({ pricing }));
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toBe('PRICE_DATA_UNAVAILABLE');
    }
  });

  it('denies founder-funded work when the price snapshot is stale beyond the max age', () => {
    const stale = admit(
      baseInput({
        pricing: {
          price: { ...price, observedAtEpochMs: NOW - MAX_AGE_MS - 1 },
          fx,
          maxAgeMs: MAX_AGE_MS,
          maxInputTokens: 1_000n,
          maxOutputTokens: 1_000n,
          reservationId: 'r',
        },
      }),
    );
    expect(stale.allowed).toBe(false);
    if (!stale.allowed) expect(stale.reason).toBe('PRICE_DATA_UNAVAILABLE');
  });

  it('treats a future-dated snapshot as stale, not as fresh (source clock skew)', () => {
    const future = admit(
      baseInput({
        pricing: {
          price: { ...price, observedAtEpochMs: NOW + 1 },
          fx,
          maxAgeMs: MAX_AGE_MS,
          maxInputTokens: 1_000n,
          maxOutputTokens: 1_000n,
          reservationId: 'r',
        },
      }),
    );
    expect(future.allowed).toBe(false);
    if (!future.allowed) expect(future.reason).toBe('PRICE_DATA_UNAVAILABLE');
  });

  it.each([
    ['negative input rate', { ...price, inputMicroUnitsPerMillionTokens: -1n }, fx],
    ['NaN timestamp', { ...price, observedAtEpochMs: Number.NaN }, fx],
    ['currency mismatch', price, { ...fx, fromCurrency: 'EUR' }],
    ['zero FX rate', price, { ...fx, microAudPerUnit: 0n }],
    ['negative safety margin', price, { ...fx, safetyMarginBasisPoints: -1n }],
  ])('denies founder-funded work on malformed data: %s', (_label, badPrice, badFx) => {
    const decision = admit(
      baseInput({
        pricing: {
          price: badPrice,
          fx: badFx,
          maxAgeMs: MAX_AGE_MS,
          maxInputTokens: 1_000n,
          maxOutputTokens: 1_000n,
          reservationId: 'r',
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('PRICE_DATA_UNAVAILABLE');
  });

  it('does NOT deny BYOK work merely because founder price data is absent (PRD §16.4)', () => {
    const decision = admit(
      baseInput({ funding: { kind: 'CUSTOMER_PREPAID_OR_BYOK', mode: 'BYOK' }, pricing: null }),
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.reservation).toBeNull();
      expect(decision.byokEstimate).toBeNull();
    }
  });

  it('denies BYOK work on malformed data, because no estimate could be recorded', () => {
    const decision = admit(
      baseInput({
        funding: { kind: 'CUSTOMER_PREPAID_OR_BYOK', mode: 'BYOK' },
        pricing: {
          price: { ...price, inputMicroUnitsPerMillionTokens: -5n },
          fx,
          maxAgeMs: MAX_AGE_MS,
          maxInputTokens: 1_000n,
          maxOutputTokens: 1_000n,
          reservationId: 'r',
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe('PRICE_DATA_UNAVAILABLE');
  });

  it('records a zero-founder-debit estimate for admitted BYOK work', () => {
    const decision = admit(
      baseInput({ funding: { kind: 'CUSTOMER_PREPAID_OR_BYOK', mode: 'BYOK' } }),
    );
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.byokEstimate?.founderDebitMicroAud).toBe(0n);
      expect(typeof decision.byokEstimate?.founderDebitMicroAud).toBe('bigint');
      expect(decision.byokEstimate?.estimatedCostMicroAud).toBeGreaterThan(0n);
    }
  });
});

describe('rate-limit metadata discloses nothing about other tenants (PRD §38.5)', () => {
  const matched = {
    ledger: 'ADVANCED_TASK_CREDITS',
    limit: 25,
    used: 3,
    resetAtEpochMs: NOW + 60_000,
  } as const;

  it('derives limit, remaining and reset from the requesting tenant s own counter', () => {
    const metadata = rateLimitMetadataOf(baseInput());
    expect(metadata).toEqual({ limit: 25, remaining: 22, resetAtEpochMs: NOW + 60_000 });
  });

  it('is unchanged when every input other than that counter is perturbed', () => {
    const reference = rateLimitMetadataOf(baseInput());
    const variants: AdmissionInput[] = [
      baseInput({ tier: 'TRIAL' }),
      baseInput({ generationAvailable: false }),
      baseInput({ nowEpochMs: NOW + 999_999 }),
      baseInput({ concurrency: [{ boundary: 'CONCURRENT_DEEP', limit: 99, inFlight: 98 }] }),
      baseInput({
        funding: {
          kind: 'FOUNDER_PLATFORM_BUDGET',
          reserveClass: 'DISCRETIONARY_DEEP',
          state: founderState(CEILING),
        },
      }),
      baseInput({ funding: { kind: 'CUSTOMER_PREPAID_OR_BYOK', mode: 'BYOK' } }),
      baseInput({ pricing: null }),
      baseInput({
        quota: {
          counters: [
            matched,
            { ledger: 'SEARCH', limit: 999, used: 998, resetAtEpochMs: NOW + 1 },
            { ledger: 'API_CALLS', limit: 7, used: 7, resetAtEpochMs: NOW + 2 },
            { ledger: 'PROVIDER_COST', limit: 3, used: 0, resetAtEpochMs: NOW + 3 },
          ],
        },
      }),
    ];
    for (const variant of variants) {
      expect(rateLimitMetadataOf(variant)).toEqual(reference);
      const decision = admit(variant);
      expect(decision.metadata).toEqual(reference);
    }
  });

  it('never surfaces a "System hard protection" value', () => {
    for (const operation of [
      'SEARCH',
      'QUICK',
      'DEEP',
      'EXPORT',
      'API_CALL',
      'WIDGET_SESSION',
    ] as const) {
      for (const tier of ['TRIAL', 'PAID_PILOT'] as const) {
        const boundary = LIMIT_BOUNDARY_BY_OPERATION[operation];
        const metadata = rateLimitMetadataOf(
          baseInput({ operation, tier, quota: { counters: [] } }),
        );
        expect(metadata.limit).toBe(limitCellFor(boundary, tier)?.count ?? 0);
        expect(metadata.remaining).toBeGreaterThanOrEqual(0);
      }
    }
    // The one boundary where the global column carries a distinct number: it must never be echoed.
    expect(limitRowFor('SEARCH_BURST')?.systemHardProtection.count).toBe(100);
    for (const tier of ['TRIAL', 'PAID_PILOT'] as const) {
      expect(
        rateLimitMetadataOf(baseInput({ operation: 'SEARCH', tier, quota: { counters: [] } }))
          .limit,
      ).not.toBe(100);
    }
  });

  it('falls back to the tenant s own plan-tier default when no counter is supplied', () => {
    expect(
      rateLimitMetadataOf(baseInput({ operation: 'SEARCH', tier: 'TRIAL', quota: { counters: [] } })),
    ).toEqual({ limit: 20, remaining: 20, resetAtEpochMs: NOW });
    expect(
      rateLimitMetadataOf(
        baseInput({ operation: 'SEARCH', tier: 'PAID_PILOT', quota: { counters: [] } }),
      ),
    ).toEqual({ limit: 60, remaining: 60, resetAtEpochMs: NOW });
  });

  it('never reports a negative remaining', () => {
    const metadata = rateLimitMetadataOf(
      baseInput({
        quota: {
          counters: [
            { ledger: 'ADVANCED_TASK_CREDITS', limit: 5, used: 500, resetAtEpochMs: NOW },
          ],
        },
      }),
    );
    expect(metadata.remaining).toBe(0);
  });
});

describe('denial reasons map onto PRD §34.9', () => {
  it('is total over the five reasons', () => {
    expect(Object.keys(ADMISSION_REASON_TO_ERROR_CODE).sort()).toEqual(
      [...ADMISSION_DENIAL_REASONS].sort(),
    );
    expect(ADMISSION_DENIAL_REASONS).toHaveLength(5);
  });

  it('maps every reason onto a real §34.9 code', () => {
    for (const [reason, code] of Object.entries(ADMISSION_REASON_TO_ERROR_CODE)) {
      expect(PRD_34_9_ERROR_CODES, `${reason} maps to ${code}, which is not a §34.9 code`).toContain(
        code,
      );
    }
  });

  it('keeps the two finer-grained causes distinct from the codes they map to', () => {
    expect(ADMISSION_REASON_TO_ERROR_CODE.PRICE_DATA_UNAVAILABLE).toBe('GENERATION_UNAVAILABLE');
    expect(ADMISSION_REASON_TO_ERROR_CODE.CONCURRENCY_LIMIT).toBe('RATE_LIMITED');
    expect(PRD_34_9_ERROR_CODES).not.toContain('PRICE_DATA_UNAVAILABLE');
    expect(PRD_34_9_ERROR_CODES).not.toContain('CONCURRENCY_LIMIT');
    expect(new Set(Object.values(ADMISSION_REASON_TO_ERROR_CODE)).size).toBe(3);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ADMISSION_REASON_TO_ERROR_CODE)).toBe(true);
    expect(Object.isFrozen(ADMISSION_DENIAL_REASONS)).toBe(true);
  });
});
