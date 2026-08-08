/**
 * The ONLY import boundary between `packages/observability` and `packages/contracts`.
 *
 * RUNT-07 Deliverable 1 asks for a "workspace dependency on `packages/contracts`". It cannot be a
 * manifest dependency: tools/tests/skeleton.test.mjs asserts every member manifest declares none.
 * The established precedent is `packages/domain/src/workflow/contracts.ts` — one file that is the
 * single import boundary, using a relative specifier.
 *
 * The relative path (rather than the `@taxrag/contracts` package specifier) is deliberate:
 * `packages/contracts/src/index.ts` is still the empty FND-01 skeleton entry file and the workspace
 * has no `node_modules/@taxrag/*` link, so the package specifier resolves to nothing at type level
 * and at runtime (FND-03 open question Q1). Everything else in this package imports contracts
 * values through this file, so when Q1 is resolved exactly the specifiers below change.
 *
 * The barrels (`enums/index.js`, `ids/index.js`) are imported, never a family file: FND-03's
 * barrels document that downstream modules never deep-import a family.
 */
export { ERROR_CODE_VALUES, isErrorCode } from '../../contracts/src/enums/index.js';
export type { ErrorCode } from '../../contracts/src/enums/index.js';
export {
  RESOURCE_KINDS,
  UUID_V7_PATTERN,
  isResourceKind,
  isUuidV7,
  parseId,
} from '../../contracts/src/ids/index.js';
export type { ResourceKind } from '../../contracts/src/ids/index.js';
