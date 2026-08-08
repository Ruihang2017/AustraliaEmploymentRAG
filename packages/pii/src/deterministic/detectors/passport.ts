/**
 * EVID-01 detector — passport number (PRD §37.1 blocked row 4, "passport").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width Latin letters and
 *                        digits folded to ASCII.
 * COVERED EVASIONS:      full-width forms, zero-width characters inside the number, a lower-case
 *                        prefix, "passport no: N1234567" written with any spacing.
 * NOT COVERED:           a non-Australian passport format; a number written in words; a number split
 *                        across fields; an MRZ line.
 * FALSE-POSITIVE POSTURE:a BARE one-letter-plus-seven-digits token ("N1234567") is not a finding
 *                        without an explicit passport context, because that shape is also an
 *                        ordinary reference number. Two letters plus seven digits ("PA1234567") is
 *                        distinctive enough to fire on its own. This is the documented main
 *                        non-coverage: a bare single-letter passport number in a field with no
 *                        context word is missed, and that is the deliberate trade against blocking
 *                        every reference number in the corpus.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, hasContextBefore, scanMatches } from './shared.js';

const PASSPORT_CONTEXT = ['passport'];
const TWO_LETTER = '(?<![A-Za-z0-9])[A-Za-z]{2}\\d{7}(?![A-Za-z0-9])';
const ONE_LETTER = '(?<![A-Za-z0-9])[A-Za-z]\\d{7}(?![A-Za-z0-9])';

export const detectPassportIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  const emit = (start: number, length: number): void => {
    findings.push(
      findingAt(view, spanOfScanRange(view, start, start + length), 'PASSPORT_NUMBER'),
    );
  };

  for (const match of scanMatches(view, TWO_LETTER, '')) {
    if (match.index !== undefined) emit(match.index, match[0].length);
  }
  for (const match of scanMatches(view, ONE_LETTER, '')) {
    const start = match.index;
    if (start === undefined) continue;
    if (!hasContextBefore(view, start, PASSPORT_CONTEXT)) continue;
    emit(start, match[0].length);
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectPassport = asPublicDetector(detectPassportIn);
