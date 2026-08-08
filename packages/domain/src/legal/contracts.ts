/**
 * The ONLY import boundary between `packages/domain/src/legal` and `packages/contracts`
 * (FND-10 deliverable 9 — purity: nothing outside `packages/contracts` and Node built-ins).
 *
 * The relative path (rather than the `@taxrag/contracts` package specifier) is deliberate:
 * `packages/contracts/src/index.ts` is still the empty FND-01 skeleton entry file and the workspace
 * has no `node_modules/@taxrag/*` link, so the package specifier resolves to nothing at type level
 * and at runtime (FND-03 open question Q1). Everything else under `src/legal/` imports from this
 * file, so when Q1 is resolved exactly the two specifiers below change. Mirrors
 * `src/workflow/contracts.ts` deliberately — the sibling leaves may not import one another (D10), so
 * the pattern is duplicated rather than shared.
 *
 * The barrel (`enums/index.js`) is imported, never a family file: FND-03's barrel documents that
 * downstream modules never deep-import a family.
 */
export {
  AUTHORITY_LEVEL_VALUES,
  LEGAL_STATUS_VALUES,
  LICENCE_ASSESSMENT_STATE_VALUES,
  isAuthorityLevel,
  isLegalStatus,
  isLicenceAssessmentState,
} from '../../../contracts/src/enums/index.js';
export type {
  AuthorityLevel,
  LegalStatus,
  LicenceAssessmentState,
} from '../../../contracts/src/enums/index.js';
