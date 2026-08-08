/**
 * EVID-01 — the digit view: maximal digit runs over a `ScanView`, for the checksum detectors.
 *
 * A RUN IS MAXIMAL, AND THAT IS A SECURITY PROPERTY, NOT A CONVENIENCE. Every checksum detector
 * tests the length of the WHOLE run: a TFN is a run of exactly 9 digits, an ABN exactly 11. If runs
 * were not maximal, an 11-digit ABN would also present a 9-digit prefix and could be reported as a
 * TFN — a false positive on a §37.1 *allowed* value, which PRD §37.2 treats as a real defect
 * (a false positive is remedied by narrowing the pattern, never by an override).
 *
 * SEPARATORS. A run may contain SINGLE ' ', '-', '.' or '/' characters between digits, because
 * "123 456 789", "123-456-789" and "123.456.789" are the same TFN written three ways (deliverable 7:
 * "resistant to the obvious evasions ... punctuation separators"). Two separators in a row end the
 * run: "12--34" is two numbers, not one.
 *
 * `indexOf[i]` maps digit i to its index in `scan`, so a finding over digits `[i, j)` becomes the NFC
 * span `spanOfScanRange(view, indexOf[i], indexOf[j - 1] + 1)`.
 */
import type { ScanView, Span } from './normalise.js';
import { spanOfScanRange } from './normalise.js';

export interface DigitRun {
  /** The digits only, separators removed. */
  readonly digits: string;
  /** `indexOf[i]` — the `scan` index of digit `i`. */
  readonly indexOf: readonly number[];
}

const SEPARATORS = new Set([' ', '-', '.', '/']);

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

export function digitRuns(view: ScanView): readonly DigitRun[] {
  const runs: DigitRun[] = [];
  const scan = view.scan;
  let index = 0;
  while (index < scan.length) {
    if (!isDigit(scan.charAt(index))) {
      index += 1;
      continue;
    }
    const digits: string[] = [];
    const indexOf: number[] = [];
    let cursor = index;
    while (cursor < scan.length) {
      const char = scan.charAt(cursor);
      if (isDigit(char)) {
        digits.push(char);
        indexOf.push(cursor);
        cursor += 1;
        continue;
      }
      // A single separator continues the run only when a digit follows it directly.
      if (SEPARATORS.has(char) && isDigit(scan.charAt(cursor + 1))) {
        cursor += 1;
        continue;
      }
      break;
    }
    runs.push({ digits: digits.join(''), indexOf });
    index = cursor;
  }
  return runs;
}

/** NFC span of digits `[from, to)` of a run. */
export function spanOfDigits(view: ScanView, run: DigitRun, from: number, to: number): Span {
  const firstScan = run.indexOf[from];
  const lastScan = run.indexOf[to - 1];
  if (firstScan === undefined || lastScan === undefined) {
    throw new Error(`digit range [${String(from)}, ${String(to)}) is outside the run`);
  }
  return spanOfScanRange(view, firstScan, lastScan + 1);
}

/** NFC span of a whole run, separators included. */
export function spanOfRun(view: ScanView, run: DigitRun): Span {
  return spanOfDigits(view, run, 0, run.digits.length);
}
