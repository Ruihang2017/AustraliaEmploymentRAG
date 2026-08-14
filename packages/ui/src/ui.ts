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
 * surface to the committed list in `test/fixtures/public-exports.json`.
 */

export { formatEffectiveInterval, formatLegalDate, isIsoDate, InvalidDateError } from './format/date.js';
