import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, assertPins, loadFixture, readPinValue } from '../workspace-assertions.mjs';

/** A throwaway root carrying copies of the five pin files plus the fixture. */
function scratchRoot() {
  const root = mkdtempSync(join(tmpdir(), 'fnd01-pins-'));
  mkdirSync(join(root, 'tools/fixtures'), { recursive: true });
  cpSync(
    join(REPO_ROOT, 'tools/fixtures/toolchain-pins.json'),
    join(root, 'tools/fixtures/toolchain-pins.json'),
  );
  for (const file of ['.node-version', 'package.json', 'rust-toolchain.toml', 'pyproject.toml']) {
    cpSync(join(REPO_ROOT, file), join(root, file));
  }
  return root;
}

describe('toolchain pins (breakdown plan 8 Q12 / D17)', () => {
  it('transcribes the Q12 values verbatim', () => {
    const fixture = loadFixture('toolchain-pins.json');
    expect(fixture.versions).toEqual({
      node: '24.18.0',
      pnpm: '11.4.0',
      rust: '1.97.1',
      python: '3.14.6',
    });
    expect(fixture.pins.map((pin) => `${pin.file}#${pin.field}`)).toEqual([
      '.node-version#<file contents>',
      'package.json#packageManager',
      'package.json#engines.node',
      'rust-toolchain.toml#toolchain.channel',
      'pyproject.toml#project.requires-python',
    ]);
  });

  it('finds all five pin fields carrying their Q12 value', () => {
    expect(assertPins()).toEqual([]);
  });

  it.each([
    ['.node-version', '24.18.0'],
    ['package.json', 'pnpm@11.4.0'],
    ['package.json', '24.18.0'],
    ['rust-toolchain.toml', '1.97.1'],
    ['pyproject.toml', '==3.14.6'],
  ])('reads %s and gets %s', (file, expected) => {
    const fixture = loadFixture('toolchain-pins.json');
    const pin = fixture.pins.find((p) => p.file === file && p.expected === expected);
    expect(readPinValue(pin)).toBe(expected);
  });

  it('fails on a valid-but-different exact version, naming Q12', () => {
    const root = scratchRoot();
    try {
      writeFileSync(join(root, '.node-version'), '24.17.0\n');
      const problems = assertPins(root);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('"24.17.0"');
      expect(problems[0]).toContain('must be exactly "24.18.0"');
      expect(problems[0]).toContain('Q12');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['>=22', '^24.18.0', '~24.18.0', '24.x', 'latest', '*'])(
    'fails when a pin is the range %s',
    (range) => {
      const root = scratchRoot();
      try {
        writeFileSync(join(root, '.node-version'), `${range}\n`);
        expect(assertPins(root).length).toBeGreaterThan(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it('fails when requires-python is loosened to a >= range', () => {
    const root = scratchRoot();
    try {
      const path = join(root, 'pyproject.toml');
      writeFileSync(
        path,
        readFileSync(path, 'utf8').replace('requires-python = "==3.14.6"', 'requires-python = ">=3.14"'),
      );
      expect(assertPins(root).join('\n')).toContain('requires-python');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when packageManager drops the exact pnpm patch', () => {
    const root = scratchRoot();
    try {
      const path = join(root, 'package.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.packageManager = 'pnpm@11.20.0';
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      expect(assertPins(root).join('\n')).toContain('"pnpm@11.20.0"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
