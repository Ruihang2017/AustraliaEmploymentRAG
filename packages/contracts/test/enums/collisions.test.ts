/**
 * FND-03 acceptance item 4 — no duplicate member inside a family, and the cross-family overlap set
 * is exactly the declared one.
 *
 * The ticket originally asserted `INSUFFICIENT_EVIDENCE` (§8.4/§8.5) was the ONLY intentional
 * overlap. Transcribing the twenty families falsifies that: the PRD itself spells five. The ticket
 * and docs/prd/00-foundation/README.md (decision D6a) were amended under the ticket's Feedback
 * obligation before this test was written, and the assertion is now "exactly the declared five" —
 * so a *sixth*, accidental collision still fails.
 *
 * "Separate types" is asserted here at the value level (each family's guard rejects the other's
 * non-shared members) and in test/ids/id-brand.test-d.ts at the type level. A shared string literal
 * is necessarily the same literal type in both derived unions; what is asserted is that the two
 * NAMED families stay distinct.
 */
import { describe, expect, it } from 'vitest';

import {
  ENUM_REGISTRY,
  isAnswerStatus,
  isClaimSupport,
  isCoverageCandidateStatus,
  isErrorCode,
  isLicenceAssessmentState,
  isRecordWorkflowState,
  isSsoConnectionState,
} from '../../src/enums/index.js';
import { loadFixture } from './fixture.js';

const fixture = loadFixture();

/** member -> the families that contain it, across the whole registry. */
function membersByFamily(): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  for (const [family, entry] of Object.entries(ENUM_REGISTRY)) {
    for (const member of entry.values) {
      const families = seen.get(member);
      if (families) families.push(family);
      else seen.set(member, [family]);
    }
  }
  return seen;
}

describe('within a family', () => {
  it('has no duplicate member', () => {
    for (const [family, entry] of Object.entries(ENUM_REGISTRY)) {
      expect(new Set(entry.values).size, `${family} repeats a member`).toBe(entry.values.length);
    }
  });
});

describe('across families', () => {
  const overlaps = [...membersByFamily().entries()]
    .filter(([, families]) => families.length > 1)
    .map(([member, families]) => ({ member, families: [...families].sort() }))
    .sort((a, b) => (a.member < b.member ? -1 : 1));

  const declared = fixture.intentionalCrossFamilyMembers
    .map((row) => ({ member: row.member, families: [...row.families].sort() }))
    .sort((a, b) => (a.member < b.member ? -1 : 1));

  it('shares a member only where the PRD does, and only in the declared pairs', () => {
    expect(overlaps).toEqual(declared);
  });

  it('declares five overlaps, each with a PRD section per family', () => {
    // Non-vacuity: if the declared list were emptied, the assertion above would pass only when the
    // implementation had no overlaps at all — which the PRD forbids.
    expect(declared).toHaveLength(5);
    for (const row of fixture.intentionalCrossFamilyMembers) {
      expect(row.prdSections).toHaveLength(row.families.length);
    }
  });

  it('keeps each colliding pair separate: a guard rejects the other family s non-shared members', () => {
    // INSUFFICIENT_EVIDENCE — §8.4 / §8.5
    expect(isAnswerStatus('INSUFFICIENT_EVIDENCE')).toBe(true);
    expect(isCoverageCandidateStatus('INSUFFICIENT_EVIDENCE')).toBe(true);
    expect(isCoverageCandidateStatus('SUPPORTED')).toBe(false);
    expect(isAnswerStatus('LIKELY')).toBe(false);

    // CONDITIONAL — §8.4 / §15.5
    expect(isClaimSupport('CONDITIONAL')).toBe(true);
    expect(isClaimSupport('OUT_OF_SCOPE')).toBe(false);
    expect(isAnswerStatus('DIRECTLY_SUPPORTED')).toBe(false);

    // SOURCE_NOT_CURRENT — §8.4 / §34.9
    expect(isErrorCode('SOURCE_NOT_CURRENT')).toBe(true);
    expect(isErrorCode('CONFLICTING_SOURCES')).toBe(false);
    expect(isAnswerStatus('RATE_LIMITED')).toBe(false);

    // REVIEW_REQUIRED — §8.7 / §11.1
    expect(isRecordWorkflowState('REVIEW_REQUIRED')).toBe(true);
    expect(isLicenceAssessmentState('REVIEW_REQUIRED')).toBe(true);
    expect(isLicenceAssessmentState('ARCHIVED')).toBe(false);
    expect(isRecordWorkflowState('PROHIBITED')).toBe(false);

    // DRAFT — §8.7 / §16.3
    expect(isSsoConnectionState('DRAFT')).toBe(true);
    expect(isSsoConnectionState('IN_REVIEW')).toBe(false);
    expect(isRecordWorkflowState('DISABLED')).toBe(false);
  });
});
