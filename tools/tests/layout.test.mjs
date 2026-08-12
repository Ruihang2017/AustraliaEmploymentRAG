import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, assertLayout, loadFixture } from '../workspace-assertions.mjs';

/** A throwaway root carrying only the files assertLayout reads. */
function scratchRoot() {
  const root = mkdtempSync(join(tmpdir(), 'fnd01-layout-'));
  mkdirSync(join(root, 'tools/fixtures'), { recursive: true });
  cpSync(
    join(REPO_ROOT, 'tools/fixtures/prd-20-1-layout.json'),
    join(root, 'tools/fixtures/prd-20-1-layout.json'),
  );
  for (const dir of loadFixture('prd-20-1-layout.json').directories) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  return root;
}

describe('PRD 20.1 layout', () => {
  it('replays green against the committed fixture', () => {
    expect(assertLayout()).toEqual([]);
  });

  it('transcribes the fixture from the PRD brace notation without losing a directory', () => {
    const fixture = loadFixture('prd-20-1-layout.json');
    const expanded = fixture.source.flatMap((line) => {
      const match = line.match(/^([^{]+)\{([^}]+)\}$/);
      if (!match) return [line];
      return match[2].split(',').map((leaf) => `${match[1]}${leaf}`);
    });
    expect(fixture.directories).toEqual(expanded);
    expect(fixture.directories).toHaveLength(47);
  });

  it('allows only the explicit pre-existing top-level directories', () => {
    const fixture = loadFixture('prd-20-1-layout.json');
    expect(fixture.topLevelPreexistingAllowed.entries).toEqual([
      '.claude',
      '.github',
      'templates',
      'tools',
      '.agents',
      '.codex',
    ]);
  });

  it('fails, naming the directory, when a PRD 20.1 directory is renamed', () => {
    const root = scratchRoot();
    try {
      rmSync(join(root, 'packages/citations'), { recursive: true });
      mkdirSync(join(root, 'packages/citations-renamed'), { recursive: true });
      const problems = assertLayout(root);
      expect(problems.join('\n')).toContain('packages/citations');
      expect(problems.some((p) => p.includes('missing from the filesystem'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when an unexpected top-level directory is introduced', () => {
    const root = scratchRoot();
    try {
      mkdirSync(join(root, 'vendor'));
      writeFileSync(join(root, 'vendor/.keep'), '');
      expect(assertLayout(root).join('\n')).toContain('unexpected top-level directory "vendor"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the filesystem, not the git index', () => {
    // A git-index-based check could not fail the rename test above, because renaming a directory in
    // the worktree leaves the index untouched. This asserts the scratch root has no git index at all
    // yet the assertions still produce results.
    const root = scratchRoot();
    try {
      rmSync(join(root, 'evals/splits'), { recursive: true });
      expect(assertLayout(root).join('\n')).toContain('evals/splits');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
