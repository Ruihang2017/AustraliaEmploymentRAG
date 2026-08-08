/**
 * `SDK_NAME`/`SDK_VERSION` are literals so this package needs no filesystem at runtime; this suite is
 * what stops them drifting from the manifest.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { SDK_NAME, SDK_VERSION } from '../src/sdk.js';
import { userAgent } from '../src/version.js';
import { PACKAGE_ROOT, readJson } from './support/repo.js';

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly scripts: Readonly<Record<string, string>>;
  readonly type: string;
  readonly main: string;
  readonly types: string;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly files: readonly string[];
}

const manifest = readJson<Manifest>(join(PACKAGE_ROOT, 'package.json'));

describe('package identity', () => {
  it('matches the manifest exactly', () => {
    expect(SDK_NAME).toBe(manifest.name);
    expect(SDK_VERSION).toBe(manifest.version);
  });

  it('declares the repository-wide typecheck script verbatim', () => {
    expect(manifest.scripts['typecheck']).toBe('tsc -p tsconfig.json --noEmit');
    expect(manifest.scripts['test']).toBe('vitest run');
    expect(manifest.main).toBe('src/index.ts');
    expect(manifest.type).toBe('module');
  });

  it('delegates generation to the contracts package, running no second generator', () => {
    expect(manifest.scripts['generate']).toBe('node ../contracts/src/openapi/generate.mjs');
    expect(manifest.scripts['generated:check']).toBe('node ../contracts/src/openapi/generated-check.mjs');
  });

  it('publishes ESM, CommonJS and declarations from the paths the build emits', () => {
    const build = readJson<{ compilerOptions: { outDir: string; rootDir: string } }>(
      join(PACKAGE_ROOT, 'tsconfig.build.json'),
    );
    const cjs = readJson<{ compilerOptions: { outDir: string; module: string } }>(
      join(PACKAGE_ROOT, 'tsconfig.build.cjs.json'),
    );
    expect(build.compilerOptions.outDir).toBe('dist/esm');
    expect(cjs.compilerOptions.outDir).toBe('dist/cjs');
    expect(cjs.compilerOptions.module).toBe('commonjs');
    // `rootDir` is the packages/ directory, not src/, because src/internal/contracts.ts deep-imports
    // packages/contracts (plan OQ-1). That is why the emitted entry sits under sdk-typescript/src/.
    expect(build.compilerOptions.rootDir).toBe('..');

    const root = manifest.exports['.'] as Record<string, string>;
    expect(root['import']).toBe(`./${build.compilerOptions.outDir}/sdk-typescript/src/sdk.js`);
    expect(root['require']).toBe(`./${cjs.compilerOptions.outDir}/sdk-typescript/src/sdk.js`);
    expect(root['types']).toBe(`./${build.compilerOptions.outDir}/sdk-typescript/src/sdk.d.ts`);
    expect(manifest.types).toBe((root['types'] ?? '').slice(2));
    expect(manifest.exports['./package.json']).toBe('./package.json');
    expect([...manifest.files].sort()).toEqual(['README.md', 'dist', 'parity']);
  });

  it('builds a User-Agent that appends a caller suffix rather than replacing the identity', () => {
    expect(userAgent(undefined)).toBe(`${SDK_NAME}/${SDK_VERSION}`);
    expect(userAgent('  ')).toBe(`${SDK_NAME}/${SDK_VERSION}`);
    expect(userAgent('my-app/2.0')).toBe(`${SDK_NAME}/${SDK_VERSION} my-app/2.0`);
  });
});
