/**
 * FND-09 acceptance item "No floating-point money" `[machine]` — PRD §34.1 (*"Integer micro-AUD for
 * internal cost; never floating point"*), sub-PRD decision **D15**.
 *
 * Static half: over `src/budget/**` with comments and string literals stripped, there is no
 * `parseFloat`, no `Number(`, no `toFixed`, no `Math.` call and no decimal numeric literal outside
 * `budget-profile.ts`'s single declarative `0.9`; and the division operator appears ONLY inside
 * `micro-aud.ts`'s `ceilDiv`/`floorDiv`.
 *
 * Runtime half: every money value returned by `reserve`, `settle`, `admit` and `recordByokEstimate`
 * is a `bigint`.
 *
 * Every scan is proved non-vacuous against a synthetic positive.
 */
import { describe, expect, it } from 'vitest';

import { admit } from '../../src/budget/admit.js';
import { recordByokEstimate } from '../../src/budget/ledgers.js';
import { toDisplay, microAud } from '../../src/budget/micro-aud.js';
import type { FxSnapshot, PriceSnapshot } from '../../src/budget/pricing.js';
import { reserve } from '../../src/budget/reserve.js';
import { settle } from '../../src/budget/settle.js';
import {
  countOf,
  readSource,
  relativeName,
  sourceFiles,
  stripCommentsAndStrings,
} from './source-scan.js';

const files = sourceFiles();
const stripped = new Map(files.map((file) => [file, stripCommentsAndStrings(readSource(file))]));

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

describe('the source scan itself', () => {
  it('walks the whole budget source tree (non-vacuity)', () => {
    expect(files.length).toBeGreaterThan(8);
    expect(files.map(relativeName).some((name) => name.includes('micro-aud.ts'))).toBe(true);
  });

  it('strips comments and string literals but keeps code', () => {
    expect(stripCommentsAndStrings('const a = 1; // a / b')).toBe('const a = 1; ');
    expect(stripCommentsAndStrings('/* x / y */const a = 1;')).toBe('const a = 1;');
    expect(stripCommentsAndStrings("const a = 'x / y';")).toBe('const a = "";');
    expect(stripCommentsAndStrings('const a = `x / y`;')).toBe('const a = "";');
    expect(stripCommentsAndStrings('const a = b / c;')).toBe('const a = b / c;');
  });
});

