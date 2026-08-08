/**
 * EVID-01 detector — driver licence number (PRD §37.1 blocked row 4, "licence number").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width letters and digits
 *                        folded to ASCII.
 * COVERED EVASIONS:      full-width forms, zero-width characters inside the number, any spacing or
 *                        punctuation between the context word and the number, lower-case prefixes.
 * NOT COVERED:           a licence number with no context word anywhere in the preceding 48
 *                        characters; a number written in words; an interstate format this table does
 *                        not name; a licence *expiry* or *class* (neither identifies a person on its
 *                        own).
 * FALSE-POSITIVE POSTURE:THE CONTEXT GATE IS THE DETECTOR. The state formats are far too loose to
 *                        fire unconditionally — VIC alone is 1-10 digits, which would match almost
 *                        every number in a legal question — so every jurisdiction pattern below
 *                        requires an explicit licence context word first. That is this detector's
 *                        main non-coverage and it is deliberate: PRD §37.1's allowed column protects
 *                        ordinary numeric facts (wage rates, hours, clause numbers), and a
 *                        context-free numeric licence rule would block them all.
 */
import type { PiiFinding } from '../../contract/finding.js';
import { deepFreeze } from '../../contract/freeze.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, hasContextBefore, scanMatches } from './shared.js';

const LICENCE_CONTEXT = [
  'licence',
  'license',
  'driver licence',
  'driver license',
  'drivers licence',
  'dl no',
  'licence no',
  'license no',
];

/**
 * The named jurisdiction formats. Named, per deliverable 7 (*"The state/territory licence formats,
 * each named"*), so a reviewer can check a format against the issuing authority rather than against
 * a regex soup.
 */
export const DRIVER_LICENCE_FORMATS = deepFreeze([
  { jurisdiction: 'NSW', pattern: '(?<![A-Za-z0-9])\\d{8}(?![A-Za-z0-9])' },
  { jurisdiction: 'NSW', pattern: '(?<![A-Za-z0-9])\\d{4}[A-Za-z]{2}(?![A-Za-z0-9])' },
  { jurisdiction: 'VIC', pattern: '(?<![A-Za-z0-9])\\d{6,10}(?![A-Za-z0-9])' },
  { jurisdiction: 'QLD', pattern: '(?<![A-Za-z0-9])\\d{8,9}(?![A-Za-z0-9])' },
  { jurisdiction: 'SA', pattern: '(?<![A-Za-z0-9])[A-Za-z]\\d{6}(?![A-Za-z0-9])' },
  { jurisdiction: 'WA', pattern: '(?<![A-Za-z0-9])\\d{7}(?![A-Za-z0-9])' },
  { jurisdiction: 'TAS', pattern: '(?<![A-Za-z0-9])[A-Za-z]{1,2}\\d{6}(?![A-Za-z0-9])' },
  { jurisdiction: 'NT', pattern: '(?<![A-Za-z0-9])\\d{6,7}(?![A-Za-z0-9])' },
  { jurisdiction: 'ACT', pattern: '(?<![A-Za-z0-9])\\d{6,8}(?![A-Za-z0-9])' },
]);

export const detectDriverLicenceIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const format of DRIVER_LICENCE_FORMATS) {
    for (const match of scanMatches(view, format.pattern, '')) {
      const start = match.index;
      if (start === undefined) continue;
      if (!hasContextBefore(view, start, LICENCE_CONTEXT)) continue;
      findings.push(
        findingAt(
          view,
          spanOfScanRange(view, start, start + match[0].length),
          'DRIVER_LICENCE_NUMBER',
        ),
      );
    }
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectDriverLicence = asPublicDetector(detectDriverLicenceIn);
