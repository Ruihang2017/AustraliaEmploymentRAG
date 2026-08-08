/**
 * FND-04 acceptance item 6, the half that was NOT covered before the review bounce:
 *
 *   "`pnpm generate && pnpm generated:check` exits 0 and leaves `git status --porcelain` empty —
 *    DEV-001's acceptance evidence, *Generated-client diff is clean in CI* (PRD §30.2)."
 *
 * `determinism.test.ts` covers the `generated:check` half. Nothing covered the `git status` half, and
 * it was broken on this repository's own documented developer configuration: repository-local
 * `core.autocrlf=true` makes git check the generated files out as CRLF, `generate` rewrote them as
 * LF, and all five files then showed as ` M` even though `git hash-object` matched the committed
 * blob — git compares the working tree against the CHECKOUT form, not against the index blob.
 *
 * `generate.mjs` now writes git's own checkout form. These are the guards:
 *
 *   1. `workingTreeNewline()` — the pure rule, every branch, driven directly rather than inferred
 *      from whatever this machine happens to be configured as.
 *   2. A real `writeGenerated()` run followed by a real `git status --porcelain` on the generated
 *      tree — the literal acceptance mechanism, and the literal Reviewer test-plan step 4.
 *   3. Every COMMITTED generated blob is LF with no BOM — the index side, which must stay LF
 *      whatever the working tree looks like. Same assertion `tools/tests/line-endings.test.mjs`
 *      makes for `tools/**`.
 *
 * Nothing here leaves the tree dirty: (2) writes exactly the bytes git would have checked out, and
 * asserting that is the whole point.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GENERATED_DIR, emit } from '../../src/openapi/emit.mjs';
import {
  existingGeneratedFiles,
  renderForWorkingTree,
  workingTreeNewline,
  workingTreeNewlineFor,
  writeGenerated,
} from '../../src/openapi/generate.mjs';
import { PACKAGE_ROOT, REPO_ROOT, document } from '../openapi/fixture.js';

function git(args: string[]) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

describe('working-tree line endings (acceptance item 6, `git status --porcelain` empty)', () => {
  it('resolves the checkout newline the way gitattributes(5) does', () => {
    // core.autocrlf is the only signal when no attribute applies. `input` and `false` check out LF.
    expect(workingTreeNewline({ autocrlf: 'true' })).toBe('\r\n');
    expect(workingTreeNewline({ autocrlf: 'input' })).toBe('\n');
    expect(workingTreeNewline({ autocrlf: 'false' })).toBe('\n');
    expect(workingTreeNewline({})).toBe('\n');

    // An explicit eol attribute wins over core.autocrlf, in both directions.
    expect(workingTreeNewline({ eolAttribute: 'lf', autocrlf: 'true' })).toBe('\n');
    expect(workingTreeNewline({ eolAttribute: 'crlf', autocrlf: 'false' })).toBe('\r\n');

    // `-text` (reported as `unset`) means git converts nothing, even under autocrlf=true.
    expect(workingTreeNewline({ textAttribute: 'unset', autocrlf: 'true' })).toBe('\n');
    expect(workingTreeNewline({ textAttribute: 'unset', eolAttribute: 'crlf' })).toBe('\n');
  });

  it('renders LF emitter bytes into the checkout form, and refuses CR from the emitter', () => {
    expect(renderForWorkingTree('a\nb\n', '\n')).toBe('a\nb\n');
    expect(renderForWorkingTree('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
    expect(() => renderForWorkingTree('a\r\nb\n', '\n')).toThrow(/LF only/);
  });

  it('agrees with what git actually reports for a generated file on this machine', () => {
    const path = join(PACKAGE_ROOT, GENERATED_DIR, 'index.ts');
    const autocrlf = git(['config', '--get', 'core.autocrlf']).stdout.trim().toLowerCase();
    const expected = workingTreeNewline({ autocrlf });
    expect(workingTreeNewlineFor(path)).toBe(expected);
  });

  // THE regression test. Before the fix this failed with five ` M` entries on a Windows checkout.
  it('leaves `git status --porcelain` clean after a real generate', () => {
    const before = git(['status', '--porcelain', '--', `packages/contracts/${GENERATED_DIR}`]);
    expect(before.status, before.stderr).toBe(0);
    expect(
      before.stdout.trim(),
      'the generated tree was already dirty before this test ran',
    ).toBe('');

    const written = writeGenerated(emit(document()), PACKAGE_ROOT);
    expect(written.length).toBeGreaterThan(0);

    const after = git(['status', '--porcelain', '--', `packages/contracts/${GENERATED_DIR}`]);
    expect(after.status, after.stderr).toBe(0);
    expect(
      after.stdout.trim(),
      '`pnpm generate` dirtied the working tree — FND-04 acceptance item 6 / DEV-001',
    ).toBe('');
  });

  it('writes every generated file with exactly the checkout newline, and no stray CR', () => {
    for (const path of existingGeneratedFiles(PACKAGE_ROOT)) {
      const raw = readFileSync(join(PACKAGE_ROOT, path), 'utf8');
      const newline = workingTreeNewlineFor(join(PACKAGE_ROOT, path));
      if (newline === '\n') {
        expect(raw.includes('\r'), `${path} has a CR but git checks this path out as LF`).toBe(false);
      } else {
        expect(raw.split('\r\n').join('\n').includes('\r'), `${path} has a lone CR`).toBe(false);
        expect(raw.includes('\r\n'), `${path} has no CRLF but git checks this path out as CRLF`).toBe(
          true,
        );
      }
    }
  });

  // The index side. Whatever the working tree looks like, the committed bytes are LF with no BOM.
  it('stores every committed generated file as UTF-8 with LF and no BOM', () => {
    const listed = git(['ls-files', '-z', '--', `packages/contracts/${GENERATED_DIR}`]);
    expect(listed.status, listed.stderr).toBe(0);
    const files = listed.stdout.split('\0').filter(Boolean);
    expect(files.length, 'no generated file is tracked — this check would be vacuous').toBeGreaterThan(0);

    for (const file of files) {
      const shown = spawnSync('git', ['show', `HEAD:${file}`], {
        cwd: REPO_ROOT,
        encoding: 'buffer',
        maxBuffer: 32 * 1024 * 1024,
      });
      if (shown.status !== 0) continue; // not committed yet — the first run on a fresh branch
      const blob = shown.stdout;
      expect(blob.includes(0x0d), `${file} has CRLF in the committed blob`).toBe(false);
      expect(
        blob.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
        `${file} has a UTF-8 BOM`,
      ).toBe(false);
    }
  });
});
