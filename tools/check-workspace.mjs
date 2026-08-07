/**
 * FND-01 deliverable 9 — offline workspace verification.
 *
 * No shebang, for the reason documented in tools/workspace-script.mjs: always run it as
 * `node tools/check-workspace.mjs`.
 *
 *   (a) asserts the PRD section 20.1 tree against tools/fixtures/prd-20-1-layout.json;
 *   (b) asserts the five pin fields against tools/fixtures/toolchain-pins.json;
 *   (c) runs each of the fourteen PRD section 45.3 entry commands and reports non-zero exits.
 *
 * Requires no network access once the pnpm store, the uv cache and the Rust 1.97.1 toolchain are
 * warm, and never modifies the tree. Reads no credential (PRD section 20.2).
 *
 * Usage:
 *   node tools/check-workspace.mjs            # (a) + (b) + (c)
 *   node tools/check-workspace.mjs --no-sweep # (a) + (b) only, seconds instead of minutes
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertLayout, assertPins, loadFixture } from './workspace-assertions.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REENTRANCY_FLAG = 'TAXRAG_WORKSPACE_SWEEP';

function heading(text) {
  process.stdout.write(`\n=== ${text} ===\n`);
}

function runEntryCommands() {
  const fixture = loadFixture('entry-commands.json', REPO_ROOT);
  const rows = [];
  for (const entry of fixture.commands) {
    const result = spawnSync(entry.command, {
      cwd: REPO_ROOT,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, [REENTRANCY_FLAG]: '1' },
    });
    const status = result.status ?? -1;
    const firstLine =
      (result.stdout || '').split(/\r?\n/).find((line) => line.trim().length > 0) ??
      (result.stderr || '').split(/\r?\n/).find((line) => line.trim().length > 0) ??
      '';
    rows.push({
      command: entry.command,
      status,
      firstLine: firstLine.slice(0, 100),
      expectedFailure: entry.known_failing ?? null,
    });
  }
  return rows;
}

function main() {
  const sweep = !process.argv.includes('--no-sweep');
  const problems = [];

  heading('PRD 20.1 layout');
  const layoutProblems = assertLayout(REPO_ROOT);
  if (layoutProblems.length === 0) {
    const fixture = loadFixture('prd-20-1-layout.json', REPO_ROOT);
    process.stdout.write(`ok — ${fixture.directories.length} directories, no extra top-level entry\n`);
  } else {
    for (const problem of layoutProblems) process.stdout.write(`FAIL ${problem}\n`);
    problems.push(...layoutProblems);
  }

  heading('Toolchain pins (breakdown plan 8 Q12 / D17)');
  const pinProblems = assertPins(REPO_ROOT);
  const pinFixture = loadFixture('toolchain-pins.json', REPO_ROOT);
  for (const pin of pinFixture.pins) {
    process.stdout.write(`  ${pin.file} # ${pin.field} -> ${pin.expected}\n`);
  }
  if (pinProblems.length === 0) {
    process.stdout.write('ok — all five pin fields carry their Q12 value, none is a range\n');
  } else {
    for (const problem of pinProblems) process.stdout.write(`FAIL ${problem}\n`);
    problems.push(...pinProblems);
  }

  if (!sweep) {
    process.stdout.write('\n(--no-sweep: the fourteen entry commands were not run)\n');
    return problems.length === 0 ? 0 : 1;
  }

  if (process.env[REENTRANCY_FLAG] === '1') {
    process.stdout.write(
      `\nrefusing to recurse: ${REENTRANCY_FLAG} is already set — the sweep runs \`pnpm test\`, ` +
        'so `pnpm test` must never run the sweep\n',
    );
    return 1;
  }

  heading('PRD 45.3 entry commands');
  const rows = runEntryCommands();
  const width = Math.max(...rows.map((row) => row.command.length));
  for (const row of rows) {
    const flag = row.status === 0 ? 'ok  ' : row.expectedFailure ? 'KNOWN' : 'FAIL';
    process.stdout.write(
      `${flag} ${row.command.padEnd(width)}  exit=${String(row.status).padStart(2)}  ${row.firstLine}\n`,
    );
    if (row.status !== 0) {
      if (row.expectedFailure) {
        process.stdout.write(`       ^ ${row.expectedFailure.reason}\n`);
        process.stdout.write(`         ${row.expectedFailure.openQuestion}\n`);
      }
      problems.push(`entry command exited ${row.status}: ${row.command}`);
    }
  }

  heading('Running toolchain vs the pins');
  for (const check of pinFixture.runtimeChecks) {
    const result = spawnSync(check.command, { cwd: REPO_ROOT, shell: true, encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split(/\r?\n/)[0] ?? '';
    const matches = output.includes(check.expected);
    process.stdout.write(
      `${matches ? 'ok  ' : 'FAIL'} ${check.command.padEnd(24)} -> ${output} (want ${check.expected})\n`,
    );
    if (!matches) {
      problems.push(
        `running toolchain does not match the pin: \`${check.command}\` reported "${output}", ` +
          `breakdown plan 8 Q12 requires ${check.expected}`,
      );
    }
  }

  heading('Summary');
  if (problems.length === 0) {
    process.stdout.write('all checks passed\n');
    return 0;
  }
  for (const problem of problems) process.stdout.write(`- ${problem}\n`);
  return 1;
}

process.exit(main());
