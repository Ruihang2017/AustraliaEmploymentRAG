/**
 * FND-07 deliverable 6 — PRD §8.4's standard answer structure as ordered, deeply frozen data, so no
 * renderer can reorder the sections and no surface can re-derive the short-answer vocabulary.
 *
 * `prdText` is verbatim from docs/PRD.md §8.4. The `id`s are coined here (the PRD spells the sections
 * as prose) and are stable identifiers for `15-answer-product`, not display copy.
 */
import { deepFreeze } from './deep-freeze.js';
import type { ShortAnswerValue } from './types.js';

export interface AnswerSection {
  readonly ordinal: 1 | 2 | 3 | 4 | 5 | 6;
  readonly id: string;
  readonly prdText: string;
}

export const ANSWER_SECTION_ORDER: readonly AnswerSection[] = deepFreeze([
  {
    ordinal: 1,
    id: 'SHORT_ANSWER',
    prdText: 'Short answer: Yes, No, Likely, Depends or insufficient evidence.',
  },
  { ordinal: 2, id: 'EXPLANATION_AND_APPLICATION', prdText: 'Explanation and application.' },
  { ordinal: 3, id: 'CONDITIONS_AND_ASSUMPTIONS', prdText: 'Conditions and assumptions.' },
  { ordinal: 4, id: 'CLAIM_LEVEL_AUTHORITIES', prdText: 'Claim-level authorities.' },
  { ordinal: 5, id: 'PRACTICAL_NEXT_STEPS', prdText: 'Practical next steps/checks.' },
  { ordinal: 6, id: 'LIMITATIONS_AND_UNRESOLVED_FACTS', prdText: 'Limitations and unresolved facts.' },
] as const satisfies readonly AnswerSection[]);

/**
 * PRD §8.4 item 1, in the PRD's own spellings — including the lower-case fifth value. It is NOT
 * normalised to `INSUFFICIENT_EVIDENCE`: that is the `AnswerStatus` member, a different family.
 */
export const SHORT_ANSWER_VALUES: readonly ShortAnswerValue[] = deepFreeze([
  'Yes',
  'No',
  'Likely',
  'Depends',
  'insufficient evidence',
] as const satisfies readonly ShortAnswerValue[]);