describe('no floating-point money in src/budget', () => {
  it.each(['parseFloat', 'Number(', 'toFixed', 'Math.'])('uses no %s', (forbidden) => {
    const offenders: string[] = [];
    for (const [file, text] of stripped) {
      if (text.includes(forbidden)) offenders.push(relativeName(file));
    }
    expect(offenders).toEqual([]);
  });

  it('detects each forbidden form when it is present (the scan is not vacuous)', () => {
    for (const forbidden of ['parseFloat', 'Number(', 'toFixed', 'Math.']) {
      expect(stripCommentsAndStrings(`const x = ${forbidden}y);`).includes(forbidden)).toBe(true);
    }
  });

  it('writes no decimal numeric literal outside the declarative budget ratio', () => {
    const decimal = /\d+\.\d+/g;
    for (const [file, text] of stripped) {
      const name = relativeName(file);
      const found = [...text.matchAll(decimal)].map((match) => match[0]);
      if (name.endsWith('budget-profile.ts')) {
        // Exactly two: the literal TYPE `warningThresholdRatio: 0.9` and its value. Nothing else.
        expect(found, 'budget-profile.ts may hold only the declarative 0.9').toEqual([
          '0.9',
          '0.9',
        ]);
      } else {
        expect(found, `${name} contains a decimal numeric literal`).toEqual([]);
      }
    }
    expect([...'const ratio = 0.9;'.matchAll(decimal)].map((match) => match[0])).toEqual(['0.9']);
  });

  it('confines the division operator to micro-aud.ts, inside ceilDiv and floorDiv', () => {
    for (const [file, text] of stripped) {
      const name = relativeName(file);
      const slashes = countOf(text, '/');
      if (name.endsWith('micro-aud.ts')) {
        expect(slashes, 'micro-aud.ts should divide exactly twice').toBe(2);
        const dividing = text
          .split('\n')
          .filter((line) => line.includes('/'))
          .map((line) => line.trim());
        expect(dividing).toHaveLength(2);
        for (const line of dividing) {
          expect(line, `unexpected division in micro-aud.ts: ${line}`).toContain('numerator');
          expect(line).toContain('denominator');
        }
      } else {
        expect(slashes, `${name} divides outside micro-aud.ts`).toBe(0);
      }
    }
  });

  it('writes no regular-expression literal (which would defeat the division scan)', () => {
    for (const [file, text] of stripped) {
      expect(/=\s*\/[^/\n]+\//.test(text), `${relativeName(file)} has a regex literal`).toBe(false);
    }
  });

  it('annotates every MicroAud-named member as MicroAud or bigint, never as number', () => {
    const declaration = /readonly\s+(\w*MicroAud\w*)\s*\??:\s*([A-Za-z]+)/g;
    const offenders: string[] = [];
    let matched = 0;
    for (const [file, text] of stripped) {
      for (const match of text.matchAll(declaration)) {
        matched += 1;
        const type = match[2];
        if (type !== 'MicroAud' && type !== 'bigint') {
          offenders.push(`${relativeName(file)}: ${match[0]}`);
        }
      }
    }
    expect(matched, 'the MicroAud annotation scan found nothing to check').toBeGreaterThan(10);
    expect(offenders).toEqual([]);
    // Non-vacuity: the scan does flag a number-typed money member.
    const synthetic = [
      ...'readonly amountMicroAud: number;'.matchAll(
        /readonly\s+(\w*MicroAud\w*)\s*\??:\s*([A-Za-z]+)/g,
      ),
    ];
    expect(synthetic[0]?.[2]).toBe('number');
  });
});

describe('money values are bigint at runtime', () => {
  const reservation = reserve({
    reservationId: 'res-purity',
    maxInputTokens: 1_000_000n,
    maxOutputTokens: 250_000n,
    price,
    fx,
  });

  it('reserve returns bigint', () => {
    expect(typeof reservation.amountMicroAud).toBe('bigint');
  });

  it('settle returns bigint on both fields, for both branches', () => {
    for (const executed of [true, false]) {
      const result = settle(reservation, {
        executed,
        usage: { inputTokens: 1_000n, outputTokens: 1_000n },
      });
      expect(typeof result.debitMicroAud).toBe('bigint');
      expect(typeof result.releaseMicroAud).toBe('bigint');
    }
  });

  it('recordByokEstimate returns bigint on both money fields', () => {
    const estimate = recordByokEstimate({
      usage: { inputTokens: 5n, outputTokens: 5n },
      price,
      fx,
    });
    expect(typeof estimate.estimatedCostMicroAud).toBe('bigint');
    expect(typeof estimate.founderDebitMicroAud).toBe('bigint');
  });

  it('admit returns a bigint reservation amount', () => {
    const decision = admit({
      operation: 'QUICK',
      tier: 'PAID_PILOT',
      nowEpochMs: NOW,
      generationAvailable: true,
      quota: {
        counters: [{ ledger: 'ANSWER_CREDITS', limit: 250, used: 0, resetAtEpochMs: NOW }],
      },
      concurrency: [{ boundary: 'CONCURRENT_QUICK', limit: 2, inFlight: 0 }],
      funding: { kind: 'CUSTOMER_PREPAID_OR_BYOK', mode: 'BYOK' },
      pricing: {
        price,
        fx,
        maxAgeMs: 86_400_000,
        maxInputTokens: 1_000n,
        maxOutputTokens: 1_000n,
        reservationId: 'res-admit-purity',
      },
    });
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(typeof decision.reservation?.amountMicroAud).toBe('bigint');
      expect(typeof decision.byokEstimate?.founderDebitMicroAud).toBe('bigint');
    }
  });
});

describe('toDisplay formats without floating point', () => {
  it.each([
    [0n, 'A$0.000000'],
    [1n, 'A$0.000001'],
    [999_999n, 'A$0.999999'],
    [1_000_000n, 'A$1.000000'],
    [50_000_000n, 'A$50.000000'],
    [45_123_456n, 'A$45.123456'],
  ])('renders %s as %s', (amount, expected) => {
    expect(toDisplay(microAud(amount))).toBe(expected);
  });
});
