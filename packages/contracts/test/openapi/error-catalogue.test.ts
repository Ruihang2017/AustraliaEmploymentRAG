/**
 * FND-04 acceptance item 4 — "Error-catalogue replay: all 17 PRD §34.9 codes are declared with the
 * exact HTTP status and `retryable` value from the table, and no extra code exists."
 *
 * Sub-PRD D7: the code IDENTIFIERS are FND-03's enum; the HTTP status, the `retryable` flag and the
 * response schema are this ticket's.
 *
 * THE FIXTURE IS NOT TRUSTED. Every row is re-extracted from the §34.9 markdown table in
 * `docs/PRD.md` and compared to the fixture first, and the `retryable` derivation rule is applied to
 * the RE-EXTRACTED Retry column rather than to the fixture's own copy — otherwise the derivation
 * would be checked against itself.
 */
import { describe, expect, it } from 'vitest';

import { ERROR_CODE_VALUES } from '../../src/enums/error-code.js';
import { document, fixture, prdTableRows, type Json } from './fixture.js';

interface ErrorRow {
  http: number;
  code: string;
  retry: string;
  retryable: boolean;
  userAction: string;
}
interface ErrorFixture {
  prdPath: string;
  tableHeading: string;
  responseComponentByCode: Record<string, string>;
  nonRetryableColumnValues: string[];
  rows: ErrorRow[];
}

const spec = fixture<ErrorFixture>('prd-34-9-errors.json');
const responses = (document().components as Json).responses as Record<string, Json>;

/** The rows of PRD §34.9, read out of the PRD itself. */
const prdRows = prdTableRows(spec.tableHeading, spec.prdPath)
  .slice(1) // drop the header row
  .map((cells) => ({
    http: Number(cells[0]),
    code: String(cells[1]).replace(/`/g, ''),
    retry: String(cells[2]),
    userAction: String(cells[3]),
  }));

describe('PRD §34.9 error catalogue (acceptance item 4)', () => {
  it('re-extracts seventeen rows from the PRD, so nothing below is vacuous', () => {
    expect(prdRows).toHaveLength(17);
    expect(prdRows[0]).toMatchObject({ http: 400, code: 'INVALID_REQUEST', retry: 'No' });
  });

  it('transcribes the PRD table into the fixture without drift', () => {
    expect(spec.rows.map(({ http, code, retry, userAction }) => ({ http, code, retry, userAction }))).toEqual(
      prdRows,
    );
  });

  it('derives `retryable` from the PRD Retry column by the one recorded rule', () => {
    const nonRetryable = new Set(spec.nonRetryableColumnValues);
    for (const [index, row] of spec.rows.entries()) {
      const fromPrd = prdRows[index];
      expect(row.retryable, `${row.code}: Retry "${fromPrd?.retry}"`).toBe(!nonRetryable.has(String(fromPrd?.retry)));
    }
  });

  it('uses exactly FND-03\'s `ERROR_CODE_VALUES`, in the same order', () => {
    expect(spec.rows.map((row) => row.code)).toEqual([...ERROR_CODE_VALUES]);
  });

  it('declares one response component per code, with the exact status and `retryable`', () => {
    for (const row of spec.rows) {
      const name = spec.responseComponentByCode[row.code];
      expect(name, `no response component recorded for ${row.code}`).toBeTruthy();
      const response = responses[name as string];
      expect(response, `#/components/responses/${name} is not declared`).toBeTruthy();
      expect(response?.['x-error-code'], `${name} x-error-code`).toBe(row.code);
      expect(response?.['x-http-status'], `${name} x-http-status`).toBe(row.http);
      expect(response?.['x-retryable'], `${name} x-retryable`).toBe(row.retryable);
    }
  });

  it('declares no extra single-code response — the catalogue is closed', () => {
    const declared = Object.entries(responses)
      .filter(([, response]) => typeof response['x-error-code'] === 'string')
      .map(([, response]) => response['x-error-code'] as string);
    expect(declared.sort()).toEqual([...ERROR_CODE_VALUES].sort());
  });

  it('pins the `ErrorCode` schema to the same seventeen members, in registry order', () => {
    const schema = ((document().components as Json).schemas as Record<string, Json>).ErrorCode;
    expect(schema?.enum).toEqual([...ERROR_CODE_VALUES]);
  });

  it('gives every error response the single PRD §16.1 error schema', () => {
    for (const [name, response] of Object.entries(responses)) {
      const isError =
        typeof response['x-error-code'] === 'string' || Array.isArray(response['x-error-codes']);
      if (!isError) continue;
      const content = response.content as Json;
      const media = (content['application/json'] ?? {}) as Json;
      expect((media.schema as Json)?.$ref, `${name} does not use the shared error schema`).toBe(
        '#/components/schemas/ErrorResponse',
      );
    }
  });

  // Composite responses exist because an HTTP status is not one-to-one with a code. They must not
  // become a back door for an eighteenth code.
  it('draws every composite response\'s members from the seventeen, all sharing its status', () => {
    const byCode = new Map(spec.rows.map((row) => [row.code, row]));
    const composites = Object.entries(responses).filter(([, response]) =>
      Array.isArray(response['x-error-codes']),
    );
    expect(composites.length).toBeGreaterThan(0);
    for (const [name, response] of composites) {
      expect(response['x-error-code'], `${name} is both single and composite`).toBeUndefined();
      for (const code of response['x-error-codes'] as string[]) {
        const row = byCode.get(code);
        expect(row, `${name} names ${code}, which PRD §34.9 does not list`).toBeTruthy();
        expect(row?.http, `${name} groups ${code} under the wrong status`).toBe(response['x-http-status']);
      }
    }
  });

  // Sub-PRD Q-F8. PRD §34.3 names `409 CLARIFICATION_ROUND_CLOSED`; §34.9 does not list it and
  // FND-03's registry does not contain it, so it may be EXPLAINED in prose but never DECLARED — an
  // eighteenth member would break acceptance items 4 and 5 at once.
  it('never declares `CLARIFICATION_ROUND_CLOSED`, only explains its absence', () => {
    const codes = Object.values(responses).flatMap((response) => [
      ...(typeof response['x-error-code'] === 'string' ? [response['x-error-code'] as string] : []),
      ...((response['x-error-codes'] as string[] | undefined) ?? []),
    ]);
    expect(codes).not.toContain('CLARIFICATION_ROUND_CLOSED');
    expect(
      (((document().components as Json).schemas as Record<string, Json>).ErrorCode?.enum as string[]),
    ).not.toContain('CLARIFICATION_ROUND_CLOSED');

    // It IS explained, and the explanation cites the open question — an undocumented silent gap
    // would be the failure this assertion guards against.
    const clarifications = (
      ((document().paths as Json)['/answer-jobs/{job_id}/clarifications'] as Json).post as Json
    ).description as string;
    expect(clarifications).toContain('CLARIFICATION_ROUND_CLOSED');
    expect(clarifications).toContain('Q-F8');
  });

  it('uses every one of the seventeen codes on at least one operation', () => {
    const text = JSON.stringify(document());
    const unused = [...ERROR_CODE_VALUES].filter((code) => !text.includes(code));
    expect(unused, `codes declared but never referenced: ${unused.join(', ')}`).toEqual([]);
  });
});
