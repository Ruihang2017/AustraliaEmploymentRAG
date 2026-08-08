/**
 * FND-06 deliverable 8 — the fixture IS PRD §38.1.
 *
 * Every assertion here compares the fixture with `docs/PRD.md` itself, never with
 * `src/access/matrix.ts`. If this file and `matrix-replay.test.ts` both pass, the implementation
 * agrees with the fixture and the fixture agrees with the PRD, which is the chain the ticket's
 * acceptance item asks for.
 */
import { describe, expect, it } from 'vitest';

import { loadMatrixFixture, loadPrd, rebuildRowLine, unwrap } from './fixture.js';

const fixture = loadMatrixFixture();
const prd = loadPrd();

describe('the PRD is really being read (non-vacuity)', () => {
  it('reads a large docs/PRD.md that contains the §38.1 heading', () => {
    expect(prd.length).toBeGreaterThan(10_000);
    expect(prd).toContain(fixture.heading);
    expect(fixture.prdFile).toBe('docs/PRD.md');
  });

  it('fails on a line that is NOT in the PRD (the containment check is not vacuous)', () => {
    expect(prd).not.toContain('| Search/read public corpus | ✓ | ✓ | ✓ | ✓ | ✓ | unrestricted |');
  });
});

describe('the table frame', () => {
  it('carries the PRD header and separator rows verbatim', () => {
    expect(prd).toContain(fixture.headerLine);
    expect(prd).toContain(fixture.separatorLine);
    expect(fixture.headerLine).toBe(
      '| Action | Owner | Admin | Researcher | Viewer | Developer | Service account |',
    );
  });

  it('carries the `Own` paragraph, wrapped exactly as the PRD wraps it', () => {
    expect(prd).toContain(fixture.ownParagraphLines.join('\n'));
    expect(unwrap(fixture.ownParagraphLines)).toBe(
      '`Own` below means a record owned by or explicitly shared with the member inside the same ' +
        'organisation; the MVP has no external/public sharing.',
    );
  });

  it('carries the closing rule — the whole point of the ticket', () => {
    expect(prd).toContain(fixture.closingRuleLines.join('\n'));
    expect(unwrap(fixture.closingRuleLines)).toBe(
      'All checks are permission checks plus resource membership; a role alone never authorises a ' +
        'record from another organisation.',
    );
  });

  it('names the six PRD columns in PRD order', () => {
    expect([...fixture.prdColumnLabels]).toEqual([
      'Owner',
      'Admin',
      'Researcher',
      'Viewer',
      'Developer',
      'Service account',
    ]);
    expect(fixture.columns.length).toBe(6);
  });
});

describe('every row, rebuilt from the fixture cells, is a line of docs/PRD.md', () => {
  for (const row of fixture.rows) {
    it(`§38.1 row "${row.prdAction}" (${row.permission})`, () => {
      const rebuilt = rebuildRowLine(fixture, row);
      expect(rebuilt).toBe(row.prdRowLine);
      expect(prd).toContain(`\n${rebuilt}\n`);
    });
  }

  it('covers all fourteen rows, in PRD order, immediately after the separator', () => {
    const start = prd.indexOf(fixture.separatorLine) + fixture.separatorLine.length + 1;
    const block = prd.slice(start).split('\n').slice(0, fixture.rows.length);
    expect(block).toEqual(fixture.rows.map((row) => rebuildRowLine(fixture, row)));
  });
});
