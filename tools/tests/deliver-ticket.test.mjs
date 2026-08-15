import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';

import { cleanupPrototypes, createScratchDelivery } from './support/scratch-delivery.mjs';

/**
 * FND-20 / DEV-004 — the required-check gate, the hard-failure exit contract, the DoD rule and the
 * refusal to open a pull request from an unfilled body.
 *
 * Every case drives the REAL .claude/scripts/deliver-ticket.mjs through its existing GH_BIN seam
 * against a scripted forge double, in a throwaway git repository with its own bare origin. Each
 * asserts the EXIT CODE and the summary flags, and — where the point is that something did not
 * happen — the absence of the call in the double's call log. Stdout text alone proves nothing.
 */

const CONTEXT_A = 'API/OpenAPI compatibility';
const CONTEXT_B = 'Rust builds/tests';

const protection = (...contexts) => ({ contexts, checks: contexts.map((context) => ({ context })) });
const checkRun = (name, status, conclusion) => ({ name, status, conclusion });

let scratch = null;
const build = (scenario, options = {}) => {
  scratch = createScratchDelivery({ id: 'FND-20', branch: 'ticket/FND-20', scenario, ...options });
  return scratch;
};

afterEach(() => {
  if (scratch) rmSync(scratch.dir, { recursive: true, force: true });
  scratch = null;
});

afterAll(() => {
  cleanupPrototypes();
});

