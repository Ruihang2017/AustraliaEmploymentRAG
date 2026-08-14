/**
 * The status badges (ticket Deliverable 7): `LegalStatusBadge`, `JurisdictionBadge`,
 * `FreshnessBadge`, `AuthorityRoleBadge`, `CitationRelationBadge`.
 *
 * PRD §41.1: "jurisdiction, legal status and source freshness use text plus badge/icon" and "colour
 * is never the only status signal". Every badge here renders visible TEXT plus a SHAPE. There is no
 * `variant`, no `iconOnly` and no `showShape` prop — a colour-only badge is not representable
 * through this API, which is a stronger guarantee than a test that no caller passes the wrong flag.
 *
 * NO CONTROLLED VALUE IS DECLARED HERE (ticket Non-goals; PRD §35.1). The maps below are KEYED BY
 * the vocabulary re-exported from `packages/contracts` and are exhaustive by `satisfies`: a member
 * added upstream breaks `pnpm typecheck` here rather than rendering a blank badge. A `Record` keyed
 * by an imported union is not an enum declaration — `test/source-scan.test.ts` deliberately targets
 * `as const` ARRAYS of UPPER_SNAKE literals, which none of these are. Do not "fix" that.
 */
import type { ReactNode } from 'react';

import { Badge } from '../primitives/basic.js';
import type {
  AuthorityLevel,
  CitationRole,
  JurisdictionCode,
  LegalStatus,
} from '../contracts.js';

type BadgeTone = 'neutral' | 'positive' | 'caution' | 'negative';
type BadgeShape = 'square' | 'circle' | 'triangle' | 'diamond' | 'bar';
type BadgeLook = { readonly label: string; readonly shape: BadgeShape; readonly tone: BadgeTone };

/** PRD §6.7 legal status. Shape and tone both vary, so shape alone carries the distinction. */
const LEGAL_STATUS_LOOK = {
  IN_FORCE: { label: 'In force', shape: 'circle', tone: 'positive' },
  ENACTED_NOT_IN_FORCE: { label: 'Enacted, not yet in force', shape: 'diamond', tone: 'caution' },
  BILL_NOT_ENACTED: { label: 'Bill, not enacted', shape: 'triangle', tone: 'caution' },
  DRAFT_OR_CONSULTATION: { label: 'Draft or consultation', shape: 'triangle', tone: 'caution' },
  REPEALED: { label: 'Repealed', shape: 'square', tone: 'negative' },
  SUPERSEDED: { label: 'Superseded', shape: 'square', tone: 'negative' },
  STATUS_UNCONFIRMED: { label: 'Status unconfirmed', shape: 'bar', tone: 'caution' },
} satisfies Record<LegalStatus, BadgeLook>;

export type LegalStatusBadgeProps = { readonly status: LegalStatus };

export function LegalStatusBadge(props: LegalStatusBadgeProps): ReactNode {
  const look = LEGAL_STATUS_LOOK[props.status];
  return <Badge label={look.label} shape={look.shape} tone={look.tone} />;
}

export type JurisdictionBadgeProps = { readonly jurisdiction: JurisdictionCode };

/**
 * `JurisdictionCode` is deliberately NOT an `ENUM_REGISTRY` family (sub-PRD Q-F10; the generated
 * type is `string`), so this badge renders whatever code it is given rather than declaring a local
 * vocabulary — declaring one here is exactly what the ticket's Non-goals forbid. Recorded as QR14.
 */
export function JurisdictionBadge(props: JurisdictionBadgeProps): ReactNode {
  return <Badge label={props.jurisdiction} shape="square" tone="neutral" />;
}

export type FreshnessBadgeProps = {
  /** `SearchResult.freshness`, typed `string` upstream for the same reason (QR14). */
  readonly freshness: string;
};

export function FreshnessBadge(props: FreshnessBadgeProps): ReactNode {
  return <Badge label={props.freshness} shape="bar" tone="neutral" />;
}

/**
 * PRD §9.1 authority hierarchy — an ORDERED family whose index 0 is the highest authority. The tone
 * follows that ordering; the shape distinguishes the three bands without relying on it.
 */
const AUTHORITY_LEVEL_LOOK = {
  CONSTITUTION_AND_LEGISLATION: { label: 'Constitution and legislation', shape: 'circle', tone: 'positive' },
  REGULATIONS_AND_LEGISLATIVE_INSTRUMENTS: {
    label: 'Regulations and legislative instruments',
    shape: 'circle',
    tone: 'positive',
  },
  BINDING_JUDICIAL_AUTHORITY: { label: 'Binding judicial authority', shape: 'circle', tone: 'positive' },
  OPERATIVE_FWC_INSTRUMENTS_AND_DECISIONS: {
    label: 'Operative FWC instruments and decisions',
    shape: 'diamond',
    tone: 'neutral',
  },
  PERSUASIVE_DECISIONS: { label: 'Persuasive decisions', shape: 'diamond', tone: 'neutral' },
  OFFICIAL_REGULATOR_GUIDANCE: { label: 'Official regulator guidance', shape: 'diamond', tone: 'neutral' },
  EXPLANATORY_AND_INTERPRETIVE_MATERIALS: {
    label: 'Explanatory and interpretive materials',
    shape: 'bar',
    tone: 'caution',
  },
  BILLS_AND_NON_OPERATIVE_FUTURE_MATERIALS: {
    label: 'Bills and non-operative future materials',
    shape: 'bar',
    tone: 'caution',
  },
} satisfies Record<AuthorityLevel, BadgeLook>;

export type AuthorityRoleBadgeProps = { readonly level: AuthorityLevel };

/**
 * The "authority role" of PRD §32.3 — the standing of the source a citation comes from.
 *
 * The generated `Citation` carries no authority field, so the value arrives as caller-supplied panel
 * data (`CitationView.authority`). Recorded as QR13; if `Citation` gains the field, this prop type
 * stops being view-model and nothing else here changes.
 */
export function AuthorityRoleBadge(props: AuthorityRoleBadgeProps): ReactNode {
  const look = AUTHORITY_LEVEL_LOOK[props.level];
  return <Badge label={look.label} shape={look.shape} tone={look.tone} />;
}

/** PRD §15.5 / §32.3 — whether a citation supports, qualifies or contradicts its claim. */
const CITATION_ROLE_LOOK = {
  SUPPORTS: { label: 'Supports', shape: 'circle', tone: 'positive' },
  QUALIFIES: { label: 'Qualifies', shape: 'diamond', tone: 'caution' },
  CONTRADICTS: { label: 'Contradicts', shape: 'triangle', tone: 'negative' },
  DEFINES: { label: 'Defines', shape: 'square', tone: 'neutral' },
  BACKGROUND_ONLY: { label: 'Background only', shape: 'bar', tone: 'neutral' },
} satisfies Record<CitationRole, BadgeLook>;

export type CitationRelationBadgeProps = { readonly role: CitationRole };

export function CitationRelationBadge(props: CitationRelationBadgeProps): ReactNode {
  const look = CITATION_ROLE_LOOK[props.role];
  return <Badge label={look.label} shape={look.shape} tone={look.tone} />;
}

/**
 * The label maps, exported for the badge tests so an assertion reads the same literal the component
 * renders instead of restating it (and so a relabelling cannot pass silently).
 */
export const BADGE_LABELS = Object.freeze({
  legalStatus: LEGAL_STATUS_LOOK,
  authorityLevel: AUTHORITY_LEVEL_LOOK,
  citationRole: CITATION_ROLE_LOOK,
});
