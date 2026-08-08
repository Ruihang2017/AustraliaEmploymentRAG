/**
 * FND-09 acceptance items 7 and 14 — both-gates admission (PRD §42.6), the fixed reason order, and the
 * rate-limit metadata that must disclose nothing about any other tenant or about the founder ledger
 * (PRD §38.5).
 */
import { describe, expect, it } from 'vitest';

import {
  admit,
  ADMISSION_REASON_TO_ERROR_CODE,
  costMicroAud,
  errorCodeForReason,
  fromWholeAud,
  isErrorCode,
  microAud,
  reservationId,
  ZERO_MICRO_AUD,
  type AdmissionDenialReason,
} from '../../src/budget/index.js';
import {
  AUD_PRICE,
  admissionInput,
  allowances,
  counter,
  founderState,
  IDENTITY_FX,
  quotaState,
  request,
} from './doubles.js';
import { stringifyWithBigInt } from './fixture.js';

const COST_OF_BASELINE = costMicroAud(100_000n, 20_000n, AUD_PRICE, IDENTITY_FX);

describe('admission requires BOTH operation quota and funding-ledger balance', () => {
  it('admits when both are present, reserving exactly the cost of the effective ceilings', () => {
    const decision = admit(admissionInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.reservation?.amountMicroAud).toBe(COST_OF_BASELINE);
    expect(decision.reservation?.founderDebitApplies).toBe(true);
  });

  it('quota available, balance absent => CREDIT_LIMIT_REACHED', () => {
    const decision = admit(
      admissionInput({
        founder: founderState({ ceilingMicroAud: microAud(1n) }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('CREDIT_LIMIT_REACHED');
  });

  it('balance available, per-operation quota exhausted => RATE_LIMITED', () => {
    const decision = admit(
      admissionInput({
        quota: quotaState({ counters: { ANSWER_CREDITS: counter(10n, 10n) } }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('RATE_LIMITED');
  });

  it('balance available, concurrency slot taken => CONCURRENCY_LIMIT', () => {
    const decision = admit(
      admissionInput({
        quota: quotaState({ concurrency: { QUICK: counter(2n, 2n) } }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('CONCURRENCY_LIMIT');
  });

  it('generation unavailable => GENERATION_UNAVAILABLE', () => {
    const decision = admit(admissionInput({ generationAvailable: false }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('GENERATION_UNAVAILABLE');
  });

  it('price data absent => PRICE_DATA_UNAVAILABLE', () => {
    const decision = admit(admissionInput({ price: null }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('PRICE_DATA_UNAVAILABLE');
  });

  it('a customer PREPAID balance too small to cover the reservation => CREDIT_LIMIT_REACHED', () => {
    const decision = admit(
      admissionInput({
        ledger: 'CUSTOMER_PREPAID_OR_BYOK',
        customer: { mode: 'PREPAID', prepaidRemainingMicroAud: microAud(1n) },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('CREDIT_LIMIT_REACHED');
  });

  it('a customer-funded request with NO customer ledger denies rather than defaults', () => {
    const decision = admit(admissionInput({ ledger: 'CUSTOMER_PREPAID_OR_BYOK', customer: null }));
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toBe('CREDIT_LIMIT_REACHED');
  });

  it('a customer PREPAID request with enough balance is admitted and creates no founder debit', () => {
    const decision = admit(
      admissionInput({
        ledger: 'CUSTOMER_PREPAID_OR_BYOK',
        customer: { mode: 'PREPAID', prepaidRemainingMicroAud: fromWholeAud(100n) },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.reservation?.founderDebitApplies).toBe(false);
  });
});

describe('the reason order is fixed and pairwise stable', () => {
  const brokenQuota = quotaState({ counters: { ANSWER_CREDITS: counter(1n, 1n) } });
  const brokenConcurrency = quotaState({ concurrency: { QUICK: counter(1n, 1n) } });
  const brokenBoth = quotaState({
    counters: { ANSWER_CREDITS: counter(1n, 1n) },
    concurrency: { QUICK: counter(1n, 1n) },
  });
  const noBalance = founderState({ ceilingMicroAud: ZERO_MICRO_AUD });

  const cases: readonly { readonly name: string; readonly input: Parameters<typeof admit>[0]; readonly reason: AdmissionDenialReason }[] = [
    {
      name: 'generation down beats concurrency',
      input: admissionInput({ generationAvailable: false, quota: brokenConcurrency }),
      reason: 'GENERATION_UNAVAILABLE',
    },
    {
      name: 'generation down beats rate limit',
      input: admissionInput({ generationAvailable: false, quota: brokenQuota }),
      reason: 'GENERATION_UNAVAILABLE',
    },
    {
      name: 'generation down beats missing price',
      input: admissionInput({ generationAvailable: false, price: null }),
      reason: 'GENERATION_UNAVAILABLE',
    },
    {
      name: 'concurrency beats rate limit',
      input: admissionInput({ quota: brokenBoth }),
      reason: 'CONCURRENCY_LIMIT',
    },
    {
      name: 'concurrency beats missing price',
      input: admissionInput({ quota: brokenConcurrency, price: null }),
      reason: 'CONCURRENCY_LIMIT',
    },
    {
      name: 'rate limit beats missing price',
      input: admissionInput({ quota: brokenQuota, price: null }),
      reason: 'RATE_LIMITED',
    },
    {
      name: 'rate limit beats no balance',
      input: admissionInput({ quota: brokenQuota, founder: noBalance }),
      reason: 'RATE_LIMITED',
    },
    {
      name: 'missing price beats no balance (fail closed before funding)',
      input: admissionInput({ price: null, founder: noBalance }),
      reason: 'PRICE_DATA_UNAVAILABLE',
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const decision = admit(testCase.input);
      expect(decision.allowed).toBe(false);
      if (decision.allowed) return;
      expect(decision.reason).toBe(testCase.reason);
    });
  }
});

describe('denial reasons map onto PRD §34.9 (plan OQ-2)', () => {
  it('is total over the five reasons and every value is a real §34.9 code', () => {
    const reasons: readonly AdmissionDenialReason[] = [
      'CREDIT_LIMIT_REACHED',
      'RATE_LIMITED',
      'GENERATION_UNAVAILABLE',
      'PRICE_DATA_UNAVAILABLE',
      'CONCURRENCY_LIMIT',
    ];
    expect(Object.keys(ADMISSION_REASON_TO_ERROR_CODE).sort()).toEqual([...reasons].sort());
    for (const reason of reasons) {
      const code = errorCodeForReason(reason);
      expect(isErrorCode(code), `${reason} maps to ${code}`).toBe(true);
    }
    expect(errorCodeForReason('PRICE_DATA_UNAVAILABLE')).toBe('GENERATION_UNAVAILABLE');
    expect(errorCodeForReason('CONCURRENCY_LIMIT')).toBe('RATE_LIMITED');
  });
});

describe('rate-limit metadata discloses nothing about other tenants or about the founder ledger', () => {
  it('is exactly the requesting organisation’s own counter', () => {
    const decision = admit(
      admissionInput({
        quota: quotaState({ counters: { ANSWER_CREDITS: counter(60n, 17n, 123_456n) } }),
      }),
    );
    expect(decision.metadata).toEqual({ limit: 60n, remaining: 43n, resetAt: 123_456n });
  });

  it('reports the concurrency counter when concurrency is what denied the request', () => {
    const decision = admit(
      admissionInput({ quota: quotaState({ concurrency: { QUICK: counter(2n, 2n, 777n) } }) }),
    );
    expect(decision.metadata).toEqual({ limit: 2n, remaining: 0n, resetAt: 777n });
  });

  it('never reports a negative remaining', () => {
    const decision = admit(
      admissionInput({ quota: quotaState({ counters: { ANSWER_CREDITS: counter(5n, 99n) } }) }),
    );
    expect(decision.metadata.remaining).toBe(0n);
  });

  it('on a CREDIT_LIMIT_REACHED denial it still describes the quota counter, not the budget', () => {
    const decision = admit(
      admissionInput({
        founder: founderState({ ceilingMicroAud: microAud(1n) }),
        quota: quotaState({ counters: { ANSWER_CREDITS: counter(9n, 3n, 42n) } }),
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.metadata).toEqual({ limit: 9n, remaining: 6n, resetAt: 42n });
  });

  it('leaks no founder-ledger figure and no other tenant’s sentinel value anywhere in the result', () => {
    // Distinctive sentinels: if any of them reaches the caller, the scan below finds it.
    const founderSentinel = 987_654_321n;
    const otherTenantSentinel = 123_456_789n;
    const decision = admit(
      admissionInput({
        founder: founderState({
          ceilingMicroAud: microAud(founderSentinel),
          settledMicroAud: microAud(founderSentinel - 1n),
          heldMicroAud: microAud(founderSentinel - 2n),
          unspentAllowanceMicroAud: allowances({ INTERNAL_TESTING: microAud(founderSentinel - 3n) }),
        }),
        quota: quotaState({ counters: { ANSWER_CREDITS: counter(50n, 1n, 60_000n) } }),
      }),
    );

    const rendered = stringifyWithBigInt(decision.metadata);
    for (const sentinel of [founderSentinel, founderSentinel - 1n, founderSentinel - 2n, founderSentinel - 3n, otherTenantSentinel]) {
      expect(rendered, `metadata leaked ${sentinel.toString()}`).not.toContain(sentinel.toString());
    }
    // Non-vacuity: the scan does find a value that IS there.
    expect(rendered).toContain('50n');
  });

  it('the metadata of a second organisation never appears in the first organisation’s decision', () => {
    // A second, differently-populated organisation, admitted first: its counters must not bleed into
    // the next decision through any shared or cached state.
    const theirs = admit(
      admissionInput({
        request: request({ reservationId: reservationId('rsv-other-org') }),
        quota: quotaState({ counters: { ANSWER_CREDITS: counter(111_111n, 222n, 333_333n) } }),
      }),
    );
    expect(theirs.metadata.limit).toBe(111_111n);

    const mine = admit(
      admissionInput({ quota: quotaState({ counters: { ANSWER_CREDITS: counter(7n, 2n, 9n) } }) }),
    );
    const rendered = stringifyWithBigInt(mine.metadata);
    for (const foreign of ['111111', '222', '333333']) {
      expect(rendered).not.toContain(foreign);
    }
    expect(mine.metadata).toEqual({ limit: 7n, remaining: 5n, resetAt: 9n });
  });
});
