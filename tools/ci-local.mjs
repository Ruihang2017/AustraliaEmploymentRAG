/**
 * FND-23 / PRD-02 DEV-005 — `pnpm ci:local`, the local reproduction of the CI job set.
 *
 * Deliberately has **no shebang**: like tools/workspace-script.mjs it is always invoked as
 * `node tools/ci-local.mjs`, and on a Windows checkout a `#!...\r\n` first line makes Vite's
 * transform fail when the test suite imports this module.
 *
 * What it is: the one command a developer (or a pipeline runner) can invoke so that "local green"
 * and "CI green" mean the same thing. Before this existed, the operative definition of tests green
 * was `pnpm test` on Windows, which reaches neither cargo, nor uv/pytest, nor any of the
 * supply-chain scans — so a Builder and a Reviewer could both honestly report green while CI was
 * red, indefinitely (docs/PRD-02-ci-repair.md section 1).
 *
 * **The command set is derived, never transcribed.** It is read out of `.github/workflows/ci.yml`
 * at run time through FND-02's restricted reader (`.github/workflows/checks/workflow-model.mjs`,
 * imported read-only). A hardcoded list would be a second source of truth that drifts the first
 * time `ci.yml` changes — the defect class FND-11, FND-12 and FND-19 each had to repair. Nothing
 * here may hardcode a command, a job id, or a command count.
 *
 * No command is rewritten, reordered, dropped or re-flagged. A line that cannot run locally is
 * reported as a **failure with its message**, never silently omitted: the whole point is that
 * `pnpm ci:local` exiting 0 means CI would pass.
 *
 * Two exclusions, both printed by the run itself rather than buried in documentation:
 *   - the run reproduces the CI **job set**, not `ubuntu-latest`;
 *   - the tenth required context, `PRD 45.4 pull-request contract`, reads a pull-request body,
 *     which does not exist on a developer machine.
 *
 * Commands are executed through a POSIX shell, because that is what GitHub uses for a `run:` step
 * on `ubuntu-latest`. This is reproduction, not deviation: `ci.yml` contains at least one line
 * (`cargo metadata --locked --format-version 1 > /dev/null`) that `cmd.exe` cannot run at all, and
 * rewriting it here is forbidden.
 *
 * No network access of its own. Reads no environment variable that could carry a credential
 * (PRD section 20.2) and never logs the environment.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWorkflow } from '../.github/workflows/checks/workflow-model.mjs';
import { membersProviding } from './workspace-script.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const NODE_VERSION_PATH = '.node-version';

/** `pnpm -r --if-present run <name>` and nothing else. Anchored on purpose: no fuzzy matching. */
const IF_PRESENT_DELEGATION = /^pnpm -r --if-present run ([A-Za-z0-9][A-Za-z0-9:._-]*)$/;

/**
 * Every `run:` line of every step of every job, in document order.
 *
 * Steps carrying `uses:` (the checkout, the composite `./.github/workflows/actions/setup`, the
 * cargo cache) have no `run:` key and drop out structurally — there is no name matching on
 * "checkout" or "setup", which would break the moment a step is renamed. A multi-line `run: |`
 * block expands to one entry per line so a failure names the exact line.
 */
export function deriveCommands(ciYamlText) {
  const doc = parseWorkflow(ciYamlText);
  const jobs = doc.jobs;
  if (jobs === null || typeof jobs !== 'object' || Array.isArray(jobs)) {
    throw new Error(`${CI_WORKFLOW_PATH}: no \`jobs:\` mapping — nothing to reproduce`);
  }
  const commands = [];
  for (const [jobId, job] of Object.entries(jobs)) {
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    for (const step of steps) {
      const run = step?.run;
      if (typeof run !== 'string') continue;
      for (const line of run.split('\n')) {
        const command = line.trim();
        if (command === '') continue;
        commands.push({
          jobId,
          jobName: typeof job?.name === 'string' ? job.name : jobId,
          stepName: typeof step?.name === 'string' ? step.name : null,
          command,
        });
      }
    }
  }
  return commands;
}

/**
 * The workspace script name a command delegates to through `pnpm -r --if-present`, or null.
 * Only such a command can ever be vacuous: `pnpm eval:smoke` is a *root* script with an owner and
 * must never carry the marker.
 */
export function vacuousScriptName(command) {
  const match = IF_PRESENT_DELEGATION.exec(String(command).trim());
  return match === null ? null : match[1];
}

/**
 * CLAUDE.md: a red result under Node 22.11.0 is an environment fault, not a regression, and a local
 * CI reproduction that does not check this reproduces the wrong thing. Pure, so the suite can drive
 * both branches without a second Node on the machine.
 */
