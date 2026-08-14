import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { EvidencePanel } from '../src/evidence/EvidencePanel.js';
import { ClaimText, InvalidHighlightRangeError, validateHighlights } from '../src/evidence/ClaimText.js';
import {
  orderByEffectiveFrom,
  selectCandidateEvidence,
  selectCitation,
  selectClaimEvidence,
} from '../src/evidence/select.js';
import type { CitationView } from '../src/evidence/types.js';
import {
  answerSnapshotFixture,
  coverageCandidateFixture,
  evidencePackFixture,
  searchDetailFixture,
} from './support/fixtures.js';

const snapshot = answerSnapshotFixture();
const detail = searchDetailFixture();
const coverage = coverageCandidateFixture();
const pack = evidencePackFixture();

const CLAIM_1 = snapshot.claims[0]!;
const CLAIM_2 = snapshot.claims[1]!;
const CLAIM_3 = snapshot.claims[2]!;

/** The snapshot's citations, given the authority the panel shows (QR13 — caller-supplied). */
const citationViews: readonly CitationView[] = snapshot.citations.map((citation) => ({
  ...citation,
  authority: {
    name: 'Synthetic Commonwealth Parliament',
    authority_level:
      citation.role === 'CONTRADICTS'
        ? ('BINDING_JUDICIAL_AUTHORITY' as const)
        : ('CONSTITUTION_AND_LEGISLATION' as const),
  },
}));

function citationById(id: string): CitationView {
  const found = citationViews.find((citation) => citation.id === id);
  if (found === undefined) throw new Error(`fixture has no citation ${id}`);
  return found;
}

