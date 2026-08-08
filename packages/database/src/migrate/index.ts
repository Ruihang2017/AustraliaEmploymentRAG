/**
 * The public surface of the DATA-01 migration framework.
 *
 * This — not `packages/database/src/index.ts` — is what DATA-02, DATA-08 and RUNT-08 import:
 *
 * ```ts
 * import { runMigrations } from '@taxrag/database/src/migrate/index.js';
 * ```
 *
 * The package entry file stays `export {};` (FND-01 asserts its content byte-for-byte).
 */
export * from './errors.js';
export * from './pragmas.js';
export * from './naming.js';
export * from './policy.js';
export * from './conventions.js';
export * from './conventions-lint.js';
export * from './manifest.js';
export * from './runner.js';
export * from './ts-resolve.js';
