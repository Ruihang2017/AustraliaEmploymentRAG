// FND-01: the `pnpm test` configuration.
// Vitest is the test framework this repository registered (see the root README). Kept under tools/
// so no unallocated root config file is introduced; invoked as
// `vitest run --config tools/vitest.config.mjs` by tools/workspace-script.mjs.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * FND-26 — the repository-wide Vitest test timeout, in milliseconds.
 *
 * DERIVED, NOT CHOSEN. Rule: >= 3x the slowest test measured at full parallelism, rounded up to a
 * readable value. Survey taken on 2026-08-17 on `main` @ 5ac25c2 under Node v24.18.0. The slowest
 * test at full parallelism was "produces exactly one commit and one typed conflict, never a lost
 * update" in packages/database/test/tenant/concurrency.test.ts at 9061 ms (7673 ms in isolation);
 * 9061 x 3 = 27183 ms, rounded up to 28000 ms. The factor is not decoration: the survey is taken on
 * a workstation and the bound has to hold on a slower, more contended CI runner — which is exactly
 * the difference that produced the original 5000 ms failure of
 * packages/domain/test/answers/decide-answer-status.property.test.ts (798 ms in isolation here,
 * 2776 ms under full parallelism, 7746-7859 ms on CI).
 *
 * This is the ONLY definition of the value in the repository: tools/workspace-script.mjs imports it
 * and interpolates it into both dispatch paths (the `pnpm -r` member dispatch and the root tools
 * run). Do not transcribe the number anywhere else. To raise it, redo the measurement above rather
 * than rounding up again.
 */
export const TEST_TIMEOUT_MS = 28_000;

export default {
  root: repoRoot,
  test: {
    include: ['tools/tests/**/*.test.mjs'],
    environment: 'node',
    reporters: ['default'],
    testTimeout: TEST_TIMEOUT_MS,
  },
};
