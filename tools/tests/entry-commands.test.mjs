import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, loadFixture } from '../workspace-assertions.mjs';

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

  it('records the one known-failing command with its open question rather than dropping it', () => {
    const known = fixture.commands.filter((entry) => entry.known_failing);
    expect(known.map((entry) => entry.command)).toEqual([
      'powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1',
    ]);
    expect(known[0].known_failing.openQuestion).toContain('OQ-1');
    expect(known[0].known_failing.reason).toContain('docs/PRD.md');
  });
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
