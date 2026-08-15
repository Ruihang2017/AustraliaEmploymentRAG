import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT } from '../workspace-assertions.mjs';

/**
 * The repository-wide frozen/unallocated-path guard. It runs on EVERY ticket's branch, because
 * tools/vitest.config.mjs collects every tools/tests/ *.test.mjs file.
 *
 * SOURCE OF TRUTH: docs/prd/breakdown-plan.md §4 — nothing else. A path belongs in FORBIDDEN only
 * if §4 puts it in the "frozen — no module writes" row, or leaves it unallocated (named by no
 * module's write-owns row). A path that appears in ANY module's write-owns row MUST NOT be listed;
 * listing one is the defect this file was repaired for (FND-11): `.github/workflows/**` is
 * 00-foundation's allocated path, and forbidding it failed FND-02, FND-03 and LNCH-01 on branches
 * that never touched a frozen path.
 *
 * ESCAPE HATCH: a ticket that genuinely needs a listed path allocates it to a module's write-owns
 * row in breakdown plan §4 by a docs PR FIRST, and only then does the entry leave this list, in a
 * separate change — the route `.gitignore` took under Q-F7. Editing this transcription to escape
 * the rule is the failure mode, not the fix.
 *
 * WHY THE ORIGINAL FRAMING WAS WRONG: this list was transcribed from one ticket's *does-not-touch*
 * set. One ticket's does-not-touch set is not a repository-wide invariant, and this suite runs on
 * every ticket's branch, not only on the branch that wrote it.
 */
const FORBIDDEN = [
  /^docs\/PRD\.md$/,                          // §4 frozen row
  /^docs\/discovery\//,                       // §4 frozen row
  /^docs\/archive\//,                         // §4 frozen row
  /^tools\/validate-prd\.ps1$/,               // §4 frozen row — "the two pre-existing tools/*.ps1"
  /^tools\/export-visible-transcript\.ps1$/,  // §4 frozen row — "the two pre-existing tools/*.ps1"
  /^templates\//,                             // §4 frozen row
  /^CLAUDE\.md$/,                             // §4 frozen row
  /^\.claude\/(?!scripts\/deliver-ticket\.mjs$)/,  // §4 frozen row, narrowed by D-CI4 (breakdown-plan-02-ci-repair.md §3): FND-20 owns .claude/scripts/deliver-ticket.mjs; every other .claude/ path stays frozen
  /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,    // unallocated — no write-owns row names it (Q-F6, open)
  /^\.github\/ISSUE_TEMPLATE\//,              // unallocated — no write-owns row names it (Q-F6, open)
  /^\.gitattributes$/,                        // unallocated — see FND-11 Background, ".gitattributes"
];

/**
 * Synthetic control paths, at least one per FORBIDDEN entry. String literals only: nothing here
 * touches the filesystem, and no ticket's deliverable is named.
 */
const FORBIDDEN_CONTROL = [
  'docs/PRD.md',
  'docs/discovery/notes.md',
  'docs/archive/old.md',
  'tools/validate-prd.ps1',
  'tools/export-visible-transcript.ps1',
  'templates/ticket.template.md',
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/workflows/run-milestone.js',   // the D-CI4 carve-out is ONE file: the workflows stay frozen
  '.claude/scripts/publish-tickets.mjs',  // ... and so does every other script under .claude/scripts/
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug.md',
  '.gitattributes',
];

/** Synthetic paths breakdown plan §4 ALLOCATES, each annotated with its owning row. */
const ALLOWED_CONTROL = [
  ['.github/workflows/ci.yml', '00-foundation (FND-02) — the defect-1 regression vector'],
  ['.gitignore', '00-foundation (root files, added in plan v0.3 / Q-F7)'],
  ['package.json', '00-foundation (root manifests)'],
  ['README.md', '00-foundation (root files)'],
  ['tools/check-workspace.mjs', '00-foundation — tools/** minus the two .ps1'],
  ['tools/tests/frozen-paths.test.mjs', '00-foundation — this very file'],
  ['.claude/scripts/deliver-ticket.mjs', '00-foundation (FND-20) — D-CI4 single-file carve-out'],
  ['docs/prd/breakdown-plan.md', 'planning artifacts row — and the case-sensitivity vector'],
  ['docs/prd/00-foundation/README.md', 'planning artifacts row'],
  ['docs/adr/0001-example.md', 'shared-additive row (A9)'],
  ['docs/runbooks/restore.md', '18-ops-release'],
  ['packages/domain/src/legal/index.ts', '00-foundation'],
  ['apps/api/src/routes/search/index.ts', '14-search-product'],
  ['pipelines/adapters/leg-cth/adapter.py', '06-sources-legislation'],
  ['tests/e2e/smoke.spec.ts', '23-assurance'],
];

function git(args) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function baseRef() {
  for (const ref of ['main', 'origin/main']) {
    if (git(['rev-parse', '--verify', '--quiet', ref]).status === 0) return ref;
  }
  return null;
}

