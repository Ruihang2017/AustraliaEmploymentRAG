/**
 * EVID-01 detector — private contact phone number (PRD §37.1 blocked row 3, "phone").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width digits, no-break
 *                        spaces and Unicode dashes folded to ASCII.
 * COVERED EVASIONS:      "0412 345 678", "0412-345-678", "+61 412 345 678", "+61412345678",
 *                        "(02) 9876 5432", "02 9876 5432", full-width digits, zero-width characters
 *                        between digits.
 * NOT COVERED:           an international number outside +61; a number written in words; a number
 *                        split across fields; an extension notation ("x 1234"); "0412.345.678" with
 *                        full stops (a full stop separates sentences far more often than digits, and
 *                        accepting it here would fire on version strings).
 * FALSE-POSITIVE POSTURE:13, 1300 and 1800 numbers are EXCLUDED. They are published business lines —
 *                        the Fair Work Infoline is 13 13 94 — and blocking one would block a
 *                        legitimate legal question, which PRD §37.1's allowed column protects. A
 *                        negative corpus case covers each. ABNs and TFNs are excluded structurally:
 *                        an AU phone number starts 0 or +61 and is 9-10 digits.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

/**
 * `0` or `+61`, then an area/mobile prefix digit 2-8 (which excludes 13/1300/1800 by construction),
 * then eight more digits with optional single spaces or hyphens.
 */
const PLAIN = '(?<![\\d+])(?:\\+61[ -]?|0)[2-478](?:[ -]?\\d){8}(?!\\d)';
const PARENTHESISED = '\\(0[2-8]\\)[ -]?\\d{4}[ -]?\\d{4}(?!\\d)';

export const detectPhoneIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const source of [PLAIN, PARENTHESISED]) {
    for (const match of scanMatches(view, source, '')) {
      const start = match.index;
      if (start === undefined) continue;
      findings.push(
        findingAt(
          view,
          spanOfScanRange(view, start, start + match[0].length),
          'PRIVATE_CONTACT_PHONE',
        ),
      );
    }
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectPhone = asPublicDetector(detectPhoneIn);
