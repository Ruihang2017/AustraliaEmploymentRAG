/**
 * EVID-01 detector — employee/payroll identifier (PRD §37.1 blocked row 6, "Employee/payroll ID").
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width letters, digits and
 *                        punctuation folded to ASCII.
 * COVERED EVASIONS:      "employee no 12345", "Employee No. 12345", "payroll id: E-12345",
 *                        "staff number = 12345", "emp # 12345", full-width forms, zero-width
 *                        characters inside the identifier.
 * NOT COVERED:           an unlabelled identifier (a bare "E-12345" is indistinguishable from a
 *                        clause reference); an identifier introduced by a label this list does not
 *                        name; an identifier written in words.
 * FALSE-POSITIVE POSTURE:the label is mandatory, so "the employee worked 12345 minutes" cannot fire
 *                        (no "no/number/id/#" token). THE FINDING SPANS THE IDENTIFIER ONLY, never
 *                        the label: replacing the span with the placeholder must leave a readable
 *                        sentence, because PRD §34.9 asks the CUSTOMER to paste the placeholder in.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

/** The identifier is group 1; `d` (hasIndices) gives its exact scan span without re-searching. */
const LABELLED_ID =
  '(?:employee|payroll|staff|emp)\\s{0,3}(?:no\\.?|number|id|ident(?:ifier)?|#)\\s{0,3}[:=]?\\s{0,3}([A-Za-z0-9][A-Za-z0-9-]{1,19})(?![A-Za-z0-9-])';

export const detectEmployeeOrPayrollIdIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const match of scanMatches(view, LABELLED_ID, 'id')) {
    const indices = match.indices?.[1];
    if (!indices) continue;
    const [start, end] = indices;
    findings.push(
      findingAt(view, spanOfScanRange(view, start, end), 'EMPLOYEE_OR_PAYROLL_IDENTIFIER'),
    );
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectEmployeeOrPayrollId = asPublicDetector(detectEmployeeOrPayrollIdIn);
