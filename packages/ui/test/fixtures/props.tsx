/**
 * One rendered example per exported component, for the accessibility sweep.
 *
 * `test/a11y.test.tsx` asserts that EVERY component exported from `src/ui.ts` has an entry here, so
 * adding a component without an accessibility case fails the suite rather than quietly skipping it.
 */
import type { ReactElement } from 'react';

import * as ui from '../../src/ui.js';
import { answerSnapshotFixture, coverageCandidateFixture, searchDetailFixture } from '../support/fixtures.js';
import type { CitationView } from '../../src/evidence/types.js';

const snapshot = answerSnapshotFixture();
const detail = searchDetailFixture();
const coverage = coverageCandidateFixture();

const REQUEST_ID = 'req_0192f8c1-6a3f-7c21-9c8e-0aa1b2c3d4e5';
const noop = (): void => undefined;

const citationViews: readonly CitationView[] = snapshot.citations.map((citation) => ({
  ...citation,
  authority: {
    name: 'Synthetic Commonwealth Parliament',
    authority_level: 'CONSTITUTION_AND_LEGISLATION' as const,
  },
}));

const OPTIONS = [
  { value: 'AU-VIC', label: 'Victoria' },
  { value: 'AU-NSW', label: 'New South Wales' },
];

/**
 * The examples. Keyed by the exported name; every entry is a fully rendered, realistic element.
 *
 * `Dialog` and `Disclosure` are rendered OPEN, because a closed dialog renders nothing and would
 * make its accessibility case vacuous.
 */
export const COMPONENT_EXAMPLES: Readonly<Record<string, ReactElement>> = {
  Badge: <ui.Badge label="In force" shape="circle" />,
  Button: <ui.Button label="Run search" onClick={noop} />,
  Checkbox: <ui.Checkbox label="Save to a record" checked={false} onChange={noop} />,
  Chip: <ui.Chip label="Victoria" onRemove={noop} />,
  ClaimText: <ui.ClaimText claims={snapshot.claims} onSelectClaim={noop} />,
  CopyableId: <ui.CopyableId label="Request ID" value={REQUEST_ID} />,
  DateField: <ui.DateField label="Legal as at" value="2026-08-03" onChange={noop} />,
  DestructiveAction: (
    <ui.DestructiveAction
      label="Delete this record"
      exactEffect="The record, its answers and its evidence packs are deleted immediately."
      recovery="Ask an administrator to restore it from the retention archive within 30 days."
      onConfirm={noop}
    />
  ),
  Dialog: (
    <ui.Dialog open title="Confirm deletion" onClose={noop}>
      <p>This cannot be undone from this screen.</p>
    </ui.Dialog>
  ),
  Disclosure: (
    <ui.Disclosure summary="Licence limitations" open>
      <p>Reproduced under a synthetic open-access licence.</p>
    </ui.Disclosure>
  ),
  EmptyState: (
    <ui.EmptyState
      title="No sources matched"
      explanation="Broaden the jurisdiction filter or remove the date limit."
      action={{ label: 'Clear filters', onAction: noop }}
    />
  ),
  ErrorSummary: (
    <ui.ErrorSummary entries={[{ fieldId: 'question', message: 'Enter a question.' }]} />
  ),
  EvidencePanel: (
    <ui.EvidencePanel
      mode="claim"
      claims={snapshot.claims}
      citations={citationViews}
      selectedClaimId={snapshot.claims[0]?.id ?? ''}
      selectedCitationId={snapshot.claims[0]?.citation_ids[0] ?? ''}
      onSelectCitation={noop}
    />
  ),
  FreshnessBadge: <ui.FreshnessBadge freshness="Verified 3 Aug 2026" />,
  JobStateView: (
    <ui.JobStateView
      state="RUNNING"
      requestId={REQUEST_ID}
      actions={[{ id: 'cancel', label: 'Cancel', onAction: noop }]}
    />
  ),
  JurisdictionBadge: <ui.JurisdictionBadge jurisdiction="AU-VIC" />,
  AuthorityRoleBadge: <ui.AuthorityRoleBadge level="CONSTITUTION_AND_LEGISLATION" />,
  CitationRelationBadge: <ui.CitationRelationBadge role="SUPPORTS" />,
  LegalStatusBadge: <ui.LegalStatusBadge status="IN_FORCE" />,
  Link: <ui.Link href="https://www.example-legislation.gov.au/C2026A00001" label="The Act" />,
  LiveRegion: <ui.LiveRegion message="Job queued" />,
  MultiSelect: (
    <ui.MultiSelect label="Jurisdictions" values={['AU-VIC']} options={OPTIONS} onChange={noop} />
  ),
  PageHeading: <ui.PageHeading text="Search" subtitle="Find a source" />,
  RadioGroup: <ui.RadioGroup label="Retention" value="AU-VIC" options={OPTIONS} onChange={noop} />,
  SafeMarkdown: <ui.SafeMarkdown source={'## Finding\n\nA **bold** claim with a [link](https://ok.example).'} />,
  Select: <ui.Select label="Jurisdiction" value="AU-VIC" options={OPTIONS} onChange={noop} />,
  SkipLink: <ui.SkipLink targetId="main" />,
  Table: (
    <ui.Table
      caption="Versions"
      columns={[
        {
          key: 'label',
          header: 'Version',
          cell: (row: { readonly label: string }) => row.label,
        },
      ]}
      rows={detail.versions.map((version) => ({ label: version.label }))}
      rowKey={(row) => row.label}
    />
  ),
  Tabs: (
    <ui.Tabs
      label="Detail"
      selectedId="a"
      onSelect={noop}
      tabs={[
        { id: 'a', label: 'Timeline', content: <p>Timeline body</p> },
        { id: 'b', label: 'Limitations', content: <p>Limitations body</p> },
      ]}
    />
  ),
  TextArea: <ui.TextArea label="Facts" value="" onChange={noop} />,
  TextField: <ui.TextField label="Question" value="" onChange={noop} />,
  Toolbar: (
    <ui.Toolbar label="Result actions">
      <ui.Button label="Save" onClick={noop} />
    </ui.Toolbar>
  ),
  Tooltip: <ui.Tooltip label="Freshness" text="How recently the source was verified." />,
};

/** The `source`-mode and `candidate`-mode panels, swept alongside the `claim`-mode one above. */
export const EXTRA_EXAMPLES: Readonly<Record<string, ReactElement>> = {
  'EvidencePanel (source mode)': <ui.EvidencePanel mode="source" detail={detail} />,
  'EvidencePanel (candidate mode)': (
    <ui.EvidencePanel
      mode="candidate"
      evidence={coverage.evidence}
      citations={coverage.citations}
      selectedCandidateId={coverage.candidates[0]?.id ?? ''}
      selectedCitationId={coverage.evidence[0]?.citationIds[0] ?? ''}
      onSelectCitation={noop}
    />
  ),
  'JobStateView (FAILED)': (
    <ui.JobStateView
      state="FAILED"
      requestId={REQUEST_ID}
      jobId="job_0192f8c1-7b40-7d33-8a11-1bb2c3d4e5f6"
      actions={[{ id: 'retry', label: 'Try again', onAction: noop }]}
    />
  ),
  'A composed form': (
    <form>
      <ui.ErrorSummary entries={[{ fieldId: 'q', message: 'Enter a question.' }]} />
      <ui.TextField label="Question" value="" onChange={noop} error="Enter a question." id="q" />
      <ui.DateField label="Legal as at" value="2026-08-03" onChange={noop} />
      <ui.Button label="Run research" onClick={noop} variant="primary" />
    </form>
  ),
};
