/**
 * FND-09 acceptance items "No founder liability from BYOK" and "Ledger separation" `[machine]`
 * (PRD §42.6, §24.4, §16.4, §38.5).
 *
 * The founder-debit assertion is `toBe(0n)` on a value additionally asserted to be a `bigint` — never
 * a truthy check, which `0n`, `0`, `''` and `false` would all pass.
 *
 * The "no cross-debit function" half is asserted by pinning the module's ENTIRE public export set
 * against a declared allow-list: a future helper that moves credit between ledgers fails this suite
 * by construction, whatever it is called.
 */
import { describe, expect, it } from 'vitest';

import * as budget from '../../src/budget/index.js';
import {
  FOUNDER_LIABILITY_BY_LEDGER,
  OPERATION_LEDGER_VALUES,
  isFounderLiability,
  recordByokEstimate,
  remainingOf,
  type OperationLedger,
  type OperationLedgerState,
} from '../../src/budget/ledgers.js';
import type { FxSnapshot, PriceSnapshot } from '../../src/budget/pricing.js';

const NOW = 1_754_600_000_000;

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

/**
 * The complete public surface of `packages/domain/src/budget`. Every name here is deliberate; a new
 * name must be added consciously, and a cross-debit helper cannot slip in unnoticed (PRD §38.5).
 */
const DECLARED_EXPORTS = [
  'ADMISSION_DENIAL_REASONS',
  'ADMISSION_REASON_TO_ERROR_CODE',
  'BASIS_POINT_DENOMINATOR',
  'BUDGET_PROFILE_V1',
  'CONCURRENCY_BOUNDARY_BY_OPERATION',
  'FOUNDER_LIABILITY_BY_LEDGER',
  'FOUNDER_RESERVE_ORDER',
  'LIMIT_BOUNDARY_BY_OPERATION',
  'LIMIT_DEFAULTS_V1',
  'ONE_AUD_IN_MICRO_AUD',
  'ONE_CENT_IN_MICRO_AUD',
  'OPERATION_KIND_VALUES',
  'OPERATION_LEDGER_VALUES',
  'QUOTA_LEDGER_BY_OPERATION',
  'ZERO_MICRO_AUD',
  'addMicroAud',
  'admit',
  'availableForClass',
  'ceilDiv',
  'costOf',
  'counterFor',
  'crossesWarningThreshold',
  'deepFreeze',
  'floorDiv',
  'fromCents',
  'fromWholeAud',
  'hasReserveFor',
  'isFounderLiability',
  'isSearchAffected',
  'limitCellFor',
  'limitRowFor',
  'maxMicroAud',
  'microAud',
  'minMicroAud',
  'rateLimitMetadataOf',
  'recordByokEstimate',
  'remainingOf',
  'reserve',
  'reservePriorityOf',
  'settle',
  'subMicroAud',
  'toDisplay',
  'validatePricing',
  'warningThresholdOf',
];

const stateWith = (counters: readonly OperationLedger[]): OperationLedgerState => ({
  counters: counters.map((ledger) => ({
    ledger,
    limit: 100,
    used: 10,
    resetAtEpochMs: NOW + 60_000,
  })),
});

describe('funding ledger kinds', () => {
  it('is exhaustive over FND-03 s enum and marks exactly one kind as founder liability', () => {
    expect(Object.keys(FOUNDER_LIABILITY_BY_LEDGER).sort()).toEqual([
      'CUSTOMER_PREPAID_OR_BYOK',
      'FOUNDER_PLATFORM_BUDGET',
    ]);
    expect(isFounderLiability('FOUNDER_PLATFORM_BUDGET')).toBe(true);
    expect(isFounderLiability('CUSTOMER_PREPAID_OR_BYOK')).toBe(false);
    expect(Object.isFrozen(FOUNDER_LIABILITY_BY_LEDGER)).toBe(true);
  });
});

