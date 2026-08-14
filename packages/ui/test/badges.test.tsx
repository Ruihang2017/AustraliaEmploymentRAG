import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  AUTHORITY_LEVEL_VALUES,
  CITATION_ROLE_VALUES,
  LEGAL_STATUS_VALUES,
} from '../src/contracts.js';
import {
  AuthorityRoleBadge,
  BADGE_LABELS,
  CitationRelationBadge,
  FreshnessBadge,
  JurisdictionBadge,
  LegalStatusBadge,
} from '../src/status/badges.js';

/** Text plus a non-colour signal, for every badge, at every member of its vocabulary. */
function expectTextAndShape(container: HTMLElement, label: string): void {
  expect(container.textContent).toContain(label);
  const shape = container.querySelector('svg[aria-hidden="true"]');
  expect(shape, `no shape node rendered for "${label}"`).not.toBeNull();
  expect(container.querySelector('[data-shape]')?.getAttribute('data-shape')).toBeTruthy();
}

describe('LegalStatusBadge (PRD §41.1)', () => {
  it.each(LEGAL_STATUS_VALUES)('renders %s with text and a shape', (status) => {
    const { container } = render(<LegalStatusBadge status={status} />);
    expectTextAndShape(container, BADGE_LABELS.legalStatus[status].label);
  });

  it('covers every member of the contracts vocabulary and no more', () => {
    expect(Object.keys(BADGE_LABELS.legalStatus).sort()).toEqual([...LEGAL_STATUS_VALUES].sort());
  });
});

describe('AuthorityRoleBadge (PRD §32.3, §9.1)', () => {
  it.each(AUTHORITY_LEVEL_VALUES)('renders %s with text and a shape', (level) => {
    const { container } = render(<AuthorityRoleBadge level={level} />);
    expectTextAndShape(container, BADGE_LABELS.authorityLevel[level].label);
  });

  it('covers every member of the contracts vocabulary and no more', () => {
    expect(Object.keys(BADGE_LABELS.authorityLevel).sort()).toEqual(
      [...AUTHORITY_LEVEL_VALUES].sort(),
    );
  });
});

describe('CitationRelationBadge (PRD §15.5, §32.3)', () => {
  it.each(CITATION_ROLE_VALUES)('renders %s with text and a shape', (role) => {
    const { container } = render(<CitationRelationBadge role={role} />);
    expectTextAndShape(container, BADGE_LABELS.citationRole[role].label);
  });

  it('covers every member of the contracts vocabulary and no more', () => {
    expect(Object.keys(BADGE_LABELS.citationRole).sort()).toEqual([...CITATION_ROLE_VALUES].sort());
  });

  it('gives supports, qualifies and contradicts three DIFFERENT shapes, not three colours', () => {
    const shapes = new Set(
      (['SUPPORTS', 'QUALIFIES', 'CONTRADICTS'] as const).map(
        (role) => BADGE_LABELS.citationRole[role].shape,
      ),
    );
    expect(shapes.size).toBe(3);
  });
});

describe('JurisdictionBadge and FreshnessBadge (sub-PRD Q-F10 / QR14)', () => {
  it('renders the open jurisdiction code it is given, with a shape', () => {
    const { container } = render(<JurisdictionBadge jurisdiction="AU-VIC" />);
    expectTextAndShape(container, 'AU-VIC');
  });

  it('renders the open freshness string it is given, with a shape', () => {
    const { container } = render(<FreshnessBadge freshness="Verified 3 Aug 2026" />);
    expectTextAndShape(container, 'Verified 3 Aug 2026');
  });
});
