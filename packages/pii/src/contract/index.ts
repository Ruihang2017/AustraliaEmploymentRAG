/**
 * EVID-01 — the admission contract's public surface.
 *
 * WHY THIS IS THE BARREL AND `src/index.ts` IS NOT. `tools/workspace-assertions.mjs`
 * (`assertEntryFilesEmpty`, asserted on every branch by `tools/tests/skeleton.test.mjs`) requires
 * every pnpm member's `src/index.ts` to be byte-exactly `export {};` — the FND-01 skeleton rule. The
 * ticket's File-scope PERMITS appending to it; the repository guard FORBIDS it, and permission is not
 * obligation. `FND-03` (plan Q1) and `FND-07` (plan OQ-3) left it untouched for the same reason and
 * this ticket follows them.
 *
 * CONSEQUENCE: `@taxrag/pii` exports nothing. `EVID-02` and `ASK-06` deep-import
 * `packages/pii/src/contract/index.js` and `packages/pii/src/deterministic/index.js` — the same
 * relative, type-only style `packages/domain` already uses for `packages/contracts`. Recorded as
 * plan OQ-1 and in packages/pii/README.md; resolving it is a follow-up ticket that owns every
 * package barrel, not a quiet edit to the entry file here.
 *
 * Explicit named re-exports, never `export *`, so the whole public surface is readable in one file.
 * `mintSanitizedPayload` is deliberately NOT re-exported: it is the internal mint of a
 * `SanitizedPayload` and belongs to `sanitize.ts` alone.
 */
export { PII_CATEGORY_VALUES, NON_PRD_CATEGORY, isPiiCategory } from './category.js';
export type { PiiCategory } from './category.js';

export type { PiiFinding, PiiSeverity } from './finding.js';

export { STRUCTURED_FIELD_NAMES, isStructuredFieldName, scannedFields } from './request.js';
export type {
  FreeTextField,
  PiiAdmissionRequest,
  StructuredChannels,
  StructuredFieldName,
} from './request.js';

export { hasBlockingFinding } from './result.js';
export type {
  PiiAdmissionResult,
  SanitizationTransformation,
  SanitizedField,
  SanitizedPayload,
} from './result.js';

export { CONSERVATIVE_STAGE_DEFAULTS, admit, decide } from './pipeline.js';
export type { PiiStages, StageInput } from './pipeline.js';

export { emitAdmissionMetrics } from './metrics.js';
export type { PiiMetricsEvent, PiiMetricsSink } from './metrics.js';

export { deepFreeze } from './freeze.js';
