/**
 * EVID-01 detector — bank and card details (PRD §37.1 blocked row 4, "bank/card details").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width digits and Unicode
 *                        dashes folded; maximal digit runs with single separators for the card rule;
 *                        the BSB rule matches the scan text directly.
 * COVERED EVASIONS:      "4111 1111 1111 1111", "4111-1111-1111-1111", full-width digits, zero-width
 *                        characters between digits; "BSB 062-000 acct 12345678" and "062 000
 *                        12345678".
 * NOT COVERED:           an IBAN or SWIFT code; a card number split across two fields; a card number
 *                        written in words; a BSB alone (see the posture note); PayID email/phone
 *                        (those fire as email/phone instead).
 * FALSE-POSITIVE POSTURE:a LONE BSB is deliberately not a finding — it identifies a bank branch, not
 *                        a person, and blocking "our payroll runs through BSB 062-000" would block a
 *                        legitimate legal question. It becomes a finding only next to an account
 *                        number. Luhn on a 13-19 digit run passes by chance for about one number in
 *                        ten, so a long reference number can fire; the negative corpus carries
 *                        Luhn-invalid long references.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { DigitRun } from '../digits.js';
import { spanOfRun } from '../digits.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import { isValidLuhn } from './checksums.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

/** How many scan characters an account number may sit after a BSB and still be "adjacent". */
const BSB_ADJACENCY = 24;

const BSB = '\\b\\d{3}[- ]\\d{3}\\b';

export const detectBankOrCardIn: Detector = (
  view: ScanView,
  runs: readonly DigitRun[],
): PiiFinding[] => {
  const findings: PiiFinding[] = [];

  // (a) Luhn-valid card numbers.
  for (const run of runs) {
    const length = run.digits.length;
    if (length < 13 || length > 19) continue;
    if (!isValidLuhn(run.digits)) continue;
    findings.push(findingAt(view, spanOfRun(view, run), 'BANK_OR_CARD_DETAIL'));
  }

  // (b) A BSB adjacent to an account number, reported as one span covering both.
  for (const match of scanMatches(view, BSB, '')) {
    const bsbStart = match.index;
    if (bsbStart === undefined) continue;
    const bsbEnd = bsbStart + match[0].length;
    const tail = view.scan.slice(bsbEnd, bsbEnd + BSB_ADJACENCY);
    if (/[.!?\n]/.test(tail.split(/\d/)[0] ?? '')) continue;
    const account = /\d{6,10}(?!\d)/.exec(tail);
    if (!account || account.index === undefined) continue;
    const accountEnd = bsbEnd + account.index + account[0].length;
    findings.push(
      findingAt(view, spanOfScanRange(view, bsbStart, accountEnd), 'BANK_OR_CARD_DETAIL'),
    );
  }

  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectBankOrCard = asPublicDetector(detectBankOrCardIn);
