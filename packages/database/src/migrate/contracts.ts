/**
 * The ONLY import boundary between `packages/database` and `packages/contracts`.
 *
 * PRD §35.1 requires enum CHECK constraints to be "generated from `packages/contracts`" (FND-03), so
 * this package has to read the canonical enum registry. It cannot do so through a manifest
 * dependency: `tools/tests/skeleton.test.mjs` ("declares no dependency beyond the toolchain in any
 * member manifest") asserts every member manifest declares none, and the root manifest is
 * `00-foundation`'s write-scope.
 *
 * The established precedent is `packages/observability/src/contracts.ts` and
 * `packages/domain/src/legal/contracts.ts`: one file, one relative specifier, importing the barrel
 * and never a family file. The relative path (rather than the `@taxrag/contracts` package specifier)
 * is deliberate — `packages/contracts/src/index.ts` is still the byte-exact-empty FND-01 skeleton
 * entry and the workspace has no `node_modules/@taxrag/*` link, so the package specifier resolves to
 * nothing at type level and at runtime.
 *
 * Do not "fix" the specifier. When FND-03 open question Q1 (a real `exports` map / workspace links)
 * is resolved, this is the single file that changes.
 */
export { ENUM_REGISTRY, getEnumValues } from '../../../contracts/src/enums/index.js';
export type { EnumRegistryEntry } from '../../../contracts/src/enums/index.js';
