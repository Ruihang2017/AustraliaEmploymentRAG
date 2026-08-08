/**
 * Sub-PRD **D1** — this package WRAPS the generated core and reaches it through exactly one file.
 *
 * The boundary is what makes plan **OQ-1** cheap to close: when a `00-foundation` repair ticket makes
 * a workspace-internal dependency expressible, switching from the relative deep import to
 * `@taxrag/contracts` is a one-file change. A second file reaching outside the package would turn
 * that into an archaeology exercise.
 */
import { describe, expect, it } from 'vitest';

import { sourceFiles, sourceWithoutComments } from './support/repo.js';

const OUTWARD = /'\.\.\/\.\.\/\.\.\//;

describe('the generated-core import boundary (sub-PRD D1)', () => {
  it('lets only src/internal/contracts.ts name a path outside this package', () => {
    // Comments are stripped, string literals kept: an import specifier IS a string literal, and a
    // doc comment that has to mention the path must not be able to trip or dodge the scan.
    const offenders = sourceWithoutComments()
      .filter(({ text }) => OUTWARD.test(text) || text.includes('@taxrag/contracts'))
      .map(({ path }) => path);
    expect(offenders).toEqual(['internal/contracts.ts']);
  });

  it('actually imports the generated core there, so the assertion above is not vacuous', () => {
    const boundary = sourceFiles().find(({ path }) => path === 'internal/contracts.ts');
    expect(boundary, 'src/internal/contracts.ts is missing').toBeDefined();
    expect(boundary?.text).toContain('../../../contracts/src/generated/index.js');
    expect(boundary?.text).toContain('../../../contracts/src/events/index.js');
  });

  it('declares no dependency in the package manifest, so nothing can be reached another way', async () => {
    const manifest = (await import('../package.json', { with: { type: 'json' } })).default as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
  });

  it('keeps src/index.ts byte-exactly the skeleton entry file', () => {
    const entry = sourceFiles().find(({ path }) => path === 'index.ts');
    expect(entry?.text).toBe('export {};\n');
  });

  it('carries no generated-file banner, because nothing here is generated', () => {
    for (const { path, text } of sourceFiles()) {
      expect(text.includes('DO NOT EDIT (PRD §20.1)'), `${path} claims to be generated`).toBe(false);
    }
  });
});
