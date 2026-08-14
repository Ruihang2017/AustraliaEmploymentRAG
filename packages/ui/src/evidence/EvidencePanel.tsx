/**
 * ONE evidence/source panel serving PRD §32.1, §32.3 and §32.4 (ticket Deliverable 3; decision A6 in
 * `docs/prd/breakdown-plan.md` §2.1).
 *
 * A6 is not falsified: the three contracts differ in WHICH prop subtree they read, not in the
 * interaction model. All three are "a labelled aside, a heading, and a body listing evidence for one
 * selected thing". `mode` chooses the body; a discriminated union on `mode` means `source` mode
 * cannot be handed claims and `candidate` mode cannot be handed a `SourceDetail`.
 *
 * SELECTION IS FULLY CONTROLLED. The owning screen holds `selectedClaimId` / `selectedCitationId` /
 * `selectedCandidateId`; this component holds none of it and writes none of it back in an effect
 * (risk R7). The only local state anywhere in this package is a `Disclosure`'s open flag and
 * `CopyableId`'s copy feedback.
 *
 * FILTERING IS PURE AND PRE-RENDER (risk R2). `src/evidence/select.ts` decides what is visible
 * before anything is created; the wrong record's evidence is never in the DOM, hidden or otherwise.
 * A stale or unknown selection renders a LABELLED empty state — never a different claim's citation.
 */
import type { ReactNode } from 'react';

import { Disclosure } from '../primitives/overlay.js';
import { EmptyState, Link } from '../primitives/basic.js';
import {
  AuthorityRoleBadge,
  CitationRelationBadge,
  LegalStatusBadge,
} from '../status/badges.js';
import { formatEffectiveInterval, formatLegalDate } from '../format/date.js';
import {
  orderByEffectiveFrom,
  selectCandidateEvidence,
  selectCitation,
  selectClaimEvidence,
} from './select.js';
import type { Claim, OpaqueId } from '../contracts.js';
import type { CandidateEvidence, CitationView, SourceDetail } from './types.js';

type CommonProps = {
  /** The panel's accessible name. Defaults per mode. */
  readonly label?: string;
};

export type EvidencePanelProps = CommonProps &
  (
    | {
        readonly mode: 'source';
        readonly detail: SourceDetail;
      }
    | {
        readonly mode: 'claim';
        readonly claims: readonly Claim[];
        readonly citations: readonly CitationView[];
        readonly selectedClaimId?: OpaqueId;
        readonly selectedCitationId?: OpaqueId;
        readonly onSelectCitation: (citationId: OpaqueId) => void;
      }
    | {
        readonly mode: 'candidate';
        readonly evidence: readonly CandidateEvidence[];
        readonly citations: readonly CitationView[];
        readonly selectedCandidateId?: OpaqueId;
        readonly selectedCitationId?: OpaqueId;
        readonly onSelectCitation: (citationId: OpaqueId) => void;
      }
  );

const DEFAULT_LABEL = {
  source: 'Source detail',
  claim: 'Evidence for the selected claim',
  candidate: 'Evidence for the selected candidate',
} as const;

/** All six PRD §32.3 fields for one citation. */
function CitationDetail(props: { readonly citation: CitationView }): ReactNode {
  const { citation } = props;
  return (
    <div className="tui-evidence__citation" data-citation-id={citation.id}>
      {/* 1. Exact text — verbatim, never Markdown. PRD §34.2 requires it to equal the source. */}
      <blockquote className="tui-evidence__quote">{citation.quote}</blockquote>
      {/* 2. Pinpoint. */}
      <p className="tui-evidence__pinpoint">
        <span className="tui-evidence__field-label">Pinpoint: </span>
        {citation.pinpoint}
      </p>
      {/* 3. Effective interval. */}
      <p className="tui-evidence__interval">
        <span className="tui-evidence__field-label">In effect: </span>
        <time dateTime={citation.effective_from}>
          {formatEffectiveInterval(citation.effective_from, citation.effective_to)}
        </time>
      </p>
      {/* 4. Authority role (QR13 — caller-supplied panel data). */}
      <p className="tui-evidence__authority">
        <span className="tui-evidence__field-label">Authority: </span>
        {citation.authority === undefined ? (
          'Not recorded for this source.'
        ) : (
          <>
            {citation.authority.name}{' '}
            <AuthorityRoleBadge level={citation.authority.authority_level} />
          </>
        )}
      </p>
      {/* 5. Official URL — through the one URL gate. */}
      <p className="tui-evidence__url">
        <span className="tui-evidence__field-label">Official source: </span>
        <Link href={citation.official_url} label={citation.official_url} newTab />
      </p>
      {/* 6. Supports / qualifies / contradicts, plus the source's legal status. */}
      <p className="tui-evidence__relation">
        <span className="tui-evidence__field-label">Relation to the claim: </span>
        <CitationRelationBadge role={citation.role} />{' '}
        <LegalStatusBadge status={citation.legal_status} />
      </p>
    </div>
  );
}

