/**
 * The evidence panel's VIEW-MODEL prop types.
 *
 * Composed from the contracts types; this file declares no controlled value and no vocabulary. Two
 * things in it are presentation shapes rather than product values, and both are deliberate:
 *
 *  - `CitationView.authority` — the generated `Citation` carries `role` (supports / qualifies /
 *    contradicts) but NO authority reference, while PRD §32.3 requires the panel to show the
 *    citation's "authority role". It therefore arrives as caller-supplied panel data, typed with the
 *    contracts `AuthorityLevel`. Recorded as open question QR13; if `Citation` gains the field this
 *    becomes a re-export and no component logic changes.
 *  - `SourceDetail.related[].kind` — a local presentation discriminator for the three PRD §32.1
 *    relation buckets ("related amendments/cases/instruments"), used to group a list. It is not a
 *    product value and is not stored, sent or compared against anything upstream.
 */
import type {
  AuthorityLevel,
  Citation,
  LegalDate,
  LegalStatus,
  OpaqueId,
} from '../contracts.js';

/** A `Citation` plus the authority standing of its source (QR13). */
export type CitationView = Citation & {
  readonly authority?: {
    readonly name: string;
    readonly authority_level: AuthorityLevel;
  };
};

/** One row of the PRD §32.1 version timeline. */
export type SourceVersion = {
  readonly document_version_id: OpaqueId;
  readonly label: string;
  readonly effective_from: LegalDate;
  readonly effective_to: string | null;
  readonly legal_status: LegalStatus;
};

/** One related amendment, case or instrument (PRD §32.1). */
export type RelatedRecord = {
  readonly kind: 'AMENDMENT' | 'CASE' | 'INSTRUMENT';
  readonly id: OpaqueId;
  readonly title: string;
  readonly official_url: string;
};

/** The PRD §32.1 right/detail panel's data. */
export type SourceDetail = {
  readonly versions: readonly SourceVersion[];
  /** Source and licence limitations, plain text. Never Markdown, never HTML. */
  readonly licenceLimitations: readonly string[];
  readonly related: readonly RelatedRecord[];
};

/** Which citations belong to a coverage candidate (PRD §32.4). */
export type CandidateEvidence = {
  readonly candidateId: OpaqueId;
  readonly citationIds: readonly OpaqueId[];
};

/** A highlighted range within claim-linked prose, supplied by the caller (PRD §32.3). */
export type PassageHighlight = {
  readonly start: number;
  readonly end: number;
  readonly claimId: OpaqueId;
};
