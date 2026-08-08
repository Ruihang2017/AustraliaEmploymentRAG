/**
 * EVID-01 deliverable 8 — the suggested replacements PRD §37.2 requires a detection response to
 * carry, and PRD §34.9 asks the customer to paste in (*"Replace indicated spans with anonymous
 * placeholders"*).
 *
 * Drawn from PRD §37.1's ALLOWED column wherever the row provides one: *"Employee A"*, *"the
 * worker"*, *"State/territory and non-precise work location"*, *"Age band where legally relevant"*.
 * The remaining categories get an explicit removal marker rather than a plausible-looking fake, so a
 * customer can see what was taken out and a downstream reader can never mistake a placeholder for
 * real data.
 *
 * Typed `Record<PiiCategory, string>`, so a new category without a placeholder is a compile error,
 * and asserted key-set-identical to `PII_CATEGORY_VALUES` at runtime by
 * `test/deterministic/placeholders.test.ts` (both directions).
 */
import type { PiiCategory } from '../contract/category.js';
import { deepFreeze } from '../contract/freeze.js';

export const PII_PLACEHOLDERS: Readonly<Record<PiiCategory, string>> = deepFreeze({
  /** PRD §37.1 allowed column: *"'Employee A', 'the worker', synthetic placeholders"*. */
  EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME: 'Employee A',
  PRIVATE_CONTACT_EMAIL: '[EMAIL REMOVED]',
  PRIVATE_CONTACT_PHONE: '[PHONE REMOVED]',
  PRIVATE_SOCIAL_IDENTIFIER: '[SOCIAL HANDLE REMOVED]',
  /** PRD §37.1 allowed column: *"State/territory and non-precise work location"*. */
  HOME_ADDRESS_OR_PRECISE_LOCATION: '[STATE OR TERRITORY]',
  TAX_FILE_NUMBER: '[TFN REMOVED]',
  BANK_OR_CARD_DETAIL: '[BANK DETAILS REMOVED]',
  MEDICARE_NUMBER: '[MEDICARE NUMBER REMOVED]',
  PASSPORT_NUMBER: '[PASSPORT NUMBER REMOVED]',
  DRIVER_LICENCE_NUMBER: '[LICENCE NUMBER REMOVED]',
  EMPLOYEE_OR_PAYROLL_IDENTIFIER: '[EMPLOYEE ID REMOVED]',
  PAYSLIP_OR_PERSONNEL_EXTRACT: '[PAYSLIP CONTENT REMOVED]',
  /** PRD §37.1 allowed column: *"Age band where legally relevant"*. */
  EXACT_DATE_OF_BIRTH: '[AGE BAND]',
  /** PRD §37.1 allowed column: *"the worker"*. */
  IDENTIFYING_COMBINATION: 'the worker',
  /** Not a §37.1 row: the admission-limit outcome asks for a smaller request, not a replacement. */
  REQUEST_LIMIT_EXCEEDED: '[SHORTEN OR SPLIT THE REQUEST]',
});
