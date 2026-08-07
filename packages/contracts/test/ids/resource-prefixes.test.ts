/**
 * FND-03 deliverable 4 — the resource prefix registry: short, lower-case, unique, and matching the
 * PRD's literals exactly where the PRD shows one.
 */
import { describe, expect, it } from 'vitest';

import { RESOURCE_KINDS, RESOURCE_PREFIXES, isResourceKind } from '../../src/ids/index.js';

/**
 * The prefixes the PRD spells literally in a payload example. These are transcribed, not chosen: if
 * one of them ever disagrees with the PRD, the PRD wins (ticket Feedback obligation 5).
 */
const PRD_LITERAL: ReadonlyArray<readonly [string, string]> = [
  ['AnswerSnapshot', 'ans'],
  ['ResearchRecord', 'rec'],
  ['AnswerClaim', 'clm'],
  ['ClaimCitation', 'cit'],
  ['AnswerAssumption', 'asm'],
  ['LegalDocument', 'doc'],
  ['DocumentVersion', 'dv'],
  ['DocumentNode', 'node'],
  ['NodeVersion', 'nv'],
  ['Authority', 'auth'],
  ['CorpusRelease', 'cr'],
  ['SearchExecution', 'srx'],
  ['Request', 'req'],
  ['Job', 'job'],
  ['Event', 'evt'],
  ['Alert', 'alt'],
  ['Watchlist', 'wat'],
];

describe('resource prefixes', () => {
  it('keeps the seventeen PRD-literal prefixes exactly as the PRD spells them', () => {
    expect(PRD_LITERAL).toHaveLength(17);
    for (const [entity, prefix] of PRD_LITERAL) {
      expect(
        (RESOURCE_PREFIXES as Record<string, string>)[entity],
        `${entity} must keep the PRD's literal prefix`,
      ).toBe(prefix);
    }
  });

  it('is short, lower-case and free of the separator', () => {
    for (const prefix of RESOURCE_KINDS) {
      expect(prefix, `${prefix} is not a short lower-case token`).toMatch(/^[a-z]{2,5}$/);
      // parseId splits on the FIRST underscore, which is only unambiguous while no prefix has one.
      expect(prefix.includes('_')).toBe(false);
    }
  });

  it('has no duplicate prefix', () => {
    expect(new Set(RESOURCE_KINDS).size).toBe(RESOURCE_KINDS.length);
    expect(RESOURCE_KINDS.length).toBe(Object.keys(RESOURCE_PREFIXES).length);
  });

  it('covers the coined entities PRD §15.4/§15.6 name without a literal', () => {
    for (const entity of [
      'Organization',
      'User',
      'Membership',
      'ServiceAccount',
      'ApiCredential',
      'Comment',
      'IssueReport',
      'Correction',
      'Export',
      'ComparisonSnapshot',
      'CoverageAssessment',
      'EvaluationCase',
    ]) {
      expect(Object.keys(RESOURCE_PREFIXES)).toContain(entity);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(RESOURCE_PREFIXES)).toBe(true);
    expect(() => {
      (RESOURCE_PREFIXES as unknown as Record<string, string>).Injected = 'xxx';
    }).toThrow();
  });

  it('recognises registered kinds and only those', () => {
    expect(isResourceKind('ans')).toBe(true);
    expect(isResourceKind('nope')).toBe(false);
    expect(isResourceKind(7)).toBe(false);
  });
});
