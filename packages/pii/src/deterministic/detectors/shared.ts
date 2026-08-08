/**
 * EVID-01 — the pieces every detector shares: the two signatures, the finding constructor and the
 * context-window rule.
 *
 * TWO SIGNATURES, ONE IMPLEMENTATION. The ticket fixes the public detector signature as
 * `(fieldName, value) => PiiFinding[]`. Building a `ScanView` and the digit runs per detector would
 * mean normalising a field fourteen times per request, so the internal signature takes the
 * pre-computed view and runs (the stage builds them once per field) and `asPublicDetector` wraps it
 * back into the ticket's shape. Both forms are exercised by the tests, and both go through exactly
 * the same code.
 *
 * NO MODULE-SCOPE `g`/`y` REGEX ANYWHERE IN THIS PACKAGE. A `RegExp` with the global or sticky flag
 * carries a mutable `lastIndex`; sharing one across concurrent requests in `apps/api` makes a
 * detector skip a match — and a skipped match here is an admitted PII payload, i.e. a silent
 * fail-open. Every global regex is therefore constructed inside the function that uses it, and
 * `test/contract/purity.test.ts` scans `src/**` for the pattern.
 */
import type { PiiCategory } from '../../contract/category.js';
import type { PiiFinding, PiiSeverity } from '../../contract/finding.js';
import type { DigitRun } from '../digits.js';
import { digitRuns } from '../digits.js';
import type { ScanView, Span } from '../normalise.js';
import { normaliseForScan } from '../normalise.js';
import { PII_PLACEHOLDERS } from '../placeholders.js';

/** The internal detector signature: a pre-normalised field. */
export type Detector = (view: ScanView, runs: readonly DigitRun[]) => PiiFinding[];

/** The ticket's public detector signature (deliverable 7). */
export type PublicDetector = (fieldName: string, value: string) => PiiFinding[];

export function asPublicDetector(detect: Detector): PublicDetector {
  return (fieldName: string, value: string): PiiFinding[] => {
    const view = normaliseForScan(fieldName, value);
    return detect(view, digitRuns(view));
  };
}

export function findingAt(
  view: ScanView,
  span: Span,
  category: PiiCategory,
  severity: PiiSeverity = 'BLOCKING',
): PiiFinding {
  return {
    field: view.field,
    start: span.start,
    end: span.end,
    category,
    severity,
    suggestedPlaceholder: PII_PLACEHOLDERS[category],
  };
}

/** How many `scan` characters before a span a context term may appear in. */
export const CONTEXT_WINDOW = 48;

/**
 * Whether any of `terms` (lower-case) appears in the `window` scan characters immediately before
 * `scanIndex`, not crossing a sentence boundary.
 *
 * Defined once and tested once, because a context gate is what makes the loose patterns (driver
 * licence, passport, date of birth) usable at all: without it they would fire on invoice numbers and
 * award clause dates, and PRD §37.2's remedy for a false positive is a narrower pattern, never an
 * override.
 *
 * A sentence boundary is a newline, `!`, `?`, or a full stop FOLLOWED BY WHITESPACE — the last
 * qualification is what keeps `d.o.b` working as a context term.
 */
export function hasContextBefore(
  view: ScanView,
  scanIndex: number,
  terms: readonly string[],
  window: number = CONTEXT_WINDOW,
): boolean {
  const from = Math.max(0, scanIndex - window);
  let text = view.scan.slice(from, scanIndex);
  let cut = -1;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '\n' || char === '!' || char === '?') cut = i;
    else if (char === '.' && /\s/.test(text.charAt(i + 1))) cut = i;
  }
  if (cut >= 0) text = text.slice(cut + 1);
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

/** Every match of `source` over the scan text. The regex is built here, never shared (see the header). */
export function scanMatches(view: ScanView, source: string, flags: string): RegExpMatchArray[] {
  return [...view.scan.matchAll(new RegExp(source, `${flags}g`))];
}
