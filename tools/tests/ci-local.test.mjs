/**
 * FND-23 deliverable 6 — the suite for tools/ci-local.mjs.
 *
 * It never executes the real gate. `pnpm test` is itself one of the commands the gate runs, so a
 * test that invoked `pnpm ci:local` would run the gate from inside the gate, forever. Everything
 * here drives the runner's decidable parts: derivation from workflow text, the vacuity rule, the
 * Node guard, shell resolution, the summary wording, and the "every command runs" property against
 * synthetic `exit N` commands.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from '../workspace-assertions.mjs';
import {
  checkNodeVersion,
  deriveCommands,
  formatSummary,
  posixShellCandidates,
  resolvePosixShell,
  runCommands,
  vacuousScriptName,
} from '../ci-local.mjs';

const SYNTHETIC = [
  'name: synthetic',
  'jobs:',
  '  first-job:',
  '    name: First job',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - uses: ./.github/workflows/actions/setup',
  '      - name: One line',
  '        run: pnpm typecheck',
  '  second-job:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - name: A block',
  '        run: |',
  '          first-line --flag',
  '          second-line',
  '          third-line > /dev/null',
  '',
].join('\n');

// The nine jobs the ticket Background table names. Asserted as a subset of what ci.yml declares, so
// adding a job to ci.yml does not fail this spuriously — but dropping one of these does.
const REQUIRED_JOB_IDS = [
  'ts-type-unit',
  'openapi-compat',
  'migration-schema',
  'tenant-auth',
  'pii-citation',
  'rust-build-test',
  'python-build-test',
  'retrieval-eval-smoke',
  'supply-chain-scan',
];

function realWorkflowText() {
  return readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
}

describe('ci:local derivation (FND-23 deliverable 2)', () => {
  it('takes every `run:` line in job order and drops `uses:` steps structurally', () => {
    const commands = deriveCommands(SYNTHETIC);
    expect(commands.map((entry) => entry.command)).toEqual([
      'pnpm typecheck',
      'first-line --flag',
      'second-line',
      'third-line > /dev/null',
    ]);
    expect(commands.map((entry) => entry.jobId)).toEqual([
      'first-job',
      'second-job',
      'second-job',
      'second-job',
    ]);
    expect(commands.some((entry) => /checkout|actions\/setup/.test(entry.command))).toBe(false);
  });

  it('expands a multi-line block to one entry per line, all under the same job', () => {
    const block = deriveCommands(SYNTHETIC).filter((entry) => entry.jobId === 'second-job');
    expect(block).toHaveLength(3);
    expect(new Set(block.map((entry) => entry.stepName))).toEqual(new Set(['A block']));
  });

  it('throws rather than returning an empty list when there is no `jobs:` mapping', () => {
    expect(() => deriveCommands('name: nothing\non:\n  push: {}\n')).toThrow();
  });

  it('derives a non-empty set from the real ci.yml covering every required job', () => {
    const commands = deriveCommands(realWorkflowText());
    expect(commands.length).toBeGreaterThan(0);
    const jobIds = new Set(commands.map((entry) => entry.jobId));
    for (const jobId of REQUIRED_JOB_IDS) {
      expect([...jobIds], `job ${jobId} contributed no command`).toContain(jobId);
    }
    const text = commands.map((entry) => entry.command);
    expect(text).toContain('pnpm typecheck');
    expect(text.some((command) => command.startsWith('corepack pnpm audit'))).toBe(true);
  });
});

describe('ci:local vacuity marker (sub-PRD D4/D19)', () => {
  it('recognises only the exact `pnpm -r --if-present run <name>` shape', () => {
    expect(vacuousScriptName('pnpm -r --if-present run scan:licence')).toBe('scan:licence');
    expect(vacuousScriptName('pnpm -r --if-present run test:migrations')).toBe('test:migrations');
    expect(vacuousScriptName('pnpm test')).toBeNull();
    // A root script with an owner exits 0 after printing its owner line; it is not a vacuous gate.
    expect(vacuousScriptName('pnpm eval:smoke')).toBeNull();
    expect(vacuousScriptName('pnpm -r run scan:licence')).toBeNull();
  });

  it('marks a zero-exit delegation vacuous only when no workspace member provides it', () => {
    const shell = resolvePosixShell();
    expect(shell.problem, shell.problem).toBeUndefined();
    const commands = [
      { jobId: 'a', jobName: 'a', stepName: null, command: 'pnpm -r --if-present run scan:licence' },
      { jobId: 'b', jobName: 'b', stepName: null, command: 'pnpm -r --if-present run test:migrations' },
    ];
    const results = runCommands(commands, {
      shell: '/does-not-matter',
      stdio: 'ignore',
      write: () => {},
      providersFor: (name) => (name === 'test:migrations' ? ['packages/database'] : []),
      // Both "commands" are replaced by a trivial success so the suite never shells out to pnpm.
      spawn: () => ({ status: 0 }),
    });
    expect(results[0].vacuous).toBe(true);
    expect(results[1].vacuous).toBe(false);
  });

  it('never marks a failing command vacuous', () => {
    const results = runCommands(
      [{ jobId: 'a', jobName: 'a', stepName: null, command: 'pnpm -r --if-present run scan:licence' }],
      {
        shell: '/does-not-matter',
        write: () => {},
        providersFor: () => [],
        spawn: () => ({ status: 1 }),
      },
    );
    expect(results[0].status).toBe(1);
    expect(results[0].vacuous).toBe(false);
  });
});

describe('ci:local execution (FND-23 deliverable 2)', () => {
  it('runs every command through the resolved shell even after one fails, and reports non-zero', () => {
    const shell = resolvePosixShell();
    expect(shell.problem, shell.problem).toBeUndefined();
    const commands = ['exit 0', 'exit 3', 'exit 0'].map((command, index) => ({
      jobId: `job-${index}`,
      jobName: `job-${index}`,
      stepName: null,
      command,
    }));
    const printed = [];
    const results = runCommands(commands, {
      shell: shell.path,
      cwd: REPO_ROOT,
      stdio: 'ignore',
      write: (text) => printed.push(text),
      providersFor: () => [],
    });
    expect(results.map((result) => result.status)).toEqual([0, 3, 0]);
    expect(printed).toHaveLength(3);
    expect(printed[1]).toContain('FAIL exit=3');
    expect(results.some((result) => result.status !== 0)).toBe(true);
  }, 30_000);
});

describe('ci:local guards and report (FND-23 deliverable 3)', () => {
  it('fails the Node guard on a wrong version and passes it on the pin', () => {
    const message = checkNodeVersion('22.11.0', '24.18.0');
    expect(message).toContain('22.11.0');
    expect(message).toContain('24.18.0');
    expect(checkNodeVersion('24.18.0', '24.18.0')).toBeNull();
  });

  it('resolves a POSIX shell on this platform, and reports a problem instead of guessing', () => {
    const shell = resolvePosixShell();
    expect(shell.path, shell.problem).toBeTruthy();
    expect(shell.uname).toMatch(/^(MINGW|MSYS|CYGWIN|Linux|Darwin)/);

    const empty = resolvePosixShell(process.platform, []);
    expect(empty.path).toBeUndefined();
    expect(empty.problem).toContain('cmd.exe');
  });

  it('never offers WSL or the WindowsApps stub as a candidate shell', () => {
    const candidates = posixShellCandidates('win32', { ProgramFiles: 'C:\\Program Files' });
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.toLowerCase()).not.toContain('system32');
      expect(candidate.toLowerCase()).not.toContain('windowsapps');
    }
  });

  it('states both exclusions and the outcome counts in the summary', () => {
    const summary = formatSummary(
      [
        { jobId: 'a', command: 'pnpm typecheck', status: 0, vacuous: false },
        { jobId: 'b', command: 'pnpm -r --if-present run scan:licence', status: 0, vacuous: true },
        { jobId: 'c', command: 'node broken.mjs', status: 1, vacuous: false },
      ],
      { nodeVersion: '24.18.0', pinnedNodeVersion: '24.18.0', platform: 'win32' },
    );
    expect(summary).toContain('ubuntu-latest');
    expect(summary).toContain('PRD 45.4 pull-request contract');
    expect(summary).toContain('24.18.0');
    expect(summary).toContain('3 total, 2 passed (1 vacuous), 1 failed');
    expect(summary).toContain('node broken.mjs');
  });

  it('says everything passed only when nothing failed', () => {
    const green = formatSummary([{ jobId: 'a', command: 'pnpm typecheck', status: 0, vacuous: false }], {
      nodeVersion: '24.18.0',
      pinnedNodeVersion: '24.18.0',
    });
    expect(green).toContain('All derived commands passed');
    expect(green).not.toContain('failed - CI would fail');
  });
});
