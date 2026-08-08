/**
 * FND-04 acceptance item 7 — "Every file under `packages/contracts/src/generated/**` carries the
 * do-not-edit banner; a hand-edited generated file is detected by `generated:check` (PRD §20.1)."
 *
 * PRD §20.1: "Generated OpenAPI/SDK/event/manifest bindings MUST NOT be hand-edited."
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BANNER, REGENERATE_HINT, GENERATED_DIR, emit } from '../../src/openapi/emit.mjs';
import { existingGeneratedFiles } from '../../src/openapi/generate.mjs';
import { PACKAGE_ROOT, document } from '../openapi/fixture.js';

const onDisk = existingGeneratedFiles(PACKAGE_ROOT);

describe('generated banner (acceptance item 7)', () => {
  it('is not vacuous: the generated tree exists and holds real files', () => {
    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk).toEqual([
      `${GENERATED_DIR}/errors.ts`,
      `${GENERATED_DIR}/index.ts`,
      `${GENERATED_DIR}/operations.ts`,
      `${GENERATED_DIR}/paths.ts`,
      `${GENERATED_DIR}/schemas.ts`,
    ]);
  });

  it('states the banner exactly as PRD §20.1 requires', () => {
    expect(BANNER).toBe('// GENERATED FROM schemas/openapi/openapi.yaml — DO NOT EDIT (PRD §20.1)');
  });

  it.each(onDisk)('%s starts with the banner and the regenerate hint', (path) => {
    const lines = readFileSync(join(PACKAGE_ROOT, path), 'utf8').split(/\r?\n/);
    expect(lines[0]).toBe(BANNER);
    expect(lines[1]).toBe(REGENERATE_HINT);
  });

  // Not `/* eslint-disable */`: root `pnpm lint` covers packages/** and reports an unused disable
  // directive as a warning, so the belt-and-braces version would both add noise and mask a real
  // problem if the emitter ever started producing lint-dirty output.
  it('suppresses no lint rule in generated output', () => {
    for (const [path, contents] of emit(document())) {
      expect(contents, `${path}`).not.toContain('eslint-disable');
    }
  });

  it.each([...emit(document()).keys()])('%s is emitted with the banner on line 1', (path) => {
    const contents = emit(document()).get(path) as string;
    expect(contents.split('\n')[0]).toBe(BANNER);
  });

  it('emits LF only, one trailing newline, and no BOM', () => {
    for (const [path, contents] of emit(document())) {
      expect(contents.includes('\r'), `${path} contains CR`).toBe(false);
      expect(contents.endsWith('\n'), `${path} has no final newline`).toBe(true);
      expect(contents.endsWith('\n\n'), `${path} has a blank final line`).toBe(false);
      expect(contents.charCodeAt(0), `${path} starts with a BOM`).not.toBe(0xfeff);
    }
  });

  it('emits no timestamp, absolute path or package version', () => {
    for (const [path, contents] of emit(document())) {
      expect(contents, `${path} names a drive letter`).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(contents, `${path} contains an ISO timestamp`).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
      expect(contents, `${path} names the repository root`).not.toContain('packages/contracts/src/generated/');
    }
  });

  // PRD §20.2 secret scan: `.github/workflows/checks/secret-scan.mjs` applies UPPER_SNAKE
  // credential-name patterns to every git-tracked file outside docs/**, and packages/** is scanned.
  // An emitted SCREAMING_SNAKE name ending in _KEY, _SECRET, _TOKEN, _PASSWORD or _CREDENTIAL(S)
  // would fail the supply-chain-scan job — which is why the emitter uses camelCase for its maps and
  // why this comment does not spell such a name out. Naming a variable is not holding a credential,
  // but the scan cannot tell, and it is right not to try.
  it('emits no credential-shaped UPPER_SNAKE identifier', () => {
    for (const [path, contents] of emit(document())) {
      expect(contents, `${path}`).not.toMatch(
        /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS?)(?:_[A-Z0-9]+)*\b/,
      );
    }
  });
});