describe('deliver-ticket required-check gate', () => {
  it('refuses to merge when a required context concluded as failing', () => {
    const s = build({
      protection: protection(CONTEXT_A, CONTEXT_B),
      rollupPhases: [[
        checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS'),
        checkRun(CONTEXT_B, 'COMPLETED', 'FAILURE'),
      ]],
      mergeLands: true,
    });
    const run = s.runDeliver();

    expect(s.called(run.calls, 'pr', 'merge'), 'a merge was attempted despite a red required check').toBe(false);
    expect(run.status).toBe(2);
    expect(run.summary.merged).toBe(false);
    expect(run.summary.dodPassed).toBe(false);
    expect(run.summary.checks.requiredChecksGreen).toBe(false);
    expect(run.summary.checks.requiredCheckRule).toBe('protection');
    expect(run.summary.notes).toContain(CONTEXT_B);
  }, 30_000);

  it('waits for pending contexts and merges once they all conclude successfully', () => {
    const s = build({
      protection: protection(CONTEXT_A, CONTEXT_B),
      rollupPhases: [
        [checkRun(CONTEXT_A, 'IN_PROGRESS', null), checkRun(CONTEXT_B, 'QUEUED', null)],
        [checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS'), checkRun(CONTEXT_B, 'COMPLETED', 'SUCCESS')],
      ],
      mergeLands: true,
    });
    const run = s.runDeliver();

    const rollupReads = run.calls.filter((argv) => argv[0] === 'pr' && argv[1] === 'view').length;
    expect(rollupReads, 'the gate did not poll a second time').toBeGreaterThanOrEqual(2);
    expect(s.called(run.calls, 'pr', 'merge')).toBe(true);
    expect(run.summary.checks.requiredChecksGreen).toBe(true);
    expect(run.summary.merged).toBe(true);
    expect(run.summary.issueClosed).toBe(true);
    expect(run.summary.dodPassed).toBe(true);
    expect(run.status).toBe(0);
  }, 30_000);

  it('treats a timeout as a failure, not a merge', () => {
    const s = build({
      protection: protection(CONTEXT_A, CONTEXT_B),
      rollupPhases: [[
        checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS'),
        checkRun(CONTEXT_B, 'IN_PROGRESS', null),
      ]],
      mergeLands: true,
    });
    const run = s.runDeliver({ checksTimeout: 2, checksInterval: 1 });

    expect(s.called(run.calls, 'pr', 'merge')).toBe(false);
    expect(run.status).toBe(2);
    expect(run.summary.merged).toBe(false);
    expect(run.summary.checks.requiredChecksGreen).toBe(false);
    expect(run.summary.notes).toContain('timed out');
    expect(run.summary.notes).toContain(CONTEXT_B);
  }, 30_000);

  it('stops when there is no context to gate on', () => {
    const s = build({ protection: null, rollupPhases: [[]], mergeLands: true });
    const run = s.runDeliver();

    expect(s.called(run.calls, 'pr', 'merge')).toBe(false);
    expect(run.status).toBe(2);
    expect(run.summary.checks.requiredCheckRule).toBe('rollup-fallback');
    expect(run.summary.notes).toContain('no check context to gate on');
  }, 30_000);

  it('counts a required context that is absent from the rollup as pending, never as absent', () => {
    const s = build({
      protection: protection(CONTEXT_A, CONTEXT_B),
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS')]], // CONTEXT_B has not reported yet
      mergeLands: true,
    });
    const run = s.runDeliver({ checksTimeout: 2, checksInterval: 1 });

    expect(s.called(run.calls, 'pr', 'merge')).toBe(false);
    expect(run.status).toBe(2);
    expect(run.summary.notes).toContain(CONTEXT_B);
    expect(run.summary.checks.requiredCheckContexts).toContain(CONTEXT_B);
  }, 30_000);

  it('falls back to every rollup context when the protection list is unreadable, and records the rule', () => {
    const s = build({
      protection: null,
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS'), { context: CONTEXT_B, state: 'SUCCESS' }]],
      mergeLands: true,
    });
    const run = s.runDeliver();

    expect(s.called(run.calls, 'pr', 'merge')).toBe(true);
    expect(run.summary.checks.requiredCheckRule).toBe('rollup-fallback');
    expect(run.summary.notes).toContain('documented fallback');
    expect(run.summary.merged).toBe(true);
    expect(run.status).toBe(0);
  }, 30_000);
});

describe('deliver-ticket hard-failure contract', () => {
  it('never reports an unlanded merge as delivered, and closes no issue', () => {
    const s = build({
      protection: protection(CONTEXT_A),
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS')]],
      mergeExitCode: 0,
      mergeLands: false, // the forge accepted the call but the branch never landed
    });
    const run = s.runDeliver();

    expect(s.called(run.calls, 'pr', 'merge')).toBe(true);
    expect(s.called(run.calls, 'issue', 'close'), 'the tracker issue was closed on an unlanded merge').toBe(false);
    expect(run.summary.merged).toBe(false);
    expect(run.summary.issueClosed).toBe(false);
    expect(run.summary.dodPassed).toBe(false);
    expect(run.status).toBe(2);
  }, 30_000);

  it('fails the Definition of Done when no --test-cmd was supplied, and passes with one', () => {
    const scenario = {
      protection: protection(CONTEXT_A),
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS')]],
      mergeLands: true,
    };

    const withoutCmd = build(scenario).runDeliver({ withTestCmd: false });
    expect(withoutCmd.summary.merged).toBe(true);
    expect(withoutCmd.summary.dodPassed).toBe(false);
    expect(withoutCmd.summary.checks.testsPassed).toBeNull();
    expect(withoutCmd.summary.notes).toContain('--test-cmd');
    expect(withoutCmd.status).toBe(2);

    rmSync(scratch.dir, { recursive: true, force: true });

    const withCmd = build(scenario).runDeliver();
    expect(withCmd.summary.dodPassed).toBe(true);
    expect(withCmd.summary.checks.testsPassed).toBe(true);
    expect(withCmd.status).toBe(0);
  }, 60_000);

  it('opens no pull request when no --body-file was supplied', () => {
    const s = build({
      protection: protection(CONTEXT_A),
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS')]],
      mergeLands: true,
    });
    const run = s.runDeliver({ withBodyFile: false });

    expect(s.called(run.calls, 'pr', 'create'), 'a PR was opened without a composed body').toBe(false);
    expect(s.called(run.calls, 'pr', 'merge')).toBe(false);
    expect(run.status).toBe(2);
    expect(run.summary.merged).toBe(false);
    expect(run.summary.prUrl).toBe('');
    expect(run.summary.notes).toContain('.github/PULL_REQUEST_TEMPLATE.md');
  }, 30_000);

  it('keeps the deliberate --no-merge stop at exit 0 with a summary line', () => {
    const s = build({
      protection: protection(CONTEXT_A),
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS')]],
      mergeLands: true,
    });
    const run = s.runDeliver({ extra: ['--no-merge'] });

    expect(s.called(run.calls, 'pr', 'merge')).toBe(false);
    expect(run.summary).not.toBeNull();
    expect(run.summary.awaitingMerge).toBe(true);
    expect(run.summary.dodPassed).toBe(false);
    expect(run.status).toBe(0);
  }, 30_000);

  it('leaves the divergence guard intact — refuses to push and changes nothing on origin', () => {
    const s = build({
      protection: protection(CONTEXT_A),
      rollupPhases: [[checkRun(CONTEXT_A, 'COMPLETED', 'SUCCESS')]],
      mergeLands: true,
    });
    // Publish build A, then replace the local branch with an unrelated build B.
    s.git(['push', '--quiet', 'origin', s.branch]);
    const remoteBefore = s.originSha(`refs/heads/${s.branch}`);
    s.git(['checkout', '--quiet', '-B', s.branch, s.defaultBranch]);
    s.git(['commit', '--quiet', '--allow-empty', '-m', 'second independent build']);

    const run = s.runDeliver();

    expect(run.summary.notes).toContain('DIVERGED');
    expect(s.called(run.calls, 'pr', 'create')).toBe(false);
    expect(s.called(run.calls, 'pr', 'merge')).toBe(false);
    expect(s.originSha(`refs/heads/${s.branch}`), 'origin was force-updated').toBe(remoteBefore);
    expect(run.summary.merged).toBe(false);
    expect(run.status).toBe(2);
  }, 30_000);
});
