import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, loadFixture } from '../workspace-assertions.mjs';
import { resolveInvocation } from '../check-workspace.mjs';

const fixture = loadFixture('entry-commands.json');

/** The fenced block under PRD "### 45.3 Target local commands". */
function prdEntryCommands() {
  const prd = readFileSync(join(REPO_ROOT, 'docs/PRD.md'), 'utf8');
  const section = prd.split('### 45.3 Target local commands')[1];
  const block = section.match(/```text\r?\n([\s\S]*?)```/)[1];
  return block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

describe('PRD 45.3 entry commands', () => {
  it('transcribes all fourteen commands verbatim from docs/PRD.md', () => {
    const fromPrd = prdEntryCommands();
    expect(fromPrd).toHaveLength(14);
    expect(fixture.commands.map((entry) => entry.command)).toEqual(fromPrd);
  });

  it('gives every command a one-line description', () => {
    for (const entry of fixture.commands) {
      expect(entry.description, entry.command).toBeTruthy();
      expect(entry.description.includes('\n')).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Regression guards for the review bounce on FND-01 v1.0 (2026-08-07).
  //
  // v1.0 shipped the PRD validation command as a `known_failing` fixture entry: the sweep printed
  // exit 1 as "KNOWN" and the suite asserted the *presence* of that annotation, so `pnpm test` stayed
  // green forever while the ticket's unconditional acceptance item 2 ("all fourteen ... exit 0") was
  // unmet. v1.1 makes the `-Path docs/PRD.md` invocation spec (sub-PRD D18) and forbids the waiver.
  // These three tests are what stop the mask from coming back.
  // ---------------------------------------------------------------------------------------------

  const WAIVER_FIELDS = [
    'known_failing',
    'knownFailing',
    'expected_failure',
    'expectedFailure',
    'allow_failure',
    'allowFailure',
    'xfail',
    'skip',
    // FND-22: `supported: false` is the shape a waiver would take on the new per-platform axis.
    'supported',
  ];

  it('carries no failure waiver on any entry — a red command escalates, it is not annotated', () => {
    for (const entry of fixture.commands) {
      for (const field of WAIVER_FIELDS) {
        expect(
          Object.hasOwn(entry, field),
          `${entry.command} carries "${field}"; FND-01 v1.1 deliverable 10 forbids failure waivers — ` +
            'a command that cannot exit 0 is a red acceptance item, not a fixture annotation',
        ).toBe(false);
      }
      // FND-22: the ban reaches into every platform record too — a waiver may not hide one level
      // down on the axis this ticket added.
      for (const [platformKey, record] of Object.entries(entry.platforms ?? {})) {
        for (const field of WAIVER_FIELDS) {
          expect(
            Object.hasOwn(record, field),
            `${entry.command} platform "${platformKey}" carries "${field}"; a command that cannot ` +
              'exit 0 on a supported platform is a red acceptance item and an escalation (Q-CI-D), ' +
              'not a fixture annotation',
          ).toBe(false);
        }
      }
    }
    // Belt and braces: the waiver must not reappear anywhere in the fixture, at any nesting depth.
    const raw = readFileSync(join(REPO_ROOT, 'tools/fixtures/entry-commands.json'), 'utf8');
    for (const field of WAIVER_FIELDS.filter((f) => f !== 'skip')) {
      expect(raw, `entry-commands.json mentions "${field}"`).not.toContain(`"${field}"`);
    }
    // …and assert deliberately that the raw scan above is actually covering the platform records
    // rather than covering nothing (FND-22 deliverable 3).
    expect(raw, 'the raw waiver scan no longer covers any platforms object').toContain('"platforms"');
  });

  // -----------------------------------------------------------------------------------------------
  // FND-22 (PRD-02 requirement DEV-006): the second recorded axis. `command` stays the verbatim
  // PRD 45.3 string and `run` stays `command + ' ' + deviation.argument`; a `platforms` record may
  // substitute the leading interpreter token only, for the one command whose token is Windows-only.
  // -----------------------------------------------------------------------------------------------

  const PS_COMMAND = 'powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1';

  it('records a per-platform interpreter on exactly one entry, and only the leading token', () => {
    const withPlatforms = fixture.commands.filter((entry) => entry.platforms);
    expect(
      withPlatforms.map((entry) => entry.command),
      'a platform substitution is exceptional and declared — bumping this count is a deliberate ' +
        'ticket change (FND-22 feedback obligation 2), never a silent one',
    ).toEqual([PS_COMMAND]);

    const entry = withPlatforms[0];
    expect(Object.keys(entry.platforms)).toEqual(['linux']);
    for (const [platformKey, record] of Object.entries(entry.platforms)) {
      expect(platformKey, 'a wildcard platform key would make the substitution undeclared').toMatch(
        /^[a-z0-9]+$/,
      );
      expect(typeof record.run, `${platformKey}.run must be a real invocation, not null`).toBe('string');
      expect(record.run.length).toBeGreaterThan(0);
      // Leading token only: everything after the first space of the normative string, plus the D18
      // argument, must be byte-identical. This is what stops a record smuggling in another script
      // path or an extra argument.
      expect(record.run).toBe(
        `${record.interpreter}${entry.command.slice(entry.command.indexOf(' '))} ${entry.deviation.argument}`,
      );
      expect(record.reason, `${platformKey} substitutes an interpreter without a reason`).toBeTruthy();
      expect(record.durableFix, `${platformKey} records no durable fix`).toBeTruthy();
      expect(record.authorisedBy).toContain('FND-22');
      expect(record.authorisedBy).toContain('DEV-006');
    }
  });

  it('resolves the invocation through one shared function, per platform (deliverable 2)', () => {
    const entry = fixture.commands.find((candidate) => candidate.command.includes('validate-prd.ps1'));
    // Platform-independent assertions, so both the Windows workstation and the ubuntu runner prove
    // the same rule — a mutation of the linux record must be catchable on Windows too.
    expect(resolveInvocation(entry, 'linux')).toBe(entry.platforms.linux.run);
    expect(resolveInvocation(entry, 'linux').startsWith('pwsh ')).toBe(true);
    expect(resolveInvocation(entry, 'win32')).toBe(entry.run);
    expect(resolveInvocation(entry, 'win32').startsWith('powershell ')).toBe(true);
    // Fallbacks: no platform record -> `run`; neither -> the verbatim command.
    expect(resolveInvocation({ command: 'pnpm lint' }, 'linux')).toBe('pnpm lint');
    expect(resolveInvocation(fixture.commands[0], 'linux')).toBe(fixture.commands[0].command);
  });

  it('still runs the sweep when invoked as a CLI, despite being importable', () => {
    // Guards the `import.meta.main` change that makes tools/check-workspace.mjs importable: a
    // botched guard would turn the sweep into a silent no-op that still exits 0.
    const result = spawnSync(process.execPath, ['tools/check-workspace.mjs', '--no-sweep'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('PRD 20.1 layout');
  }, 60_000);

  it('executes the verbatim §45.3 string unless a documented deviation says otherwise', () => {
    const deviating = fixture.commands.filter((entry) => (entry.run ?? entry.command) !== entry.command);
    // Exactly one deviation is authorised today: FND-01 v1.1 / D18.
    expect(deviating.map((entry) => entry.command)).toEqual([
      'powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1',
    ]);
    for (const entry of deviating) {
      expect(entry.deviation, `${entry.command} changes its invocation without a deviation record`).toBeTruthy();
      // The executed form must be the normative string plus the recorded argument — nothing else.
      expect(entry.run).toBe(`${entry.command} ${entry.deviation.argument}`);
      expect(entry.deviation.reason).toContain('docs/PRD.md');
      expect(entry.deviation.authorisedBy).toContain('FND-01 v1.1');
      expect(entry.deviation.authorisedBy).toContain('D18');
      expect(entry.deviation.durableFix).toBeTruthy();
    }
    // A `deviation` may never appear on an entry that does not actually deviate — that would be a
    // waiver wearing a different name.
    for (const entry of fixture.commands) {
      if (!deviating.includes(entry)) expect(entry.deviation, entry.command).toBeUndefined();
    }
  });

  it('runs the PRD validation entry command for real and exits 0 (acceptance item 2)', () => {
    const entry = fixture.commands.find((candidate) => candidate.command.includes('validate-prd.ps1'));
    // The invocation for the platform this suite is actually running on — never a skip, never a
    // `process.platform` conditional: the point of DEV-006 is that a command that cannot run is
    // visible on the platform it cannot run on.
    const invocation = resolveInvocation(entry, process.platform);
    const result = spawnSync(invocation, {
      cwd: REPO_ROOT,
      shell: true,
      encoding: 'utf8',
    });
    expect(
      result.status,
      `\`${invocation}\` exited ${result.status}:\n${result.stdout}\n${result.stderr}`,
    ).toBe(0);
    expect(`${result.stdout}`).toContain('PASS');
  }, 120_000);
});

describe('uv workspace empty-suite handling', () => {
  const pyproject = readFileSync(join(REPO_ROOT, 'pyproject.toml'), 'utf8');

  it('loads the exit-code plugin from the root pyproject, with no root conftest.py', () => {
    expect(pyproject).toContain('addopts');
    expect(pyproject).toContain('-p tools.pytest_exit_zero_when_empty');
    expect(pyproject).toContain('pythonpath = ["."]');
    expect(() => readFileSync(join(REPO_ROOT, 'conftest.py'))).toThrow();
  });

  it('rewrites only NO_TESTS_COLLECTED, never a failure', () => {
    const plugin = readFileSync(join(REPO_ROOT, 'tools/pytest_exit_zero_when_empty.py'), 'utf8');
    expect(plugin).toContain('ExitCode.NO_TESTS_COLLECTED');
    expect(plugin).toContain('ExitCode.OK');
    expect(plugin).not.toContain('TESTS_FAILED');
  });

  it('declares the uv workspace members and the exact Python pin', () => {
    expect(pyproject).toContain('requires-python = "==3.14.6"');
    expect(pyproject).toContain('[tool.uv.workspace]');
    expect(pyproject).toContain('"pipelines/*"');
    expect(pyproject).toContain('"sdk/python"');
  });
});

describe('Cargo workspace', () => {
  const cargo = readFileSync(join(REPO_ROOT, 'Cargo.toml'), 'utf8');

  it('is a virtual workspace with resolver 2 and the search-rs member', () => {
    expect(cargo).toContain('[workspace]');
    expect(cargo).toContain('resolver = "2"');
    expect(cargo).toContain('members = ["services/search-rs"]');
    expect(cargo).not.toContain('[package]');
  });

  it('pins the toolchain channel exactly, with rustfmt and clippy', () => {
    const toolchain = readFileSync(join(REPO_ROOT, 'rust-toolchain.toml'), 'utf8');
    expect(toolchain).toContain('channel = "1.97.1"');
    expect(toolchain).toContain('rustfmt');
    expect(toolchain).toContain('clippy');
  });
});

describe('pnpm workspace', () => {
  it('uses globs so a later module never edits a root file to register a package', () => {
    const yaml = readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
    expect(yaml).toContain("- 'apps/*'");
    expect(yaml).toContain("- 'packages/*'");
    expect(yaml).toContain("- 'tests/*'");
    expect(yaml).not.toMatch(/apps\/(web|api|worker)\b/);
  });

  it('sets engine-strict and prefer-frozen-lockfile', () => {
    const npmrc = readFileSync(join(REPO_ROOT, '.npmrc'), 'utf8');
    expect(npmrc).toContain('engine-strict=true');
    expect(npmrc).toContain('prefer-frozen-lockfile=true');
  });

  it('has an .editorconfig fixing UTF-8, LF and a final newline', () => {
    const editorconfig = readFileSync(join(REPO_ROOT, '.editorconfig'), 'utf8');
    expect(editorconfig).toContain('charset = utf-8');
    expect(editorconfig).toContain('end_of_line = lf');
    expect(editorconfig).toContain('insert_final_newline = true');
  });
});
