/**
 * The fixture is only a trustworthy assertion target if it really is what docs/PRD.md says. This suite
 * reads the PRD (read-only; it is a frozen path) and asserts every verbatim field occurs in it, so a
 * transcription typo fails here rather than silently redefining the spec somewhere downstream.
 */
import { describe, expect, it } from 'vitest';

import { loadFixture, loadPrd } from './fixture.js';

const fixture = loadFixture();
const prd = loadPrd();

describe('the fixture is a faithful transcription of docs/PRD.md', () => {
  it('reads a PRD that actually contains §36.8 (non-vacuity)', () => {
    expect(prd).toContain('### 36.8 Refusal/status decision table');
    expect(prd.length).toBeGreaterThan(10_000);
  });

  for (const row of fixture.prd_36_8.status_rows) {
    it(`§36.8 status row "${row.condition_text}" is in the PRD, with its tabled result`, () => {
      expect(prd).toContain(`| ${row.condition_text} | \`${row.result}\` |`);
    });
  }

  for (const row of fixture.prd_36_8.non_status_rows) {
    it(`§36.8 non-status row "${row.condition_text}" is in the PRD, with its consequence`, () => {
      expect(prd).toContain(`| ${row.condition_text} | ${row.result_text} |`);
    });
  }

  it('§36.8 closing paragraph is transcribed verbatim, curly quotes included', () => {
    expect(prd).toContain(fixture.prd_36_8.closing_paragraph_lines.join('\n'));
    // Non-vacuity: the paragraph really does carry the curly-quoted words.
    expect(fixture.prd_36_8.closing_paragraph_lines.join('\n')).toContain('“guaranteed”');
  });

  for (const section of fixture.answer_structure.sections) {
    it(`§8.4 section ${section.ordinal} is in the PRD verbatim`, () => {
      expect(prd).toContain(`${section.ordinal}. ${section.prd_text}`);
    });
  }

  it('§15.5 BACKGROUND_ONLY rule is in the PRD verbatim', () => {
    expect(prd).toContain(fixture.claim_support.background_only_rule);
  });

  it('§15.5 claim-support values and citation roles are in the PRD verbatim', () => {
    for (const value of fixture.claim_support.values) expect(prd).toContain(`- \`${value}\``);
    for (const role of fixture.claim_support.citation_roles) expect(prd).toContain(`- \`${role}\``);
  });

  it('ANS-005 states the zero-unsupported-definitive-claim measure D21 is defined against', () => {
    expect(prd).toContain('Unsupported definitive claim count is zero');
  });

  it('§8.2 keeps Search available when the AI budget is exhausted (§36.8 row 9)', () => {
    expect(prd).toContain('Search MUST remain usable when the AI budget is exhausted.');
  });
});