export function checkNodeVersion(actual, pinned) {
  if (String(actual) === String(pinned)) return null;
  return (
    `Node version mismatch: running ${actual}, but ${NODE_VERSION_PATH} pins ${pinned}. ` +
    'Put the pinned toolchain first on PATH and re-run; a gate result from the wrong Node says ' +
    'nothing about CI.'
  );
}

/**
 * Candidate POSIX shells, in preference order.
 *
 * `C:\Windows\System32\bash.exe` (WSL) and the WindowsApps stub are deliberately absent and must
 * stay absent: WSL is a different filesystem, so the whole gate would run against a Linux checkout
 * and could plausibly pass — a green run that proves nothing.
 */
export function posixShellCandidates(platform = process.platform, env = process.env) {
  if (platform !== 'win32') return ['/bin/bash', '/usr/bin/bash'];
  const roots = [env.ProgramFiles, env.ProgramW6432, 'C:\\Program Files'].filter(
    (root) => typeof root === 'string' && root.length > 0,
  );
  const candidates = [];
  for (const root of roots) {
    for (const tail of ['Git\\bin\\bash.exe', 'Git\\usr\\bin\\bash.exe']) {
      const candidate = `${root}\\${tail}`;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  }
  return candidates;
}

/**
 * The first candidate that exists *and* answers `uname -s` like a POSIX shell. Never falls back to
 * `cmd.exe`, which cannot run every line `ci.yml` contains.
 */
export function resolvePosixShell(platform = process.platform, candidates = null) {
  const list = candidates ?? posixShellCandidates(platform);
  const tried = [];
  for (const candidate of list) {
    if (!existsSync(candidate)) {
      tried.push(`${candidate} (not present)`);
      continue;
    }
    const probe = spawnSync(candidate, ['-c', 'uname -s'], { encoding: 'utf8' });
    const output = String(probe.stdout ?? '').trim();
    if (probe.status === 0 && /^(MINGW|MSYS|CYGWIN|Linux|Darwin)/.test(output)) {
      return { path: candidate, uname: output };
    }
    tried.push(`${candidate} (uname -s did not answer like a POSIX shell)`);
  }
  return {
    problem:
      'no POSIX shell could be resolved, and cmd.exe is not an acceptable substitute (it cannot ' +
      `run every line ${CI_WORKFLOW_PATH} contains). Tried: ${tried.length === 0 ? '(nothing)' : tried.join('; ')}`,
  };
}

function statusLabel(result) {
  if (result.status !== 0) return `FAIL exit=${result.status}`;
  return result.vacuous ? 'PASS (vacuous)' : 'PASS';
}

/**
 * Runs every derived command, in order, one child at a time.
 *
 * **Every command runs, even after one fails.** A run that stops at the first failure hides the
 * rest of the gate, which is exactly how one failure class masked another. `providersFor` is
 * injected so the suite can drive both vacuity branches without depending on live workspace state.
 */
export function runCommands(commands, options = {}) {
  const shell = options.shell;
  const cwd = options.cwd ?? REPO_ROOT;
  const providersFor = options.providersFor ?? ((name) => membersProviding(name, cwd));
  const write = options.write ?? ((text) => process.stdout.write(text));
  const results = [];
  for (const entry of commands) {
    const child = spawnSync(shell, ['-c', entry.command], { cwd, stdio: options.stdio ?? 'inherit' });
    const status = child.status === null || child.status === undefined ? 1 : child.status;
    const scriptName = vacuousScriptName(entry.command);
    // A non-zero exit is never vacuous, whatever the command looks like.
    const vacuous = status === 0 && scriptName !== null && providersFor(scriptName).length === 0;
    const result = { ...entry, status, vacuous };
    results.push(result);
    write(`${entry.jobId}  ${statusLabel(result)}  ${entry.command}\n`);
  }
  return results;
}

/** The report block. Pure, so its wording is assertable without running the gate. */
export function formatSummary(results, context = {}) {
  const total = results.length;
  const failed = results.filter((result) => result.status !== 0);
  const vacuous = results.filter((result) => result.status === 0 && result.vacuous);
  const passed = total - failed.length;
  const jobIds = [...new Set(results.map((result) => result.jobId))];

  const lines = [];
  lines.push('');
  lines.push('=== pnpm ci:local — summary ===');
  lines.push(
    `Node ${context.nodeVersion ?? 'unknown'} (checked against the ${NODE_VERSION_PATH} pin ` +
      `${context.pinnedNodeVersion ?? 'unknown'})`,
  );
  if (context.shellPath) lines.push(`POSIX shell: ${context.shellPath}`);
  lines.push(`Command set derived from ${CI_WORKFLOW_PATH} at run time — never transcribed.`);
  lines.push(`Jobs reproduced (${jobIds.length}): ${jobIds.join(', ')}`);
  lines.push(
    `Commands: ${total} total, ${passed} passed (${vacuous.length} vacuous), ${failed.length} failed.`,
  );
  if (failed.length > 0) {
    lines.push('Failed:');
    for (const result of failed) lines.push(`  ${result.jobId}  exit=${result.status}  ${result.command}`);
  }
  lines.push('');
  lines.push('What this run does NOT cover:');
  lines.push(
    '  1. It reproduces the CI job SET, not the CI runner. CI runs on ubuntu-latest; this ran on ' +
      `${context.platform ?? process.platform}. Platform-shaped failures remain CI's to catch, and a ` +
      'green run here is not a claim about them.',
  );
  lines.push(
    '  2. The PRD 45.4 pull-request contract context is not reproduced at all: it reads a ' +
      'pull-request body, and there is no pull-request body on a developer machine.',
  );
  lines.push(
    '  3. A multi-line `run:` block is executed line by line, every line, whereas CI runs the block ' +
      'under `bash -e`, where a failing line aborts the rest of that block. This run therefore ' +
      'reports more of the block than CI would; it never reports less.',
  );
  lines.push(
    '  4. The composite ./.github/workflows/actions/setup steps are not reproduced: they install ' +
      'the toolchain whose version the guard above has already verified is the pinned one.',
  );
  lines.push('');
  lines.push(
    failed.length === 0
      ? 'All derived commands passed. On this evidence CI would pass, subject to the caveats above.'
      : `${failed.length} derived command(s) failed — CI would fail the same way.`,
  );
  return lines.join('\n');
}

// Takes no arguments: `pnpm ci:local` reproduces the CI job set exactly, and a flag that reduced or
// reshaped that set would recreate the very "looks complete, is a subset" defect this exists to end.
export function main(root = REPO_ROOT) {
  const write = (text) => process.stdout.write(text);
  const fail = (text) => process.stderr.write(text);

  // 1. The Node guard runs before anything else, in this process...
  const pinned = readFileSync(join(root, NODE_VERSION_PATH), 'utf8').trim();
  const mismatch = checkNodeVersion(process.versions.node, pinned);
  if (mismatch !== null) {
    fail(`ci:local: ${mismatch}\n`);
    return 1;
  }

  // 2. ...and then in the shell the commands will actually run in. CLAUDE.md's whole failure
  // signature is a child process re-resolving `node` from a PATH the parent does not share.
  const shell = resolvePosixShell();
  if (shell.problem) {
    fail(`ci:local: ${shell.problem}\n`);
    return 1;
  }
  const childNode = spawnSync(shell.path, ['-c', 'node -v'], { cwd: root, encoding: 'utf8' });
  if (childNode.status !== 0) {
    fail(`ci:local: the resolved shell ${shell.path} could not run \`node -v\`.\n`);
    return 1;
  }
  const childVersion = String(childNode.stdout ?? '').trim().replace(/^v/, '');
  const childMismatch = checkNodeVersion(childVersion, pinned);
  if (childMismatch !== null) {
    fail(`ci:local: the shell that runs the commands resolves a different Node. ${childMismatch}\n`);
    return 1;
  }

  // 3. Derive.
  const commands = deriveCommands(readFileSync(join(root, CI_WORKFLOW_PATH), 'utf8'));
  if (commands.length === 0) {
    fail(`ci:local: derived no commands from ${CI_WORKFLOW_PATH} — a runner that derives nothing must fail.\n`);
    return 1;
  }

  write(`ci:local — ${commands.length} command(s) derived from ${CI_WORKFLOW_PATH}\n`);
  write(`Node ${process.versions.node}; shell ${shell.path} (${shell.uname})\n\n`);

  const results = runCommands(commands, { shell: shell.path, cwd: root, write });
  write(`${formatSummary(results, {
    nodeVersion: process.versions.node,
    pinnedNodeVersion: pinned,
    shellPath: shell.path,
    platform: process.platform,
  })}\n`);

  return results.some((result) => result.status !== 0) ? 1 : 0;
}

// Import-safe: `pnpm test` imports this module, and `pnpm test` is itself one of the derived
// commands. Without this guard the gate would run itself.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
