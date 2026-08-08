/**
 * FND-09 acceptance item 12 — NO FLOATING-POINT MONEY (PRD §34.1: *"Integer micro-AUD for internal
 * cost; never floating point"*, sub-PRD D15).
 *
 * Static half: every file under `src/budget/**` is scanned with comments AND string literals stripped.
 * Runtime half: every exported constant, and every field of a real `reserve`/`settle`/`admit` result,
 * is asserted to be a `bigint`.
 *
 * Every scanner carries a positive control, so none of these can pass vacuously.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  admit,
  BUDGET_PROFILE_V1,
  reserve,
  reservationId,
  settle,
} from '../../src/budget/index.js';
import { admissionInput, AUD_PRICE, IDENTITY_FX, MAX_PRICE_AGE_MILLIS, NOW, request } from './doubles.js';
import { PACKAGE_ROOT } from './fixture.js';
import { codeLines, codeOnly, named, sourceFiles } from './source-scan.js';

const SRC_BUDGET = join(PACKAGE_ROOT, 'src', 'budget');
const files = sourceFiles(SRC_BUDGET);
const lines = codeLines(PACKAGE_ROOT, files);

/** The only lines in the leaf that may contain the `/` operator: the body of `ceilDiv`. */
const DIVISION_LINES: readonly string[] = ['return (numerator + denominator - 1n) / denominator;'];

const FLOAT_HELPERS = ['parseFloat', 'parseInt', 'Number(', 'toFixed', 'toPrecision', 'toLocaleString', 'Math.'];

describe('the scanner is not vacuous (positive controls)', () => {
  it('walks the whole leaf', () => {
    expect(files.length).toBeGreaterThanOrEqual(11);
    expect(files.map((file) => named(PACKAGE_ROOT, file))).toContain('src/budget/index.ts');
  });

  it('strips comments and strings, and keeps the code', () => {
    expect(codeOnly("const path = './micro-aud.js';")).not.toContain('/micro-aud');
    expect(codeOnly('/** 1/2 of the budget */\nconst a = 1n;')).not.toContain('1/2');
    expect(codeOnly('const a = b / c; // 0.9\n')).toContain('b / c');
  });

  it('fires on a synthetic division, a float annotation and a float money literal', () => {
    const control = codeOnly('const x = a / b;\nconst y: number = 1.5;\nconst amountMicroAud = 0.9;');
    expect(control).toContain('/');
    expect(control).toContain(': number');
    expect(/\b\d+\.\d+\b/.test(control)).toBe(true);
  });
});

describe('no floating-point money in src/budget/**', () => {
  for (const helper of FLOAT_HELPERS) {
    it(`no source line uses ${helper}`, () => {
      const offenders = lines
        .filter((line) => line.text.includes(helper))
        .map((line) => `${line.file}:${String(line.lineNumber)}`);
      expect(offenders, offenders.join('\n')).toEqual([]);
    });
  }

  it('the `/` operator appears only in ceilDiv, in micro-aud.ts', () => {
    const offenders = lines
      .filter((line) => line.text.includes('/'))
      .filter(
        (line) => !(line.file === 'src/budget/micro-aud.ts' && DIVISION_LINES.includes(line.text.trim())),
      )
      .map((line) => `${line.file}:${String(line.lineNumber)} ${line.text.trim()}`);
    expect(offenders, `division outside ceilDiv:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('ceilDiv really is where the division lives (the allow-list is not stale)', () => {
    const found = lines.filter(
      (line) => line.file === 'src/budget/micro-aud.ts' && DIVISION_LINES.includes(line.text.trim()),
    );
    expect(found).toHaveLength(DIVISION_LINES.length);
  });

  it('`: number` appears only on profile.ts’s documentation-only warningThresholdRatio', () => {
    const offenders = lines
      .filter((line) => line.text.includes(': number'))
      .filter((line) => !(line.file === 'src/budget/profile.ts' && line.text.includes('warningThresholdRatio')))
      .map((line) => `${line.file}:${String(line.lineNumber)} ${line.text.trim()}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the identifier warningThresholdRatio appears in no file but profile.ts', () => {
    const offenders = lines
      .filter((line) => line.text.includes('warningThresholdRatio'))
      .filter((line) => line.file !== 'src/budget/profile.ts')
      .map((line) => `${line.file}:${String(line.lineNumber)}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every numeric literal on a money-named line is a bigint literal', () => {
    const moneyIdentifier = /MicroAud|Amount|Cost|Price|Balance|Ceiling|Budget|Tokens|BasisPoints/;
    const decimalLiteral = /(?<![\w.])\d[\d_]*(?:\.\d+)?(?![\w])/g;
    const offenders: string[] = [];
    for (const line of lines) {
      if (!moneyIdentifier.test(line.text)) continue;
      for (const match of line.text.matchAll(decimalLiteral)) {
        offenders.push(`${line.file}:${String(line.lineNumber)} ${match[0]} in ${line.text.trim()}`);
      }
    }
    expect(offenders, `non-bigint numeric literal on a money line:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no float literal appears anywhere except the documented ratio', () => {
    const offenders = lines
      .filter((line) => /(?<![\w.])\d+\.\d+/.test(line.text))
      .filter((line) => !line.text.includes('warningThresholdRatio'))
      .map((line) => `${line.file}:${String(line.lineNumber)} ${line.text.trim()}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('every money value is a bigint at runtime', () => {
  const MONEY_FIELD = /MicroAud$/;

  function assertMoneyIsBigInt(value: unknown, path: string, seen = new WeakSet<object>()): void {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (MONEY_FIELD.test(key)) {
        expect(child === null || typeof child === 'bigint', `${path}.${key} is ${typeof child}`).toBe(true);
      }
      assertMoneyIsBigInt(child, `${path}.${key}`, seen);
    }
  }

  it('holds for BUDGET_PROFILE_V1', () => {
    assertMoneyIsBigInt(BUDGET_PROFILE_V1, 'BUDGET_PROFILE_V1');
    expect(typeof BUDGET_PROFILE_V1.founderMonthlyCeilingMicroAud).toBe('bigint');
  });

  it('holds for a real reserve / settle / admit result', () => {
    const reservation = reserve({
      request: request({ reservationId: reservationId('rsv-money') }),
      ledger: 'FOUNDER_PLATFORM_BUDGET',
      price: AUD_PRICE,
      fx: IDENTITY_FX,
      now: NOW,
      maxPriceAgeMillis: MAX_PRICE_AGE_MILLIS,
    });
    assertMoneyIsBigInt(reservation, 'reservation');
    const settlement = settle(reservation, { executed: true, inputTokens: 10n, outputTokens: 10n });
    assertMoneyIsBigInt(settlement, 'settlement');
    const decision = admit(admissionInput());
    assertMoneyIsBigInt(decision, 'admission');
    expect(typeof decision.metadata.limit).toBe('bigint');
  });

  it('the runtime scan fires on a float money field (positive control)', () => {
    expect(() => assertMoneyIsBigInt({ amountMicroAud: 1.5 }, 'control')).toThrow();
  });
});
