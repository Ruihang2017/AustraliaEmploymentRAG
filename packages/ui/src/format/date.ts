/**
 * The PRD §41.1 date rule as one helper: "dates display unambiguously as `3 Aug 2026` in UI while
 * APIs use ISO format".
 *
 * DISPLAY ONLY. Nothing in this module mutates or reformats a value bound for an API — this package
 * sends nothing anywhere, and every component that receives an ISO string passes that exact string
 * through to its props and its `datetime` attributes. `formatLegalDate` produces a NEW string for
 * human eyes; the input is never rewritten.
 *
 * `Intl.DateTimeFormat` is deliberately NOT used: locale data, the choice of a narrow no-break space
 * before the year, and month abbreviations all vary by ICU build, and the acceptance asserts an exact
 * string. An explicit twelve-entry month table over the UTC parts is reproducible everywhere.
 *
 * UTC, always. A `LegalDate` of `2026-08-03` read through local-time parts renders `2 Aug 2026` for
 * anyone west of UTC — a legal effective date off by a day is a correctness defect, not a nicety.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Thrown instead of rendering the string `Invalid Date` into a legal interface. */
export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`formatLegalDate: "${value}" is not an ISO 8601 date or date-time`);
    this.name = 'InvalidDateError';
  }
}

/**
 * True for an ISO 8601 calendar date (`YYYY-MM-DD`) or date-time that names a real day.
 *
 * The regular expression rejects the shapes `Date.parse` accepts by accident (`3 Aug 2026`,
 * `2026/08/03`); the round-trip rejects the calendar-invalid ones the expression cannot
 * (`2026-02-30`).
 */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(
    value,
  );
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);
  return (
    Number.isFinite(utc) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * `2026-08-03` → `3 Aug 2026`. Day without a leading zero, three-letter month, four-digit year,
 * plain ASCII spaces.
 *
 * @throws {InvalidDateError} when `iso` is not an ISO 8601 date or date-time naming a real day.
 */
export function formatLegalDate(iso: string): string {
  if (!isIsoDate(iso)) throw new InvalidDateError(iso);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const name = MONTHS[month - 1];
  /* istanbul ignore next — unreachable: isIsoDate has already bounded `month` to 1..12. */
  if (name === undefined) throw new InvalidDateError(iso);
  return `${day} ${name} ${year}`;
}

/**
 * An effective interval as one display string: `3 Aug 2026 – current` when open-ended.
 *
 * `null` and `undefined` both mean "no end recorded"; the generated `Citation.effective_to` is
 * `null | string`.
 */
export function formatEffectiveInterval(from: string, to: string | null | undefined): string {
  const end = to === null || to === undefined || to === '' ? 'current' : formatLegalDate(to);
  return `${formatLegalDate(from)} – ${end}`;
}