/**
 * NUL-separated git output -> paths. No trim(): -z exists so that a path containing a leading or
 * trailing space, a quote or a non-ASCII byte survives intact.
 */
function splitZ(stdout) {
  return stdout.split('\0').filter((entry) => entry.length > 0);
}

/**
 * THE changed-file helper. Both the guard and the non-vacuity check go through this one function;
 * that shared use is what makes the non-vacuity check meaningful.
 * --no-renames so a frozen file renamed away is listed under BOTH its old and its new path.
 */
function changedFiles(range) {
  const result = git(['diff', '--name-only', '-z', '--no-renames', range]);
  return { status: result.status, stderr: result.stderr, paths: splitZ(result.stdout) };
}

function forbiddenAmong(paths) {
  return paths.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)));
}

/**
 * Ticket-agnostic proof that the changed-file helper returns a non-empty list. The ranges are
 * historical and chosen without reference to any ticket's files; the current branch's own diff is
 * never inspected here.
 */
function nonVacuityProbe(base) {
  const tried = [];
  for (let back = 0; back < 5; back += 1) {
    const tip = back === 0 ? base : `${base}~${back}`;
    if (git(['rev-parse', '--verify', '--quiet', `${tip}^{commit}`]).status !== 0) break;

    if (git(['rev-parse', '--verify', '--quiet', `${tip}~1^{commit}`]).status !== 0) {
      // Root commit reached (single-commit clone): use the commit's own tree listing.
      const shown = git(['show', '--pretty=', '--name-only', '-z', tip]);
      tried.push(`show ${tip}`);
      return { tried, status: shown.status, stderr: shown.stderr, paths: splitZ(shown.stdout) };
    }

    const range = `${tip}~1..${tip}`;
    tried.push(range);
    const probe = changedFiles(range);
    if (probe.status !== 0 || probe.paths.length > 0) return { tried, ...probe };
  }
  return { tried, status: 0, stderr: '', paths: [] };
}

describe('frozen and unallocated paths (breakdown plan §4)', () => {
  it('resolves a base ref, so this check is never silently skipped', () => {
    expect(baseRef(), 'neither main nor origin/main exists — cannot compute the branch diff').not.toBeNull();
  });

  it('changes no frozen or unallocated path in the branch diff', () => {
    const base = baseRef();
    const { status, stderr, paths } = changedFiles(`${base}...HEAD`);
    expect(status, stderr).toBe(0);
    const violations = forbiddenAmong(paths);
    expect(
      violations,
      `frozen or unallocated paths modified: ${violations.join(', ')} — breakdown plan §4`,
    ).toEqual([]);
  });

  it('leaves the two pre-existing tools/*.ps1 scripts byte-identical to main', () => {
    const base = baseRef();
    for (const script of ['tools/validate-prd.ps1', 'tools/export-visible-transcript.ps1']) {
      const result = git(['diff', '--exit-code', '--quiet', `${base}...HEAD`, '--', script]);
      expect(result.status, `${script} differs from ${base}`).toBe(0);
    }
  });

  it('is not vacuous — the changed-file helper returns files for a historical range', () => {
    const probe = nonVacuityProbe(baseRef());
    expect(probe.status, probe.stderr).toBe(0);
    expect(
      probe.paths.length,
      `changed-file helper returned nothing for every range tried: ${probe.tried.join(', ')}`,
    ).toBeGreaterThan(0);
  });

  it('catches every FORBIDDEN_CONTROL path', () => {
    for (const path of FORBIDDEN_CONTROL) {
      expect(
        forbiddenAmong([path]),
        `${path} is frozen or unallocated but matched no FORBIDDEN entry`,
      ).toEqual([path]);
    }
  });

  it('has a control vector for every FORBIDDEN entry', () => {
    for (const pattern of FORBIDDEN) {
      expect(
        FORBIDDEN_CONTROL.some((path) => pattern.test(path)),
        `no control vector for ${pattern.source}`,
      ).toBe(true);
    }
  });

  it('catches no ALLOWED_CONTROL path', () => {
    for (const [path, owner] of ALLOWED_CONTROL) {
      expect(
        forbiddenAmong([path]),
        `${path} is allocated to ${owner} by breakdown plan §4 but matched a FORBIDDEN entry`,
      ).toEqual([]);
    }
  });

  it('lists exactly the eleven breakdown plan §4 entries, unflagged', () => {
    expect(FORBIDDEN).toHaveLength(11);
    for (const pattern of FORBIDDEN) {
      // '' rules out `i` (docs/prd vs docs/PRD.md differ only in case) and stateful `g`.
      expect(pattern.flags, `${pattern.source} carries a regex flag`).toBe('');
    }
  });

  it('gives every FORBIDDEN entry its §4 basis in a comment', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const block = source.split('const FORBIDDEN = [')[1].split('];')[0];
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    expect(lines).toHaveLength(11);
    for (const line of lines) {
      expect(line, `FORBIDDEN entry without a §4 basis comment: ${line}`).toMatch(/^\/\^.+\/,\s*\/\/\s+\S+/);
    }
  });
});
