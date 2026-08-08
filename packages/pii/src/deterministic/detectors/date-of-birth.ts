/**
 * EVID-01 detector — exact date of birth (PRD §37.1 blocked row 5, *"Exact date of birth unless
 * public case material"*).
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width digits, Unicode
 *                        dashes and full-width solidus folded to ASCII.
 * COVERED EVASIONS:      "12/03/1990", "12-03-1990", "1990-03-12", "12 March 1990",
 *                        "March 12, 1990", full-width digits, zero-width characters inside the date.
 * NOT COVERED:           a date written entirely in words ("the twelfth of March nineteen ninety");
 *                        a date with no birth context word within 48 characters; a two-digit year;
 *                        a birth date given as an age plus a reference date.
 * FALSE-POSITIVE POSTURE:AN AGE BAND IS NOT A FINDING. PRD §37.1's allowed column has *"Age band
 *                        where legally relevant"*, so "aged 30-39", "in her 40s" and "over 55" are
 *                        negative corpus cases and this detector cannot fire on them: it matches a
 *                        DATE, and only when a birth context word precedes it. An award commencement
 *                        date, a dismissal date and a hearing date all have dates but no birth
 *                        context, and are negative cases too.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, hasContextBefore, scanMatches } from './shared.js';

const BIRTH_CONTEXT = ['born', 'dob', 'd.o.b', 'date of birth', 'birthdate', 'birth date', 'birthday'];

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const PATTERNS: readonly string[] = [
  '(?<!\\d)\\d{1,2}[/-]\\d{1,2}[/-]\\d{4}(?!\\d)',
  '(?<!\\d)\\d{4}-\\d{1,2}-\\d{1,2}(?!\\d)',
  `(?<![A-Za-z0-9])\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\s+\\d{4}(?!\\d)`,
  `(?<![A-Za-z0-9])${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}(?!\\d)`,
];

export const detectDateOfBirthIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const source of PATTERNS) {
    for (const match of scanMatches(view, source, 'i')) {
      const start = match.index;
      if (start === undefined) continue;
      if (!hasContextBefore(view, start, BIRTH_CONTEXT)) continue;
      findings.push(
        findingAt(
          view,
          spanOfScanRange(view, start, start + match[0].length),
          'EXACT_DATE_OF_BIRTH',
        ),
      );
    }
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectDateOfBirth = asPublicDetector(detectDateOfBirthIn);
