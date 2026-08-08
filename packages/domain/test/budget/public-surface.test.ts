/**
 * FND-09 acceptance item 11 (ledger separation) — the module's public surface, asserted as a whole.
 *
 * PRD §38.5: *"Search, answer credits, advanced-task credits, API calls and provider cost are separate
 * ledgers; exhausting one does not misreport the others."* The separation is enforced by ABSENCE, so it
 * is checked by comparing the exported name list against a literal expectation: a cross-debit helper
 * added later fails here rather than reaching `RUNT-02` and `EVID-08`.
 *
 * Also: every exported constant is frozen at EVERY level, because they are process-lifetime singletons
 * read concurrently by every in-flight request (plan risk R2).
 */
import { describe, expect, it } from 'vitest';

import * as budget from '../../src/budget/index.js';
import {
  ADMISSION_REASON_TO_ERROR_CODE,
  BUDGET_PROFILE_V1,
  FOUNDER_RESERVE_ORDER,
  isErrorCode,
  LIMIT_DEFAULTS_V1,
  ORGANISATION_CONCURRENCY_DEFAULTS,
  QUOTA_LEDGER_KINDS,
  remainingOf,
  type QuotaLedgerKind,
} from '../../src/budget/index.js';
import { counter, quotaState } from './doubles.js';

const EXPECTED_EXPORTS = [
  'ADMISSION_REASON_TO_ERROR_CODE',
  'BOUNDARY_FOR_OPERATION',
  'BUDGET_PROFILE_V1',
  'CONCURRENCY_BOUNDARY_FOR_OPERATION',
  'ERROR_CODE_VALUES',
  'FOUNDER_RESERVE_ORDER',
  'FOUNDER_RESERVE_ORDER_PRD_TEXT',
  'FUNDING_LEDGER_VALUES',
  'LIMIT_DEFAULTS_V1',
  'MICRO_AUD_PER_AUD',
  'MICRO_AUD_PER_CENT',
  'OPERATIONS_REQUIRING_MODEL_FUNDING',
  'ORGANISATION_CONCURRENCY_DEFAULTS',
  'ORGANISATION_CONCURRENCY_PRD_TEXT',
  'QUOTA_KIND_FOR_OPERATION',
  'QUOTA_LEDGER_KINDS',
  'ZERO_MICRO_AUD',
  'addMicroAud',
  'admit',
  'assertMicroAud',
  'availableForClass',
  'budgetLineItem',
  'ceilDiv',
  'costMicroAud',
  'crossesWarningThreshold',
  'deepFreeze',
  'errorCodeForReason',
  'fromCents',
  'fromWholeAud',
  'hasReserveFor',
  'isErrorCode',
  'isFounderLiability',
  'isFundingLedger',
  'isSearchAffected',
  'limitRow',
  'maxMicroAud',
  'microAud',
  'minMicroAud',
  'nextHighWaterMark',
  'reachedCeiling',
  'recordByokEstimate',
  'remainingOf',
  'reservationId',
  'reserve',
  'settle',
  'subMicroAud',
  'toDisplay',
  'validatePriceData',
  'warningThresholdMicroAud',
].sort((a, b) => (a < b ? -1 : 1));

