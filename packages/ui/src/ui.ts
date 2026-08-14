/**
 * The public export barrel of `@taxrag/ui` (ticket Deliverable 10).
 *
 * WHY NOT `src/index.ts`. `tools/workspace-assertions.mjs#assertEntryFilesEmpty`, asserted by
 * `tools/tests/skeleton.test.mjs`, requires every pnpm member's `src/index.ts` to be byte-exactly
 * `export {};\n`. The merged precedent for a package that needs a real entry is an `exports` map in
 * the manifest pointing at a differently-named file — `packages/database` (`./migrate`, `./crypto`,
 * `./tenant`) and `packages/sdk-typescript` (`src/sdk.ts`) both do exactly this. `package.json`
 * therefore maps `"."` here, and `src/index.ts` is left untouched. Deviation D-1 on the ticket.
 *
 * Explicit named re-exports only — no `export *` — so the public surface is a literal, reviewable
 * list. Anything not named here is private to this package. `test/exports.test.ts` compares this
 * surface to the committed list in `test/fixtures/public-exports.json`, so a downstream module
 * cannot come to depend on an internal path by accident.
 *
 * Note what is NOT here: `src/contracts.ts`. Consumers take the contracts vocabulary from
 * `packages/contracts`, not second-hand from this package (PRD §35.1, single generated source).
 */

/* --- Primitives (Deliverable 6) ------------------------------------------------------------- */
export { Badge, Button, Chip, EmptyState, Link, LiveRegion, PageHeading, SkipLink } from './primitives/basic.js';
export type {
  BadgeProps,
  ButtonProps,
  ChipProps,
  EmptyStateProps,
  LinkProps,
  LiveRegionProps,
  PageHeadingProps,
  SkipLinkProps,
} from './primitives/basic.js';

export {
  Checkbox,
  DateField,
  ErrorSummary,
  MultiSelect,
  RadioGroup,
  Select,
  TextArea,
  TextField,
} from './primitives/fields.js';
export type {
  CheckboxProps,
  DateFieldProps,
  ErrorSummaryEntry,
  ErrorSummaryProps,
  MultiSelectProps,
  RadioGroupProps,
  SelectOption,
  SelectProps,
  TextAreaProps,
  TextFieldProps,
} from './primitives/fields.js';

export { Dialog, Disclosure, Tooltip } from './primitives/overlay.js';
export type { DialogProps, DisclosureProps, TooltipProps } from './primitives/overlay.js';

export { Table, Tabs, Toolbar } from './primitives/structure.js';
export type {
  TabDescriptor,
  TableColumn,
  TableProps,
  TabsProps,
  ToolbarProps,
} from './primitives/structure.js';

export { CopyableId } from './primitives/CopyableId.js';
export type { CopyableIdProps } from './primitives/CopyableId.js';

/* --- Status badges (Deliverable 7) ------------------------------------------------------------ */
export {
  AuthorityRoleBadge,
  CitationRelationBadge,
  FreshnessBadge,
  JurisdictionBadge,
  LegalStatusBadge,
} from './status/badges.js';
export type {
  AuthorityRoleBadgeProps,
  CitationRelationBadgeProps,
  FreshnessBadgeProps,
  JurisdictionBadgeProps,
  LegalStatusBadgeProps,
} from './status/badges.js';

/* --- Async states (Deliverable 2) ------------------------------------------------------------- */
export { JobStateView, MissingRecoveryGuidanceError } from './async-state/JobStateView.js';
export type { JobStateAction, JobStateViewProps } from './async-state/JobStateView.js';
export { STATE_COPY, isTerminalState } from './async-state/state-copy.js';
export type { StateCopy } from './async-state/state-copy.js';

/* --- Evidence (Deliverables 3 and 4) ----------------------------------------------------------- */
export { EvidencePanel } from './evidence/EvidencePanel.js';
export type { EvidencePanelProps } from './evidence/EvidencePanel.js';
export { ClaimText, InvalidHighlightRangeError, validateHighlights } from './evidence/ClaimText.js';
export type { ClaimTextProps } from './evidence/ClaimText.js';
export {
  orderByEffectiveFrom,
  selectCandidateEvidence,
  selectCitation,
  selectClaimEvidence,
} from './evidence/select.js';
export type {
  CandidateEvidence,
  CitationView,
  PassageHighlight,
  RelatedRecord,
  SourceDetail,
  SourceVersion,
} from './evidence/types.js';

/* --- Safe rendering (Deliverable 5; SEC-003) --------------------------------------------------- */
export { SafeMarkdown } from './safe/SafeMarkdown.js';
export type { SafeMarkdownProps } from './safe/SafeMarkdown.js';
export { MARKDOWN_ALLOWLIST } from './safe/parse.js';
export { ALLOWED_URL_SCHEMES, SAFE_LINK_REL, decideUrl, isAllowedUrl } from './safe/url.js';
export type { UrlDecision } from './safe/url.js';

/* --- Dates (Deliverable 8) --------------------------------------------------------------------- */
export {
  InvalidDateError,
  formatEffectiveInterval,
  formatLegalDate,
  isIsoDate,
} from './format/date.js';

/* --- Destructive actions (Deliverable 9) -------------------------------------------------------- */
export { DestructiveAction, MissingDestructiveDisclosureError } from './actions/DestructiveAction.js';
export type { DestructiveActionProps } from './actions/DestructiveAction.js';
