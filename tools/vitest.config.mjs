// FND-01: the `pnpm test` configuration.
// Vitest is the test framework this repository registered (see the root README). Kept under tools/
// so no unallocated root config file is introduced; invoked as
// `vitest run --config tools/vitest.config.mjs` by tools/workspace-script.mjs.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default {
  root: repoRoot,
  test: {
    include: ['tools/tests/**/*.test.mjs'],
    environment: 'node',
    reporters: ['default'],
  },
};
