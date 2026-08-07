/**
 * FND-02 deliverable 2 (verification half) — proves that the toolchain a CI run actually resolved is
 * the toolchain FND-01 pinned (PRD section 45.3 "CI and local development use the same pinned
 * versions"; breakdown plan section 8 Q12 / sub-PRD D17).
 *
 * Zero version literals live here. The **expected** versions are read at runtime from the pin files
 * themselves (`.node-version`, `package.json#packageManager`, `rust-toolchain.toml`,
 * `pyproject.toml#requires-python`) through FND-01's own read-only assertion module; the **actual**
 * versions come from running the commands listed in `tools/fixtures/toolchain-pins.json#runtimeChecks`
 * — the same four the local `node tools/check-workspace.mjs` sweep runs, so CI and the local sweep
 * cannot test different things.
 *
 * A mismatch is a failed job, never a warning: a valid-but-different version is exactly the drift the
 * pin files exist to prevent. The fix is the toolchain, never the pin file (FND-01 owns those; see
 * that ticket's Feedback obligation 3).
 *
 * Read-only. No network. Reads no environment variable that could carry a credential (PRD 20.2).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPins, loadFixture, readPinValue, REPO_ROOT } from '../../../tools/workspace-assertions.mjs';

/**
 * Drops the decoration a pin file puts around its version: a `<tool>@` prefix (`package.json`'s
 * `packageManager`), a `==` prefix (`pyproject.toml`'s `requires-python`) or a leading `v`
 * (`node -v` output). No example is spelled out here on purpose — a version literal must not appear
 * anywhere under `.github/workflows/**`, not even in a comment, and the harness asserts exactly that.
 */
function normalise(value) {
  return String(value)
    .trim()
    .replace(/^[a-z-]+@/i, '')
    .replace(/^==/, '')
    .replace(/^v/i, '');
}

function versionIn(text) {
  return text.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
}

/** The pin-file entries that fix one tool's version, with the file#field each came from. */
function expectationsFor(tool, fixture) {
  return fixture.pins
    .filter((pin) => pin.tool === tool)
    .map((pin) => ({
      source: `${pin.file}#${pin.field}`,
      value: normalise(readPinValue(pin, REPO_ROOT)),
    }));
}

export function run(write = (line) => process.stdout.write(`${line}\n`)) {
  const problems = [];

  // 1. The pin files still carry their Q12 values. If this fails, nothing below means anything.
  for (const problem of assertPins(REPO_ROOT)) problems.push(`pin file drift: ${problem}`);

  const fixture = loadFixture('toolchain-pins.json', REPO_ROOT);
  let checked = 0;

  for (const check of fixture.runtimeChecks) {
    const expectations = expectationsFor(check.tool, fixture);
    if (expectations.length === 0) {
      problems.push(`${check.tool}: no pin file fixes this tool's version — cannot verify the runtime`);
      continue;
    }
    const distinct = [...new Set(expectations.map((entry) => entry.value))];
    if (distinct.length !== 1) {
      problems.push(
        `${check.tool}: pin files disagree — ${expectations.map((e) => `${e.source}="${e.value}"`).join(', ')}`,
      );
      continue;
    }
    const expected = distinct[0];

    const result = spawnSync(check.command, {
      cwd: REPO_ROOT,
      shell: true,
      encoding: 'utf8',
      env: process.env,
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const actual = versionIn(output);
    const sources = expectations.map((entry) => entry.source).join(', ');
    write(`${check.tool}: \`${check.command}\` -> "${output}" want "${expected}" (from ${sources})`);
    checked += 1;

    if (result.status !== 0) {
      problems.push(`${check.tool}: \`${check.command}\` exited ${result.status}: ${output}`);
      continue;
    }
    if (actual !== expected) {
      problems.push(
        `${check.tool}: \`${check.command}\` reports "${actual ?? output}" but ${sources} pins "${expected}"`,
      );
    }
  }

  if (checked === 0) problems.push('no runtime check ran — this verification would be vacuous');
  return problems;
}

// Runs only when invoked directly, so a test may import `run` without triggering the process exit.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const problems = run();
  if (problems.length > 0) {
    process.stderr.write(
      `\nResolved toolchain does not match the committed pin files:\n${problems.map((p) => `  - ${p}`).join('\n')}\n\n` +
        'PRD section 45.3 requires CI and local development to use the same pinned versions, and the\n' +
        'versions are fixed by breakdown plan section 8 Q12 (CONFIRMED) / sub-PRD 00-foundation D17.\n' +
        'Fix the toolchain the runner installs. Never change a pin file to match the runner: those\n' +
        'files belong to FND-01 and a change there goes through its Feedback obligation 3 first.\n',
    );
    process.exit(1);
  }
  process.stdout.write('Resolved toolchain matches every committed pin file.\n');
}
