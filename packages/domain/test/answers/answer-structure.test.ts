/**
 * FND-07 acceptance item 8 — `ANSWER_SECTION_ORDER` matches PRD §8.4's six sections in order, asserted
 * against the fixture.
 */
import { describe, expect, it } from 'vitest';

import { ANSWER_SECTION_ORDER, SHORT_ANSWER_VALUES } from '../../src/answers/index.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();

describe('PRD §8.4 answer structure', () => {
  it('has exactly six sections (non-vacuity)', () => {
    expect(fixture.answer_structure.sections).toHaveLength(6);
    expect(ANSWER_SECTION_ORDER).toHaveLength(6);
  });

  for (const [index, section] of fixture.answer_structure.sections.entries()) {
    it(`section ${section.ordinal} is "${section.id}", in position ${index + 1}`, () => {
      const implemented = ANSWER_SECTION_ORDER[index];
      expect(implemented?.ordinal).toBe(section.ordinal);
      expect(implemented?.id).toBe(section.id);
      expect(implemented?.prdText).toBe(section.prd_text);
    });
  }

  it('ordinals are 1..6 and ids are unique', () => {
    expect(ANSWER_SECTION_ORDER.map((section) => section.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(ANSWER_SECTION_ORDER.map((section) => section.id)).size).toBe(6);
  });

  it('short-answer values are the PRD\'s own spellings, including the lower-case fifth', () => {
    expect(SHORT_ANSWER_VALUES).toEqual(fixture.answer_structure.short_answer_values);
    expect(SHORT_ANSWER_VALUES).toContain('insufficient evidence');
    // It is NOT the AnswerStatus member of the same idea.
    expect(SHORT_ANSWER_VALUES as readonly string[]).not.toContain('INSUFFICIENT_EVIDENCE');
  });

  it('no renderer can reorder or edit them: both constants are deeply frozen', () => {
    expect(Object.isFrozen(ANSWER_SECTION_ORDER)).toBe(true);
    expect(Object.isFrozen(SHORT_ANSWER_VALUES)).toBe(true);
    for (const section of ANSWER_SECTION_ORDER) expect(Object.isFrozen(section)).toBe(true);
  });
});
