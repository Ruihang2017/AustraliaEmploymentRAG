/**
 * FND-10 acceptance items "financial years" and "non-exclusion rules" (PRD §6.6).
 */
import { describe, expect, it } from 'vitest';

import {
  SUPPORTED_FINANCIAL_YEARS,
  agreementCeased,
  financialYearOf,
  isEligible,
  isSupportedFinancialYear,
  mustNotExcludeForAge,
  type EnterpriseAgreement,
  type LegalEvent,
} from '../../src/legal/index.js';
import { loadBoundaryDates } from './fixture.js';

const fixture = loadBoundaryDates();
const EVIDENCE = 'nv_01J0000000000000000000';

describe('financialYearOf (PRD §6.6, 1 July – 30 June)', () => {
  it('replays every fixture case', () => {
    expect(fixture.financialYears.length).toBeGreaterThanOrEqual(8);
    for (const row of fixture.financialYears) {
      expect(financialYearOf(row.date), row.date).toBe(row.financialYear);
    }
  });

  it('the ticket literals', () => {
    expect(financialYearOf('2026-06-30')).toBe('2025-26');
    expect(financialYearOf('2026-07-01')).toBe('2026-27');
  });

  it('the 30 June / 1 July boundary', () => {
    expect(financialYearOf('2024-06-30')).toBe('2023-24');
    expect(financialYearOf('2024-07-01')).toBe('2024-25');
    expect(financialYearOf('2025-06-30')).toBe('2024-25');
    expect(financialYearOf('2025-07-01')).toBe('2025-26');
  });

  it('renders the century roll as the PRD notation, not silently wrong arithmetic', () => {
    expect(financialYearOf('2099-07-01')).toBe('2099-00');
    expect(financialYearOf('2100-07-01')).toBe('2100-01');
  });

  it('THROWS TypeError on a malformed legal date — the one documented exception to totality', () => {
    for (const bad of ['2026-13-01', 'not-a-date', '', '2026-02-30', '2026-7-1']) {
      expect(() => financialYearOf(bad), bad).toThrow(TypeError);
    }
    expect(() => financialYearOf(null as unknown as string)).toThrow(TypeError);
  });
});

describe('SUPPORTED_FINANCIAL_YEARS', () => {
  it('is exactly the three PRD §6.6 years, in the PRD order, frozen', () => {
    expect([...SUPPORTED_FINANCIAL_YEARS]).toEqual(['2024-25', '2025-26', '2026-27']);
    expect(Object.isFrozen(SUPPORTED_FINANCIAL_YEARS)).toBe(true);
  });

  it('isSupportedFinancialYear accepts only those three', () => {
    for (const year of SUPPORTED_FINANCIAL_YEARS) expect(isSupportedFinancialYear(year)).toBe(true);
    for (const value of ['2023-24', '2027-28', '', null, 2025]) {
      expect(isSupportedFinancialYear(value), String(value)).toBe(false);
    }
  });
});

describe('mustNotExcludeForAge (PRD §6.6 non-exclusion rule 1)', () => {
  it('a 2015 case is not excluded for age', () => {
    expect(mustNotExcludeForAge({ kind: 'CASE_LAW', legal_status: 'IN_FORCE' })).toBe(true);
    // ... whatever its status, case law is case law.
    expect(mustNotExcludeForAge({ kind: 'CASE_LAW', legal_status: 'STATUS_UNCONFIRMED' })).toBe(true);
  });

  it('a 2019 STILL-OPERATIVE instrument is not excluded for age', () => {
    expect(mustNotExcludeForAge({ kind: 'INSTRUMENT', legal_status: 'IN_FORCE' })).toBe(true);
  });

  it('a repealed 2019 instrument is not covered by the rule', () => {
    expect(mustNotExcludeForAge({ kind: 'INSTRUMENT', legal_status: 'REPEALED' })).toBe(false);
  });

  it("'OTHER' and unknown kinds are not covered — the rule simply does not apply", () => {
    expect(mustNotExcludeForAge({ kind: 'OTHER', legal_status: 'IN_FORCE' })).toBe(false);
    expect(
      mustNotExcludeForAge({ kind: 'GUIDANCE' as 'OTHER', legal_status: 'IN_FORCE' }),
    ).toBe(false);
  });

  it('is total for junk input', () => {
    for (const value of [null, undefined, 'CASE_LAW', 3]) {
      expect(() => mustNotExcludeForAge(value as never)).not.toThrow();
      expect(mustNotExcludeForAge(value as never)).toBe(false);
    }
  });

  it('is ADVISORY, not a §36.2 conjunct — it cannot re-admit a filtered item', () => {
    const caseLaw = { kind: 'CASE_LAW' as const, legal_status: 'IN_FORCE' };
    expect(mustNotExcludeForAge(caseLaw)).toBe(true);
    // The same item, failing conjunct 4 (licence), stays ineligible.
    const result = isEligible(
      {
        effective_from: '2015-01-01',
        effective_to: null,
        jurisdictions: ['CTH'],
        legal_status: 'IN_FORCE',
        licence_state: 'PROHIBITED',
        corpus_release_id: 'cr_pinned',
      },
      {
        legal_as_at: '2026-08-03',
        jurisdictions: ['CTH'],
        request_mode: 'CURRENT_LAW',
        corpus_release_id: 'cr_pinned',
      },
    );
    expect(result.eligible).toBe(false);
    expect(result.failures).toEqual(['LICENCE_NOT_PERMITTED']);
  });
});

