/**
 * FND-10 — legal dates as `YYYY-MM-DD` strings (PRD §34.1, §35.1).
 *
 * PRD §35.1: legal dates are `TEXT` with `YYYY-MM-DD` checks. Ticket deliverable 9: *"All dates are
 * `YYYY-MM-DD` legal dates, never `Date` objects with a timezone."* A `Date` is a UTC instant with
 * local-timezone rendering; a legal date is a calendar day in a jurisdiction's own reckoning, and the
 * two differ by up to a day at exactly the boundaries (30 June / 1 July) that PRD §6.6 and `UAT-SRCH-03`
 * exist to test. So this module does string arithmetic and constructs no `Date` anywhere.
 *
 * `LegalDate` is deliberately NOT branded: FND-03's `Id` brand is for opaque identifiers, and a brand
 * here would force every caller — including the JSON fixtures — through a constructor for a value the
 * PRD models as plain text.
 */

/** A legal date in `YYYY-MM-DD` form (PRD §35.1). Validate with `isLegalDate` before trusting one. */
export type LegalDate = string;

/** Shape only. A well-formed shape is not yet a real calendar day — see `isLegalDate`. */
const LEGAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UTC ISO-8601 timestamp shape (PRD §35.1 stores `retrieved_at` / `recorded_at` as UTC ISO text).
 * Shape only: no parsing, no timezone maths, no `Date`.
 */
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Length of each Gregorian month, February in its common-year length. Not exported: an internal table. */
const DAYS_IN_MONTH: readonly number[] = Object.freeze([
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
]);

/** Proleptic Gregorian leap rule, computed arithmetically — no `Date`, which would parse `2025-02-30`. */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * The `{year, month, day}` of a well-formed legal date, or `null`. Internal to the leaf but exported
 * because `financial-year.ts` needs the month without re-implementing the parse.
 *
 * Total: never throws, whatever crosses the API boundary into it.
 */
export function parseLegalDate(
  value: unknown,
): { readonly year: number; readonly month: number; readonly day: number } | null {
  if (typeof value !== 'string' || !LEGAL_DATE_PATTERN.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > DAYS_IN_MONTH.length) return null;
  const nominal = DAYS_IN_MONTH[month - 1];
  if (nominal === undefined) return null;
  const limit = month === 2 && isLeapYear(year) ? nominal + 1 : nominal;
  if (day < 1 || day > limit) return null;
  return { year, month, day };
}

/**
 * `true` only for a real calendar day in `YYYY-MM-DD` form. `2024-02-29` is valid; `2025-02-29` and
 * `2025-02-30` are not — a regex-only check would admit both, and a `Date`-based check would silently
 * roll `2025-02-30` forward to 2 March.
 */
export function isLegalDate(value: unknown): value is LegalDate {
  return parseLegalDate(value) !== null;
}

/**
 * Orders two legal dates.
 *
 * Plain lexicographic comparison is CORRECT here and is not a shortcut to be "improved" into date
 * arithmetic: `YYYY-MM-DD` is fixed-width and zero-padded with the components in most-significant
 * order, so byte order and calendar order coincide for every value `isLegalDate` accepts.
 *
 * Callers must validate first; comparing a malformed value is meaningless, so every caller in this
 * leaf guards with `isLegalDate` and fails closed rather than passing junk through.
 */
export function compareLegalDate(a: LegalDate, b: LegalDate): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Shape check for the §35.1 UTC ISO text stamps (`retrieved_at`, `recorded_at`). Regex only. */
export function isIsoTimestamp(value: unknown): boolean {
  return typeof value === 'string' && ISO_TIMESTAMP_PATTERN.test(value);
}
