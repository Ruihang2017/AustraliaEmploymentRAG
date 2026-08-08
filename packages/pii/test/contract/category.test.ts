/**
 * EVID-01 deliverable 3 — the category vocabulary against PRD §37.1.
 *
 * The mapping is asserted in BOTH directions: every §37.1 "Blocked" row has at least one member, and
 * every member (except the one documented non-§37.1 addition) cites a row. A one-directional
 * assertion would let a member be invented that no PRD row asks for, which is how a vocabulary drifts
 * away from the spec it is supposed to transcribe.
 */
import { describe, expect, it } from 'vitest';

import {
  NON_PRD_CATEGORY,
  PII_CATEGORY_VALUES,
  isPiiCategory,
} from '../../src/contract/category.js';
import type { PiiCategory } from '../../src/contract/category.js';

/** PRD §37.1's "Blocked" column, transcribed verbatim, in the PRD's row order. */
const BLOCKED_ROWS: readonly (readonly [string, readonly PiiCategory[]])[] = [
  ['Employee or private individual name', ['EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME']],
  ['Home address or precise private location', ['HOME_ADDRESS_OR_PRECISE_LOCATION']],
  [
    'Personal email, phone or private social identifier',
    ['PRIVATE_CONTACT_EMAIL', 'PRIVATE_CONTACT_PHONE', 'PRIVATE_SOCIAL_IDENTIFIER'],
  ],
  [
    'TFN, bank/card details, Medicare/passport/licence number',
    [
      'TAX_FILE_NUMBER',
      'BANK_OR_CARD_DETAIL',
      'MEDICARE_NUMBER',
      'PASSPORT_NUMBER',
      'DRIVER_LICENCE_NUMBER',
    ],
  ],
  ['Exact date of birth unless public case material', ['EXACT_DATE_OF_BIRTH']],
  [
    'Employee/payroll ID, payslip content or personnel-file extract',
    ['EMPLOYEE_OR_PAYROLL_IDENTIFIER', 'PAYSLIP_OR_PERSONNEL_EXTRACT'],
  ],
  [
    'Identifying combination of rare role + tiny workplace + personal event',
    ['IDENTIFYING_COMBINATION'],
  ],
];

describe('PII_CATEGORY_VALUES against PRD §37.1', () => {
  it('gives every §37.1 "Blocked" row at least one member', () => {
    for (const [row, categories] of BLOCKED_ROWS) {
      expect(categories.length, `no category for §37.1 blocked row: ${row}`).toBeGreaterThan(0);
      for (const category of categories) {
        expect(PII_CATEGORY_VALUES, `${category} is missing from the vocabulary`).toContain(
          category,
        );
      }
    }
  });

  it('gives every member a §37.1 row, except the documented admission-limit addition', () => {
    const cited = new Set(BLOCKED_ROWS.flatMap(([, categories]) => categories));
    for (const category of PII_CATEGORY_VALUES) {
      if (category === NON_PRD_CATEGORY) continue;
      expect(cited, `${category} cites no PRD §37.1 blocked row`).toContain(category);
    }
  });

  it('carries exactly the seven §37.1 blocked rows and one non-§37.1 member', () => {
    expect(BLOCKED_ROWS).toHaveLength(7);
    expect(PII_CATEGORY_VALUES).toHaveLength(15);
    expect(PII_CATEGORY_VALUES.filter((value) => value === NON_PRD_CATEGORY)).toEqual([
      'REQUEST_LIMIT_EXCEEDED',
    ]);
  });

  it('is deep-frozen — it is a process-wide singleton', () => {
    expect(Object.isFrozen(PII_CATEGORY_VALUES)).toBe(true);
  });

  it('has no duplicate member', () => {
    expect(new Set(PII_CATEGORY_VALUES).size).toBe(PII_CATEGORY_VALUES.length);
  });
});

describe('isPiiCategory', () => {
  it('accepts every member', () => {
    for (const category of PII_CATEGORY_VALUES) expect(isPiiCategory(category)).toBe(true);
  });

  it('rejects anything else, of any type', () => {
    for (const value of [
      '',
      'tax_file_number',
      'TAX FILE NUMBER',
      'OVERRIDE',
      0,
      null,
      undefined,
      {},
      ['TAX_FILE_NUMBER'],
    ]) {
      expect(isPiiCategory(value), `${String(value)} was accepted`).toBe(false);
    }
  });
});
