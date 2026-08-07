import { describe, expect, it } from 'vitest';

import { loadFixture, scanForSecrets, scanText, secretScanInventory } from '../workspace-assertions.mjs';

const fixture = loadFixture('secret-patterns.json');

/**
 * Build the synthetic credential name at runtime from the parts recorded in the fixture, so the
 * literal never appears in a scanned file and cannot make the scan of this very test file fail.
 */
const syntheticCredential = fixture.positiveControlParts.join('_');

describe('secret scan (PRD 20.2)', () => {
  it('finds no credential reference in root scripts or tools/**', () => {
    expect(scanForSecrets()).toEqual([]);
  });

  it('inspects root package.json scripts AND every file under tools/', () => {
    const inventory = secretScanInventory();
    expect(inventory).toContain('package.json');
    expect(inventory).toContain('tools/workspace-script.mjs');
    expect(inventory).toContain('tools/check-workspace.mjs');
    expect(inventory).toContain('tools/eslint.config.mjs');
    expect(inventory).toContain('tools/validate-prd.ps1');
    expect(inventory.filter((path) => path.startsWith('tools/')).length).toBeGreaterThan(10);
  });

  it('excludes exactly one path — the pattern file — and never a fixtures/ wildcard', () => {
    expect(fixture.excludedPaths).toEqual(['tools/fixtures/secret-patterns.json']);
    const inventory = secretScanInventory();
    expect(inventory).toContain('tools/fixtures/toolchain-pins.json');
    expect(inventory).toContain('tools/fixtures/prd-20-1-layout.json');
    expect(inventory).toContain('tools/fixtures/entry-commands.json');
  });

  // Positive control: a scanner that cannot detect anything discharges nothing.
  it('detects a synthetic provider credential fed to it in memory', () => {
    const findings = scanText(`const x = process.env.${syntheticCredential};`, '<in-memory>');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.patternId)).toContain('aws');
  });

  // Each name is assembled at runtime from harmless parts for the same reason as above: this file is
  // itself inside tools/**, so a literal credential name here would make the clean-repo scan fail.
  it.each([
    [['GITHUB', 'TOKEN'], 'token'],
    [['STRIPE', 'SECRET'], 'secret'],
    [['ANTHROPIC', 'API', 'KEY'], 'key'],
    [['POSTGRES', 'PASSWORD'], 'password'],
    [['GOOGLE', 'APPLICATION', 'CREDENTIALS'], 'credential'],
    [['DATABASE', 'URL'], 'dsn'],
  ])('detects %s via the %s pattern', (parts, patternId) => {
    const findings = scanText(`process.env.${parts.join('_')}`, '<in-memory>');
    expect(findings.map((f) => f.patternId)).toContain(patternId);
  });

  it('detects an inlined private key block', () => {
    const findings = scanText(
      ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
      '<in-memory>',
    );
    expect(findings.map((f) => f.patternId)).toContain('private-key-block');
  });

  it('does not fire on ordinary prose', () => {
    expect(scanText('the corpus manifest is signed before release', '<in-memory>')).toEqual([]);
  });
});
