/**
 * EVID-01 detector — home address or precise private location (PRD §37.1 blocked row 2).
 *
 * WHY THIS EXISTS IN A TICKET WHOSE NON-GOALS EXCLUDE ENTITY RECOGNITION: it is a POSTCODE-ANCHORED
 * PATTERN, not a place recogniser. It has no gazetteer of suburbs and no notion of geography — it
 * matches "<number> <street words> <street type> ... <state> <4-digit postcode>". It ships here
 * because the ticket's `[fixture]` acceptance item requires every §37.1 "Blocked" row to have a
 * passing positive case; recognising an unanchored place name remains `EVID-02`'s.
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width letters, digits and
 *                        solidus folded to ASCII; Unicode dashes folded to '-'.
 * COVERED EVASIONS:      "Unit 4/12", "4/12", "12A", any comma/space punctuation between the street,
 *                        suburb, state and postcode; full-width forms; zero-width characters.
 * NOT COVERED:           an address with no state+postcode tail; a PO box; a suburb-only reference;
 *                        an address split across fields; a rural property name; GPS coordinates.
 * FALSE-POSITIVE POSTURE:the state+postcode anchor is what makes this safe. PRD §37.1 ALLOWS
 *                        *"State/territory and non-precise work location"*, so "the site is in NSW",
 *                        "Sydney metro", "a Victorian warehouse" and "the Brisbane office" cannot
 *                        fire — none has a street number, a street type AND a postcode. Each is a
 *                        negative corpus case.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

const STREET_TYPE =
  '(?:st|street|rd|road|ave|avenue|cres|crescent|ct|court|pl|place|dr|drive|tce|terrace|hwy|highway|ln|lane|pde|parade|way|close|cl)';
const STATE = '(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)';

/**
 * Every quantifier is bounded and the street-word group repeats at most four times, so the pattern
 * cannot backtrack catastrophically on hostile input (the limits stage caps the field at 8,000
 * characters first).
 */
const ADDRESS =
  `(?:[Uu]nit\\s{1,2})?\\d{1,5}[A-Za-z]?(?:\\s{0,2}[/-]\\s{0,2}\\d{1,5})?\\s{1,2}` +
  `(?:[A-Za-z'-]{2,20}\\s{1,2}){1,4}${STREET_TYPE}\\b` +
  `[,\\s]{1,3}(?:[A-Za-z'-]{2,20}[,\\s]{1,3}){0,3}${STATE}[,\\s]{1,3}\\d{4}(?!\\d)`;

export const detectAddressIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const match of scanMatches(view, ADDRESS, 'i')) {
    const start = match.index;
    if (start === undefined) continue;
    findings.push(
      findingAt(
        view,
        spanOfScanRange(view, start, start + match[0].length),
        'HOME_ADDRESS_OR_PRECISE_LOCATION',
      ),
    );
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectAddress = asPublicDetector(detectAddressIn);