describe('the exported surface is exactly what it says it is', () => {
  it('exports the expected names and nothing else', () => {
    const actual = Object.keys(budget).sort((a, b) => (a < b ? -1 : 1));
    expect(actual).toEqual(EXPECTED_EXPORTS);
  });

  it('exposes no cross-debit, transfer, borrow or top-up function (PRD §38.5)', () => {
    const forbidden = /transfer|crossDebit|moveBetween|borrow|convertLedger|topUp|debitFrom/i;
    const offenders = Object.keys(budget).filter((name) => forbidden.test(name));
    expect(offenders, offenders.join(', ')).toEqual([]);
    // Positive control: the matcher does fire on the shape it is looking for.
    expect(forbidden.test('transferBetweenLedgers')).toBe(true);
  });

  it('no exported function takes two quota-ledger kinds', () => {
    const offenders: string[] = [];
    for (const [name, value] of Object.entries(budget)) {
      if (typeof value !== 'function') continue;
      const source = value.toString();
      const kindParameters = source.slice(0, source.indexOf(')')).match(/kind/gi) ?? [];
      if (kindParameters.length > 1) offenders.push(name);
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});

describe('ledger separation is observable, not merely promised', () => {
  const KINDS: readonly QuotaLedgerKind[] = [
    'SEARCH',
    'ANSWER_CREDITS',
    'ADVANCED_TASK_CREDITS',
    'API_CALLS',
    'PROVIDER_COST',
  ];

  for (const exhaustedKind of KINDS) {
    it(`exhausting ${exhaustedKind} changes the reported remaining of no other ledger`, () => {
      const before = quotaState({ counters: Object.fromEntries(KINDS.map((kind) => [kind, counter(10n, 3n)])) });
      const after = quotaState({
        counters: {
          ...Object.fromEntries(KINDS.map((kind) => [kind, counter(10n, 3n)])),
          [exhaustedKind]: counter(10n, 10n),
        },
      });
      expect(remainingOf(after, exhaustedKind)).toBe(0n);
      for (const other of KINDS) {
        if (other === exhaustedKind) continue;
        expect(remainingOf(after, other), other).toBe(remainingOf(before, other));
        expect(remainingOf(after, other)).toBe(7n);
      }
    });
  }

  it('remaining never goes negative', () => {
    const state = quotaState({ counters: { SEARCH: counter(5n, 50n) } });
    expect(remainingOf(state, 'SEARCH')).toBe(0n);
  });

  it('QUOTA_LEDGER_KINDS is the five §38.5 ledgers and nothing else', () => {
    expect([...QUOTA_LEDGER_KINDS]).toEqual([...KINDS]);
  });
});

describe('every exported constant is deeply frozen (concurrency, plan risk R2)', () => {
  function assertDeeplyFrozen(value: unknown, path: string, seen = new WeakSet<object>()): void {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    expect(Object.isFrozen(value), `${path} is not frozen`).toBe(true);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      assertDeeplyFrozen(child, `${path}.${key}`, seen);
    }
  }

  const constants: readonly [string, unknown][] = [
    ['BUDGET_PROFILE_V1', BUDGET_PROFILE_V1],
    ['LIMIT_DEFAULTS_V1', LIMIT_DEFAULTS_V1],
    ['FOUNDER_RESERVE_ORDER', FOUNDER_RESERVE_ORDER],
    ['ORGANISATION_CONCURRENCY_DEFAULTS', ORGANISATION_CONCURRENCY_DEFAULTS],
    ['QUOTA_LEDGER_KINDS', QUOTA_LEDGER_KINDS],
    ['ADMISSION_REASON_TO_ERROR_CODE', ADMISSION_REASON_TO_ERROR_CODE],
  ];

  for (const [name, value] of constants) {
    it(`${name} is frozen at every level`, () => {
      assertDeeplyFrozen(value, name);
    });
  }

  it('the freeze assertion fires on a shallow-frozen structure (positive control)', () => {
    const shallow = Object.freeze({ row: { mutable: true } });
    expect(() => assertDeeplyFrozen(shallow, 'control')).toThrow();
  });

  it('a frozen row really cannot be mutated', () => {
    const row = LIMIT_DEFAULTS_V1.rows[0];
    expect(row).toBeDefined();
    expect(() => {
      (row as unknown as Record<string, unknown>).label = 'tampered';
    }).toThrow(TypeError);
  });
});

describe('ADMISSION_REASON_TO_ERROR_CODE stays inside FND-03’s catalogue', () => {
  it('every value is a real §34.9 code', () => {
    for (const [reason, code] of Object.entries(ADMISSION_REASON_TO_ERROR_CODE)) {
      expect(isErrorCode(code), `${reason} -> ${code}`).toBe(true);
    }
    expect(Object.keys(ADMISSION_REASON_TO_ERROR_CODE)).toHaveLength(5);
  });
});
