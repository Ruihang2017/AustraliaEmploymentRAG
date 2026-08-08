/**
 * `pnpm --filter @taxrag/contracts generated:check:events` — fails when a generated file was
 * hand-edited or is stale (PRD §20.1; FND-05 acceptance item 11).
 *
 * CRLF DISCIPLINE — the single most likely cause of a green-locally / red-in-CI bounce here.
 * `git config core.autocrlf` is `true` on a default Git-for-Windows checkout and `.gitattributes` is
 * unallocated by breakdown plan §4 (see `tools/tests/line-endings.test.mjs`, which works around the
 * same problem by reading committed blobs). A byte-for-byte comparison of freshly rendered LF text
 * against a working-tree file that git checked out as CRLF fails on Windows and passes in CI.
 * Every comparison in this ticket therefore normalises `\r\n` -> `\n` on read, and
 * `test/events/generated.test.ts` separately asserts the COMMITTED blob has no `\r`.
 *
 * Exits 1 on the first difference, naming the path. The same comparison runs inside the package's
 * vitest suite, so it is enforced on every PR through `pnpm test` even though the aggregate
 * `generated:check` root name cannot be registered yet (sub-PRD D31).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, committedGeneratedFiles, emit } from './emit.mjs';

/** Working-tree text, normalised to LF. */
export function readNormalised(absolutePath) {
  return readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n');
}

const expectedFiles = emit();
let failures = 0;

for (const [relativePath, source] of expectedFiles) {
  const absolutePath = join(PACKAGE_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    process.stderr.write(`generated:check:events — missing: ${relativePath}\n`);
    failures += 1;
    continue;
  }
  if (readNormalised(absolutePath) !== source) {
    process.stderr.write(
      `generated:check:events — ${relativePath} differs from the emitter's output. ` +
        'It was hand-edited or the schemas moved; run `generate:events` (PRD §20.1).\n',
    );
    failures += 1;
  }
}

for (const relativePath of committedGeneratedFiles()) {
  if (!expectedFiles.has(relativePath)) {
    process.stderr.write(
      `generated:check:events — stale: ${relativePath} is committed but the emitter does not ` +
        'produce it. Delete it, or add its schema to schemas/events/registry.json.\n',
    );
    failures += 1;
  }
}

if (failures > 0) process.exit(1);
process.stdout.write(`generated:check:events — ${expectedFiles.size} files match\n`);
