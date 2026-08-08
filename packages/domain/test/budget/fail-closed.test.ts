/**
 * FND-09 acceptance item 8 — fail closed: absent, stale or malformed price/FX data denies
 * founder-funded admission with `PRICE_DATA_UNAVAILABLE` (PRD §42.6's final sentence).
 *
 * Closed in every direction (plan risk R6): the FX snapshot is validated as strictly as the price, a
 * FUTURE `recordedAt` is malformed rather than "very fresh", and the two snapshots must agree on the
 * currency being converted. Customer PREPAID work fails closed identically; BYOK does not, because it
 * creates no founder liability.
 */
import { describe, expect, it } from 'vitest';

import {
  admit,
  fromWholeAud,
  recordByokEstimate,
  reserve,
  reservationId,
  validatePriceData,
  ZERO_MICRO_AUD,
  type FxSnapshot,
  type PriceDataProblem,
  type PriceSnapshot,
} from '../../src/budget/index.js';
import { AUD_PRICE, IDENTITY_FX, MAX_PRICE_AGE_MILLIS, NOW, admissionInput, request } from './doubles.js';

const price = (overrides: Partial<PriceSnapshot>): PriceSnapshot => ({ ...AUD_PRICE, ...overrides });
const fx = (overrides: Partial<FxSnapshot>): FxSnapshot => ({ ...IDENTITY_FX, ...overrides });

interface BadCase {
  readonly name: string;
  readonly price: PriceSnapshot | null;
  readonly fx: FxSnapshot | null;
  readonly problem: PriceDataProblem;
}

const BAD_CASES: readonly BadCase[] = [
  { name: 'price absent', price: null, fx: IDENTITY_FX, problem: 'PRICE_ABSENT' },
  { name: 'fx absent', price: AUD_PRICE, fx: null, problem: 'FX_ABSENT' },
  {
    name: 'price stale by one millisecond',
    price: price({ recordedAt: NOW - MAX_PRICE_AGE_MILLIS - 1n }),
    fx: IDENTITY_FX,
    problem: 'PRICE_STALE',
  },
  {
    name: 'price malformed: negative input rate',
    price: price({ microPerMillionInputTokens: -1n }),
    fx: IDENTITY_FX,
    problem: 'PRICE_MALFORMED',
  },
  {
    name: 'price malformed: recorded in the future',
    price: price({ recordedAt: NOW + 1n }),
    fx: IDENTITY_FX,
    problem: 'PRICE_MALFORMED',
  },
  {
    name: 'price malformed: empty currency',
    price: price({ currency: '' }),
    fx: fx({ fromCurrency: '' }),
    problem: 'PRICE_MALFORMED',
  },
  {
    name: 'fx malformed: zero rate',
    price: AUD_PRICE,
    fx: fx({ microAudPerUnit: 0n }),
    problem: 'FX_MALFORMED',
  },
  {
    name: 'fx malformed: negative safety margin',
    price: AUD_PRICE,
    fx: fx({ safetyMarginBasisPoints: -1n }),
    problem: 'FX_MALFORMED',
  },
  {
    name: 'fx malformed: recorded in the future',
    price: AUD_PRICE,
    fx: fx({ recordedAt: NOW + 1n }),
    problem: 'FX_MALFORMED',
  },
  {
    name: 'fx stale by one millisecond',
    price: AUD_PRICE,
    fx: fx({ recordedAt: NOW - MAX_PRICE_AGE_MILLIS - 1n }),
    problem: 'FX_STALE',
  },
  {
    name: 'currency mismatch between price and fx',
    price: price({ currency: 'USD' }),
    fx: fx({ fromCurrency: 'EUR' }),
    problem: 'FX_CURRENCY_MISMATCH',
  },
  {
    name: 'fx does not target AUD',
    price: price({ currency: 'USD' }),
    fx: fx({ fromCurrency: 'USD', toCurrency: 'NZD' as 'AUD' }),
    problem: 'FX_CURRENCY_MISMATCH',
  },
];

describe('validatePriceData names the problem', () => {
  for (const testCase of BAD_CASES) {
    it(testCase.name, () => {
      expect(validatePriceData(testCase.price, testCase.fx, NOW, MAX_PRICE_AGE_MILLIS)).toBe(
        testCase.problem,
      );
    });
  }

  it('accepts fresh, well-formed, mutually consistent data (non-vacuity)', () => {
    expect(validatePriceData(AUD_PRICE, IDENTITY_FX, NOW, MAX_PRICE_AGE_MILLIS)).toBeNull();
  });

  it('treats the exact age boundary as fresh, and one millisecond more as stale', () => {
    const atBoundary = price({ recordedAt: NOW - MAX_PRICE_AGE_MILLIS });
    expect(validatePriceData(atBoundary, IDENTITY_FX, NOW, MAX_PRICE_AGE_MILLIS)).toBeNull();
    const overBoundary = price({ recordedAt: NOW - MAX_PRICE_AGE_MILLIS - 1n });
    expect(validatePriceData(overBoundary, IDENTITY_FX, NOW, MAX_PRICE_AGE_MILLIS)).toBe('PRICE_STALE');
  });
});

describe('founder-funded admission fails closed on every one of those cases', () => {
  for (const testCase of BAD_CASES) {
    it(`${testCase.name} => PRICE_DATA_UNAVAILABLE`, () => {
      const decision = admit(admissionInput({ price: testCase.price, fx: testCase.fx }));
      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;
      expect(decision.reason).toBe('PRICE_DATA_UNAVAILABLE');
    });
  }

  it('the same request with valid data is admitted (non-vacuity)', () => {
    expect(admit(admissionInput()).allowed).toBe(true);
  });
});

describe('customer PREPAID work fails closed identically; BYOK does not', () => {
  for (const testCase of BAD_CASES) {
    it(`PREPAID: ${testCase.name} => PRICE_DATA_UNAVAILABLE`, () => {
      const decision = admit(
        admissionInput({
          ledger: 'CUSTOMER_PREPAID_OR_BYOK',
          customer: { mode: 'PREPAID', prepaidRemainingMicroAud: fromWholeAud(100n) },
          price: testCase.price,
          fx: testCase.fx,
        }),
      );
      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;
      expect(decision.reason).toBe('PRICE_DATA_UNAVAILABLE');
    });
  }

  it('BYOK proceeds without price data, with a null estimate and no founder debit', () => {
    const decision = admit(
      admissionInput({
        ledger: 'CUSTOMER_PREPAID_OR_BYOK',
        customer: { mode: 'BYOK', prepaidRemainingMicroAud: ZERO_MICRO_AUD },
        price: null,
        fx: null,
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.reservation).toBeNull();

    const estimate = recordByokEstimate({
      inputTokens: 1_000n,
      outputTokens: 100n,
      price: null,
      fx: null,
      now: NOW,
      maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
    });
    expect(estimate.estimateMicroAud).toBeNull();
    expect(estimate.priceAvailable).toBe(false);
    expect(estimate.founderDebitMicroAud).toBe(0n);
  });
});

describe('reserve enforces the precondition rather than trusting it', () => {
  for (const testCase of BAD_CASES.slice(0, 4)) {
    it(`throws on ${testCase.name}`, () => {
      expect(() =>
        reserve({
          request: request({ reservationId: reservationId('rsv-precondition') }),
          ledger: 'FOUNDER_PLATFORM_BUDGET',
          price: testCase.price as PriceSnapshot,
          fx: testCase.fx as FxSnapshot,
          now: NOW,
          maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
        }),
      ).toThrow(RangeError);
    });
  }
});
