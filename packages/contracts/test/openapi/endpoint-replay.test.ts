/**
 * FND-04 acceptance item 2 — "Endpoint replay: every path/method in `prd-16-2-endpoints.json`
 * appears exactly once in the document, and the document declares no endpoint absent from the
 * fixture (PRD §16.2, §16.3)."
 *
 * BOTH DIRECTIONS. Checking only fixture -> document lets an undeclared operation be added silently;
 * checking only document -> fixture lets a PRD endpoint be dropped silently. One direction alone is
 * the vacuous-green failure this ticket's risk list names first.
 */
import { describe, expect, it } from 'vitest';

import { absolutePath, operations } from '../../src/openapi/document.mjs';
import { document, fixture, repoText, type Json } from './fixture.js';

interface Operation {
  method: string;
  path: string;
}
interface Group {
  prd_section: string;
  group: string;
  prd_line: string;
  derived: boolean;
  basis?: string;
  operations: Operation[];
}
interface Endpoints {
  basePath: string;
  groups: Group[];
}

const endpoints = fixture<Endpoints>('prd-16-2-endpoints.json');
const expected = endpoints.groups.flatMap((group) =>
  group.operations.map((operation) => `${operation.method} ${operation.path}`),
);
const declared = operations(document()).map(
  ({ path, method }) => `${method.toUpperCase()} ${absolutePath(document(), path)}`,
);

describe('PRD §16.2/§16.3 endpoint replay (acceptance item 2)', () => {
  it('composes the PRD form from `servers[0].url` + the path key', () => {
    expect((document().servers as { url: string }[])[0]?.url).toBe(endpoints.basePath);
    expect(absolutePath(document(), '/search')).toBe('/v1/search');
  });

  it('is not vacuous: the fixture and the document both carry real operations', () => {
    expect(expected.length).toBeGreaterThan(80);
    expect(declared.length).toBe(expected.length);
  });

  it('declares every fixture operation exactly once', () => {
    const missing = expected.filter((entry) => !declared.includes(entry));
    expect(missing, `PRD endpoints not declared: ${missing.join(', ')}`).toEqual([]);
    const duplicated = expected.filter((entry, index) => expected.indexOf(entry) !== index);
    expect(duplicated, `listed twice in the fixture: ${duplicated.join(', ')}`).toEqual([]);
  });

  it('declares no operation absent from the fixture', () => {
    const extra = declared.filter((entry) => !expected.includes(entry));
    expect(extra, `declared but not in the PRD fixture: ${extra.join(', ')}`).toEqual([]);
  });

  it('declares each operation exactly once in the document', () => {
    const duplicated = declared.filter((entry, index) => declared.indexOf(entry) !== index);
    expect(duplicated).toEqual([]);
  });

  // Sub-PRD D23: an operation the PRD does not spell literally must say so and say why, so the
  // Reviewer reads the derivation rather than trusting it.
  it('gives every derived group a basis, and gives every literal group none', () => {
    for (const group of endpoints.groups) {
      if (group.derived) {
        expect(group.basis?.trim(), `${group.prd_line} is derived but has no basis`).toBeTruthy();
      } else {
        expect(group.basis, `${group.prd_line} is literal but carries a basis`).toBeUndefined();
        expect(group.operations).toHaveLength(1);
      }
    }
  });

  it('quotes every non-derived `prd_line` verbatim from docs/PRD.md', () => {
    const prd = repoText('docs/PRD.md');
    for (const group of endpoints.groups.filter((entry) => !entry.derived)) {
      expect(prd.includes(group.prd_line), `not found in the PRD: ${group.prd_line}`).toBe(true);
    }
  });

  it('carries the §34.3 clarifications endpoint the §16.2 lists omit (sub-PRD D24)', () => {
    const clarifications = endpoints.groups.find(
      (group) => group.prd_section === '34.3' && group.derived,
    );
    expect(clarifications?.operations).toEqual([
      { method: 'POST', path: '/v1/answer-jobs/{job_id}/clarifications' },
    ]);
  });

  it('marks every §16.3 group derived — §16.3 states capabilities, not paths', () => {
    const sixteenThree = endpoints.groups.filter((group) => group.prd_section === '16.3');
    expect(sixteenThree).toHaveLength(5);
    for (const group of sixteenThree) expect(group.derived).toBe(true);
  });

  it('gives every operation an `x-prd-basis` naming a section the fixture also uses', () => {
    const sections = new Set(endpoints.groups.map((group) => `§${group.prd_section}`));
    for (const { path, method, operation } of operations(document())) {
      const basis = String((operation as Json)['x-prd-basis'] ?? '');
      const named = basis.split(',').map((part) => part.trim());
      expect(
        named.some((section) => sections.has(section)),
        `${method.toUpperCase()} ${path} cites ${basis}, none of ${[...sections].join('/')}`,
      ).toBe(true);
    }
  });
});
