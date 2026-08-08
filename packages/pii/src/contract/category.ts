/**
 * EVID-01 deliverable 3 — the PRD §37.1 blocked-category vocabulary.
 *
 * Shaped exactly like a `FND-03` enum family (`<FAMILY>_VALUES` frozen tuple + derived union +
 * `is<Family>` guard) so that promoting it into `packages/contracts` once Q-EVID-6 is settled is a
 * file move, not a rename. `packages/contracts` is PRD §44.3 serial-owned by `00-foundation`, so this
 * module owns the vocabulary locally in the meantime — see docs/prd/12-evidence-safety/README.md
 * Q-EVID-6.
 *
 * Every member below quotes the PRD §37.1 "Blocked" row it comes from, with ONE documented exception
 * (`REQUEST_LIMIT_EXCEEDED`, see its comment). Removing a member, or narrowing what it covers, is a
 * PRD §45.5 product change, not a refactor: PRD §10.1 makes the blocked list absolute and only the
 * *recall target* (Q-EVID-2) is a tuning parameter.
 */
import { deepFreeze } from './freeze.js';

export const PII_CATEGORY_VALUES = deepFreeze([
  /** §37.1 blocked row 1 — "Employee or private individual name". */
  'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
  /** §37.1 blocked row 3 — "Personal email, phone or private social identifier" (the email third). */
  'PRIVATE_CONTACT_EMAIL',
  /** §37.1 blocked row 3 — "Personal email, phone or private social identifier" (the phone third). */
  'PRIVATE_CONTACT_PHONE',
  /** §37.1 blocked row 3 — "Personal email, phone or private social identifier" (the social third). */
  'PRIVATE_SOCIAL_IDENTIFIER',
  /** §37.1 blocked row 2 — "Home address or precise private location". */
  'HOME_ADDRESS_OR_PRECISE_LOCATION',
  /** §37.1 blocked row 4 — "TFN, bank/card details, Medicare/passport/licence number" (TFN). */
  'TAX_FILE_NUMBER',
  /** §37.1 blocked row 4 — "TFN, bank/card details, …" (bank and card details). */
  'BANK_OR_CARD_DETAIL',
  /** §37.1 blocked row 4 — "… Medicare/passport/licence number" (Medicare). */
  'MEDICARE_NUMBER',
  /** §37.1 blocked row 4 — "… Medicare/passport/licence number" (passport). */
  'PASSPORT_NUMBER',
  /** §37.1 blocked row 4 — "… Medicare/passport/licence number" (driver licence). */
  'DRIVER_LICENCE_NUMBER',
  /** §37.1 blocked row 6 — "Employee/payroll ID, payslip content or personnel-file extract" (the ID). */
  'EMPLOYEE_OR_PAYROLL_IDENTIFIER',
  /** §37.1 blocked row 6 — "… payslip content or personnel-file extract" (the pasted document). */
  'PAYSLIP_OR_PERSONNEL_EXTRACT',
  /** §37.1 blocked row 5 — "Exact date of birth unless public case material". */
  'EXACT_DATE_OF_BIRTH',
  /** §37.1 blocked row 7 — "Identifying combination of rare role + tiny workplace + personal event". */
  'IDENTIFYING_COMBINATION',
  /**
   * NOT a §37.1 row. The admission-limit outcome required by deliverable 6: PRD §37.2 puts "request
   * byte/field limits" before any scanning, and deliverable 6 makes exceeding a limit a `REJECT`
   * *with a limit finding* — but `PiiFinding.category` is a `PiiCategory` and the result shape
   * (deliverable 4) has no other channel, so a limit rejection would otherwise be unrepresentable.
   *
   * It names no PII category, it says nothing about the content of the request, and it is excluded
   * from the §37.1 recall table (the recall report reports it separately). Added by the EVID-01
   * ticket amendment §0.1; carried into Q-EVID-6 so the promotion of this vocabulary into
   * `packages/contracts` inherits the decision rather than rediscovering it.
   */
  'REQUEST_LIMIT_EXCEEDED',
] as const);

export type PiiCategory = (typeof PII_CATEGORY_VALUES)[number];

/** Runtime guard. Accepts only the members above; any other value, of any type, is `false`. */
export const isPiiCategory = (value: unknown): value is PiiCategory =>
  typeof value === 'string' && (PII_CATEGORY_VALUES as readonly string[]).includes(value);

/**
 * The one member that is not a PRD §37.1 blocked row. Kept as a named constant so the recall report,
 * the corpus loader and the category test all exclude the same thing.
 */
export const NON_PRD_CATEGORY: PiiCategory = 'REQUEST_LIMIT_EXCEEDED';