describe('claim mode (PRD §32.3)', () => {
  it('shows only the selected claim citations, and nothing before a claim is selected', () => {
    render(
      <EvidencePanel
        mode="claim"
        claims={snapshot.claims}
        citations={citationViews}
        onSelectCitation={vi.fn()}
      />,
    );
    expect(screen.getByText('No claim selected')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Citations' })).toBeNull();
  });

  it('selecting a claim raises onSelectClaim with that claim id', async () => {
    const onSelectClaim = vi.fn();
    render(<ClaimText claims={snapshot.claims} onSelectClaim={onSelectClaim} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^Claim 1: `) }));
    expect(onSelectClaim).toHaveBeenCalledWith(CLAIM_1.id);
  });

  it('names each claim with its support status, so it is comprehensible without sight', () => {
    render(<ClaimText claims={snapshot.claims} onSelectClaim={vi.fn()} />);
    expect(screen.getByRole('button', { name: /directly supported$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /conditional$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /contradicted$/ })).toBeTruthy();
  });

  it('shows exactly the selected claim citations and no other claim citation', () => {
    render(
      <EvidencePanel
        mode="claim"
        claims={snapshot.claims}
        citations={citationViews}
        selectedClaimId={CLAIM_1.id}
        onSelectCitation={vi.fn()}
      />,
    );
    const list = screen.getByRole('list', { name: 'Citations' });
    const shown = within(list)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(shown).toEqual(CLAIM_1.citation_ids.map((id) => citationById(id).pinpoint));

    // Claim 2's and claim 3's quotes are absent from the DOM entirely, not merely hidden.
    for (const claim of [CLAIM_2, CLAIM_3]) {
      for (const id of claim.citation_ids) {
        expect(document.body.textContent).not.toContain(citationById(id).quote);
      }
    }
  });

  it.each([
    ['SUPPORTS', 'cit_0192f8c1-6a3f-7c21-9c8e-000000000030', 'Supports'],
    ['QUALIFIES', 'cit_0192f8c1-6a3f-7c21-9c8e-000000000032', 'Qualifies'],
    ['CONTRADICTS', 'cit_0192f8c1-6a3f-7c21-9c8e-000000000033', 'Contradicts'],
  ])('a %s citation shows all six PRD §32.3 fields', (_role, citationId, relationLabel) => {
    const citation = citationById(citationId);
    const owningClaim = snapshot.claims.find((claim) => claim.citation_ids.includes(citation.id))!;
    const { container } = render(
      <EvidencePanel
        mode="claim"
        claims={snapshot.claims}
        citations={citationViews}
        selectedClaimId={owningClaim.id}
        selectedCitationId={citation.id}
        onSelectCitation={vi.fn()}
      />,
    );
    const panel = screen.getByRole('complementary', { name: 'Evidence for the selected claim' });

    // 1. Exact text, verbatim.
    expect(within(panel).getByText(citation.quote).tagName).toBe('BLOCKQUOTE');
    // 2. Pinpoint.
    expect(within(panel).getByText(`Pinpoint:`).parentElement?.textContent).toContain(
      citation.pinpoint,
    );
    // 3. Effective interval, in the PRD §41.1 display format, ISO kept in the attribute.
    const time = container.querySelector('.tui-evidence__interval time');
    expect(time?.getAttribute('datetime')).toBe(citation.effective_from);
    expect(time?.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4} – /);
    // 4. Authority role.
    expect(within(panel).getByText(/^Authority:/).parentElement?.textContent).toContain(
      'Synthetic Commonwealth Parliament',
    );
    // 5. Official URL, as an https anchor through the one URL gate.
    const anchor = within(panel).getByRole('link', { name: new RegExp(citation.official_url) });
    expect(anchor.getAttribute('href')).toBe(citation.official_url);
    expect(anchor.getAttribute('rel')).toContain('noreferrer');
    // 6. supports / qualifies / contradicts.
    expect(within(panel).getByText(relationLabel)).toBeTruthy();
  });

  it('raises onSelectCitation when a citation is chosen', async () => {
    const onSelectCitation = vi.fn();
    render(
      <EvidencePanel
        mode="claim"
        claims={snapshot.claims}
        citations={citationViews}
        selectedClaimId={CLAIM_1.id}
        onSelectCitation={onSelectCitation}
      />,
    );
    const list = screen.getByRole('list', { name: 'Citations' });
    await userEvent.click(within(list).getAllByRole('button')[0]!);
    expect(onSelectCitation).toHaveBeenCalledWith(CLAIM_1.citation_ids[0]);
  });

  it('a stale selectedCitationId from another claim shows a labelled empty state, not that citation', () => {
    const stranger = citationById(CLAIM_3.citation_ids[0]!);
    render(
      <EvidencePanel
        mode="claim"
        claims={snapshot.claims}
        citations={citationViews}
        selectedClaimId={CLAIM_1.id}
        selectedCitationId={stranger.id}
        onSelectCitation={vi.fn()}
      />,
    );
    expect(screen.getByText('That citation is not available here')).toBeTruthy();
    expect(document.body.textContent).not.toContain(stranger.quote);
  });
});

describe('source mode (PRD §32.1)', () => {
  it('renders all three regions by accessible name', () => {
    render(<EvidencePanel mode="source" detail={detail} />);
    expect(screen.getByRole('region', { name: 'Version timeline' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Source and licence limitations' })).toBeTruthy();
    expect(
      screen.getByRole('region', { name: 'Related amendments, cases and instruments' }),
    ).toBeTruthy();
  });

  it('orders the timeline by effective date and badges each version legal status', () => {
    render(<EvidencePanel mode="source" detail={detail} />);
    const timeline = screen.getByRole('region', { name: 'Version timeline' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items.map((item) => item.textContent?.split(' ')[0])).toBeTruthy();
    expect(items).toHaveLength(detail.versions.length);
    expect(items[0]?.textContent).toContain('As made (2025 compilation)');
    expect(items[0]?.textContent).toContain('Superseded');
    expect(items[1]?.textContent).toContain('In force');
    expect(items[2]?.textContent).toContain('Enacted, not yet in force');
  });

  it('lists every licence limitation as plain text', () => {
    render(<EvidencePanel mode="source" detail={detail} />);
    const region = screen.getByRole('region', { name: 'Source and licence limitations' });
    for (const limitation of detail.licenceLimitations) {
      expect(within(region).getByText(limitation)).toBeTruthy();
    }
  });

  it('lists one related record of each kind, each as an allowed link', () => {
    render(<EvidencePanel mode="source" detail={detail} />);
    const region = screen.getByRole('region', {
      name: 'Related amendments, cases and instruments',
    });
    for (const related of detail.related) {
      const link = within(region).getByRole('link', {
        name: (name: string) => name.includes(related.title),
      });
      expect(link.getAttribute('href')).toBe(related.official_url);
    }
    expect(within(region).getByText(/^Amendment:/)).toBeTruthy();
    expect(within(region).getByText(/^Case:/)).toBeTruthy();
    expect(within(region).getByText(/^Instrument:/)).toBeTruthy();
  });
});

describe('candidate mode (PRD §32.4)', () => {
  const [first, second] = coverage.candidates;

  it('renders only the selected candidate evidence, with the other absent from the DOM', () => {
    const { container } = render(
      <EvidencePanel
        mode="candidate"
        evidence={coverage.evidence}
        citations={coverage.citations}
        selectedCandidateId={first!.id}
        selectedCitationId={coverage.evidence[0]!.citationIds[0]!}
        onSelectCitation={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('CLERICAL COVERAGE MARKER');
    expect(container.textContent).not.toContain('MANUFACTURING COVERAGE MARKER');
    // Not merely visually hidden: it is not in the accessibility tree either.
    expect(screen.queryByText(/MANUFACTURING COVERAGE MARKER/)).toBeNull();
    expect(container.querySelector('[data-citation-id="cit_0192f8c1-6a3f-7c21-9c8e-000000000091"]')).toBeNull();
  });

  it('renders the other candidate evidence when the other candidate is selected', () => {
    const { container } = render(
      <EvidencePanel
        mode="candidate"
        evidence={coverage.evidence}
        citations={coverage.citations}
        selectedCandidateId={second!.id}
        selectedCitationId={coverage.evidence[1]!.citationIds[0]!}
        onSelectCitation={vi.fn()}
      />,
    );
    expect(container.textContent).toContain('MANUFACTURING COVERAGE MARKER');
    expect(container.textContent).not.toContain('CLERICAL COVERAGE MARKER');
  });

  it('shows a labelled empty state, not everything, when no candidate is selected', () => {
    const { container } = render(
      <EvidencePanel
        mode="candidate"
        evidence={coverage.evidence}
        citations={coverage.citations}
        onSelectCitation={vi.fn()}
      />,
    );
    expect(screen.getByText('No candidate selected')).toBeTruthy();
    expect(container.textContent).not.toContain('COVERAGE MARKER');
  });
});

describe('the pure selection helpers', () => {
  it('selectCandidateEvidence returns only that candidate citations', () => {
    const chosen = selectCandidateEvidence(
      coverage.candidates[0]!.id,
      coverage.evidence,
      coverage.citations,
    );
    expect(chosen.map((citation) => citation.id)).toEqual(coverage.evidence[0]!.citationIds);
  });

  it('selectCandidateEvidence returns nothing for an unknown or absent candidate', () => {
    expect(selectCandidateEvidence('cnd_unknown', coverage.evidence, coverage.citations)).toEqual([]);
    expect(selectCandidateEvidence(undefined, coverage.evidence, coverage.citations)).toEqual([]);
  });

  it('selectClaimEvidence keeps the claim own order and drops unresolvable ids', () => {
    expect(selectClaimEvidence(CLAIM_1, citationViews).map((c) => c.id)).toEqual([
      ...CLAIM_1.citation_ids,
    ]);
    expect(selectClaimEvidence(CLAIM_1, []).length).toBe(0);
    expect(selectClaimEvidence(undefined, citationViews)).toEqual([]);
  });

  it('selectCitation refuses an id that is not in the available set', () => {
    const available = selectClaimEvidence(CLAIM_1, citationViews);
    expect(selectCitation(CLAIM_3.citation_ids[0], available)).toBeUndefined();
    expect(selectCitation(CLAIM_1.citation_ids[0], available)?.id).toBe(CLAIM_1.citation_ids[0]);
  });

  it('orderByEffectiveFrom does not mutate its input', () => {
    const input = [...detail.versions];
    const before = input.map((version) => version.document_version_id);
    orderByEffectiveFrom(input);
    expect(input.map((version) => version.document_version_id)).toEqual(before);
  });
});

describe('ClaimText highlighting (risk R3)', () => {
  const text = CLAIM_1.text;

  it('highlights exactly the given range and drops or duplicates no character', () => {
    const { container } = render(
      <ClaimText
        claims={[CLAIM_1]}
        onSelectClaim={vi.fn()}
        highlights={{ [CLAIM_1.id]: [{ start: 2, end: 8, claimId: CLAIM_1.id }] }}
      />,
    );
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe(text.slice(2, 8));
    expect(container.querySelector('.tui-claim-text__claim')?.textContent).toBe(text);
  });

  it.each([
    [{ start: -1, end: 4 }, 'out of bounds low'],
    [{ start: 0, end: text.length + 1 }, 'out of bounds high'],
    [{ start: 8, end: 2 }, 'reversed'],
    [{ start: 3, end: 3 }, 'empty'],
    [{ start: 1.5, end: 4 }, 'not an integer'],
  ])('rejects a %s range (%s) with a named error rather than a garbled slice', (range) => {
    expect(() =>
      validateHighlights([{ ...range, claimId: CLAIM_1.id }], text.length),
    ).toThrow(InvalidHighlightRangeError);
  });

  it('rejects overlapping ranges', () => {
    expect(() =>
      validateHighlights(
        [
          { start: 0, end: 10, claimId: CLAIM_1.id },
          { start: 5, end: 15, claimId: CLAIM_1.id },
        ],
        text.length,
      ),
    ).toThrow(InvalidHighlightRangeError);
  });

  it('accepts adjacent, ordered ranges and returns them sorted', () => {
    const ordered = validateHighlights(
      [
        { start: 10, end: 15, claimId: CLAIM_1.id },
        { start: 0, end: 10, claimId: CLAIM_1.id },
      ],
      text.length,
    );
    expect(ordered.map((range) => range.start)).toEqual([0, 10]);
  });
});

describe('the committed fixtures render without error and reproduce their field sets', () => {
  it('answer-snapshot.json carries three claims, four citations and all three relations', () => {
    expect(snapshot.claims.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.citations.length).toBeGreaterThanOrEqual(4);
    const roles = new Set(snapshot.citations.map((citation) => citation.role));
    expect(roles.has('SUPPORTS')).toBe(true);
    expect(roles.has('QUALIFIES')).toBe(true);
    expect(roles.has('CONTRADICTS')).toBe(true);
    expect(CLAIM_1.citation_ids.length).toBe(2);
    for (const citation of snapshot.citations) {
      expect(citation.id).toMatch(/^[a-z]{2,8}_[0-9a-f-]{36}$/);
    }
  });

  it('evidence-pack.json references the same citation ids as the snapshot', () => {
    const snapshotIds = new Set(snapshot.citations.map((citation) => citation.id));
    expect(pack.citations.length).toBeGreaterThan(0);
    for (const citation of pack.citations) {
      expect(snapshotIds.has(citation.id)).toBe(true);
    }
  });

  it('search-detail.json has a superseded and an in-force version, a limitation and each kind', () => {
    const statuses = detail.versions.map((version) => version.legal_status);
    expect(statuses).toContain('SUPERSEDED');
    expect(statuses).toContain('IN_FORCE');
    expect(detail.licenceLimitations.length).toBeGreaterThanOrEqual(1);
    expect(new Set(detail.related.map((related) => related.kind))).toEqual(
      new Set(['AMENDMENT', 'CASE', 'INSTRUMENT']),
    );
  });

  it('coverage-candidate.json has two candidates with disjoint citation sets', () => {
    expect(coverage.candidates).toHaveLength(2);
    const [a, b] = coverage.evidence;
    const overlap = a!.citationIds.filter((id) => b!.citationIds.includes(id));
    expect(overlap).toEqual([]);
  });

  it('every fixture renders through the panel without throwing', () => {
    expect(() => render(<EvidencePanel mode="source" detail={detail} />)).not.toThrow();
    expect(() =>
      render(
        <EvidencePanel
          mode="claim"
          claims={snapshot.claims}
          citations={citationViews}
          selectedClaimId={CLAIM_1.id}
          selectedCitationId={CLAIM_1.citation_ids[0]!}
          onSelectCitation={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(() =>
      render(
        <EvidencePanel
          mode="candidate"
          evidence={coverage.evidence}
          citations={coverage.citations}
          selectedCandidateId={coverage.candidates[0]!.id}
          onSelectCitation={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(() =>
      render(<ClaimText claims={snapshot.claims} onSelectClaim={vi.fn()} />),
    ).not.toThrow();
  });
});
