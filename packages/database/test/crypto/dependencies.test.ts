import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}

describe('crypto dependency boundary', () => {
  it('uses only built-in AEAD cryptography', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJson = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as { dependencies: unknown; devDependencies: unknown };
    expect(packageJson.dependencies).toEqual({ 'better-sqlite3': '13.0.3' });
    expect(packageJson.devDependencies).toEqual({ '@types/better-sqlite3': '9.6.0' });
    const source = files(join(here, '..', '..', 'src', 'crypto')).map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const forbidden of ['aes-256-' + 'cbc', 'aes-256-' + 'ctr', 'create' + 'Cipher(']) expect(source).not.toContain(forbidden);
  });
});