/** The citation list plus the selected citation's detail, shared by `claim` and `candidate` mode. */
function CitationSection(props: {
  readonly citations: readonly CitationView[];
  readonly selectedCitationId: OpaqueId | undefined;
  readonly onSelectCitation: (citationId: OpaqueId) => void;
  readonly emptyTitle: string;
  readonly emptyExplanation: string;
}): ReactNode {
  const selected = selectCitation(props.selectedCitationId, props.citations);
  if (props.citations.length === 0) {
    return <EmptyState title={props.emptyTitle} explanation={props.emptyExplanation} />;
  }
  return (
    <>
      <ul className="tui-evidence__citation-list" aria-label="Citations">
        {props.citations.map((citation) => (
          <li key={citation.id}>
            <button
              type="button"
              className="tui-evidence__citation-button"
              aria-pressed={citation.id === selected?.id}
              onClick={() => props.onSelectCitation(citation.id)}
            >
              {citation.pinpoint}
            </button>
          </li>
        ))}
      </ul>
      {props.selectedCitationId !== undefined && selected === undefined ? (
        <EmptyState
          title="That citation is not available here"
          explanation="The citation you selected is not one of the citations shown above. Select one from the list."
        />
      ) : null}
      {selected === undefined ? null : <CitationDetail citation={selected} />}
    </>
  );
}

export function EvidencePanel(props: EvidencePanelProps): ReactNode {
  const label = props.label ?? DEFAULT_LABEL[props.mode];

  return (
    <aside className="tui-evidence" aria-label={label} data-mode={props.mode}>
      <h2 className="tui-evidence__heading">{label}</h2>

      {props.mode === 'source' ? <SourceBody detail={props.detail} /> : null}

      {props.mode === 'claim' ? (
        <CitationSection
          citations={selectClaimEvidence(
            props.claims.find((claim) => claim.id === props.selectedClaimId),
            props.citations,
          )}
          selectedCitationId={props.selectedCitationId}
          onSelectCitation={props.onSelectCitation}
          emptyTitle="No claim selected"
          emptyExplanation="Select a claim in the answer to see the sources it relies on."
        />
      ) : null}

      {props.mode === 'candidate' ? (
        <CitationSection
          citations={selectCandidateEvidence(
            props.selectedCandidateId,
            props.evidence,
            props.citations,
          )}
          selectedCitationId={props.selectedCitationId}
          onSelectCitation={props.onSelectCitation}
          emptyTitle="No candidate selected"
          emptyExplanation="Select a coverage candidate to see only the evidence relevant to it."
        />
      ) : null}
    </aside>
  );
}

/** The three PRD §32.1 regions: version timeline, source/licence limitations, related records. */
function SourceBody(props: { readonly detail: SourceDetail }): ReactNode {
  const versions = orderByEffectiveFrom(props.detail.versions);
  return (
    <>
      <section aria-label="Version timeline">
        <h3>Version timeline</h3>
        {versions.length === 0 ? (
          <EmptyState
            title="No versions recorded"
            explanation="No version history has been captured for this source yet."
          />
        ) : (
          <ol className="tui-evidence__timeline">
            {versions.map((version) => (
              <li key={version.document_version_id}>
                <span className="tui-evidence__version-label">{version.label}</span>{' '}
                <LegalStatusBadge status={version.legal_status} />{' '}
                <time dateTime={version.effective_from}>
                  {formatEffectiveInterval(version.effective_from, version.effective_to)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Source and licence limitations">
        <h3>Source and licence limitations</h3>
        {props.detail.licenceLimitations.length === 0 ? (
          <p>No limitations are recorded for this source.</p>
        ) : (
          <ul>
            {props.detail.licenceLimitations.map((limitation) => (
              /* Plain text by type — never Markdown, never HTML. */
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Related amendments, cases and instruments">
        <h3>Related amendments, cases and instruments</h3>
        {props.detail.related.length === 0 ? (
          <p>No related records are recorded for this source.</p>
        ) : (
          <ul>
            {props.detail.related.map((related) => (
              <li key={related.id}>
                <span className="tui-evidence__related-kind">{RELATED_KIND_TEXT[related.kind]}: </span>
                <Link href={related.official_url} label={related.title} newTab />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Disclosure summary="What these dates mean">
        <p>
          A version is in effect from its start date until the day before the next version begins.
          Dates are shown as {formatLegalDate('2026-08-03')} and are stored in ISO format.
        </p>
      </Disclosure>
    </>
  );
}

/** Presentation labels for the three PRD §32.1 relation buckets — not a product vocabulary. */
const RELATED_KIND_TEXT = {
  AMENDMENT: 'Amendment',
  CASE: 'Case',
  INSTRUMENT: 'Instrument',
} as const;
