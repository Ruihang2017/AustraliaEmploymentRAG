/**
 * EVID-01 — the deterministic stage's public surface (PRD §37.2 stages 1-2).
 *
 * See `src/contract/index.ts` for why this is a leaf barrel rather than `src/index.ts`.
 *
 * `isValidAbn` is exported here on purpose: `14-search-product` needs the same mod-89 check for
 * `INVALID_ABN` (`UAT-SRCH-04`, PRD §34.9), and the ticket's Feedback obligation says the resolution
 * is ONE owner plus a dependency edge, never a second copy. There is now something to depend on.
 */
export { PII_ADMISSION_LIMITS, REQUEST_SCOPE_FIELD, enforceLimits, utf8Length } from './limits.js';
export { PII_PLACEHOLDERS } from './placeholders.js';
export { buildScanViews, detectDeterministic } from './detect.js';
export { sanitize } from './sanitize.js';

export {
  DROPPED_CHARACTERS,
  FOLDED_CHARACTERS,
  normaliseForScan,
  spanOfScanRange,
  stripFormatting,
} from './normalise.js';
export type { ScanView, Span } from './normalise.js';

export { digitRuns, spanOfDigits, spanOfRun } from './digits.js';
export type { DigitRun } from './digits.js';

export { DETECTORS, DRIVER_LICENCE_FORMATS } from './detectors/index.js';
export type { Detector, PublicDetector, RegisteredDetector } from './detectors/index.js';
export { isValidAbn, isValidLuhn, isValidMedicare, isValidTfn } from './detectors/index.js';
export {
  detectAbn,
  detectAddress,
  detectBankOrCard,
  detectDateOfBirth,
  detectDriverLicence,
  detectEmail,
  detectEmployeeOrPayrollId,
  detectLabelledName,
  detectMedicare,
  detectPassport,
  detectPayslipOrPersonnelExtract,
  detectPhone,
  detectSocialIdentifier,
  detectTfn,
} from './detectors/index.js';

export { MINIMUM_RECALL, buildRecallReport } from './report.js';
export type {
  CategoryReport,
  Corpus,
  CorpusCategoryFile,
  CorpusDeferred,
  CorpusNegative,
  CorpusPositive,
  CorpusRunner,
  CorpusSpan,
  DeferredEntry,
  RecallReport,
} from './report.js';
