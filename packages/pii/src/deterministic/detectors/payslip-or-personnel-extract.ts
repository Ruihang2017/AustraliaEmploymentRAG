/**
 * EVID-01 detector — pasted payslip or personnel-file extract (PRD §37.1 blocked row 6, *"payslip
 * content or personnel-file extract"*).
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width letters, digits and
 *                        punctuation folded to ASCII.
 * COVERED EVASIONS:      any spacing or line breaks between the markers; full-width forms;
 *                        zero-width characters inside a marker word; markers in any order or case.
 * NOT COVERED:           a payslip pasted as an image or a base64 blob; a payslip paraphrased in
 *                        prose without its markers; a single payslip line ("my gross was $1,200") —
 *                        that is an approximate wage fact, which PRD §37.1 ALLOWS.
 * FALSE-POSITIVE POSTURE:it is the STRUCTURE that is the disclosure, so the rule needs three
 *                        distinct payslip markers AND either a labelled employee identifier or two
 *                        currency amounts. A question that mentions superannuation and tax withheld
 *                        in prose does not reach three markers plus an identifier shape. The finding
 *                        spans the WHOLE field, because a payslip cannot be repaired span by span —
 *                        the customer is asked to describe the facts instead (PRD §34.9).
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { DigitRun } from '../digits.js';
import type { ScanView } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';
import { detectEmployeeOrPayrollIdIn } from './employee-or-payroll-id.js';

const MARKERS: readonly string[] = [
  'gross',
  'net pay',
  'ytd',
  'year to date',
  'superannuation',
  'super guarantee',
  'tax withheld',
  'payg',
  'allowances',
  'leave balance',
  'ordinary hours',
  'pay period',
];

const REQUIRED_MARKERS = 3;
const CURRENCY = '\\$\\s{0,2}\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?';

export const detectPayslipOrPersonnelExtractIn: Detector = (
  view: ScanView,
  runs: readonly DigitRun[],
): PiiFinding[] => {
  const lower = view.scan.toLowerCase();
  const present = MARKERS.filter((marker) => lower.includes(marker));
  if (present.length < REQUIRED_MARKERS) return [];

  const amounts = scanMatches(view, CURRENCY, '').length;
  const hasIdentifier = detectEmployeeOrPayrollIdIn(view, runs).length > 0;
  if (!hasIdentifier && amounts < 2) return [];

  if (view.nfc.length === 0) return [];
  return [
    findingAt(
      view,
      { start: 0, end: view.nfc.length },
      'PAYSLIP_OR_PERSONNEL_EXTRACT',
    ),
  ];
};

/** The ticket's public signature (deliverable 7). */
export const detectPayslipOrPersonnelExtract = asPublicDetector(detectPayslipOrPersonnelExtractIn);
