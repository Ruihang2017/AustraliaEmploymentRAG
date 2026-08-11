import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}

// The manifest is append-only and shared with every other ticket in this module (sub-PRD D9):
// DATA-04/06/07/09 will legitimately append their own, unrelated dependencies to it. This ticket's
// acceptance item is narrower than "the manifest never changes" — it is "no third-party cryptography
// dependency is added" — so assert a denylist of known crypto packages rather than freezing the whole
// manifest. A future non-crypto dependency must not fail a crypto ticket's test.
const FORBIDDEN_CRYPTO_DEPENDENCIES = [
  'node-forge',
  'crypto-js',
  'tweetnacl',
  'libsodium',
  'libsodium-wrappers',
  'sjcl',
  'jose',
  '@noble/ciphers',
  '@noble/hashes',
  '@noble/curves',
];

describe('crypto dependency boundary', () => {
  it('uses only built-in AEAD cryptography', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const declared = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ];
    for (const forbidden of FORBIDDEN_CRYPTO_DEPENDENCIES) {
      expect(declared, `unexpected crypto dependency: ${forbidden}`).not.toContain(forbidden);
      expect(
        declared.some((name) => name.startsWith(`${forbidden}/`)),
        `unexpected scoped crypto dependency under: ${forbidden}`,
      ).toBe(false);
    }
    const source = files(join(here, '..', '..', 'src', 'crypto')).map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const forbidden of ['aes-256-' + 'cbc', 'aes-256-' + 'ctr', 'create' + 'Cipher(']) expect(source).not.toContain(forbidden);
  });
});
