// Per-case scratch repository for tools/tests/deliver-ticket.test.mjs (FND-20).
//
// This harness spawns the REAL .claude/scripts/deliver-ticket.mjs, so it carries two
// non-negotiable safety rails: the seam assertion (GH_BIN is split on spaces by the delivery
// script, so a path containing one would mis-spawn) and the identity assertion (a leaked case must
// never be able to push, merge or close anything in THIS repository). Treat their removal as a
// defect, not a simplification.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { REPO_ROOT } from '../../workspace-assertions.mjs';

export const DELIVER_SCRIPT = resolve(REPO_ROOT, '.claude/scripts/deliver-ticket.mjs');
export const FORGE_DOUBLE = resolve(REPO_ROOT, 'tools/tests/support/forge-double.mjs');

// Rail 1. deliver-ticket.mjs resolves GH_BIN with `raw.split(' ')` — production code this ticket
// must not change — so a space anywhere in either path produces a confusing mis-spawn instead of
// an honest failure.
for (const path of [DELIVER_SCRIPT, FORGE_DOUBLE]) {
  if (path.includes(' ')) {
    throw new Error(
      `deliver-ticket suite cannot run from a path containing a space: ${path} — GH_BIN is split on spaces by the delivery script`,
    );
  }
}
if (!existsSync(DELIVER_SCRIPT)) throw new Error(`delivery script not found: ${DELIVER_SCRIPT}`);

const sameDir = (a, b) => {
  try {
    return realpathSync(a).replace(/\\/g, '/').toLowerCase() === realpathSync(b).replace(/\\/g, '/').toLowerCase();
  } catch {
    return false;
  }
};

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

/**
 * Build a throwaway repository plus a bare origin, and return a runner for the delivery script.
 * Nothing here touches this repository's remotes.
 */
export function createScratchDelivery({ id = 'FND-XX', branch = 'ticket/FND-XX', defaultBranch = 'main', scenario = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fnd20-'));
  const originDir = join(dir, 'origin.git');
  const repo = join(dir, 'repo');
  mkdirSync(repo);

  git(dir, ['init', '--bare', '--quiet', originDir]);
  git(repo, ['init', '--quiet']);
  git(repo, ['symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`]); // portable "default branch"
  git(repo, ['config', 'user.name', 'scratch']);
  git(repo, ['config', 'user.email', 'scratch@example.invalid']);
  git(repo, ['config', 'commit.gpgsign', 'false']);

  writeFileSync(join(repo, 'README.md'), '# scratch\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', 'initial']);

  const originUrl = originDir.replace(/\\/g, '/');
  git(repo, ['remote', 'add', 'origin', originUrl]);
  git(repo, ['push', '--quiet', 'origin', defaultBranch]);

  git(repo, ['checkout', '--quiet', '-b', branch]);
  writeFileSync(join(repo, 'feature.txt'), 'work\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '--quiet', '-m', `feat: ${id}`]);

  // The DoD needs the plan to EXIST on disk; deliver-ticket's dirty-tree filter ignores docs/plans/.
  mkdirSync(join(repo, 'docs', 'plans'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'plans', `${id}.md`), '# plan\n');

  // Body and verdict live OUTSIDE the repo so they never make its tree dirty.
  const bodyFile = join(dir, 'body.md');
  const verdictFile = join(dir, 'verdict.md');
  writeFileSync(bodyFile, '## Summary\nscratch body\n');
  writeFileSync(verdictFile, 'CLEAR\n');

  // Never `pnpm test` as a scenario --test-cmd: it would re-enter this suite recursively.
  const passCmd = join(dir, 'pass.mjs');
  const failCmd = join(dir, 'fail.mjs');
  writeFileSync(passCmd, 'process.exit(0)\n');
  writeFileSync(failCmd, 'process.exit(1)\n');

  const callLog = join(dir, 'calls.jsonl');
  writeFileSync(callLog, '');
  const issueClosedMarker = join(dir, 'issue-closed.marker');
  const scenarioPath = join(dir, 'scenario.json');
  const writeScenario = (patch = {}) => {
    writeFileSync(scenarioPath, JSON.stringify({
      callLog,
      originDir,
      branch,
      defaultBranch,
      issueClosedMarker,
      prUrl: 'https://example.invalid/o/r/pull/7',
      ...scenario,
      ...patch,
    }, null, 2));
  };
  writeScenario();

  const originSha = (ref) => spawnSync('git', ['--git-dir', originDir, 'rev-parse', ref], { encoding: 'utf8' }).stdout.trim();

  // checksTimeout/checksInterval are OPTIONS rather than something a case appends to `extra`:
  // deliver-ticket's opt() takes the FIRST occurrence of a flag, so a duplicate in `extra` would be
  // silently ignored and the case would sit on the harness default instead.
  const runDeliver = ({ extra = [], withTestCmd = true, withBodyFile = true, checksTimeout = 10, checksInterval = 1 } = {}) => {
    // Rail 2. A leaked case must not be able to act on this repository.
    const top = git(repo, ['rev-parse', '--show-toplevel']).trim();
    if (sameDir(top, REPO_ROOT)) throw new Error('refusing to run: the scratch repo resolved to the real repository root');
    const remote = git(repo, ['remote', 'get-url', 'origin']).trim();
    if (!sameDir(remote, originDir)) throw new Error(`refusing to run: origin is not the scratch bare repo (${remote})`);

    const args = [
      DELIVER_SCRIPT,
      '--id', id,
      '--branch', branch,
      '--default-branch', defaultBranch,
      '--issue', '999',
      '--platform', 'gh',
      '--delivery', 'pr',
      '--verdict-file', verdictFile,
      '--checks-interval', String(checksInterval),
      '--checks-timeout', String(checksTimeout),
    ];
    if (withBodyFile) args.push('--body-file', bodyFile);
    if (withTestCmd) args.push('--test-cmd', `node "${passCmd}"`);
    args.push(...extra);

    const result = spawnSync(process.execPath, args, {
      cwd: repo,
      encoding: 'utf8',
      timeout: 120_000,
      env: {
        ...process.env,
        GH_BIN: `node ${FORGE_DOUBLE}`,
        FORGE_DOUBLE_SCENARIO: scenarioPath,
      },
    });

    const stdout = result.stdout || '';
    const line = stdout.split('\n').map((l) => l.trim()).find((l) => l.startsWith('DELIVER-SUMMARY-JSON:'));
    const summary = line ? JSON.parse(line.slice('DELIVER-SUMMARY-JSON:'.length).trim()) : null;
    const calls = readFileSync(callLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).argv);
    return { status: result.status, stdout, stderr: result.stderr || '', summary, calls };
  };

  const called = (calls, ...prefix) => calls.some((argv) => prefix.every((part, i) => argv[i] === part));

  return {
    dir, repo, originDir, scenarioPath, callLog, bodyFile, verdictFile,
    passCmd, failCmd, branch, defaultBranch, id,
    git: (args) => git(repo, args),
    originSha, writeScenario, runDeliver, called,
  };
}
