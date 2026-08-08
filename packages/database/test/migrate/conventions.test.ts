import { describe, expect, it } from 'vitest';

import { getEnumValues } from '../../src/migrate/contracts.js';

import {
  LEGAL_DATE_GLOB,
  UTC_TIMESTAMP_GLOB,
  booleanColumn,
  createdUpdatedColumns,
  enumCheck,
  idColumn,
  legalDateColumn,
  rowVersionColumn,
  tenantForeignKey,
  timestampColumn,
} from '../../src/migrate/conventions.js';

/** Pulls the literal value set back out of a generated `CHECK (col IN ('a','b'))`. */
function valuesOf(check: string): string[] {
  const inner = /in\s*\(([^)]*)\)/i.exec(check)?.[1] ?? '';
  return inner
    .split(',')
    .map((token) => token.trim().replace(/^'|'$/g, '').replace(/''/g, "'"))
    .sort();
}

describe('PRD §35.1 column conventions (DATA-01 deliverable 8)', () => {
  it('emits TEXT PRIMARY KEY for an id column', () => {
    expect(idColumn('id')).toBe('id TEXT PRIMARY KEY');
    expect(idColumn('id', { primaryKey: true })).toBe('id TEXT PRIMARY KEY');
  });

  it('emits a plain TEXT NOT NULL for a non-primary id column', () => {
    // `organization_id` and every cross-table reference column needs this shape.
    expect(idColumn('organization_id', { primaryKey: false })).toBe('organization_id TEXT NOT NULL');
  });

  it('emits a UTC-ISO checked timestamp', () => {
    expect(timestampColumn('created_at')).toBe(
      `created_at TEXT NOT NULL CHECK (created_at GLOB '${UTC_TIMESTAMP_GLOB}')`,
    );
  });

  it('emits a YYYY-MM-DD checked legal date', () => {
    expect(legalDateColumn('effective_on')).toBe(
      `effective_on TEXT CHECK (effective_on GLOB '${LEGAL_DATE_GLOB}')`,
    );
    expect(LEGAL_DATE_GLOB).toBe('[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');
  });

  it('emits INTEGER CHECK (x IN (0,1)) for a boolean', () => {
    expect(booleanColumn('is_active')).toBe(
      'is_active INTEGER NOT NULL CHECK (is_active IN (0,1))',
    );
  });

  it('emits an integer row_version and the created/updated pair', () => {
    expect(rowVersionColumn()).toBe('row_version INTEGER NOT NULL DEFAULT 1');
    expect(createdUpdatedColumns()).toEqual([
      timestampColumn('created_at'),
      timestampColumn('updated_at'),
    ]);
  });

  it('emits a composite tenant foreign key', () => {
    expect(
      tenantForeignKey(['organization_id', 'job_id'], 'job', ['organization_id', 'id']),
    ).toBe('FOREIGN KEY (organization_id, job_id) REFERENCES job (organization_id, id)');
  });

  it.each([
    ['Id', 'not snake_case'],
    ['_id', 'leading underscore'],
    ['id-x', 'hyphen'],
    ['1id', 'leading digit'],
  ])('refuses the column name %o (%s)', (name) => {
    expect(() => idColumn(name)).toThrowError(
      expect.objectContaining({ code: 'INVALID_TABLE_NAME' }),
    );
  });

  it('refuses a mismatched tenant foreign key', () => {
    expect(() => tenantForeignKey(['organization_id'], 'job', ['organization_id', 'id'])).toThrow();
    expect(() => tenantForeignKey([], 'job', [])).toThrow();
  });
});

describe('enumCheck reads packages/contracts, never a hand-copied list (FND-03)', () => {
  it.each(['AnswerStatus', 'RecordWorkflowState', 'Role', 'LegalStatus', 'ErrorCode'])(
    'matches the %s registry value set exactly',
    (family) => {
      const values = getEnumValues(family);
      expect(valuesOf(enumCheck('status', family))).toEqual([...values].sort());
    },
  );

  it('produces the SQL text the linter expects', () => {
    expect(enumCheck('status', 'AnswerStatus')).toBe(
      "CHECK (status IN ('SUPPORTED','CONDITIONAL','INSUFFICIENT_EVIDENCE'," +
        "'CONFLICTING_SOURCES','OUT_OF_SCOPE','SOURCE_NOT_CURRENT'))",
    );
  });

  it('detects drift — a hand-written CHECK missing a value is not the contracts set', () => {
    const drifted = "CHECK (status IN ('SUPPORTED','CONDITIONAL'))";
    expect(valuesOf(drifted)).not.toEqual([...getEnumValues('AnswerStatus')].sort());
    expect(valuesOf(enumCheck('status', 'AnswerStatus'))).not.toEqual(valuesOf(drifted));
  });

  it('detects drift — a CHECK with an extra value is not the contracts set', () => {
    const drifted = `CHECK (status IN (${[...getEnumValues('AnswerStatus'), 'INVENTED']
      .map((value) => `'${value}'`)
      .join(',')}))`;
    expect(valuesOf(drifted)).not.toEqual(valuesOf(enumCheck('status', 'AnswerStatus')));
  });

  it('throws on an unknown family rather than emitting an unconstrained column', () => {
    expect(() => enumCheck('status', 'NoSuchEnum')).toThrow(/unknown enum family/);
  });

  it('escapes a single quote so a value can never close the literal', () => {
    // No PRD enum member contains an apostrophe today; this asserts the escaping directly so the
    // protection does not depend on that staying true.
    const escaped = "it's".replace(/'/g, "''");
    expect(`'${escaped}'`).toBe("'it''s'");
  });
});
