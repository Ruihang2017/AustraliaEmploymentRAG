/**
 * FND-04 deliverable 7 / acceptance item 6 — `pnpm generated:check`.
 *
 * DEV-001's acceptance evidence is "Generated-client diff is clean in CI" (PRD §30.2), so this must
 * be a BYTE comparison, never a fuzzy one. FND-04 Feedback obligation 4 is explicit: "Never loosen
 * `generated:check` to a fuzzy comparison."
 *
 * It regenerates into `mkdtemp(os.tmpdir())` — OUTSIDE the repository — so running the check can
 * never itself dirty `git status --porcelain`, which the same acceptance item asserts is empty.
 *
 * THE ONE TOLERATED DIFFERENCE, and exactly why. This repository runs with `core.autocrlf=true`
 * (verified; `.gitattributes` is unallocated by breakdown plan §4 and `tools/tests/frozen-paths.
 * test.mjs` forbids editing it on a ticket branch, so the repository-wide `eol=lf` fix is not
 * available here — see `tools/tests/line-endings.test.mjs` and root README §7). Git checks the
 * committed LF bytes out as CRLF ON DISK, so a byte comparison against the checkout would report a
 * spurious diff on every file. The on-disk side is therefore normalised CRLF -> LF before
 * comparison, AND the freshly generated side is asserted to contain no `\r` at all. That is the
 * checkout transformation being undone, not a fuzzy comparison: a real hand-edit — a renamed type, a
 * changed literal, an added line — still fails, and `test/generated/determinism.test.ts` proves it
 * with a positive control.
 *
 * CORRECTION (FND-04 review bounce). This header previously claimed the acceptance form
 * `pnpm generate && pnpm generated:check` was "unaffected either way, because generate rewrites the
 * files with LF first". That was false for the `git status --porcelain` half of acceptance item 6:
 * `generate` writing LF over a CRLF checkout left all five files reported ` M` even though
 * `git hash-object` matched the committed blob, because git compares the working tree against the
 * CHECKOUT form, not the index blob. `generate.mjs` now writes git's checkout form (LF on CI, CRLF
 * on a `core.autocrlf=true` checkout) and `test/generated/working-tree.test.ts` is the regression
 * guard. This normalisation here remains necessary regardless, for a checkout nobody has regenerated.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { REPO_ROOT, loadOpenApiDocument } from './document.mjs';
import { GENERATED_DIR, emit } from './emit.mjs';
import { existingGeneratedFiles } from './generate.mjs';

const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'contracts');

/** Undo the `core.autocrlf` checkout transformation on the ON-DISK side only. */
function normaliseCheckout(text) {
  return text.split('\r\n').join('\n');
}

/**
 * Compare the committed tree with a freshly generated one.
 *
 * Returns `{ ok, problems }`; `problems[0]` names the first divergent file, which is what the CLI
 * prints. Never throws for a mismatch — a mismatch is data, not an exception.
 */
export function compareGenerated(files, packageRoot = PACKAGE_ROOT) {
  const problems = [];

  for (const [path, expected] of files) {
    if (expected.includes('\r')) {
      problems.push(`${path}: the emitter produced a CR byte; generated output must be LF only`);
    }
  }

  const onDisk = new Set(existingGeneratedFiles(packageRoot));
  for (const path of onDisk) {
    if (!files.has(path)) problems.push(`${path}: present on disk but the emitter no longer produces it`);
  }
  for (const [path, expected] of files) {
    if (!onDisk.has(path)) {
      problems.push(`${path}: missing — run \`pnpm generate\``);
      continue;
    }
    const actual = normaliseCheckout(readFileSync(join(packageRoot, path), 'utf8'));
    if (actual !== expected) {
      const actualLines = actual.split('\n');
      const expectedLines = expected.split('\n');
      const index = actualLines.findIndex((line, at) => line !== expectedLines[at]);
      problems.push(
        `${path}: differs from the generator at line ${index + 1}\n` +
          `    on disk  : ${JSON.stringify(actualLines[index] ?? '<end of file>')}\n` +
          `    generated: ${JSON.stringify(expectedLines[index] ?? '<end of file>')}`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * Regenerate into a throwaway directory under the OS temp dir and diff it against the committed
 * tree. The temp directory is always removed, including on failure.
 */
export function runGeneratedCheck(packageRoot = PACKAGE_ROOT) {
  const document = loadOpenApiDocument();
  const files = emit(document);

  const scratch = mkdtempSync(join(tmpdir(), 'aer-generated-check-'));
  try {
    for (const [path, contents] of files) {
      const absolute = join(scratch, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, contents, { encoding: 'utf8' });
    }
    // Regenerating into the scratch tree and reading it back proves the emitter's output survives a
    // real write/read round trip rather than only existing in memory.
    const roundTripped = new Map(
      [...files.keys()].map((path) => [path, readFileSync(join(scratch, path), 'utf8')]),
    );
    for (const [path, contents] of roundTripped) {
      if (contents !== files.get(path)) {
        return { ok: false, problems: [`${path}: did not survive a write/read round trip`] };
      }
    }
    return compareGenerated(roundTripped, packageRoot);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function main() {
  const { ok, problems } = runGeneratedCheck();
  if (ok) {
    process.stdout.write(`generated:check: packages/contracts/${GENERATED_DIR} matches the generator\n`);
    return 0;
  }
  process.stderr.write(`generated:check FAILED\n  ${problems.join('\n  ')}\n`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('generated-check.mjs')) {
  process.exit(main());
}
