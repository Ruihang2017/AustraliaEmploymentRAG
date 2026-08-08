/**
 * EVID-01 — the scan view and the digit view, tested directly.
 *
 * Everything downstream depends on the index map being right, so it is asserted here rather than only
 * through detectors: a detector test that passes with a subtly wrong map just moves the bug.
 */
import { describe, expect, it } from 'vitest';

import { digitRuns, spanOfRun } from '../../src/deterministic/digits.js';
import {
  DROPPED_CHARACTERS,
  FOLDED_CHARACTERS,
  normaliseForScan,
  spanOfScanRange,
  stripFormatting,
} from '../../src/deterministic/normalise.js';

const ZWSP = String.fromCodePoint(0x200b);
const NBSP = String.fromCodePoint(0x00a0);
const EM_DASH = String.fromCodePoint(0x2014);

describe('normaliseForScan', () => {
  it('maps every scan index back to a real NFC range', () => {
    const view = normaliseForScan('question', `ab${ZWSP}cd${NBSP}ef`);
    expect(view.scan).toBe('abcd ef');
    for (let index = 0; index < view.scan.length; index += 1) {
      const start = view.startOf[index];
      const end = view.endOf[index];
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      expect(end).toBeGreaterThan(start ?? -1);
    }
  });

  it('drops zero-width characters without shifting the surrounding offsets', () => {
    const value = `12${ZWSP}34`;
    const view = normaliseForScan('question', value);
    expect(view.scan).toBe('1234');
    const span = spanOfScanRange(view, 0, 4);
    expect(view.nfc.slice(span.start, span.end)).toBe(value);
  });

  it('folds look-alikes to ASCII without changing the NFC text', () => {
    const view = normaliseForScan('question', `12${EM_DASH}34`);
    expect(view.scan).toBe('12-34');
    expect(view.nfc).toBe(`12${EM_DASH}34`);
  });

  it('folds full-width digits and letters', () => {
    const fullwidthOne = String.fromCodePoint(0xff11);
    const fullwidthA = String.fromCodePoint(0xff21);
    const view = normaliseForScan('question', `${fullwidthOne}${fullwidthA}`);
    expect(view.scan).toBe('1A');
  });

  it('normalises to NFC before indexing', () => {
    const combiningAcute = String.fromCodePoint(0x0301);
    const view = normaliseForScan('question', `e${combiningAcute}abc`);
    expect(view.nfc.length).toBe(4);
    expect(view.scan.length).toBe(4);
  });

  it('keeps an astral character as two code units mapping to the same NFC range', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const view = normaliseForScan('question', `${emoji}1`);
    expect(view.scan).toBe(`${emoji}1`);
    expect(view.startOf[0]).toBe(0);
    expect(view.startOf[1]).toBe(0);
    expect(view.endOf[0]).toBe(2);
    expect(view.startOf[2]).toBe(2);
  });

  it('does not lowercase (a length-changing fold would corrupt the map)', () => {
    const view = normaliseForScan('question', 'ABC');
    expect(view.scan).toBe('ABC');
  });

  it('documents a non-empty drop set and fold set', () => {
    expect(DROPPED_CHARACTERS.length).toBeGreaterThanOrEqual(15);
    expect(FOLDED_CHARACTERS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('spanOfScanRange', () => {
  it('throws on an empty or out-of-range span rather than returning a wrong one', () => {
    const view = normaliseForScan('question', 'abc');
    expect(() => spanOfScanRange(view, 1, 1)).toThrow(/not a span/);
    expect(() => spanOfScanRange(view, 0, 9)).toThrow(/not a span/);
  });

  it('names the field but never a character of the value', () => {
    const view = normaliseForScan('question', 'my tfn is 123456782');
    try {
      spanOfScanRange(view, 0, 99);
      throw new Error('expected a throw');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('question');
      expect(message).not.toContain('123456782');
    }
  });
});

describe('digitRuns', () => {
  it('groups digits with single separators into one maximal run', () => {
    const view = normaliseForScan('question', 'ref 123 456 789 end');
    const runs = digitRuns(view);
    expect(runs.map((run) => run.digits)).toEqual(['123456789']);
  });

  it('splits on a double separator', () => {
    const view = normaliseForScan('question', '12--34');
    expect(digitRuns(view).map((run) => run.digits)).toEqual(['12', '34']);
  });

  it('is maximal, so an 11-digit run never presents a 9-digit prefix', () => {
    const view = normaliseForScan('question', 'abn 51824753556 here');
    const runs = digitRuns(view);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.digits).toHaveLength(11);
  });

  it('spans the run from its first digit to its last, separators included', () => {
    const value = 'ref 123-456-789 end';
    const view = normaliseForScan('question', value);
    const run = digitRuns(view)[0];
    if (!run) throw new Error('no run');
    const span = spanOfRun(view, run);
    expect(view.nfc.slice(span.start, span.end)).toBe('123-456-789');
  });

  it('maps digit positions back through the zero-width characters', () => {
    const view = normaliseForScan('question', `12${ZWSP}3`);
    const run = digitRuns(view)[0];
    if (!run) throw new Error('no run');
    expect(run.digits).toBe('123');
    const span = spanOfRun(view, run);
    expect(view.nfc.slice(span.start, span.end)).toBe(`12${ZWSP}3`);
  });
});

describe('stripFormatting', () => {
  it('removes the dropped characters and nothing else', () => {
    expect(stripFormatting(`a${ZWSP}b${NBSP}c`)).toBe(`ab${NBSP}c`);
  });
});
