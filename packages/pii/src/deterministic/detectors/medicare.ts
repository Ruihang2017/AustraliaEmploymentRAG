/**
 * EVID-01 detector — Medicare card number (PRD §37.1 blocked row 4, "Medicare").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width digits, non-breaking
 *                        spaces and Unicode dashes folded; maximal digit runs with single separators.
 * COVERED EVASIONS:      "2123 45670 1", "2123-45670-1", full-width digits, zero-width characters
 *                        between digits, soft hyphens.
 * NOT COVERED:           a number written in words; a card number split across fields; the card
 *                        holder's name (that is `labelled-name.ts` / `EVID-02`).
 * FALSE-POSITIVE POSTURE:requires the leading digit 2-6 AND the published check digit AND a run of
 *                        exactly 10 or 11 digits, so an ordinary ten-digit reference is very unlikely
 *                        to fire. A valid ELEVEN-digit ABN can occasionally satisfy the check; the
 *                        module fails closed there (blocking wins) and the supported channel for a
 *                        public ABN is `structured.abn` — see abn.ts.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { DigitRun } from '../digits.js';
import { spanOfRun } from '../digits.js';
import type { ScanView } from '../normalise.js';
import { isValidMedicare } from './checksums.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt } from './shared.js';

export const detectMedicareIn: Detector = (
  view: ScanView,
  runs: readonly DigitRun[],
): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const run of runs) {
    const length = run.digits.length;
    if (length !== 10 && length !== 11) continue;
    if (!isValidMedicare(run.digits)) continue;
    findings.push(findingAt(view, spanOfRun(view, run), 'MEDICARE_NUMBER'));
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectMedicare = asPublicDetector(detectMedicareIn);