describe('BYOK never creates founder liability', () => {
  it.each([
    [0n, 0n],
    [1n, 0n],
    [1_000_000n, 1_000_000n],
    [123_456_789n, 987_654_321n],
  ])('records an estimate with a founder debit of exactly 0n for %s/%s tokens', (input, output) => {
    const estimate = recordByokEstimate({
      usage: { inputTokens: input, outputTokens: output },
      price,
      fx,
    });
    expect(estimate.founderDebitMicroAud).toBe(0n);
    expect(typeof estimate.founderDebitMicroAud).toBe('bigint');
    expect(estimate.ledger).toBe('CUSTOMER_PREPAID_OR_BYOK');
    expect(estimate.priceSnapshot).toBe(price);
    expect(estimate.fxSnapshot).toBe(fx);
    expect(typeof estimate.estimatedCostMicroAud).toBe('bigint');
  });

  it('still records a non-zero estimate for real usage (visibility, PRD §42.6)', () => {
    const estimate = recordByokEstimate({
      usage: { inputTokens: 1_000_000n, outputTokens: 1_000_000n },
      price,
      fx,
    });
    expect(estimate.estimatedCostMicroAud).toBeGreaterThan(0n);
    expect(estimate.founderDebitMicroAud).toBe(0n);
  });

  it('cannot be made to produce a founder debit by any input', () => {
    const debits = new Set<bigint>();
    for (let tokens = 0n; tokens <= 5_000_000n; tokens += 250_001n) {
      debits.add(
        recordByokEstimate({
          usage: { inputTokens: tokens, outputTokens: tokens * 3n },
          price,
          fx,
        }).founderDebitMicroAud,
      );
    }
    expect([...debits]).toEqual([0n]);
  });
});

describe('ledger separation (PRD §38.5)', () => {
  it('names the five PRD §38.5 ledgers, in PRD order', () => {
    expect([...OPERATION_LEDGER_VALUES]).toEqual([
      'SEARCH',
      'ANSWER_CREDITS',
      'ADVANCED_TASK_CREDITS',
      'API_CALLS',
      'PROVIDER_COST',
    ]);
  });

  it('exhausting answer credits does not change the reported remaining for any other ledger', () => {
    const all = [...OPERATION_LEDGER_VALUES];
    const before = stateWith(all);
    const beforeReadings = all.map((ledger) => remainingOf(ledger, before));

    const after: OperationLedgerState = {
      counters: before.counters.map((counter) =>
        counter.ledger === 'ANSWER_CREDITS' ? { ...counter, used: counter.limit } : counter,
      ),
    };
    const afterReadings = all.map((ledger) => remainingOf(ledger, after));

    expect(remainingOf('ANSWER_CREDITS', before)).toBe(90);
    expect(remainingOf('ANSWER_CREDITS', after)).toBe(0);
    for (const ledger of all) {
      if (ledger === 'ANSWER_CREDITS') continue;
      expect(
        afterReadings[all.indexOf(ledger)],
        `${ledger} changed when ANSWER_CREDITS was exhausted`,
      ).toBe(beforeReadings[all.indexOf(ledger)]);
    }
  });

  it('reports absence as null, never as zero', () => {
    const partial = stateWith(['SEARCH']);
    expect(remainingOf('SEARCH', partial)).toBe(90);
    expect(remainingOf('PROVIDER_COST', partial)).toBeNull();
  });

  it('never reports a negative remaining', () => {
    const over: OperationLedgerState = {
      counters: [{ ledger: 'SEARCH', limit: 5, used: 500, resetAtEpochMs: NOW }],
    };
    expect(remainingOf('SEARCH', over)).toBe(0);
  });
});

describe('public surface', () => {
  it('exports exactly the declared allow-list — no cross-debit helper can appear', () => {
    expect(Object.keys(budget).sort()).toEqual([...DECLARED_EXPORTS].sort());
  });

  it('exposes no name shaped like a cross-ledger transfer', () => {
    const forbidden = ['transfer', 'crossDebit', 'debitAny', 'spendCredit', 'moveCredit', 'borrow'];
    const lowered = Object.keys(budget).map((name) => name.toLowerCase());
    for (const shape of forbidden) {
      expect(lowered.some((name) => name.includes(shape.toLowerCase()))).toBe(false);
    }
  });

  it('exposes no mutable state: every exported object is frozen', () => {
    for (const [name, value] of Object.entries(budget)) {
      if (typeof value === 'object' && value !== null) {
        expect(Object.isFrozen(value), `${name} is not frozen`).toBe(true);
      }
    }
  });
});
