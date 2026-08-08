/**
 * EVID-01 detector — private social identifier (PRD §37.1 blocked row 3, *"private social
 * identifier"*).
 *
 * NORMALISATION APPLIED: NFC; zero-width and bidi controls dropped; full-width `@`, `.`, `/` and
 *                        Latin letters folded to ASCII.
 * COVERED EVASIONS:      "@handle" with full-width `@`; zero-width characters inside a handle;
 *                        profile URLs with or without scheme and "www."; trailing slashes and query
 *                        strings.
 * NOT COVERED:           a handle written without "@" ("find me on insta, janesmith"); a platform
 *                        this list does not name; a shortened URL that redirects to a profile; a
 *                        handle split across fields.
 * FALSE-POSITIVE POSTURE:a company page is NOT a finding — `linkedin.com/company/...` is public
 *                        business information, which PRD §37.1 ALLOWS, and it is a negative corpus
 *                        case. An email address is not double-reported as a handle: the `@` of an
 *                        email is preceded by its local part, which the lookbehind excludes.
 */
import type { PiiFinding } from '../../contract/finding.js';
import type { ScanView } from '../normalise.js';
import { spanOfScanRange } from '../normalise.js';
import type { Detector } from './shared.js';
import { asPublicDetector, findingAt, scanMatches } from './shared.js';

/** An `@handle` that is not the `@` of an email address. */
const HANDLE = '(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_.]{2,30}(?![A-Za-z0-9_.])';

/**
 * Personal profile URLs. `linkedin.com/company/` is deliberately absent — see the posture note.
 */
const PROFILE =
  '(?:https?://)?(?:www\\.)?(?:linkedin\\.com/in/|facebook\\.com/|instagram\\.com/|x\\.com/|twitter\\.com/|wa\\.me/|t\\.me/)[A-Za-z0-9._-]{2,40}';

export const detectSocialIdentifierIn: Detector = (view: ScanView): PiiFinding[] => {
  const findings: PiiFinding[] = [];
  for (const source of [PROFILE, HANDLE]) {
    for (const match of scanMatches(view, source, 'i')) {
      const start = match.index;
      if (start === undefined) continue;
      findings.push(
        findingAt(
          view,
          spanOfScanRange(view, start, start + match[0].length),
          'PRIVATE_SOCIAL_IDENTIFIER',
        ),
      );
    }
  }
  return findings;
};

/** The ticket's public signature (deliverable 7). */
export const detectSocialIdentifier = asPublicDetector(detectSocialIdentifierIn);
