/**
 * The ONLY import boundary between `packages/domain/src/budget` and `packages/contracts`
 * (FND-09 deliverable 12 — purity: nothing outside `packages/contracts` and Node built-ins).
 *
 * The relative specifier (rather than the `@taxrag/contracts` package specifier) is deliberate:
 * `packages/contracts/src/index.ts` is still the empty FND-01 skeleton entry file and the workspace
 * has no `node_modules/@taxrag/*` link, so the package specifier resolves to nothing at type level
 * and at runtime (FND-03 open question Q1). Everything else under `src/budget/` imports from this
 * file, so when Q1 is resolved exactly the two specifiers below change — and `test/budget/purity.test.ts`
 * asserts this is the only file in the leaf that names `packages/contracts`.
 *
 * The barrel (`enums/index.js`) is imported, never a family file: FND-03's barrel documents that
 * downstream modules never deep-import a family.
 */
export { ERROR_CODE_VALUES, FUNDING_LEDGER_VALUES, isErrorCode, isFundingLedger } from '../../../contracts/src/enums/index.js';
export type { ErrorCode, FundingLedger } from '../../../contracts/src/enums/index.js';
