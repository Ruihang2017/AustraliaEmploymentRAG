/**
 * EVID-02 acceptance items 1 and 2 (the runtime half) — the suppression predicate.
 *
 * This is the security surface of the ticket: the ONLY way a finding leaves the pipeline. The
 * assertions are made against `isExplainedByStructuredChannel` DIRECTLY, with synthetic findings,
 * because that is where they are non-vacuous — no shipped detector produces a whole-value finding on
 * a structured channel from realistic input, so an end-to-end-only test of the checksum rule and the
 * citation rule would pass without ever exercising them. The end-to-end half is
 * `structured-matrix.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import type { PiiCategory } from '../../src/contract/category.js';
import { PII_CATEGORY_VALUES } from '../../src/contract/category.js';
import type { PiiFinding } from '../../src/contract/finding.js';
import { STRUCTURED_FIELD_NAMES } from '../../src/contract/request.js';
import { PII_PLACEHOLDERS } from '../../src/deterministic/placeholders.js';
import {
  SUPPRESSIBLE_CATEGORIES,
  isExplainedByStructuredChannel,
} from '../../src/context/publicEntity.js';

const VALID_ABN = '51824753556';
const INVALID_ABN = '51824753557';

function finding(
  field: string,
  value: string,
  category: PiiCategory = 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME',
  span?: { start: number; end: number },
): PiiFinding {
  const nfc = value.normalize('NFC');
  return {
    field,
    start: span?.start ?? 0,
    end: span?.end ?? nfc.length,
    category,
    severity: 'BLOCKING',
    suggestedPlaceholder: PII_PLACEHOLDERS[category],
  };
}

describe('the predicate takes exactly two inputs', () => {
  it('and its arity says so at runtime as well as at the type level', () => {
    expect(isExplainedByStructuredChannel.length).toBe(2);
  });

  it('suppresses nothing when there is no structured block at all', () => {
    const value = 'Example Widgets Pty Ltd';
    expect(
      isExplainedByStructuredChannel(finding(STRUCTURED_FIELD_NAMES.employer, value), undefined),
    ).toBe(false);
  });
});

describe('the employer channel', () => {
  const value = 'Example Widgets Pty Ltd';

  it('explains a whole-value name finding on its own field', () => {
    expect(
      isExplainedByStructuredChannel(finding(STRUCTURED_FIELD_NAMES.employer, value), {
        employer: value,
      }),
    ).toBe(true);
  });

  it('tolerates leading and trailing whitespace, and nothing else', () => {
    const padded = `  ${value}  `;
    const nfc = padded.normalize('NFC');
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.employer, padded, 'EMPLOYEE_OR_PRIVATE_INDIVIDUAL_NAME', {
          start: 2,
          end: nfc.length - 2,
        }),
        { employer: padded },
      ),
    ).toBe(true);
  });

  it('does NOT explain a partial span — an employer name with a phone appended stays blocked', () => {
    const withPhone = `${value} 0412 345 678`;
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.employer, withPhone, 'PRIVATE_CONTACT_PHONE', {
          start: value.length + 1,
          end: withPhone.length,
        }),
        { employer: withPhone },
      ),
    ).toBe(false);
  });

  it('does NOT explain a category it does not cover — a personal email is still blocked', () => {
    const email = 'private.person@example.invalid';
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.employer, email, 'PRIVATE_CONTACT_EMAIL'),
        { employer: email },
      ),
    ).toBe(false);
  });

  it('does NOT explain a finding on a DIFFERENT field carrying the identical string', () => {
    expect(isExplainedByStructuredChannel(finding('question', value), { employer: value })).toBe(
      false,
    );
  });

  it('does NOT explain a finding when the channel is absent from the request', () => {
    expect(isExplainedByStructuredChannel(finding(STRUCTURED_FIELD_NAMES.employer, value), {})).toBe(
      false,
    );
  });
});

describe('the ABN channel requires the mod-89 checksum', () => {
  it('explains a whole-value finding when the ABN is valid', () => {
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.abn, VALID_ABN, 'TAX_FILE_NUMBER'),
        { abn: VALID_ABN },
      ),
    ).toBe(true);
  });

  it('refuses a checksum-FAILING ABN — it is never a public entity', () => {
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.abn, INVALID_ABN, 'TAX_FILE_NUMBER'),
        { abn: INVALID_ABN },
      ),
    ).toBe(false);
  });

  it('accepts the formatted form, because only the digits are checksummed', () => {
    const formatted = '51 824 753 556';
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.abn, formatted, 'MEDICARE_NUMBER'),
        { abn: formatted },
      ),
    ).toBe(true);
  });
});

describe('the public-case-party channel requires a citation', () => {
  it('explains a party name accompanied by a citation-shaped reference', () => {
    const value = 'Smith v Acme Pty Ltd [2024] FWC 123';
    expect(
      isExplainedByStructuredChannel(finding(STRUCTURED_FIELD_NAMES.publicCaseParty, value), {
        publicCaseParty: value,
      }),
    ).toBe(true);
  });

  it('accepts the reported-citation form too', () => {
    const value = 'Harper v Acme Bakery Pty Ltd (2019) 268 CLR';
    expect(
      isExplainedByStructuredChannel(finding(STRUCTURED_FIELD_NAMES.publicCaseParty, value), {
        publicCaseParty: value,
      }),
    ).toBe(true);
  });

  it('refuses a bare party name — "Smith" alone is not public material', () => {
    expect(
      isExplainedByStructuredChannel(finding(STRUCTURED_FIELD_NAMES.publicCaseParty, 'Smith'), {
        publicCaseParty: 'Smith',
      }),
    ).toBe(false);
  });
});

describe('the category table (the acceptance item’s "only for the categories it covers")', () => {
  it('covers only the three reserved channels', () => {
    expect(Object.keys(SUPPRESSIBLE_CATEGORIES).sort()).toEqual(
      Object.values(STRUCTURED_FIELD_NAMES).sort(),
    );
  });

  it.each(
    PII_CATEGORY_VALUES.filter(
      (category) =>
        !(SUPPRESSIBLE_CATEGORIES[STRUCTURED_FIELD_NAMES.employer] ?? []).includes(category),
    ).map((category) => [category] as const),
  )('the employer channel never suppresses %s', (category) => {
    const value = 'Example Widgets Pty Ltd';
    expect(
      isExplainedByStructuredChannel(
        finding(STRUCTURED_FIELD_NAMES.employer, value, category),
        { employer: value },
      ),
    ).toBe(false);
  });

  it('never lists IDENTIFYING_COMBINATION for any channel', () => {
    for (const categories of Object.values(SUPPRESSIBLE_CATEGORIES)) {
      expect(categories).not.toContain('IDENTIFYING_COMBINATION');
    }
  });
});
