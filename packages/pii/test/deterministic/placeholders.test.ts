/**
 * EVID-01 acceptance item 12 — "placeholders cover every category".
 *
 * Asserted in both directions and at runtime, even though `Readonly<Record<PiiCategory, string>>`
 * already makes a MISSING key a compile error: the extra direction catches a placeholder for a
 * category that no longer exists, which the type does not.
 */
import { describe, expect, it } from 'vitest';

import { PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';

describe('PII_PLACEHOLDERS', () => {
  it('has exactly the category key set', () => {
    expect(Object.keys(PII_PLACEHOLDERS).sort()).toEqual([...PII_CATEGORY_VALUES].sort());
  });

  it('gives every category a non-empty placeholder', () => {
    for (const category of PII_CATEGORY_VALUES) {
      expect(PII_PLACEHOLDERS[category].length, category).toBeGreaterThan(0);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PII_PLACEHOLDERS)).toBe(true);
  });

  it('uses the PRD §37.1 allowed-column wording where the row provides one', () => {
    expect(PII_PLACEHOLDERS.EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME).toBe('Employee A');
    expect(PII_PLACEHOLDERS.IDENTIFYING_COMBINATION).toBe('the worker');
  });

  it('never contains a plausible-looking fake value a reader could mistake for real data', () => {
    for (const category of PII_CATEGORY_VALUES) {
      expect(/\d{6,}/.test(PII_PLACEHOLDERS[category]), category).toBe(false);
      expect(PII_PLACEHOLDERS[category].includes('@'), category).toBe(false);
    }
  });
});
