/**
 * EVID-01 detector — a labelled employee or private individual name (PRD §37.1 blocked row 1,
 * *"Employee or private individual name"*).
 *
 * WHY THIS EXISTS IN A TICKET WHOSE NON-GOALS EXCLUDE ENTITY RECOGNITION. It is not a recogniser: it
 * has no gazetteer, no model and no notion of what a name is. It matches a PERSON-LABEL followed by
 * capitalised tokens — a deterministic pattern with a context gate, exactly like `passport.ts` and
 * `driver-licence.ts`. It ships here because the ticket's `[fixture]` acceptance item requires every
 * §37.1 "Blocked" row to have at least one passing positive case, and deliverable 7's table is a
 * MINIMUM ("Required detectors"). Real name recognition — an unlabelled name in prose — remains
 * `EVID-02`'s, and that is this detector's documented non-coverage.
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width letters folded; curly
 *                        apostrophes folded to ASCII.
 * COVERED EVASIONS:      any spacing or punctuation between the label and the name; full-width
 *                        letters; zero-width characters inside the name; one to three name tokens;
 *                        hyphenated and apostrophed surnames.
 * NOT COVERED:           an UNLABELLED name in prose ("I spoke to Jane Smith about it") — `EVID-02`;
 *                        an all-lower-case name; an ALL-UPPER-CASE label ("EMPLOYEE NAME:"); a name
 *                        in a non-Latin script; a mononym; a name introduced by a label this list
 *                        does not name.
 * FALSE-POSITIVE POSTURE:the label list is deliberately PERSON-specific: "employer name" is NOT in
 *                        it, because PRD §37.1 ALLOWS a public employer name and blocking it would
 *                        break the product's main use case. A captured name that looks like an
 *                        organisation (Pty/Ltd/Limited/Inc/Group/Council/Commission/Corporation) is
 *                        dropped, and so are the §37.1 allowed placeholders themselves —
 *                        "Employee A", "the worker", "the applicant".
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

/**
 * Person labels only. Adding "employer name" here would block a PRD §37.1 allowed value.
 *
 * Written with explicit case classes rather than the `i` flag: the NAME pattern below is
 * case-SENSITIVE (the capitals are the whole signal), and one flag governs the whole regex. An
 * all-upper-case label ("EMPLOYEE NAME:") is therefore not matched — listed under NOT COVERED.
 */
const LABEL =
  "(?:[Mm]y name is|[Ee]mployee(?:'s)? name|[Ww]orker(?:'s)? name|[Ff]ull name|[Ss]taff member(?:'s)? name|[Nn]ame of the (?:employee|worker)|[Cc]lient(?:'s)? name)" +
  '(?:\\s{1,2}(?:is|was))?\\s{0,3}[:=-]?\\s{0,3}';

/**
 * One to three capitalised tokens. Case-SENSITIVE on purpose: the capitals are the signal. Internal
 * capitals are allowed so "O-Connor", "McDonald" and "van Der Berg"-style surnames are captured
 * whole rather than truncated at the second capital — a truncated span is a wrong span shown to a
 * customer.
 */
const NAME = "[A-Z][A-Za-z'-]{1,20}(?:\\s[A-Z][A-Za-z'-]{1,20}){0,2}";

/** PRD §37.1 allowed column: *"'Employee A', 'the worker', synthetic placeholders"*. */
const ALLOWED_PLACEHOLDER = /^(?:Employee|Worker|Person|Individual|Staff|Applicant)(?:\s[A-Z])?$/;
const ORGANISATION = /\b(?:Pty|Ltd|Limited|Inc|Group|Council|Commission|Corporation|Services)$/;

export const detectLabelledNameIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  // Flags: `d` (hasIndices) ONLY. An `i` here would make `[A-Z]` match a lower-case letter and the
  // detector would swallow the words after the name — the capitals are the entire signal.
  for (const match of scanMatches(view, `${LABEL}(${NAME})`, 'd')) {
    const indices = match.indices?.[1];
    const captured = match[1];
    if (!indices || captured === undefined) continue;
    if (ALLOWED_PLACEHOLDER.test(captured) || ORGANISATION.test(captured)) continue;
    const [start, end] = indices;
    findings.push(
      findingAt(view, spanOfScanRange(view, start, end), 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME'),
    );
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectLabelledName = asPublicDetector(detectLabelledNameIn);
