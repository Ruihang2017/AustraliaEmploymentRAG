import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, loadFixture } from '../workspace-assertions.mjs';

const bytes = readFileSync(join(REPO_ROOT, 'README.md'));
const text = bytes.toString('utf8');
const entryCommands = loadFixture('entry-commands.json');
const pins = loadFixture('toolchain-pins.json');

describe('root README (PRD 45.3 "document platform prerequisites in the root README.md")', () => {
  it('is valid UTF-8 with no BOM', () => {
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))).toBe(false);
    expect(Buffer.from(text, 'utf8').equals(bytes)).toBe(true);
  });

  // Line endings are asserted against the *committed blob* in tools/tests/line-endings.test.mjs:
  // git's core.autocrlf=true rewrites the working-tree copy on a Windows checkout, so a working-tree
  // check here would fail on a fresh clone even though the repository stores LF.
  it('has no stray carriage return inside a line', () => {
    expect(text.split('\r\n').join('\n').includes('\r')).toBe(false);
  });

  it('quotes all fourteen PRD 45.3 entry commands verbatim', () => {
    expect(entryCommands.commands).toHaveLength(14);
    for (const entry of entryCommands.commands) {
      expect(text, `README is missing: ${entry.command}`).toContain(entry.command);
    }
  });

  it('invokes tools/validate-prd.ps1 exactly as PRD 45.3 spells it', () => {
    expect(text).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-prd.ps1');
  });

  it('states each pinned version alongside the file it lives in', () => {
    const rows = [
      ['24.18.0', '.node-version'],
      ['24.18.0', 'engines.node'],
      ['pnpm@11.4.0', 'packageManager'],
      ['1.97.1', 'rust-toolchain.toml'],
      ['3.14.6', 'pyproject.toml'],
    ];
    for (const [version, file] of rows) {
      const line = text.split('\n').find((l) => l.includes(version) && l.includes(file));
      expect(line, `no README line names both ${version} and ${file}`).toBeTruthy();
    }
    for (const version of Object.values(pins.versions)) {
      expect(text).toContain(version);
    }
  });

  it('names the owning ticket for every not-yet-implemented entry command', () => {
    const owners = loadFixture('script-owners.json').owners;
    for (const [name, owner] of Object.entries(owners)) {
      const line = text
        .split('\n')
        .find((l) => l.includes(`pnpm ${name}`) && l.includes(owner.ticket) && l.includes(owner.module));
      expect(line, `README does not name ${owner.ticket} for pnpm ${name}`).toBeTruthy();
    }
  });

  it('declares the conventions FND-03 and later tickets inherit', () => {
    expect(text).toContain('Vitest');
    expect(text).toContain('ESLint');
    expect(text).toContain('@taxrag/');
    expect(text).toContain('tsconfig.base.json');
  });

  it('documents the PRD 20.2 no-credential rule and the Windows 11 workstation', () => {
    expect(text).toContain('Windows 11');
    expect(text).toMatch(/§20\.2/);
    // Markdown hard-wraps, so compare against a whitespace-normalised copy.
    const flat = text.toLowerCase().replace(/\s+/g, ' ');
    expect(flat).toContain('no entry command in §4 reads a secret');
    expect(flat).toContain('no credentials** are required at any step');
  });

  it('records the known-failing entry command instead of hiding it', () => {
    const known = entryCommands.commands.filter((entry) => entry.known_failing);
    expect(known).toHaveLength(1);
    expect(text).toContain('Known gaps');
    expect(text).toContain('OQ-1');
  });
});
