/**
 * EVID-01 detector — Australian Tax File Number (PRD §37.1 blocked row 4, "TFN").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width digits, non-breaking
 *                        spaces and Unicode dashes folded to ASCII; digits grouped into maximal runs
 *                        that may contain single ' ', '-', '.' or '/' separators.
 * COVERED EVASIONS:      "123 456 789", "123-456-789", "123.456.789", full-width digits,
 *                        zero-width characters inserted between digits, soft hyphens, mixed forms.
 * NOT COVERED:           a TFN spelled in words ("one two three ..."), a TFN split across two fields,
 *                        a TFN embedded in a longer digit run (deliberate — see the maximality note
 *                        in digits.ts), base64/hex encodings of a TFN.
 * FALSE-POSITIVE POSTURE:only a run of EXACTLY nine digits passing the ATO mod-11 check fires
 *                        unconditionally. Roughly one nine-digit number in eleven passes by chance,
 *                        so a nine-digit invoice or reference number can still fire; the negative
 *                        corpus carries checksum-invalid nine-digit references, and the remedy for a
 *                        new false positive is a corpus case plus a narrower rule, never an override
 *                        (PRD §37.2, sub-PRD D2).
 *
 * The second rule is deliverable 7's: *"a number that fails the checksum is still reported when it
 * appears in an explicit TFN context"*. Fail closed — a customer who writes "my TFN is 123456780"
 * has disclosed a TFN whether or not they typed it correctly.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { DigitRun } from '../digits.js';
import { spanOfRun } from '../digits.js';
import type { ScanView } from '../normalise.js';
import { isValidTfn } from './checksums.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, hasContextBefore } from './shared.js';

const TFN_CONTEXT = ['tfn', 'tax file number', 'tax file no'];

export const detectTfnIn: Detector = (view: ScanView, runs: readonly DigitRun[]): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const run of runs) {
    const length = run.digits.length;
    if (length !== 8 && length !== 9) continue;
    const checksumValid = length === 9 && isValidTfn(run.digits);
    const firstScanIndex = run.indexOf[0];
    const inContext =
      firstScanIndex !== undefined && hasContextBefore(view, firstScanIndex, TFN_CONTEXT);
    if (!checksumValid && !inContext) continue;
    findings.push(findingAt(view, spanOfRun(view, run), 'TAX_FILE_NUMBER'));
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectTfn = asPublicDetector(detectTfnIn);