describe('agreementCeased (PRD §6.6 non-exclusion rule 2)', () => {
  const expiredNoEvent: EnterpriseAgreement = { nominal_expiry: '2023-06-30', events: [] };
  const replaced: EnterpriseAgreement = {
    nominal_expiry: '2023-06-30',
    events: [
      { event_type: 'REPLACEMENT', effective_date: '2025-01-01', evidence_node_version_id: EVIDENCE },
    ],
  };
  const terminated: EnterpriseAgreement = {
    nominal_expiry: null,
    events: [{ event_type: 'REPEAL', effective_date: '2025-01-01', evidence_node_version_id: EVIDENCE }],
  };

  it('a passed nominal expiry with NO evidenced cessation event is NOT ceased', () => {
    expect(agreementCeased(expiredNoEvent, '2026-08-03')).toBe(false);
  });

  it('an evidenced REPLACEMENT or REPEAL effective before asAt IS ceased', () => {
    expect(agreementCeased(replaced, '2026-08-03')).toBe(true);
    expect(agreementCeased(terminated, '2026-08-03')).toBe(true);
  });

  it('a cessation event effective AFTER asAt is not yet ceased', () => {
    expect(agreementCeased(replaced, '2024-12-31')).toBe(false);
  });

  it('an UNEVIDENCED cessation event does not cease it', () => {
    const unevidenced: EnterpriseAgreement = {
      nominal_expiry: '2023-06-30',
      events: [{ event_type: 'REPEAL', effective_date: '2025-01-01' }],
    };
    expect(agreementCeased(unevidenced, '2026-08-03')).toBe(false);
  });

  it('a commenced-but-not-ceased agreement is not ceased', () => {
    const live: EnterpriseAgreement = {
      nominal_expiry: '2023-06-30',
      events: [
        { event_type: 'COMMENCEMENT', effective_date: '2020-07-01', evidence_node_version_id: EVIDENCE },
      ],
    };
    expect(agreementCeased(live, '2026-08-03')).toBe(false);
  });

  it('nominal_expiry is NEVER read: sweeping it changes no answer', () => {
    const expiries: (string | null)[] = [null, '1999-01-01', '2023-06-30', '2026-08-03', '2099-12-31'];
    const cases: readonly [string, readonly LegalEvent[], string, boolean][] = [
      ['no events', [], '2026-08-03', false],
      ['replaced', replaced.events, '2026-08-03', true],
      ['replaced, before the event', replaced.events, '2024-12-31', false],
      ['terminated', terminated.events, '2026-08-03', true],
    ];
    for (const [name, events, asAt, expected] of cases) {
      for (const nominal_expiry of expiries) {
        expect(agreementCeased({ nominal_expiry, events }, asAt), `${name} / ${String(nominal_expiry)}`).toBe(
          expected,
        );
      }
    }
  });

  it('is total for junk input', () => {
    expect(() => agreementCeased(null as unknown as EnterpriseAgreement, '2026-08-03')).not.toThrow();
    expect(agreementCeased(null as unknown as EnterpriseAgreement, '2026-08-03')).toBe(false);
    expect(
      agreementCeased({ nominal_expiry: null, events: null as unknown as LegalEvent[] }, '2026-08-03'),
    ).toBe(false);
  });
});
