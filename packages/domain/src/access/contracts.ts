/**
 * The ONLY import boundary between `packages/domain/src/access` and `packages/contracts`
 * (FND-06 deliverable 7 — purity: nothing outside `packages/contracts` and Node built-ins).
 *
 * The relative specifier (rather than the `@taxrag/contracts` package specifier) is deliberate:
 * `packages/contracts/src/index.ts` is still the empty FND-01 skeleton entry file and the workspace
 * has no `node_modules/@taxrag/*` link, so the package specifier resolves to nothing at type level
 * and at runtime (FND-03 open question Q1). Everything else under `src/access/` imports from this
 * file, so when Q1 is resolved exactly the two specifiers below change — and
 * `test/access/purity.test.ts` asserts this is the only file in the leaf that names
 * `packages/contracts`.
 *
 * The barrel (`enums/index.js`) is imported, never a family file: FND-03's barrel documents that
 * downstream modules never deep-import a family.
 *
 * The vocabulary is FND-03's and is not re-coined here (sub-PRD D6). This ticket owns the MATRIX —
 * which principal column gets which cell of PRD §38.1 — not the words.
 */
export {
  API_SCOPE_VALUES,
  PERMISSION_VALUES,
  ROLE_VALUES,
  isApiScope,
  isPermission,
  isRole,
} from '../../../contracts/src/enums/index.js';
export type { ApiScope, Permission, Role } from '../../../contracts/src/enums/index.js';
