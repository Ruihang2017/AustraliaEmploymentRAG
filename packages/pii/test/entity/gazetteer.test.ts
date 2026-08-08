/**
 * EVID-02 — the gazetteer as a CANDIDATE filter, and the assertion that it is nothing more.
 *
 * The risk this suite exists for: a gazetteer that could remove a finding another stage produced
 * would be the *"generic 'ignore warning' button"* PRD §37.2 forbids, reachable by pasting a company
 * suffix into a request. The second describe block is that test — a free-text field that IS a
 * gazetteer entry, with a TFN appended, still rejects.
 */
import { describe, expect, it } from 'vitest';

import { PII_STAGES } from '../../src/context/stages.js';
import { normaliseForScan } from '../../src/deterministic/normalise.js';
import {
  ALLOWED_ENTITY_FORMS,
  CITATION_SHAPED,
  citationSentences,
  isAllowedEntityForm,
  isFollowedByOrganisationHead,
  isInsideAnyRange,
} from '../../src/entity/deterministic/gazetteer.js';
import { admitFieldWith } from './fixture.js';

describe('the gazetteer’s shape', () => {
  it('groups every form under a reason and a PRD §37.1 allowed row', () => {
    expect(ALLOWED_ENTITY_FORMS.length).toBeGreaterThanOrEqual(4);
    for (const group of ALLOWED_ENTITY_FORMS) {
      expect(group.reason.length).toBeGreaterThan(20);
      expect(group.prdAllowedRow.length).toBeGreaterThan(10);
      expect(group.forms.length).toBeGreaterThan(0);
    }
  });

  it('is deep-frozen (a process-wide singleton)', () => {
    expect(Object.isFrozen(ALLOWED_ENTITY_FORMS)).toBe(true);
    expect(Object.isFrozen(ALLOWED_ENTITY_FORMS[0]?.forms)).toBe(true);
  });
});

describe('isAllowedEntityForm', () => {
  it.each([
    'Example Widgets Pty Ltd',
    'Smith & Co Pty Ltd',
    'Fair Work Commission',
    'Employee A',
    'the worker',
    'New South Wales',
    'Certificate III',
  ])('allows %s', (form) => {
    expect(isAllowedEntityForm(form)).toBe(true);
  });

  it.each(['Marta Kowalski', 'Ana Popović', 'Wiremu Tane', 'Grace Fields'])(
    'does not allow the invented person name %s',
    (form) => {
      expect(isAllowedEntityForm(form)).toBe(false);
    },
  );
});

describe('the organisation-head test', () => {
  it('sees a head immediately after a captured span', () => {
    const view = normaliseForScan('question', 'The employee works for Example Widgets Pty Ltd.');
    const end = view.scan.indexOf('Widgets') + 'Widgets'.length;
    expect(isFollowedByOrganisationHead(view, end)).toBe(true);
  });

  it('does not see one after an ordinary word', () => {
    const view = normaliseForScan('question', 'My employee Marta Kowalski asked about pay.');
    const end = view.scan.indexOf('Kowalski') + 'Kowalski'.length;
    expect(isFollowedByOrganisationHead(view, end)).toBe(false);
  });
});

describe('the citation guard', () => {
  it('declares the three citation shapes as sources, never compiled globals', () => {
    expect(CITATION_SHAPED.length).toBe(3);
    for (const source of CITATION_SHAPED) expect(typeof source).toBe('string');
  });

  it('covers the sentence a citation sits in', () => {
    const view = normaliseForScan(
      'question',
      'The matter is Smith v Example Widgets Pty Ltd [2024] FWC 123.',
    );
    const ranges = citationSentences(view);
    expect(ranges.length).toBeGreaterThan(0);
    const smith = view.scan.indexOf('Smith');
    expect(isInsideAnyRange(ranges, smith, smith + 5)).toBe(true);
  });

  it('leaves an unrelated sentence alone', () => {
    const view = normaliseForScan(
      'question',
      'My employee Marta Kowalski asked about pay. The matter is Harper v Acme Pty Ltd [2024] FWC 1.',
    );
    const ranges = citationSentences(view);
    const marta = view.scan.indexOf('Marta');
    expect(isInsideAnyRange(ranges, marta, marta + 14)).toBe(false);
  });
});

describe('the gazetteer can never clear a finding (PRD §37.2)', () => {
  it('a free-text field that IS a gazetteer entry, plus a TFN, still rejects', () => {
    const result = admitFieldWith(
      PII_STAGES,
      'question',
      'Example Widgets Pty Ltd — their tax file number is 123 456 782.',
    );
    expect(result.decision).toBe('REJECT');
    expect(result.findings.map((finding) => finding.category)).toContain('TAX_FILE_NUMBER');
  });

  it('a gazetteer entry beside a private phone number still rejects', () => {
    const result = admitFieldWith(
      PII_STAGES,
      'question',
      'Fair Work Commission — call the worker on 0412 345 678 tonight.',
    );
    expect(result.decision).toBe('REJECT');
  });
});
