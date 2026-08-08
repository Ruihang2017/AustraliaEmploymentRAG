/**
 * EVID-01 acceptance item 8 — "checksums are real".
 *
 * For each algorithm: one known-valid synthetic value, then EVERY single-digit mutation at EVERY
 * position, each asserted rejected. Single-digit mutation is the right mutation class here because
 * mod-11, mod-89 and Luhn all detect every single-digit change by construction — so a surviving
 * mutant is a real defect and never an artefact of the test.
 *
 * Every value below is invented (PRD §45.1 item 6).
 */
import { describe, expect, it } from 'vitest';

import {
  isValidAbn,
  isValidLuhn,
  isValidMedicare,
  isValidTfn,
} from '../../src/deterministic/detectors/checksums.js';

/**
 * Every single-digit mutation of the CHECK-PROTECTED prefix. `protectedLength` is the whole value
 * except for digits the algorithm does not cover — on a Medicare number the trailing issue number is
 * free, and mutating it produces another perfectly valid card number rather than a defect.
 */
function mutations(value: string, protectedLength = value.length): { mutant: string; at: number }[] {
  const out: { mutant: string; at: number }[] = [];
  for (let at = 0; at < protectedLength; at += 1) {
    for (let digit = 0; digit <= 9; digit += 1) {
      const replacement = String(digit);
      if (value.charAt(at) === replacement) continue;
      out.push({ mutant: value.slice(0, at) + replacement + value.slice(at + 1), at });
    }
  }
  return out;
}

const CASES: readonly (readonly [string, string, (value: string) => boolean, number])[] = [
  ['TFN mod-11', '123456782', isValidTfn, 9],
  ['ABN mod-89', '51824753556', isValidAbn, 11],
  // Positions 1-9 only: the tenth digit is the issue number, which no check digit protects.
  ['Medicare check digit', '2123456701', isValidMedicare, 9],
  ['card Luhn', '4111111111111111', isValidLuhn, 16],
];

describe.each(CASES)('%s', (name, valid, check, protectedLength) => {
  it('accepts the known-valid synthetic value', () => {
    expect(check(valid), `${name}: ${valid} should be valid`).toBe(true);
  });

  it('rejects every single-digit mutation, at every check-protected position', () => {
    const survivors: string[] = [];
    for (const { mutant } of mutations(valid, protectedLength)) {
      if (check(mutant)) survivors.push(mutant);
    }
    expect(survivors, `${name}: mutations that still validate`).toEqual([]);
  });

  it('the mutation set is non-vacuous', () => {
    expect(mutations(valid, protectedLength)).toHaveLength(protectedLength * 9);
  });

  it('rejects a wrong length and a non-digit string', () => {
    expect(check(valid.slice(0, -1))).toBe(false);
    expect(check(`${valid}0`)).toBe(false);
    expect(check(valid.replace(/\d$/, 'x'))).toBe(false);
    expect(check('')).toBe(false);
  });
});

describe('Medicare-specific rules', () => {
  it('rejects a leading digit outside 2-6', () => {
    expect(isValidMedicare('7123456701')).toBe(false);
    expect(isValidMedicare('1123456701')).toBe(false);
  });

  it('rejects an issue number of 0', () => {
    expect(isValidMedicare('2123456700')).toBe(false);
  });
});

describe('ABN is used to allow, never to block', () => {
  it('validates the shared primitive 14-search-product will depend on (UAT-SRCH-04)', () => {
    expect(isValidAbn('51824753556')).toBe(true);
    expect(isValidAbn('51824753557')).toBe(false);
  });
});
