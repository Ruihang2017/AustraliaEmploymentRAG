/**
 * EVID-01 detector — personal email address (PRD §37.1 blocked row 3, "Personal email").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width `@`, `.` and Latin
 *                        letters folded to ASCII; no-break spaces folded to ordinary spaces.
 * COVERED EVASIONS:      "user @ example.com", "user(at)example(dot)com", "user [at] example [dot]
 *                        com", "user at example dot com", full-width forms, zero-width characters
 *                        inside the address, soft hyphens.
 * NOT COVERED:           an address written entirely in words ("jay dot smith at gmail"), an address
 *                        split across two fields, an address with the local part reversed, or a
 *                        mailto: URL with percent-encoding.
 * FALSE-POSITIVE POSTURE:a bare domain ("fairwork.gov.au") does not fire — an `@`-equivalent is
 *                        required — and neither does a citation or a URL. The detector cannot tell a
 *                        personal address from a business one and does not try: PRD §37.1's blocked
 *                        row says "Personal email", and the safe reading for a boundary that must
 *                        fail closed is to treat any address as personal. The remedy for a business
 *                        address a customer needs to quote is the structured channel, not an
 *                        override.
 *
 * REGEX SHAPE (ReDoS): every quantifier is bounded and no quantifier is nested inside another
 * quantifier's group, because this pattern runs on hostile input by definition. The limits stage
 * caps a field at 8,000 characters before this ever runs.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

const AT = '(?:\\s{0,2}@\\s{0,2}|\\s{0,2}\\(at\\)\\s{0,2}|\\s{0,2}\\[at\\]\\s{0,2}|\\sat\\s)';
const DOT = '(?:\\s{0,2}\\.\\s{0,2}|\\s{0,2}\\(dot\\)\\s{0,2}|\\s{0,2}\\[dot\\]\\s{0,2}|\\sdot\\s)';
const LOCAL = '(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}';
const LABEL = '[A-Za-z0-9-]{1,63}';
const TLD = '[A-Za-z]{2,24}(?![A-Za-z0-9-])';

const EMAIL = `${LOCAL}${AT}${LABEL}(?:${DOT}${LABEL}){0,3}${DOT}${TLD}`;

export const detectEmailIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const match of scanMatches(view, EMAIL, 'i')) {
    const start = match.index;
    if (start === undefined) continue;
    findings.push(
      findingAt(
        view,
        spanOfScanRange(view, start, start + match[0].length),
        'PRIVATE_CONTACT_EMAIL',
      ),
    );
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectEmail = asPublicDetector(detectEmailIn);
