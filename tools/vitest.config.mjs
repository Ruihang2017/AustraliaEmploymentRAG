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
 * readable value. Survey re-taken on 2026-08-18 on `ticket/FND-26` rebased on `main` @ cb49bc8
 * (i.e. after FND-29 rewrote the tenant write-conflict test and FND-30 cleared the standing lint
 * errors) under Node v24.18.0. The slowest test at full parallelism was "produces exactly one
 * commit and one typed conflict, never a lost update" in
 * packages/database/test/tenant/concurrency.test.ts at 8684 ms (7498 ms in isolation);
 * 8684 x 3 = 26052 ms, rounded up to 28000 ms. The factor is not decoration: the survey is taken on
 * a workstation and the bound has to hold on a slower, more contended CI runner — which is exactly
 * the difference that produced the original 5000 ms failure of
 * packages/domain/test/answers/decide-answer-status.property.test.ts (2587 ms in isolation here,
 * 3594 ms under full parallelism, 7746-7859 ms on CI).
 *
 * Caveat recorded with the measurement: that slowest test carries its own per-test
 * `{ timeout: 60_000 }` argument (FND-29's, pre-dating this change and untouched by it), so no
 * global testTimeout governs it. The slowest test this bound actually governs is
 * "fails the Definition of Done when no --test-cmd was supplied, and passes with one" in
 * tools/tests/deliver-ticket.test.mjs at 6418 ms; 6418 x 3 = 19254 ms, which 28000 ms also
 * satisfies, so deriving from the globally-slowest measurement is the stricter of the two readings.
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
