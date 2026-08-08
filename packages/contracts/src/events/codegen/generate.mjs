/**
 * `pnpm --filter @taxrag/contracts generate:events` — writes the event bindings (FND-05 deliverable 4).
 *
 * All the logic is in emit.mjs; this file only puts the rendered text on disk. The aggregate `generate`
 * script name is deliberately NOT registered — see sub-PRD D22 (`tools/tests/scripts.test.mjs` asserts
 * no workspace member provides it, and the repair lives in `tools/**`, outside this ticket's scope).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PACKAGE_ROOT, emit } from './emit.mjs';

const files = emit();
for (const [relativePath, source] of files) {
  const absolutePath = join(PACKAGE_ROOT, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}
process.stdout.write(`generate:events — wrote ${files.size} files under ${'src/events/generated'}\n`);
