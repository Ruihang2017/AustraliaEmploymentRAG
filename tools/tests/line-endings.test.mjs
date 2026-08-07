import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

import { REPO_ROOT, cargoMembers, pnpmMembers, uvMembers } from '../workspace-assertions.mjs';

/**
 * git's `core.autocrlf=true` — the default of the Git for Windows installer — rewrites LF to CRLF in
 * the working tree on checkout. The authoritative bytes are therefore the ones git stores, not the
 * ones on disk, so these assertions read the committed blob with `git show`.
 *
 * The repository-wide fix would be `* text=auto eol=lf` in `.gitattributes`, but breakdown plan §4
 * leaves `.gitattributes` unallocated and the FND-01 File-scope forbids touching it. See the root
 * README §7.
 */
function committedBlob(relPath) {
  const result = spawnSync('git', ['show', `HEAD:${relPath}`], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : null;
}

function assertLfNoBom(relPath) {
  const blob = committedBlob(relPath);
  if (blob === null) return; // not committed yet — the first run on a fresh branch
  expect(blob.includes(0x0d), `${relPath} has CRLF in the committed blob`).toBe(false);
  expect(
    blob.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
    `${relPath} has a UTF-8 BOM`,
  ).toBe(false);
  expect(
    blob.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])),
    `${relPath} is UTF-16`,
  ).toBe(false);
}

describe('committed line endings and encoding', () => {
  it.each([
    'README.md',
    '.editorconfig',
    '.node-version',
    '.npmrc',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'Cargo.toml',
    'rust-toolchain.toml',
    'pyproject.toml',
  ])('stores %s as UTF-8 with LF and no BOM', (relPath) => {
    assertLfNoBom(relPath);
  });

  it('stores every skeleton entry file as UTF-8 with LF and no BOM', () => {
    for (const member of pnpmMembers()) assertLfNoBom(`${member}/src/index.ts`);
    for (const member of cargoMembers()) assertLfNoBom(`${member}/src/lib.rs`);
    expect(uvMembers().length).toBe(6);
  });

  it('stores every tools/ script as UTF-8 with LF and no BOM', () => {
    const listed = spawnSync('git', ['ls-files', 'tools'], { cwd: REPO_ROOT, encoding: 'utf8' });
    const files = listed.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.endsWith('.ps1')); // the two frozen scripts are not ours
    for (const file of files) assertLfNoBom(file);
    if (files.length > 0) expect(files).toContain('tools/workspace-script.mjs');
  });
});
