import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

import { REPO_ROOT } from '../workspace-assertions.mjs';

/**
 * Paths breakdown plan §4 freezes or leaves unallocated, which the FND-01 File-scope forbids touching.
 * `docs/prd/breakdown-plan.md` and `docs/prd/00-foundation/README.md` are deliberately absent: the
 * ticket's Feedback obligation 2 / Q-F7 requires the `.gitignore` writeback to land in this same PR.
 */
const FORBIDDEN = [
  /^tools\/validate-prd\.ps1$/,
  /^tools\/export-visible-transcript\.ps1$/,
  /^templates\//,
  /^CLAUDE\.md$/,
  /^\.claude\//,
  /^docs\/PRD\.md$/,
  /^docs\/discovery\//,
  /^docs\/archive\//,
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /^\.github\/ISSUE_TEMPLATE\//,
  /^\.github\/workflows\//,
  /^\.gitattributes$/,
];

function git(args) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function baseRef() {
  for (const ref of ['main', 'origin/main']) {
    if (git(['rev-parse', '--verify', '--quiet', ref]).status === 0) return ref;
  }
  return null;
}

describe('frozen and unallocated paths (breakdown plan §4)', () => {
  it('resolves a base ref, so this check is never silently skipped', () => {
    expect(baseRef(), 'neither main nor origin/main exists — cannot compute the branch diff').not.toBeNull();
  });

  it('changes no frozen or unallocated path in the branch diff', () => {
    const base = baseRef();
    const result = git(['diff', '--name-only', `${base}...HEAD`]);
    expect(result.status, result.stderr).toBe(0);
    const changed = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const violations = changed.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)));
    expect(violations, `frozen paths modified: ${violations.join(', ')}`).toEqual([]);
  });

  it('is not vacuous — the branch diff actually contains this ticket’s files', () => {
    const base = baseRef();
    const changed = git(['diff', '--name-only', `${base}...HEAD`])
      .stdout.split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    // Empty only before the first commit on the branch; after that it must include the root manifest.
    if (changed.length > 0) {
      expect(changed).toContain('package.json');
      expect(changed).toContain('README.md');
    }
  });

  it('leaves the two pre-existing tools/*.ps1 scripts byte-identical to main', () => {
    const base = baseRef();
    for (const script of ['tools/validate-prd.ps1', 'tools/export-visible-transcript.ps1']) {
      const result = git(['diff', '--exit-code', '--quiet', `${base}...HEAD`, '--', script]);
      expect(result.status, `${script} differs from ${base}`).toBe(0);
    }
  });
});
